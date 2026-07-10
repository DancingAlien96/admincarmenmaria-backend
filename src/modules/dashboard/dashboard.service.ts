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
    moraNow,
    actasTotal,
    waOutbound,
    studentsBySedeRows,
    enrollmentsBySedeRows,
    incomePayments,
    studentsByMuniRows,
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
    // Mora = estudiantes de la cohorte actual sin mensualidad del mes en curso
    getMoraStudents(),
    prisma.acta.count(),
    prisma.whatsappMessage.count({ where: { direction: "OUTBOUND" } }),
    // Estudiantes por sede (no archivados)
    prisma.student.groupBy({
      by: ["sede"],
      where: { archived: false },
      _count: true,
    }),
    // Inscripciones del año por sede (estudiantes dados de alta este año)
    prisma.student.groupBy({
      by: ["sede"],
      where: {
        archived: false,
        enrollmentDate: { gte: yearStart, lte: yearEnd },
      },
      _count: true,
    }),
    // Pagos del año con la sede del estudiante (para ingresos por sede)
    prisma.payment.findMany({
      where: { status: "ACTIVO", paidAt: { gte: yearStart, lte: yearEnd } },
      select: {
        amount: true,
        discount: true,
        sede: true,
        student: { select: { sede: true } },
      },
    }),
    // Estudiantes por municipio (para el mapa)
    prisma.student.groupBy({
      by: ["department", "municipality"],
      where: { archived: false },
      _count: true,
    }),
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

  // Mora = cantidad de estudiantes (cohorte actual) sin la mensualidad del mes.
  const moraCount = moraNow.pending;

  // --- Demografia por sede ---
  const SIN_SEDE = "Sin especificar";

  // Estudiantes por sede
  const studentsBySede = studentsBySedeRows
    .map((r) => ({ sede: r.sede ?? SIN_SEDE, count: r._count }))
    .sort((a, b) => b.count - a.count);

  // Inscripciones (altas del año) por sede
  const enrollmentsBySede = enrollmentsBySedeRows
    .map((r) => ({ sede: r.sede ?? SIN_SEDE, count: r._count }))
    .sort((a, b) => b.count - a.count);

  // Ingresos del año por sede: prioriza la sede del estudiante, luego la del pago
  const incomeMap = new Map<string, { total: number; count: number }>();
  for (const p of incomePayments) {
    const sede = p.student?.sede ?? p.sede ?? SIN_SEDE;
    const net = Number(p.amount) - Number(p.discount);
    const cur = incomeMap.get(sede) ?? { total: 0, count: 0 };
    cur.total += net;
    cur.count += 1;
    incomeMap.set(sede, cur);
  }
  const incomeBySede = [...incomeMap.entries()]
    .map(([sede, v]) => ({ sede, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);

  // Estudiantes por municipio (para el mapa). Los que no tienen municipio
  // registrado se cuentan aparte (sin ubicación).
  let studentsWithoutLocation = 0;
  const studentsByMunicipality = studentsByMuniRows
    .map((r) => ({
      department: (r.department ?? "").trim(),
      municipality: (r.municipality ?? "").trim(),
      count: r._count,
    }))
    .filter((r) => {
      if (!r.municipality) {
        studentsWithoutLocation += r.count;
        return false;
      }
      return true;
    })
    .sort((a, b) => b.count - a.count);

  return {
    year: now.getFullYear(),
    students: { total: studentsTotal, byStatus: statusCounts },
    graduatesTotal,
    actasTotal,
    finance: {
      incomeYear,
      expenseYear,
      balanceYear: incomeYear - expenseYear,
      moraCount,
      moraLabel: moraNow.label,
    },
    paymentsBySource: paymentsBySource.map((s) => ({
      source: s.source,
      total: Number(s._sum.amount ?? 0),
      count: s._count,
    })),
    monthlyIncome: monthly.map((m) => ({ label: m.label, income: m.income })),
    whatsappOutbound: waOutbound,
    studentsBySede,
    enrollmentsBySede,
    incomeBySede,
    studentsByMunicipality,
    studentsWithoutLocation,
  };
}

export type OverviewData = Awaited<ReturnType<typeof getOverview>>;

// Estado de la mensualidad de un mes: cuántos estudiantes activos (que ya
// estaban inscritos ese mes) pagaron su mensualidad y cuántos están pendientes.
const MONTHS_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export interface MoraStudent {
  id: string;
  fullName: string;
  sede: string | null;
  department: string | null;
  municipality: string | null;
}

// Estudiantes en mora de un mes: los de la cohorte del año en curso, ya
// inscritos, que NO pagaron su mensualidad ese mes. Devuelve conteos + lista.
export async function getMoraStudents(monthStr?: string) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [yy, mm] = monthStr.split("-").map(Number);
    y = yy;
    m = mm - 1;
  }
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const yearStart = new Date(y, 0, 1); // solo la cohorte del año en curso

  const eligible = await prisma.student.findMany({
    where: {
      archived: false,
      status: "ACTIVO",
      enrollmentDate: { gte: yearStart, lte: end },
    },
    select: {
      id: true,
      fullName: true,
      sede: true,
      department: true,
      municipality: true,
    },
  });

  // Pagos de mensualidad (concepto contiene "mensual") de ese mes.
  const pays = await prisma.payment.findMany({
    where: {
      status: "ACTIVO",
      paidAt: { gte: start, lte: end },
      concept: { contains: "ensual" },
      studentId: { not: null },
    },
    select: { studentId: true },
  });
  const paidSet = new Set(pays.map((p) => p.studentId));

  const enMora = eligible.filter((s) => !paidSet.has(s.id));
  return {
    month: `${y}-${String(m + 1).padStart(2, "0")}`,
    label: `${MONTHS_FULL[m]} ${y}`,
    total: eligible.length,
    paid: eligible.length - enMora.length,
    pending: enMora.length,
    students: enMora as MoraStudent[],
  };
}

export async function getMonthlyPaymentStatus(monthStr?: string) {
  const r = await getMoraStudents(monthStr);
  return {
    month: r.month,
    label: r.label,
    total: r.total,
    paid: r.paid,
    pending: r.pending,
  };
}

export type MonthlyPaymentStatus = Awaited<
  ReturnType<typeof getMonthlyPaymentStatus>
>;

// Estudiantes por municipio para el mapa, filtrable por año de inscripción
// (por defecto, la cohorte del año en curso).
export async function getStudentsByMunicipality(yearStr?: string) {
  const now = new Date();
  const year =
    yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : now.getFullYear();

  const rows = await prisma.student.groupBy({
    by: ["municipality", "department"],
    where: {
      archived: false,
      enrollmentDate: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      },
    },
    _count: true,
  });

  let studentsWithoutLocation = 0;
  const studentsByMunicipality = rows
    .map((r) => ({
      department: (r.department ?? "").trim(),
      municipality: (r.municipality ?? "").trim(),
      count: r._count,
    }))
    .filter((r) => {
      if (!r.municipality) {
        studentsWithoutLocation += r.count;
        return false;
      }
      return true;
    })
    .sort((a, b) => b.count - a.count);

  const total = rows.reduce((s, r) => s + r._count, 0);
  return { year, total, studentsByMunicipality, studentsWithoutLocation };
}
