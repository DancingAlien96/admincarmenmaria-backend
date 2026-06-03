import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import type { CreateFeeInput, UpdateFeeInput } from "./fees.schemas.js";

// Prisma devuelve Decimal; lo convertimos a number para el frontend
function serialize<T extends { amount: unknown }>(fee: T) {
  return { ...fee, amount: Number(fee.amount) };
}

export async function listFees(includeInactive = false) {
  const fees = await prisma.feeType.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return fees.map(serialize);
}

export async function createFee(input: CreateFeeInput) {
  const fee = await prisma.feeType.create({ data: input });
  return serialize(fee);
}

export async function updateFee(id: string, input: UpdateFeeInput) {
  const existing = await prisma.feeType.findUnique({ where: { id } });
  if (!existing) throw notFound("Tipo de cuota no encontrado");
  const fee = await prisma.feeType.update({ where: { id }, data: input });
  return serialize(fee);
}
