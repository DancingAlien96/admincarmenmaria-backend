import path from "node:path";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

const BRAND = "#16314f";
const BRAND_XLSX = "FF16314F";
const GRAY = "#666666";
const LIGHT = "#dddddd";
const ASSETS_DIR = path.resolve(process.cwd(), "assets");

// Estructura genérica de cualquier reporte. Los builders producen esto y el
// renderizador lo convierte a PDF o Excel (un solo motor para todos).
export interface ReportKpi {
  label: string;
  value: string;
}
export interface ReportTable {
  title?: string;
  columns: string[];
  rows: (string | number)[][];
  totals?: (string | number)[]; // fila de totales opcional
}
export interface ReportData {
  title: string; // ej. "Cobranza General"
  subtitle?: string; // ej. "Tendencia de pagos…"
  periodLabel?: string; // ej. "Enero – Junio 2026"
  kpis?: ReportKpi[];
  tables: ReportTable[];
}

const INST = "Escuela de Enfermería Carmen María";

function fmtToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("day")}/${get("month")}/${get("year")}`;
}

// ---------------------------------------------------------------- PDF --------
export function renderReportPDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 45 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Encabezado: logo + institución (izq) / fecha (der)
    try {
      doc.image(path.join(ASSETS_DIR, "logo.png"), left, 38, { width: 70 });
    } catch {
      /* sin logo */
    }
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(INST, left + 82, 44, { width: width - 82 });
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(9)
      .text(`Generado el ${fmtToday()}`, left + 82, 66, { width: width - 82 });
    doc.moveTo(left, 100).lineTo(right, 100).strokeColor(BRAND).lineWidth(2).stroke();

    doc.y = 116;
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(17).text(data.title, left, doc.y);
    if (data.subtitle)
      doc.fillColor(GRAY).font("Helvetica").fontSize(10).text(data.subtitle, left);
    if (data.periodLabel)
      doc.fillColor(GRAY).font("Helvetica").fontSize(10).text(`Periodo: ${data.periodLabel}`, left);
    doc.moveDown(0.6);

    // KPIs en tarjetas
    if (data.kpis && data.kpis.length) {
      const cols = Math.min(4, data.kpis.length);
      const gap = 8;
      const cardW = (width - gap * (cols - 1)) / cols;
      const startY = doc.y;
      data.kpis.forEach((k, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = left + col * (cardW + gap);
        const y = startY + row * 52;
        doc.roundedRect(x, y, cardW, 46, 4).fillAndStroke("#f4f6f9", LIGHT);
        doc.fillColor(GRAY).font("Helvetica").fontSize(7.5).text(k.label.toUpperCase(), x + 8, y + 7, { width: cardW - 16 });
        doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(13).text(k.value, x + 8, y + 22, { width: cardW - 16 });
      });
      const rows = Math.ceil(data.kpis.length / cols);
      doc.y = startY + rows * 52 + 6;
    }

    // Tablas
    for (const table of data.tables) {
      renderPdfTable(doc, left, width, table);
    }

    // Pie: se anula el margen inferior para que escribir cerca del borde no
    // provoque una página en blanco extra.
    const footY = doc.page.height - 34;
    doc.page.margins.bottom = 0;
    doc.moveTo(left, footY).lineTo(right, footY).strokeColor(LIGHT).lineWidth(1).stroke();
    doc.fillColor(GRAY).font("Helvetica").fontSize(8).text(
      `${INST} — Documento generado por el sistema administrativo`,
      left,
      footY + 6,
      { width, align: "center", lineBreak: false }
    );

    doc.end();
  });
}

function renderPdfTable(
  doc: PDFKit.PDFDocument,
  left: number,
  width: number,
  table: ReportTable
) {
  if (doc.y + 60 > doc.page.height - 60) doc.addPage();
  if (table.title) {
    doc.moveDown(0.5).fillColor(BRAND).font("Helvetica-Bold").fontSize(11).text(table.title, left, doc.y);
    doc.moveDown(0.2);
  }
  const nCols = table.columns.length;
  const colW = width / nCols;
  const rowH = 18;

  const header = (y: number) => {
    doc.rect(left, y, width, rowH).fill(BRAND);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);
    table.columns.forEach((c, i) =>
      doc.text(c, left + i * colW + 5, y + 5, {
        width: colW - 8,
        align: i === 0 ? "left" : "right",
      })
    );
  };

  let y = doc.y;
  header(y);
  y += rowH;

  const drawRow = (cells: (string | number)[], bold = false) => {
    if (y + rowH > doc.page.height - 55) {
      doc.addPage();
      y = doc.page.margins.top;
      header(y);
      y += rowH;
    }
    doc.rect(left, y, width, rowH).strokeColor("#eeeeee").lineWidth(0.5).stroke();
    doc.fillColor("#111111").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    cells.forEach((c, i) =>
      doc.text(String(c), left + i * colW + 5, y + 5, {
        width: colW - 8,
        align: i === 0 ? "left" : "right",
      })
    );
    y += rowH;
  };

  table.rows.forEach((r) => drawRow(r));
  if (table.totals) drawRow(table.totals, true);
  doc.y = y + 8;
}

// -------------------------------------------------------------- Excel --------
export async function renderReportExcel(data: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = INST;
  const s = wb.addWorksheet("Reporte");
  s.columns = [{ width: 40 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];

  s.addRow([INST]);
  s.getCell("A1").font = { bold: true, size: 14, color: { argb: BRAND_XLSX } };
  s.addRow([data.title]);
  s.getCell("A2").font = { bold: true, size: 12 };
  if (data.subtitle) s.addRow([data.subtitle]);
  if (data.periodLabel) s.addRow([`Periodo: ${data.periodLabel}`]);
  s.addRow([`Generado el ${fmtToday()}`]);
  s.addRow([]);

  if (data.kpis && data.kpis.length) {
    for (const k of data.kpis) {
      const r = s.addRow([k.label, k.value]);
      r.getCell(1).font = { bold: true };
    }
    s.addRow([]);
  }

  for (const table of data.tables) {
    if (table.title) {
      const t = s.addRow([table.title]);
      t.getCell(1).font = { bold: true, size: 11, color: { argb: BRAND_XLSX } };
    }
    const head = s.addRow(table.columns);
    head.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_XLSX } };
    });
    for (const row of table.rows) s.addRow(row);
    if (table.totals) {
      const tr = s.addRow(table.totals);
      tr.eachCell((cell) => (cell.font = { bold: true }));
    }
    s.addRow([]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
