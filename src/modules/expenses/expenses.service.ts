import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { deleteFile } from "../../lib/storage.js";
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
} from "./expenses.schemas.js";

function serialize<T extends { amount: unknown }>(e: T) {
  return { ...e, amount: Number(e.amount) };
}

const include = {
  registeredBy: { select: { name: true } },
} satisfies Prisma.ExpenseInclude;

// Construye el rango de fechas [from, to] para filtros
function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }
  return filter;
}

export async function listExpenses(q: ListExpensesQuery) {
  const spentAt = dateRange(q.from, q.to);
  const where: Prisma.ExpenseWhereInput = {
    ...(q.category ? { category: q.category } : {}),
    ...(spentAt ? { spentAt } : {}),
  };

  const [total, rows, sum] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      include,
      orderBy: { spentAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    data: rows.map(serialize),
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
    total: Number(sum._sum.amount ?? 0),
  };
}

export async function createExpense(input: CreateExpenseInput, userId?: string) {
  const expense = await prisma.expense.create({
    data: {
      category: input.category,
      concept: input.concept,
      amount: input.amount,
      spentAt: input.spentAt,
      notes: input.notes || null,
      receiptUrl: input.receiptUrl || null,
      receiptKey: input.receiptKey || null,
      registeredById: userId,
    },
    include,
  });
  return serialize(expense);
}

export async function updateExpense(id: string, input: UpdateExpenseInput) {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw notFound("Egreso no encontrado");
  const expense = await prisma.expense.update({
    where: { id },
    data: {
      category: input.category,
      concept: input.concept,
      amount: input.amount,
      spentAt: input.spentAt,
      notes: input.notes,
    },
    include,
  });
  return serialize(expense);
}

export async function deleteExpense(id: string) {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw notFound("Egreso no encontrado");
  await prisma.expense.delete({ where: { id } });
  // Borra el comprobante adjunto del disco, si lo hubiera.
  await deleteFile(existing.receiptKey);
  return { ok: true };
}
