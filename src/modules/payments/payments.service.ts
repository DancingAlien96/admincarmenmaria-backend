import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import {
  fetchOrders,
  extractSede,
  extractBuyerInfo,
  type WooOrder,
  type WooBuyerInfo,
} from "../../lib/woocommerce.js";
import { normalizeName } from "../../lib/normalize.js";
import { nameSimilarity } from "../../lib/similarity.js";

// Completa los datos del expediente (municipio, departamento, dirección, DPI)
// con lo que trae el checkout, sin sobrescribir lo que ya tenga cargado.
async function applyBuyerInfoToStudent(studentId: string, info: WooBuyerInfo) {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: { municipality: true, department: true, address: true, dpi: true },
  });
  if (!s) return;
  const data: Record<string, string> = {};
  if (!s.municipality && info.municipality) data.municipality = info.municipality;
  if (!s.department && info.department) data.department = info.department;
  if (!s.address && info.address) data.address = info.address;
  if (!s.dpi && info.dpi) {
    // El DPI es único: solo se asigna si ningún otro expediente lo tiene.
    const dup = await prisma.student.findUnique({ where: { dpi: info.dpi } });
    if (!dup) data.dpi = info.dpi;
  }
  if (Object.keys(data).length > 0) {
    await prisma.student.update({ where: { id: studentId }, data });
  }
}
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
    // Y por correo (confirmación de pago).
    void import("../../lib/email-notify.js")
      .then((m) => m.sendPaymentReceiptEmail(payment.id))
      .catch((e) => console.error("[email pago]", (e as Error).message));
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

// --- Boletas subidas por el alumno (revisión del personal) ------------------

// Pagos en revisión (boletas subidas por estudiantes), con datos del alumno.
export async function listPendingPayments() {
  const rows = await prisma.payment.findMany({
    where: { status: "EN_REVISION" },
    orderBy: { createdAt: "asc" },
    include: {
      student: {
        select: { id: true, fullName: true, expedienteNumber: true, sede: true },
      },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    concept: p.concept,
    amount: Number(p.amount),
    method: p.method,
    paidAt: p.paidAt,
    receiptUrl: p.receiptUrl,
    student: p.student,
  }));
}

// Aprueba una boleta: el pago pasa a ACTIVO y se recalcula la cuota.
export async function approvePayment(id: string, userId?: string) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw notFound("Pago no encontrado");
  if (payment.status !== "EN_REVISION") {
    throw badRequest("Este pago no está en revisión");
  }
  const updated = await prisma.payment.update({
    where: { id },
    data: { status: "ACTIVO", registeredById: userId },
    include,
  });
  if (payment.chargeId) await recomputeChargeStatus(payment.chargeId);
  // Confirmación de pago al alumno (correo), sin bloquear.
  void import("../../lib/email-notify.js")
    .then((m) => m.sendPaymentReceiptEmail(updated.id))
    .catch((e) => console.error("[email boleta aprobada]", (e as Error).message));
  return serialize(updated);
}

// Rechaza una boleta (con motivo). No cuenta para la cuota.
export async function rejectPayment(
  id: string,
  reason: string | undefined,
  userId?: string
) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw notFound("Pago no encontrado");
  if (payment.status !== "EN_REVISION") {
    throw badRequest("Este pago no está en revisión");
  }
  const updated = await prisma.payment.update({
    where: { id },
    data: {
      status: "RECHAZADO",
      annulReason: reason || null,
      annulledById: userId,
      annulledAt: new Date(),
    },
    include,
  });
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

// Indice en memoria de estudiantes (correo + nombre normalizado) para vincular
// pagos sin crear duplicados. Se carga una vez por sync y se actualiza al crear.
type StudentIndex = {
  byEmail: Map<string, string>;
  byName: Map<string, string>;
};

async function buildStudentIndex(): Promise<StudentIndex> {
  const rows = await prisma.student.findMany({
    select: { id: true, fullName: true, email: true },
  });
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const r of rows) {
    if (r.email) byEmail.set(r.email.toLowerCase(), r.id);
    const key = normalizeName(r.fullName);
    if (key && !byName.has(key)) byName.set(key, r.id);
  }
  return { byEmail, byName };
}

// Busca un estudiante existente por correo exacto o por nombre normalizado.
function findInIndex(
  idx: StudentIndex,
  email: string | undefined,
  fullName: string
): string | null {
  const emailKey = email?.toLowerCase();
  if (emailKey && idx.byEmail.has(emailKey)) return idx.byEmail.get(emailKey)!;
  const nameKey = normalizeName(fullName);
  if (nameKey && idx.byName.has(nameKey)) return idx.byName.get(nameKey)!;
  return null;
}

// Un concepto es de "inscripcion" si lo menciona (nuevo estudiante).
export function isInscripcionConcept(concept: string): boolean {
  return /inscrip/i.test(concept);
}

// Sugerencias de vinculacion: agrupa los pagos huerfanos por pagador y
// propone el estudiante mas parecido (por similitud de nombre) para aprobar.
export async function getLinkSuggestions() {
  const [students, orphans] = await Promise.all([
    prisma.student.findMany({
      where: { archived: false },
      select: { id: true, fullName: true, sede: true },
    }),
    prisma.payment.findMany({
      where: { studentId: null, status: "ACTIVO" },
      select: {
        id: true,
        payerName: true,
        payerEmail: true,
        concept: true,
        amount: true,
        paidAt: true,
      },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  // Agrupa por pagador (nombre normalizado).
  type Group = {
    key: string;
    payerName: string;
    payerEmail: string | null;
    paymentIds: string[];
    count: number;
    totalAmount: number;
    concepts: Set<string>;
  };
  const groups = new Map<string, Group>();
  for (const p of orphans) {
    const key = normalizeName(p.payerName ?? "") || p.id;
    const g =
      groups.get(key) ??
      ({
        key,
        payerName: p.payerName ?? "(sin nombre)",
        payerEmail: p.payerEmail,
        paymentIds: [],
        count: 0,
        totalAmount: 0,
        concepts: new Set<string>(),
      } as Group);
    g.paymentIds.push(p.id);
    g.count += 1;
    g.totalAmount += Number(p.amount);
    if (p.concept) g.concepts.add(p.concept);
    groups.set(key, g);
  }

  // Para cada grupo, mejores estudiantes por similitud.
  const result = [...groups.values()].map((g) => {
    const scored = students
      .map((s) => ({
        studentId: s.id,
        fullName: s.fullName,
        sede: s.sede,
        score: nameSimilarity(g.payerName, s.fullName),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      key: g.key,
      payerName: g.payerName,
      payerEmail: g.payerEmail,
      count: g.count,
      totalAmount: g.totalAmount,
      paymentIds: g.paymentIds,
      concepts: [...g.concepts],
      best: scored[0] ?? null,
      alternatives: scored.slice(1, 4),
    };
  });

  // Solo grupos con alguna coincidencia razonable, mejor primero.
  return result
    .filter((r) => r.best && r.best.score >= 0.34)
    .sort((a, b) => (b.best!.score ?? 0) - (a.best!.score ?? 0));
}

// Vincula varios pagos (por id) a un mismo estudiante. Solo afecta huerfanos.
export async function linkManyPayments(paymentIds: string[], studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw badRequest("El estudiante no existe");
  const res = await prisma.payment.updateMany({
    where: { id: { in: paymentIds }, studentId: null },
    data: { studentId },
  });
  return { linked: res.count };
}

// Re-vincula pagos "huerfanos" (sin estudiante) a un expediente existente,
// por correo o nombre normalizado. Para pagos importados antes de que el sync
// vinculara por nombre. No toca los que ya tienen estudiante.
export async function relinkOrphanPayments() {
  const idx = await buildStudentIndex();
  const orphans = await prisma.payment.findMany({
    where: { studentId: null },
    select: { id: true, payerName: true, payerEmail: true },
  });
  let linked = 0;
  for (const p of orphans) {
    const studentId = findInIndex(
      idx,
      p.payerEmail ?? undefined,
      p.payerName ?? ""
    );
    if (studentId) {
      await prisma.payment.update({
        where: { id: p.id },
        data: { studentId },
      });
      linked++;
    }
  }
  return { total: orphans.length, linked, remaining: orphans.length - linked };
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

  // Indice de estudiantes para vincular pagos sin crear duplicados.
  const idx = await buildStudentIndex();

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
      const sede = extractSede(order);
      const buyer = extractBuyerInfo(order);

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
            ...(sede ? { sede } : {}),
          },
        });
        // Si el pago trae sede y el estudiante vinculado aun no la tiene, la hereda.
        if (existing.studentId) {
          if (sede) {
            await prisma.student.updateMany({
              where: { id: existing.studentId, sede: null },
              data: { sede },
            });
          }
          // Completa municipio/departamento/direccion/DPI desde el checkout.
          await applyBuyerInfoToStudent(existing.studentId, buyer);
        }
        updated++;
      } else {
        const concept = orderConcept(order);
        // Vincula por correo o por nombre normalizado (evita duplicados).
        const studentId = findInIndex(idx, order.billing.email, payerName);
        // WooCommerce ya NO crea expedientes: los expedientes se crean solo
        // desde el sistema. Los pagos de personas sin expediente llegan "sin
        // vincular" para enlazarlos a mano al expediente creado en el sistema.
        if (sede && studentId) {
          // Estudiante existente sin sede: la hereda de este pago.
          await prisma.student.updateMany({
            where: { id: studentId, sede: null },
            data: { sede },
          });
        }
        // Completa datos del expediente (municipio/DPI/etc.) desde el checkout.
        if (studentId) await applyBuyerInfoToStudent(studentId, buyer);
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
            sede,
          },
        });
        imported++;
      }
    }
    page++;
  } while (page <= totalPages);

  return { imported, updated, skipped };
}
