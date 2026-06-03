import PDFDocument from "pdfkit";
import type { Graduate } from "@prisma/client";

const BRAND = "#16314f";
const GRAY = "#444444";
const LIGHT = "#e5e7eb";

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

function header(doc: PDFKit.PDFDocument, left: number, right: number) {
  doc
    .fillColor(BRAND)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("Escuela de Enfermería Carmen María", left, 55, {
      width: right - left,
      align: "center",
    });
  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(10)
    .text("enfermeriacarmenmaria.edu.gt", left, 80, {
      width: right - left,
      align: "center",
    });
  doc.moveTo(left, 105).lineTo(right, 105).strokeColor(BRAND).lineWidth(2).stroke();
}

function footer(doc: PDFKit.PDFDocument, left: number, right: number) {
  const width = right - left;
  const footY = doc.page.height - 110;
  doc.moveTo(left, footY).lineTo(right, footY).strokeColor(LIGHT).lineWidth(1).stroke();
  doc
    .fillColor(GRAY)
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Documento emitido por el sistema administrativo de la Escuela de Enfermería Carmen María.",
      left,
      footY + 12,
      { width, align: "center" }
    );
  doc.text(`Emitido el ${fmtDate(new Date())}`, left, footY + 38, {
    width,
    align: "center",
    lineBreak: false,
  });
}

// Constancia de egreso
export function generateConstanciaPDF(g: Graduate): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    header(doc, left, right);

    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("CONSTANCIA DE EGRESO", left, 150, { width, align: "center" });

    const body =
      `Por este medio se hace constar que ${g.fullName}, con Documento Personal de ` +
      `Identificación (DPI) número ${g.dpi}, completó satisfactoriamente el programa ` +
      `de estudios impartido por la Escuela de Enfermería Carmen María, ` +
      `habiéndose graduado con fecha ${fmtDate(g.graduationDate)}.`;

    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(12)
      .text(body, left, 210, { width, align: "justify", lineGap: 6 });

    let y = 320;
    doc.fillColor(GRAY).fontSize(11);
    doc.text(`No. de diploma: ${g.diplomaNumber}`, left, y);
    if (g.mspasCode) {
      y += 20;
      doc.text(`Código MSPAS: ${g.mspasCode}`, left, y);
    }

    doc
      .fillColor("#111111")
      .text(
        "Y para los usos que al interesado convengan, se extiende la presente constancia.",
        left,
        y + 50,
        { width, align: "justify", lineGap: 6 }
      );

    // Espacio de firma
    const signY = 480;
    doc.moveTo(left + 120, signY).lineTo(right - 120, signY).strokeColor("#999999").lineWidth(1).stroke();
    doc
      .fillColor(GRAY)
      .fontSize(11)
      .text("Dirección", left, signY + 8, { width, align: "center" })
      .text("Escuela de Enfermería Carmen María", left, signY + 24, {
        width,
        align: "center",
      });

    footer(doc, left, right);
    doc.end();
  });
}

// Carta de recomendacion. Solo varia fecha/nombre/DPI (+ firma digital futura).
export function generateRecommendationPDF(
  g: Graduate,
  issueDate: Date
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    header(doc, left, right);

    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(11)
      .text(`Guatemala, ${fmtDate(issueDate)}`, left, 130, {
        width,
        align: "right",
      });

    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("CARTA DE RECOMENDACIÓN", left, 170, { width, align: "center" });

    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(12)
      .text("A quien corresponda:", left, 220);

    const body =
      `Por medio de la presente, la Escuela de Enfermería Carmen María se complace en ` +
      `recomendar a ${g.fullName}, con DPI número ${g.dpi}, quien cursó y completó ` +
      `satisfactoriamente sus estudios en nuestra institución.\n\n` +
      `Durante su formación, demostró responsabilidad, dedicación y vocación de servicio, ` +
      `cualidades propias de un profesional de enfermería. Por ello, recomendamos ampliamente ` +
      `a el/la egresado/a para desempeñarse en el ámbito laboral que requiera de sus ` +
      `conocimientos y competencias.\n\n` +
      `Se extiende la presente para los fines que el/la interesado/a estime convenientes.`;

    doc.text(body, left, 250, { width, align: "justify", lineGap: 6 });

    // Firma
    const signY = 470;
    doc.moveTo(left + 120, signY).lineTo(right - 120, signY).strokeColor("#999999").lineWidth(1).stroke();
    doc
      .fillColor(GRAY)
      .fontSize(11)
      .text("Dirección", left, signY + 8, { width, align: "center" })
      .text("Escuela de Enfermería Carmen María", left, signY + 24, {
        width,
        align: "center",
      });

    footer(doc, left, right);
    doc.end();
  });
}
