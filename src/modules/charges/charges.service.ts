import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import type {
  CreateChargeInput,
  BulkChargeInput,
  AnnulChargeInput,
  ListChargesQuery,
} from "./charges.schemas.js";

// Suma neta (monto - descuento) de pagos ACTIVOS por cargo
export async function paidByCharge(
  chargeIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (chargeIds.length === 0) return map;
  const rows = await prisma.payment.groupBy({
    by: ["chargeId"],
    where: { chargeId: { in: chargeIds }, status: "ACTIVO" },
    _sum: { amount: true, discount: true },
  });
  for (const r of rows) {
    if (!r.chargeId) continue;
    const net = Number(r._sum.amount ?? 0) - Number(r._sum.discount ?? 0);
    map.set(r.chargeId, net);
  }
  return map;
}

const include = {
  student: { select: { id: true, fullName: true, dpi: true } },
  feeType: { select: { id: true, name: true, category: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.ChargeInclude;

type ChargeRow = Prisma.ChargeGetPayload<{ include: typeof include }>;

// Agrega saldo y bandera de vencido a un cargo
function decorate(charge: ChargeRow, paid: number, now: Date) {
  const amount = Number(charge.amount);
  const saldo = Math.max(0, amount - paid);
  const overdue =
    charge.status === "PENDIENTE" && saldo > 0 && charge.dueDate < now;
  return {
    ...charge,
    amount,
    paid,
    saldo,
    overdue,
  };
}

export async function listCharges(q: ListChargesQuery) {
  const now = new Date();
  const where: Prisma.ChargeWhereInput = {
    ...(q.studentId ? { studentId: q.studentId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.overdue === true
      ? { status: "PENDIENTE", dueDate: { lt: now } }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.charge.count({ where }),
    prisma.charge.findMany({
      where,
      include,
      orderBy: { dueDate: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  const paid = await paidByCharge(rows.map((r) => r.id));
  let data = rows.map((r) => decorate(r, paid.get(r.id) ?? 0, now));

  // Filtro overdue tambien excluye los que ya estan cubiertos (saldo 0)
  if (q.overdue === true) data = data.filter((c) => c.saldo > 0);

  return {
    data,
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
  };
}

export async function createCharge(input: CreateChargeInput, userId?: string) {
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
  });
  if (!student) throw badRequest("El estudiante no existe");

  const charge = await prisma.charge.create({
    data: {
      studentId: input.studentId,
      feeTypeId: input.feeTypeId || null,
      concept: input.concept,
      amount: input.amount,
      dueDate: new Date(input.dueDate),
      createdById: userId,
    },
    include,
  });
  return decorate(charge, 0, new Date());
}

// Asigna el mismo cargo a varios estudiantes (ej. mensualidad del mes)
export async function bulkCreateCharges(
  input: BulkChargeInput,
  userId?: string
) {
  const result = await prisma.charge.createMany({
    data: input.studentIds.map((studentId) => ({
      studentId,
      feeTypeId: input.feeTypeId || null,
      concept: input.concept,
      amount: input.amount,
      dueDate: new Date(input.dueDate),
      createdById: userId,
    })),
  });
  return { created: result.count };
}

export async function annulCharge(
  id: string,
  input: AnnulChargeInput,
  userId?: string
) {
  const charge = await prisma.charge.findUnique({ where: { id } });
  if (!charge) throw notFound("Cargo no encontrado");
  if (charge.status === "ANULADO") throw badRequest("El cargo ya esta anulado");

  const updated = await prisma.charge.update({
    where: { id },
    data: {
      status: "ANULADO",
      annulledAt: new Date(),
      annulledById: userId,
      annulReason: input.reason,
    },
    include,
  });
  return decorate(updated, 0, new Date());
}

// Recalcula el estado de un cargo segun lo pagado (PENDIENTE <-> PAGADO)
export async function recomputeChargeStatus(chargeId: string) {
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (!charge || charge.status === "ANULADO") return;
  const paid = (await paidByCharge([chargeId])).get(chargeId) ?? 0;
  const fullyPaid = paid >= Number(charge.amount);
  const newStatus = fullyPaid ? "PAGADO" : "PENDIENTE";
  if (newStatus !== charge.status) {
    await prisma.charge.update({
      where: { id: chargeId },
      data: { status: newStatus },
    });
  }
}

// Estado de cuenta de un estudiante: cargos + totales
export async function studentAccount(studentId: string) {
  const now = new Date();
  const rows = await prisma.charge.findMany({
    where: { studentId, status: { not: "ANULADO" } },
    include,
    orderBy: { dueDate: "desc" },
  });
  const paid = await paidByCharge(rows.map((r) => r.id));
  const charges = rows.map((r) => decorate(r, paid.get(r.id) ?? 0, now));

  const totalCharged = charges.reduce((s, c) => s + c.amount, 0);
  const totalPaid = charges.reduce((s, c) => s + c.paid, 0);
  const totalDue = charges.reduce((s, c) => s + c.saldo, 0);
  const overdueAmount = charges
    .filter((c) => c.overdue)
    .reduce((s, c) => s + c.saldo, 0);

  return {
    charges,
    summary: { totalCharged, totalPaid, totalDue, overdueAmount },
  };
}
