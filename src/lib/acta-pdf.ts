import path from "node:path";
import PDFDocument from "pdfkit";
import type { Acta, ActaEntry } from "@prisma/client";

const BRAND = "#16314f";
const ASSETS_DIR = path.resolve(process.cwd(), "assets");
const asset = (name: string) => path.join(ASSETS_DIR, name);

type ActaWithEntries = Acta & { entries: ActaEntry[] };

const UNITS = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis",
  "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
  "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete",
  "veintiocho", "veintinueve", "treinta", "treinta y uno",
];
const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];
const numWords = (n: number) => UNITS[n] ?? String(n);
const yearWords = (y: number) =>
  y - 2000 === 0 ? "dos mil" : `dos mil ${UNITS[y - 2000] ?? String(y - 2000)}`;
const hourWords = (h: number) => `${numWords(h)} horas`;

export function generateActaPDF(acta: ActaWithEntries): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 55 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    const directora = acta.directora || "Licda. Ana Patricia Corado Arroyo";
    const secretario = acta.secretario || "Lic. Héctor Manuel Sarmiento Reyes";
    const d = acta.actaDate;
    const close = acta.closeDate ?? acta.actaDate;

    // Logo centrado
    try {
      doc.image(asset("logo.png"), (doc.page.width - 90) / 2, 40, { width: 90 });
    } catch {
      /* sin logo */
    }
    doc.y = 140;

    const intro =
      `El infrascrito Secretario de la Escuela Privada de auxiliares de Enfermería ` +
      `"CARMEN MARÍA" CERTIFICA: Haber tenido a la vista el Libro de Registro de ` +
      `Calificaciones autorizado por el Departamento de Formación y Educación en Salud del ` +
      `Ministerio de Salud Pública y Asistencia Social de fecha veinte de enero del año dos ` +
      `mil diecisiete (20/01/2017) en el que a folios números ${acta.folios ?? "____"} se ` +
      `encuentra el Acta número ${acta.actaNumber}, que transcrita literalmente dice: ` +
      `--------------------------------------------------`;

    const cuerpo =
      `Acta ${acta.actaNumber}. En la ciudad de Chiquimula del Departamento de Chiquimula ` +
      `siendo las ${hourWords(d.getUTCHours() || 7)} en punto del día ${DOW[d.getUTCDay()]} ` +
      `${numWords(d.getUTCDate())} de ${MONTHS[d.getUTCMonth()]} del año ${yearWords(d.getUTCFullYear())}, ` +
      `estando reunidos en oficinas administrativas de la Escuela Privada de Auxiliares de ` +
      `Enfermería Carmen María de Chiquimula, ${directora}, Directora Técnica y quien suscribe ` +
      `la presente, ${secretario}, Secretario, dejando constancia de lo siguiente. PRIMERO. ` +
      `${directora}, Directora Técnica da palabras de bienvenida a los estudiantes y procede a ` +
      `indicar que el día de hoy se realizará la evaluación final de la ${acta.phase}. SEGUNDO: ` +
      `La Dirección da detalles e instrucciones a los estudiantes para elaborar dicha evaluación, ` +
      `indicando que tienen una hora para realizarla. TERCERO: El Secretario procede a registrar ` +
      `las notas obtenidas durante dicha evaluación, siendo estas las siguientes:`;

    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(11)
      .text(intro, { align: "justify", lineGap: 3 })
      .moveDown(0.5)
      .text(cuerpo, { align: "justify", lineGap: 3 })
      .moveDown(0.8);

    // --- Tabla NO. / NOMBRE / Nota Obtenida ---
    const rowH = 20;
    const noW = 40;
    const scoreW = 90;
    const nameW = width - noW - scoreW;

    function tableHeader(y: number) {
      doc.rect(left, y, width, rowH).fill(BRAND);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
      doc.text("NO.", left + 6, y + 6, { width: noW - 8 });
      doc.text("NOMBRE DEL ALUMNO", left + noW + 6, y + 6, { width: nameW - 8 });
      doc.text("Nota Obtenida", left + noW + nameW, y + 6, { width: scoreW, align: "center" });
    }
    let y = doc.y;
    tableHeader(y);
    y += rowH;

    acta.entries.forEach((e, i) => {
      if (y + rowH > doc.page.height - 70) {
        doc.addPage();
        y = doc.page.margins.top;
        tableHeader(y);
        y += rowH;
      }
      doc.rect(left, y, noW, rowH).strokeColor("#cccccc").lineWidth(0.5).stroke();
      doc.rect(left + noW, y, nameW, rowH).strokeColor("#cccccc").lineWidth(0.5).stroke();
      doc.rect(left + noW + nameW, y, scoreW, rowH).strokeColor("#cccccc").lineWidth(0.5).stroke();
      doc.fillColor("#111111").font("Helvetica").fontSize(10);
      doc.text(String(i + 1), left + 6, y + 6, { width: noW - 8 });
      doc.text(e.studentName, left + noW + 6, y + 6, { width: nameW - 12 });
      doc.text(String(Math.round(Number(e.score))), left + noW + nameW, y + 6, {
        width: scoreW,
        align: "center",
      });
      y += rowH;
    });
    doc.y = y + 14;

    // --- Cierre (CUARTO) ---
    const cierre =
      `CUARTO. No habiendo más que hacer constar se da por finalizada la presente acta, en el ` +
      `mismo lugar y fecha, siendo las ${hourWords(close.getUTCHours() || 12)} en punto. Damos fe ` +
      `los que en ella intervenimos.`;
    const remite =
      `Y PARA REMITIR A DONDE CORRESPONDE, SE EXTIENDE LA PRESENTE EN PAPEL BOND MEMBRETADO, ` +
      `EL DÍA ${DOW[close.getUTCDay()].toUpperCase()} ${numWords(close.getUTCDate()).toUpperCase()} ` +
      `DE ${MONTHS[close.getUTCMonth()].toUpperCase()} DEL AÑO ${yearWords(close.getUTCFullYear()).toUpperCase()}.`;

    if (doc.y + 150 > doc.page.height - 70) doc.addPage();
    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(11)
      .text(cierre, left, doc.y, { align: "justify", lineGap: 3 })
      .moveDown(0.6)
      .font("Helvetica-Bold")
      .text(remite, { align: "justify", lineGap: 3 });

    // --- Firmas (bloque que no debe partirse entre paginas) ---
    const SIGN_BLOCK = 150;
    if (doc.y + 55 + SIGN_BLOCK > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      doc.y = doc.page.margins.top;
    }
    const signY = doc.y + 55;
    try {
      doc.image(asset("firma.png"), left + 20, signY - 35, { width: 120 });
    } catch {
      /* sin firma */
    }
    try {
      doc.image(asset("sello.png"), right - 150, signY - 30, { width: 120 });
    } catch {
      /* sin sello */
    }
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#111111")
      .text(secretario, left, signY, { width: 250 })
      .text("Secretario", left, signY + 14, { width: 250 });
    doc
      .text(`Vo.Bo. ${directora}`, left, signY + 60, { width })
      .text("Directora Técnica", left, signY + 74, { width });

    doc.end();
  });
}
