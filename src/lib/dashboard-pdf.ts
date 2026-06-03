import PDFDocument from "pdfkit";
import type { DashboardData } from "../modules/dashboard/dashboard.service.js";

const BRAND = "#16314f";
const GRAY = "#666666";
const LIGHT = "#e5e7eb";
const GREEN = "#15803d";
const RED = "#b91c1c";

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

function gtq(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return (
    sign +
    "Q " +
    Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  );
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function generateDashboardPDF(data: DashboardData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // --- Encabezado ---
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("Escuela de Enfermería Carmen María", left, 55);
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(12)
      .text("Reporte Financiero", left, 80);
    doc
      .fontSize(10)
      .text(
        `Periodo: ${fmtDate(new Date(data.period.from))} — ${fmtDate(
          new Date(data.period.to)
        )}`,
        left,
        98
      );
    doc.moveTo(left, 118).lineTo(right, 118).strokeColor(BRAND).lineWidth(2).stroke();

    // --- KPIs principales ---
    let y = 135;
    const k = data.kpis;
    const kpiRows: [string, string, string?][] = [
      ["Ingreso neto del periodo", gtq(k.netIncome), GREEN],
      ["  Monto bruto", gtq(k.grossIncome)],
      ["  Descuentos / becas", gtq(k.discounts)],
      ["Egresos del periodo", gtq(k.totalExpenses), RED],
      ["Saldo neto", gtq(k.balance), k.balance >= 0 ? GREEN : RED],
    ];
    for (const [label, value, color] of kpiRows) {
      const bold = !label.startsWith("  ");
      doc
        .fillColor(bold ? "#111111" : GRAY)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(bold ? 12 : 10)
        .text(label, left, y);
      doc
        .fillColor(color ?? "#111111")
        .font("Helvetica-Bold")
        .fontSize(bold ? 12 : 10)
        .text(value, right - 150, y, { width: 150, align: "right" });
      y += bold ? 22 : 18;
    }

    // --- Ingresos por metodo ---
    y += 15;
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Ingresos por método", left, y);
    y += 22;
    if (data.incomeByMethod.length === 0) {
      doc.fillColor(GRAY).font("Helvetica").fontSize(10).text("Sin ingresos en el periodo.", left, y);
      y += 18;
    } else {
      for (const m of data.incomeByMethod) {
        doc.fillColor("#111111").font("Helvetica").fontSize(10);
        doc.text(METHOD_LABELS[m.method] ?? m.method, left + 10, y);
        doc.text(gtq(m.total), right - 150, y, { width: 150, align: "right" });
        y += 18;
      }
    }

    // --- Egresos por categoria ---
    y += 15;
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Egresos por categoría", left, y);
    y += 22;
    if (data.expensesByCategory.length === 0) {
      doc.fillColor(GRAY).font("Helvetica").fontSize(10).text("Sin egresos en el periodo.", left, y);
      y += 18;
    } else {
      for (const c of data.expensesByCategory) {
        doc.fillColor("#111111").font("Helvetica").fontSize(10);
        doc.text(CATEGORY_LABELS[c.category] ?? c.category, left + 10, y);
        doc.text(gtq(c.total), right - 150, y, { width: 150, align: "right" });
        y += 18;
      }
    }

    // --- Tabla mensual (ultimos 12 meses) ---
    y += 20;
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Movimiento de los últimos 12 meses", left, y);
    y += 22;

    const col = { mes: left + 10, ing: left + 150, egr: left + 290, bal: right - 110 };
    doc.rect(left, y, width, 22).fill(BRAND);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
    doc.text("Mes", col.mes, y + 7);
    doc.text("Ingresos", col.ing, y + 7);
    doc.text("Egresos", col.egr, y + 7);
    doc.text("Saldo", col.bal, y + 7, { width: 100, align: "right" });
    y += 22;

    for (const row of data.monthly) {
      doc.rect(left, y, width, 18).strokeColor(LIGHT).lineWidth(0.5).stroke();
      doc.fillColor("#111111").font("Helvetica").fontSize(9);
      doc.text(row.label, col.mes, y + 5);
      doc.fillColor(GREEN).text(gtq(row.income), col.ing, y + 5);
      doc.fillColor(RED).text(gtq(row.expense), col.egr, y + 5);
      doc
        .fillColor(row.balance >= 0 ? GREEN : RED)
        .font("Helvetica-Bold")
        .text(gtq(row.balance), col.bal, y + 5, { width: 100, align: "right" });
      y += 18;
    }

    // --- Pie ---
    // Posicion fija con margen amplio para no desbordar a otra pagina
    const footY = doc.page.height - 110;
    doc.moveTo(left, footY).lineTo(right, footY).strokeColor(LIGHT).lineWidth(1).stroke();
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(9)
      .text(`Generado el ${fmtDate(new Date())}`, left, footY + 12, {
        width,
        align: "center",
        lineBreak: false,
      });

    doc.end();
  });
}
