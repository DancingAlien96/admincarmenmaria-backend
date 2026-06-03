import PDFDocument from "pdfkit";
import type { Acta, ActaEntry } from "@prisma/client";

const BRAND = "#16314f";
const GRAY = "#444444";
const LIGHT = "#e5e7eb";

type ActaWithEntries = Acta & { entries: ActaEntry[] };

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function generateActaPDF(acta: ActaWithEntries): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // --- Membrete ---
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("Escuela de Enfermería Carmen María", left, 50, {
        width,
        align: "center",
      });
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(10)
      .text("Acta de Calificaciones", left, 72, { width, align: "center" });
    doc.moveTo(left, 92).lineTo(right, 92).strokeColor(BRAND).lineWidth(2).stroke();

    // --- Datos del acta ---
    let y = 105;
    doc.fillColor("#111111").font("Helvetica").fontSize(10);
    const lineH = 16;
    const col2 = left + width / 2;
    doc.font("Helvetica-Bold").text("No. de acta: ", left, y, { continued: true }).font("Helvetica").text(acta.actaNumber);
    doc.font("Helvetica-Bold").text("No. de folios: ", col2, y, { continued: true }).font("Helvetica").text(acta.folios ?? "—");
    y += lineH;
    doc.font("Helvetica-Bold").text("Fecha: ", left, y, { continued: true }).font("Helvetica").text(fmtDate(acta.actaDate));
    y += lineH;
    doc.font("Helvetica-Bold").text("Fase: ", left, y, { continued: true }).font("Helvetica").text(acta.phase);
    y += lineH + 10;

    // --- Tabla de punteos ---
    const numW = 30;
    const scoreW = 80;
    const nameW = width - numW - scoreW;
    const rowH = 22;

    function tableHeader(yPos: number) {
      doc.rect(left, yPos, width, rowH).fill(BRAND);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
      doc.text("No.", left + 6, yPos + 6, { width: numW - 6 });
      doc.text("Estudiante", left + numW + 6, yPos + 6, { width: nameW - 6 });
      doc.text("Punteo", left + numW + nameW, yPos + 6, {
        width: scoreW,
        align: "center",
      });
      return yPos + rowH;
    }

    y = tableHeader(y);

    acta.entries.forEach((e, i) => {
      // Salto de pagina si se acaba el espacio
      if (y > doc.page.height - 160) {
        doc.addPage();
        y = doc.page.margins.top;
        y = tableHeader(y);
      }
      const bg = i % 2 === 0 ? "#ffffff" : "#f7f8fa";
      doc.rect(left, y, width, rowH).fill(bg);
      doc.rect(left, y, width, rowH).strokeColor(LIGHT).lineWidth(0.5).stroke();
      doc.fillColor("#111111").font("Helvetica").fontSize(10);
      doc.text(String(i + 1), left + 6, y + 6, { width: numW - 6 });
      doc.text(e.studentName, left + numW + 6, y + 6, { width: nameW - 6 });
      doc.text(Number(e.score).toFixed(2), left + numW + nameW, y + 6, {
        width: scoreW,
        align: "center",
      });
      y += rowH;
    });

    // Promedio del grupo
    if (acta.entries.length > 0) {
      const avg =
        acta.entries.reduce((s, e) => s + Number(e.score), 0) /
        acta.entries.length;
      doc.rect(left, y, width, rowH).fill("#eef2f7");
      doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(10);
      doc.text("Promedio del grupo", left + numW + 6, y + 6, {
        width: nameW - 6,
      });
      doc.text(avg.toFixed(2), left + numW + nameW, y + 6, {
        width: scoreW,
        align: "center",
      });
      y += rowH;
    }

    // --- Firma ---
    const signY = Math.min(y + 80, doc.page.height - 130);
    doc.moveTo(left + 120, signY).lineTo(right - 120, signY).strokeColor("#999999").lineWidth(1).stroke();
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(11)
      .text("Dirección", left, signY + 8, { width, align: "center" })
      .text("Escuela de Enfermería Carmen María", left, signY + 24, {
        width,
        align: "center",
      });

    // --- Pie ---
    const footY = doc.page.height - 95;
    doc.moveTo(left, footY).lineTo(right, footY).strokeColor(LIGHT).lineWidth(1).stroke();
    doc
      .fillColor(GRAY)
      .fontSize(9)
      .text(`Generado el ${fmtDate(new Date())}`, left, footY + 10, {
        width,
        align: "center",
        lineBreak: false,
      });

    doc.end();
  });
}
