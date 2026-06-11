import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import { fetchOrders, type WooOrder } from "../../lib/woocommerce.js";
import { recomputeChargeStatus } from "../charges/charges.service.js";
import type {
  CreatePaymentInput,
  AnnulPaymentInput,
  ListPaymentsQuery,
} from "./payments.schemas.js";

// Mapea el metodo de pago de WooCommerce a nuestro enum
function mapWooMethod(method: string): "TRANSFERENCIA" | "TARJETA" | "DEPOSITO" {
  if (method === "bacs") return "TRANSFERENCIA";
  if (method === "tilopay" || method === "card") return "TARJETA";
  return "DEPOSITO";
}

// Convierte Decimal -> number para el frontend
type WithDecimals = { amount: unknown; discount: unknown };
function serialize<T extends WithDecimals>(p: T) {
  return {
    ...p,
    amount: Number(p.amount),
    discount: Number(p.discount),
    net: Number(p.amount) - Number(p.discount),
  };
}

const include = {
  student: { select: { id: true, fullName: true, dpi: true } },
  feeType: { select: { id: true, name: true, category: true } },
  registeredBy: { select: { name: true } },
  annulledBy: { select: { name: true } },
} satisfies Prisma.PaymentInclude;

export async function listPayments(q: ListPaymentsQuery) {
  const where: Prisma.PaymentWhereInput = {
    ...(q.studentId ? { studentId: q.studentId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(q.method ? { method: q.method } : {}),
    ...(q.unlinked === true ? { studentId: null } : {}),
  };

  const [total, rows, totals] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include,
      orderBy: { paidAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    // Suma de pagos ACTIVOS que coinciden con el filtro
    prisma.payment.aggregate({
      where: { ...where, status: "ACTIVO" },
      _sum: { amount: true, discount: true },
    }),
  ]);

  const sumAmount = Number(totals._sum.amount ?? 0);
  const sumDiscount = Number(totals._sum.discount ?? 0);

  return {
    data: rows.map(serialize),
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
    totals: { gross: sumAmount, discount: sumDiscount, net: sumAmount - sumDiscount },
  };
}

export async function getPayment(id: string) {
  const payment = await prisma.payment.findUnique({ where: { id }, include });
  if (!payment) throw notFound("Pago no encontrado");
  return serialize(payment);
}

// Trae el pago crudo (con Decimal y relaciones) para generar el recibo PDF
export async function getPaymentForReceipt(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, fullName: true, dpi: true } },
      feeType: { select: { id: true, name: true, category: true } },
      registeredBy: { select: { name: true } },
    },
  });
  if (!payment) throw notFound("Pago no encontrado");
  return payment;
}

export async function createManualPayment(
  input: CreatePaymentInput,
  userId?: string
) {
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
  });
  if (!student) throw badRequest("El estudiante no existe");

  if (input.discount > input.amount) {
    throw badRequest("El descuento no puede ser mayor que el monto");
  }

  const payment = await prisma.payment.create({
    data: {
      studentId: input.studentId,
      feeTypeId: input.feeTypeId || null,
      chargeId: input.chargeId || null,
      concept: input.concept,
      amount: input.amount,
      discount: input.discount,
      method: input.method,
      source: "MANUAL",
      paidAt: input.paidAt,
      receiptUrl: input.receiptUrl || null,
      receiptKey: input.receiptKey || null,
      registeredById: userId,
    },
    include,
  });

  // Si el pago cubre un cargo, recalcula su estado (PENDIENTE/PAGADO)
  if (input.chargeId) {
    await recomputeChargeStatus(input.chargeId);
  }

  // Notifica al estudiante por WhatsApp (sin bloquear ni romper si falla).
  if (payment.studentId) {
    void import("../whatsapp/notifications.service.js")
      .then((m) => m.notifyPaymentReceived(payment.id))
      .catch((e) => console.error("[notify pago]", (e as Error).message));
  }

  return serialize(payment);
}

// Anula un pago (no se elimina; queda trazabilidad)
export async function annulPayment(
  id: string,
  input: AnnulPaymentInput,
  userId?: string
) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw notFound("Pago no encontrado");
  if (payment.status === "ANULADO") {
    throw badRequest("El pago ya esta anulado");
  }

  const updated = await prisma.payment.update({
    where: { id },
    data: {
      status: "ANULADO",
      annulledAt: new Date(),
      annulledById: userId,
      annulReason: input.reason,
    },
    include,
  });

  // Al anular, el cargo vinculado puede volver a quedar PENDIENTE
  if (payment.chargeId) {
    await recomputeChargeStatus(payment.chargeId);
  }
  return serialize(updated);
}

// Vincula un pago (tipicamente de Woo) a un estudiante
export async function linkPayment(id: string, studentId: string) {
  const [payment, student] = await Promise.all([
    prisma.payment.findUnique({ where: { id } }),
    prisma.student.findUnique({ where: { id: studentId } }),
  ]);
  if (!payment) throw notFound("Pago no encontrado");
  if (!student) throw badRequest("El estudiante no existe");

  const updated = await prisma.payment.update({
    where: { id },
    data: { studentId },
    include,
  });
  return serialize(updated);
}

// --- Sincronizacion con WooCommerce -----------------------------------------

function orderConcept(order: WooOrder): string {
  const items = order.line_items?.map((i) => i.name).filter(Boolean);
  return items && items.length > 0 ? items.join(", ") : "Pago en linea";
}

// Intenta vincular automaticamente por correo del comprador
async function findStudentByEmail(email: string | undefined) {
  if (!email) return null;
  return prisma.student.findFirst({
    where: { email: { equals: email } },
    select: { id: true },
  });
}

// Un concepto es de "inscripcion" si lo menciona (nuevo estudiante).
export function isInscripcionConcept(concept: string): boolean {
  return /inscrip/i.test(concept);
}

// Crea un estudiante nuevo a partir de los datos de un pago de inscripcion.
// Sin DPI (se completa luego). Registra el historial inicial.
async function createStudentFromPayment(data: {
  fullName: string;
  email?: string;
  phone?: string;
  enrollmentDate?: Date; // fecha del pago de inscripcion (ciclo real)
}): Promise<string> {
  const student = await prisma.student.create({
    data: {
      fullName: data.fullName || "Estudiante sin nombre",
      email: data.email || null,
      phonePrimary: data.phone || null,
      status: "ACTIVO",
      // La inscripcion real es la fecha del pago, no la de hoy.
      ...(data.enrollmentDate ? { enrollmentDate: data.enrollmentDate } : {}),
      statusHistory: {
        create: {
          toStatus: "ACTIVO",
          reason: "Alta automatica por pago de inscripcion",
        },
      },
    },
  });
  return student.id;
}

export async function syncWooCommerce(options: { full?: boolean } = {}) {
  // Por defecto solo trae pedidos de los ultimos 120 dias; full=true trae todo
  let after: string | undefined;
  if (!options.full) {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    after = d.toISOString();
  }

  let page = 1;
  let totalPages = 1;
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  do {
    const { orders, totalPages: tp } = await fetchOrders({
      page,
      perPage: 50,
      status: "any",
      after,
    });
    totalPages = tp;

    for (const order of orders) {
      // Solo pedidos pagados/validos cuentan como ingreso
      const validStatus = ["completed", "processing", "on-hold"].includes(
        order.status
      );
      if (!validStatus) {
        skipped++;
        continue;
      }

      const existing = await prisma.payment.findUnique({
        where: { wooOrderId: order.id },
      });

      const method = mapWooMethod(order.payment_method);
      const paidAt = order.date_paid_gmt
        ? new Date(order.date_paid_gmt + "Z")
        : new Date(order.date_created_gmt + "Z");
      const payerName =
        `${order.billing.first_name} ${order.billing.last_name}`.trim();

      if (existing) {
        // Actualiza datos basicos pero respeta la anulacion y el vinculo manual
        await prisma.payment.update({
          where: { wooOrderId: order.id },
          data: {
            amount: order.total,
            method,
            paidAt,
            payerName,
            payerEmail: order.billing.email,
          },
        });
        updated++;
      } else {
        const concept = orderConcept(order);
        let student = await findStudentByEmail(order.billing.email);
        // Si es un pago de inscripcion y no hay estudiante, lo creamos (nuevo alumno).
        let studentId = student?.id ?? null;
        if (!studentId && isInscripcionConcept(concept)) {
          studentId = await createStudentFromPayment({
            fullName: payerName,
            email: order.billing.email,
            phone: order.billing.phone,
            enrollmentDate: paidAt,
          });
        }
        await prisma.payment.create({
          data: {
            wooOrderId: order.id,
            studentId,
            concept,
            amount: order.total,
            method,
            source: "WOOCOMMERCE",
            paidAt,
            payerName,
            payerEmail: order.billing.email,
          },
        });
        imported++;
      }
    }
    page++;
  } while (page <= totalPages);

  return { imported, updated, skipped };
}
