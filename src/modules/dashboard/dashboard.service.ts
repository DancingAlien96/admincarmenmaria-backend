import { prisma } from "../../lib/prisma.js";
import { paidByCharge } from "../charges/charges.service.js";
import type { DashboardQuery } from "./dashboard.schemas.js";

// Calcula KPIs de cobranza: ingreso esperado, mora y estudiantes al dia/en mora.
async function getMora(from: Date, to: Date) {
  const now = new Date();

  // Ingreso esperado del periodo: cargos con vencimiento en el rango (no anulados)
  const expectedAgg = await prisma.charge.aggregate({
    where: { status: { not: "ANULADO" }, dueDate: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  const expectedIncome = Number(expectedAgg._sum.amount ?? 0);

  // Mora acumulada: cargos PENDIENTE ya vencidos (hasta hoy)
  const overdueCharges = await prisma.charge.findMany({
    where: { status: "PENDIENTE", dueDate: { lt: now } },
    select: { id: true, amount: true, studentId: true },
  });
  const paid = await paidByCharge(overdueCharges.map((c) => c.id));

  let moraTotal = 0;
  const studentsInMora = new Set<string>();
  for (const c of overdueCharges) {
    const saldo = Number(c.amount) - (paid.get(c.id) ?? 0);
    if (saldo > 0) {
      moraTotal += saldo;
      studentsInMora.add(c.studentId);
    }
  }

  // Estudiantes activos (no egresados ni de baja)
  const enrolled = await prisma.student.count({
    where: { archived: false, status: "ACTIVO" },
  });
  const inMora = studentsInMora.size;
  const upToDate = Math.max(0, enrolled - inMora);

  return {
    expectedIncome,
    moraTotal,
    studentsInMora: inMora,
    studentsUpToDate: upToDate,
    enrolled,
  };
}

// Resuelve el periodo: usa from/to o, por defecto, el mes en curso.
function resolvePeriod(q: DashboardQuery) {
  const now = new Date();
  const from = q.from
    ? new Date(q.from)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = q.to ? new Date(q.to) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export async function getDashboard(q: DashboardQuery) {
  const { from, to } = resolvePeriod(q);

  // --- Ingresos del periodo (pagos ACTIVOS) ---
  const paymentsWhere = {
    status: "ACTIVO" as const,
    paidAt: { gte: from, lte: to },
  };

  const [incomeAgg, expenseAgg, byMethod, byCategory] = await Promise.all([
    prisma.payment.aggregate({
      where: paymentsWhere,
      _sum: { amount: true, discount: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { spentAt: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: paymentsWhere,
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { spentAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
  ]);

  const grossIncome = Number(incomeAgg._sum.amount ?? 0);
  const discounts = Number(incomeAgg._sum.discount ?? 0);
  const netIncome = grossIncome - discounts;
  const totalExpenses = Number(expenseAgg._sum.amount ?? 0);

  // KPIs de cobranza (mora, ingreso esperado, estudiantes al dia/en mora)
  const mora = await getMora(from, to);

  // --- Serie mensual de los ultimos 12 meses (ingresos vs egresos) ---
  const now = new Date();
  const seriesStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [monthlyPayments, monthlyExpenses] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "ACTIVO", paidAt: { gte: seriesStart } },
      select: { paidAt: true, amount: true, discount: true },
    }),
    prisma.expense.findMany({
      where: { spentAt: { gte: seriesStart } },
      select: { spentAt: true, amount: true },
    }),
  ]);

  // Inicializa 12 cubos mensuales
  const buckets: {
    key: string;
    label: string;
    income: number;
    expense: number;
  }[] = [];
  const indexByKey = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    indexByKey.set(key, buckets.length);
    buckets.push({
      key,
      label: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      income: 0,
      expense: 0,
    });
  }

  for (const p of monthlyPayments) {
    const key = `${p.paidAt.getFullYear()}-${p.paidAt.getMonth()}`;
    const idx = indexByKey.get(key);
    if (idx !== undefined) {
      buckets[idx]!.income += Number(p.amount) - Number(p.discount);
    }
  }
  for (const e of monthlyExpenses) {
    const key = `${e.spentAt.getFullYear()}-${e.spentAt.getMonth()}`;
    const idx = indexByKey.get(key);
    if (idx !== undefined) {
      buckets[idx]!.expense += Number(e.amount);
    }
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    kpis: {
      netIncome,
      grossIncome,
      discounts,
      totalExpenses,
      balance: netIncome - totalExpenses,
      paymentsCount: incomeAgg._count,
      expensesCount: expenseAgg._count,
      // Cobranza
      expectedIncome: mora.expectedIncome,
      moraTotal: mora.moraTotal,
      studentsInMora: mora.studentsInMora,
      studentsUpToDate: mora.studentsUpToDate,
      enrolled: mora.enrolled,
    },
    incomeByMethod: byMethod.map((m) => ({
      method: m.method,
      total: Number(m._sum.amount ?? 0),
    })),
    expensesByCategory: byCategory.map((c) => ({
      category: c.category,
      total: Number(c._sum.amount ?? 0),
    })),
    monthly: buckets.map((b) => ({
      label: b.label,
      income: b.income,
      expense: b.expense,
      balance: b.income - b.expense,
    })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

// Estadisticas generales para la pagina de inicio (overview).
const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

export async function getOverview() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  const [
    studentsByStatus,
    graduatesTotal,
    incomeYearAgg,
    expenseYearAgg,
    paymentsBySource,
    monthlyPayments,
    overdueCharges,
    actasTotal,
    waOutbound,
  ] = await Promise.all([
    prisma.student.groupBy({ by: ["status"], _count: true }),
    prisma.graduate.count(),
    prisma.payment.aggregate({
      where: { status: "ACTIVO", paidAt: { gte: yearStart, lte: yearEnd } },
      _sum: { amount: true, discount: true },
    }),
    prisma.expense.aggregate({
      where: { spentAt: { gte: yearStart, lte: yearEnd } },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ["source"],
      where: { status: "ACTIVO", paidAt: { gte: yearStart, lte: yearEnd } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.findMany({
      where: { status: "ACTIVO", paidAt: { gte: yearStart, lte: yearEnd } },
      select: { paidAt: true, amount: true, discount: true },
    }),
    prisma.charge.findMany({
      where: { status: "PENDIENTE", dueDate: { lt: now } },
      select: { id: true, amount: true },
    }),
    prisma.acta.count(),
    prisma.whatsappMessage.count({ where: { direction: "OUTBOUND" } }),
  ]);

  // Estudiantes por estado -> objeto
  const statusCounts: Record<string, number> = {
    ACTIVO: 0, EGRESADO: 0, BAJA: 0,
  };
  let studentsTotal = 0;
  for (const r of studentsByStatus) {
    statusCounts[r.status] = r._count;
    studentsTotal += r._count;
  }

  // Ingresos del año (neto) y egresos
  const incomeYear =
    Number(incomeYearAgg._sum.amount ?? 0) - Number(incomeYearAgg._sum.discount ?? 0);
  const expenseYear = Number(expenseYearAgg._sum.amount ?? 0);

  // Serie mensual del año en curso
  const monthly = MONTHS_ES.map((label, i) => ({ label, income: 0, month: i }));
  for (const p of monthlyPayments) {
    const m = p.paidAt.getMonth();
    monthly[m]!.income += Number(p.amount) - Number(p.discount);
  }

  // Mora total
  const moraTotal = overdueCharges.reduce((s, c) => s + Number(c.amount), 0);

  return {
    year: now.getFullYear(),
    students: { total: studentsTotal, byStatus: statusCounts },
    graduatesTotal,
    actasTotal,
    finance: {
      incomeYear,
      expenseYear,
      balanceYear: incomeYear - expenseYear,
      moraTotal,
    },
    paymentsBySource: paymentsBySource.map((s) => ({
      source: s.source,
      total: Number(s._sum.amount ?? 0),
      count: s._count,
    })),
    monthlyIncome: monthly.map((m) => ({ label: m.label, income: m.income })),
    whatsappOutbound: waOutbound,
  };
}

export type OverviewData = Awaited<ReturnType<typeof getOverview>>;
