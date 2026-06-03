import ExcelJS from "exceljs";
import type { DashboardData } from "../modules/dashboard/dashboard.service.js";

const METHOD_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  DEPOSITO: "Depósito",
  TARJETA: "Tarjeta",
};

const CATEGORY_LABELS: Record<string, string> = {
  SALARIOS: "Salarios y honorarios",
  INSUMOS: "Insumos y materiales",
  SERVICIOS: "Servicios",
  MANTENIMIENTO: "Mantenimiento",
  ADMINISTRATIVOS: "Administrativos",
  IMPREVISTOS: "Imprevistos",
};

const MONEY_FMT = '"Q" #,##0.00';
const BRAND = "FF16314F";

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export async function generateDashboardExcel(
  data: DashboardData
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema Administrativo Carmen María";

  // --- Hoja 1: Resumen ---
  const s = wb.addWorksheet("Resumen");
  s.columns = [
    { width: 32 },
    { width: 18 },
  ];

  s.addRow(["Escuela de Enfermería Carmen María"]);
  s.getCell("A1").font = { bold: true, size: 14, color: { argb: BRAND } };
  s.addRow(["Reporte Financiero"]);
  s.addRow([
    `Periodo: ${fmtDate(data.period.from)} — ${fmtDate(data.period.to)}`,
  ]);
  s.addRow([]);

  const k = data.kpis;
  const kpiRows: [string, number][] = [
    ["Ingreso neto del periodo", k.netIncome],
    ["Monto bruto", k.grossIncome],
    ["Descuentos / becas", k.discounts],
    ["Egresos del periodo", k.totalExpenses],
    ["Saldo neto", k.balance],
  ];
  for (const [label, value] of kpiRows) {
    const row = s.addRow([label, value]);
    row.getCell(1).font = { bold: label.includes("neto") };
    row.getCell(2).numFmt = MONEY_FMT;
  }
  s.addRow([]);
  s.addRow(["Pagos registrados", k.paymentsCount]);
  s.addRow(["Egresos registrados", k.expensesCount]);

  // --- Hoja 2: Ingresos por método ---
  const im = wb.addWorksheet("Ingresos por método");
  im.columns = [{ width: 24 }, { width: 18 }];
  const imHead = im.addRow(["Método", "Total"]);
  imHead.font = { bold: true, color: { argb: "FFFFFFFF" } };
  imHead.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  });
  for (const m of data.incomeByMethod) {
    const r = im.addRow([METHOD_LABELS[m.method] ?? m.method, m.total]);
    r.getCell(2).numFmt = MONEY_FMT;
  }

  // --- Hoja 3: Egresos por categoría ---
  const ec = wb.addWorksheet("Egresos por categoría");
  ec.columns = [{ width: 28 }, { width: 18 }];
  const ecHead = ec.addRow(["Categoría", "Total"]);
  ecHead.font = { bold: true, color: { argb: "FFFFFFFF" } };
  ecHead.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  });
  for (const c of data.expensesByCategory) {
    const r = ec.addRow([CATEGORY_LABELS[c.category] ?? c.category, c.total]);
    r.getCell(2).numFmt = MONEY_FMT;
  }

  // --- Hoja 4: Movimiento mensual ---
  const mm = wb.addWorksheet("Movimiento mensual");
  mm.columns = [{ width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }];
  const mmHead = mm.addRow(["Mes", "Ingresos", "Egresos", "Saldo"]);
  mmHead.font = { bold: true, color: { argb: "FFFFFFFF" } };
  mmHead.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  });
  for (const row of data.monthly) {
    const r = mm.addRow([row.label, row.income, row.expense, row.balance]);
    r.getCell(2).numFmt = MONEY_FMT;
    r.getCell(3).numFmt = MONEY_FMT;
    r.getCell(4).numFmt = MONEY_FMT;
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
