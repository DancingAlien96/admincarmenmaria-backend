import { prisma } from "../../lib/prisma.js";
import { paidByCharge } from "../charges/charges.service.js";
import type { ReportData } from "../../lib/report-render.js";

export const REPORT_TYPES = [
  "resumen",
  "cobranza",
  "mora",
  "estudiantes",
  "egresados",
  "sedes",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportFilters {
  from?: string;
  to?: string;
  sede?: string;
  status?: "ACTIVO" | "EGRESADO" | "BAJA";
  year?: number;
}

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
const SIN_SEDE = "Sin especificar";

const money = (n: number) =>
  "Q " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dfmt = (d: Date) => d.toLocaleDateString("es-GT");

function period(f: ReportFilters): { from: Date; to: Date; label: string } {
  const now = new Date();
  const from = f.from ? new Date(f.from) : new Date(now.getFullYear(), 0, 1);
  const to = f.to ? new Date(f.to) : new Date(now.getFullYear(), 11, 31);
  to.setHours(23, 59, 59, 999);
  return { from, to, label: `${dfmt(from)} — ${dfmt(to)}` };
}

// ---- Mora (cargos pendientes vencidos) agrupada por estudiante --------------
async function moraByStudent() {
  const now = new Date();
  const overdue = await prisma.charge.findMany({
    where: { status: "PENDIENTE", dueDate: { lt: now } },
    select: {
      id: true,
      amount: true,
      dueDate: true,
      student: { select: { id: true, fullName: true, sede: true } },
    },
  });
  const paid = await paidByCharge(overdue.map((c) => c.id));
  const map = new Map<
    string,
    { name: string; sede: string; saldo: number; cargos: number }
  >();
  for (const c of overdue) {
    const saldo = Number(c.amount) - (paid.get(c.id) ?? 0);
    if (saldo <= 0) continue;
    const key = c.student.id;
    const cur = map.get(key) ?? {
      name: c.student.fullName,
      sede: c.student.sede ?? SIN_SEDE,
      saldo: 0,
      cargos: 0,
    };
    cur.saldo += saldo;
    cur.cargos += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.saldo - a.saldo);
}

// ---- Builders ---------------------------------------------------------------

async function buildResumen(f: ReportFilters): Promise<ReportData> {
  const { from, to, label } = period(f);
  const [byStatus, income, expense, graduates, mora] = await Promise.all([
    prisma.student.groupBy({ by: ["status"], where: { archived: false }, _count: true }),
    prisma.payment.aggregate({
      where: { status: "ACTIVO", paidAt: { gte: from, lte: to } },
      _sum: { amount: true, discount: true },
    }),
    prisma.expense.aggregate({
      where: { spentAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.graduate.count(),
    moraByStudent(),
  ]);
  const status: Record<string, number> = { ACTIVO: 0, EGRESADO: 0, BAJA: 0 };
  byStatus.forEach((r) => (status[r.status] = r._count));
  const ingresos = Number(income._sum.amount ?? 0) - Number(income._sum.discount ?? 0);
  const egresos = Number(expense._sum.amount ?? 0);
  const moraTotal = mora.reduce((s, m) => s + m.saldo, 0);

  return {
    title: "Resumen Ejecutivo",
    subtitle: "Panorama general de la academia",
    periodLabel: label,
    kpis: [
      { label: "Estudiantes activos", value: String(status.ACTIVO) },
      { label: "Egresados", value: String(graduates) },
      { label: "Ingresos del periodo", value: money(ingresos) },
      { label: "Egresos del periodo", value: money(egresos) },
      { label: "Saldo del periodo", value: money(ingresos - egresos) },
      { label: "Mora acumulada", value: money(moraTotal) },
      { label: "Estudiantes en mora", value: String(mora.length) },
      { label: "De baja", value: String(status.BAJA) },
    ],
    tables: [
      {
        title: "Estudiantes por estado",
        columns: ["Estado", "Cantidad"],
        rows: [
          ["Activos", status.ACTIVO],
          ["Egresados", status.EGRESADO],
          ["De baja", status.BAJA],
        ],
      },
    ],
  };
}

async function buildCobranza(f: ReportFilters): Promise<ReportData> {
  const { from, to, label } = period(f);
  const [payments, charges] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "ACTIVO", paidAt: { gte: from, lte: to } },
      select: { paidAt: true, amount: true, discount: true },
    }),
    prisma.charge.findMany({
      where: { status: { not: "ANULADO" }, dueDate: { gte: from, lte: to } },
      select: { dueDate: true, amount: true },
    }),
  ]);

  // Agrupa por mes (cobrado vs esperado)
  const buckets = new Map<string, { label: string; cobrado: number; esperado: number }>();
  const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
  const ensure = (d: Date) => {
    const k = keyOf(d);
    if (!buckets.has(k))
      buckets.set(k, { label: `${MESES[d.getMonth()]} ${d.getFullYear()}`, cobrado: 0, esperado: 0 });
    return buckets.get(k)!;
  };
  for (const p of payments) ensure(p.paidAt).cobrado += Number(p.amount) - Number(p.discount);
  for (const c of charges) ensure(c.dueDate).esperado += Number(c.amount);

  const ordered = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((e) => e[1]);
  const totalCobrado = ordered.reduce((s, b) => s + b.cobrado, 0);
  const totalEsperado = ordered.reduce((s, b) => s + b.esperado, 0);
  const pendiente = Math.max(0, totalEsperado - totalCobrado);
  const tasa = totalEsperado > 0 ? Math.round((totalCobrado / totalEsperado) * 100) : 100;

  return {
    title: "Cobranza / Ingresos por mes",
    subtitle: "Cobrado frente a lo esperado en el periodo",
    periodLabel: label,
    kpis: [
      { label: "Cobrado", value: money(totalCobrado) },
      { label: "Esperado", value: money(totalEsperado) },
      { label: "Pendiente", value: money(pendiente) },
      { label: "Tasa de cobro", value: `${tasa}%` },
    ],
    tables: [
      {
        title: "Desglose mensual",
        columns: ["Mes", "Cobrado", "Esperado"],
        rows: ordered.map((b) => [b.label, money(b.cobrado), money(b.esperado)]),
        totals: ["Total", money(totalCobrado), money(totalEsperado)],
      },
    ],
  };
}

async function buildMora(f: ReportFilters): Promise<ReportData> {
  let list = await moraByStudent();
  if (f.sede) list = list.filter((m) => m.sede === f.sede);
  const total = list.reduce((s, m) => s + m.saldo, 0);
  return {
    title: "Estudiantes en mora",
    subtitle: "Cuotas pendientes ya vencidas" + (f.sede ? ` — sede ${f.sede}` : ""),
    kpis: [
      { label: "Estudiantes en mora", value: String(list.length) },
      { label: "Mora total", value: money(total) },
    ],
    tables: [
      {
        title: "Detalle por estudiante",
        columns: ["Estudiante", "Sede", "Cuotas vencidas", "Saldo"],
        rows: list.map((m) => [m.name, m.sede, m.cargos, money(m.saldo)]),
        totals: ["Total", "", "", money(total)],
      },
    ],
  };
}

async function buildEstudiantes(f: ReportFilters): Promise<ReportData> {
  const where: Record<string, unknown> = { archived: false };
  if (f.status) where.status = f.status;
  if (f.sede) where.sede = f.sede;
  if (f.year)
    where.enrollmentDate = {
      gte: new Date(f.year, 0, 1),
      lt: new Date(f.year + 1, 0, 1),
    };
  const rows = await prisma.student.findMany({
    where,
    orderBy: { fullName: "asc" },
    select: {
      fullName: true,
      dpi: true,
      sede: true,
      status: true,
      phonePrimary: true,
      enrollmentDate: true,
    },
  });
  const STAT: Record<string, string> = { ACTIVO: "Activo", EGRESADO: "Egresado", BAJA: "Baja" };
  const filtros = [
    f.status ? STAT[f.status] : null,
    f.sede || null,
    f.year ? String(f.year) : null,
  ].filter(Boolean);
  return {
    title: "Listado de estudiantes",
    subtitle: filtros.length ? `Filtros: ${filtros.join(" · ")}` : "Todos los expedientes activos",
    kpis: [{ label: "Total de estudiantes", value: String(rows.length) }],
    tables: [
      {
        columns: ["Nombre", "DPI", "Sede", "Estado", "Teléfono", "Inscrito"],
        rows: rows.map((r) => [
          r.fullName,
          r.dpi ?? "—",
          r.sede ?? "—",
          STAT[r.status] ?? r.status,
          r.phonePrimary ?? "—",
          dfmt(r.enrollmentDate),
        ]),
      },
    ],
  };
}

async function buildEgresados(f: ReportFilters): Promise<ReportData> {
  const where: Record<string, unknown> = {};
  if (f.year)
    where.graduationDate = {
      gte: new Date(f.year, 0, 1),
      lt: new Date(f.year + 1, 0, 1),
    };
  const rows = await prisma.graduate.findMany({
    where,
    orderBy: { graduationDate: "desc" },
    select: {
      fullName: true,
      dpi: true,
      diplomaNumber: true,
      mspasCode: true,
      graduationDate: true,
    },
  });
  return {
    title: "Egresados / Diplomas",
    subtitle: f.year ? `Año ${f.year}` : "Todos los egresados",
    kpis: [{ label: "Total de egresados", value: String(rows.length) }],
    tables: [
      {
        columns: ["Nombre", "DPI", "No. Diploma", "Código MSPAS", "Graduación"],
        rows: rows.map((r) => [
          r.fullName,
          r.dpi ?? "—",
          r.diplomaNumber,
          r.mspasCode ?? "—",
          dfmt(r.graduationDate),
        ]),
      },
    ],
  };
}

async function buildSedes(f: ReportFilters): Promise<ReportData> {
  const { from, to, label } = period(f);
  const [students, enroll, payments] = await Promise.all([
    prisma.student.groupBy({ by: ["sede"], where: { archived: false }, _count: true }),
    prisma.student.groupBy({
      by: ["sede"],
      where: { archived: false, enrollmentDate: { gte: from, lte: to } },
      _count: true,
    }),
    prisma.payment.findMany({
      where: { status: "ACTIVO", paidAt: { gte: from, lte: to } },
      select: { amount: true, discount: true, sede: true, student: { select: { sede: true } } },
    }),
  ]);
  const sedes = new Set<string>();
  const stu = new Map<string, number>();
  const enr = new Map<string, number>();
  const inc = new Map<string, number>();
  for (const r of students) {
    const k = r.sede ?? SIN_SEDE;
    sedes.add(k);
    stu.set(k, r._count);
  }
  for (const r of enroll) {
    const k = r.sede ?? SIN_SEDE;
    sedes.add(k);
    enr.set(k, r._count);
  }
  for (const p of payments) {
    const k = p.student?.sede ?? p.sede ?? SIN_SEDE;
    sedes.add(k);
    inc.set(k, (inc.get(k) ?? 0) + Number(p.amount) - Number(p.discount));
  }
  const list = [...sedes];
  return {
    title: "Reporte por sede",
    subtitle: "Comparativo de sedes",
    periodLabel: label,
    tables: [
      {
        title: "Estudiantes, inscripciones e ingresos por sede",
        columns: ["Sede", "Estudiantes", "Inscripciones", "Ingresos"],
        rows: list.map((s) => [s, stu.get(s) ?? 0, enr.get(s) ?? 0, money(inc.get(s) ?? 0)]),
        totals: [
          "Total",
          list.reduce((a, s) => a + (stu.get(s) ?? 0), 0),
          list.reduce((a, s) => a + (enr.get(s) ?? 0), 0),
          money(list.reduce((a, s) => a + (inc.get(s) ?? 0), 0)),
        ],
      },
    ],
  };
}

const BUILDERS: Record<ReportType, (f: ReportFilters) => Promise<ReportData>> = {
  resumen: buildResumen,
  cobranza: buildCobranza,
  mora: buildMora,
  estudiantes: buildEstudiantes,
  egresados: buildEgresados,
  sedes: buildSedes,
};

export async function buildReport(
  type: ReportType,
  filters: ReportFilters
): Promise<ReportData> {
  return BUILDERS[type](filters);
}
