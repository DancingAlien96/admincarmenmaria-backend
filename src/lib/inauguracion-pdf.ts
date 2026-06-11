import path from "node:path";
import PDFDocument from "pdfkit";

const BRAND = "#16314f";
const GRAY = "#444444";
const ASSETS_DIR = path.resolve(process.cwd(), "assets");
const asset = (name: string) => path.join(ASSETS_DIR, name);

// Numeros a palabras (dia/hora/anio) — suficiente para el rango usado en actas.
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

function numWords(n: number): string {
  return UNITS[n] ?? String(n);
}
function yearWords(y: number): string {
  const r = y - 2000;
  return r === 0 ? "dos mil" : `dos mil ${UNITS[r] ?? String(r)}`;
}
// "siete horas en punto" / "catorce horas en punto"
function hourWords(h: number): string {
  return `${numWords(h)} horas`;
}

export interface InauguracionData {
  actaNumber: string;
  folios: string | null;
  promocion: string; // ej. "décima"
  cohorte: number;
  actoDate: Date;
  closeDate: Date;
  city: string;
  department: string;
  directora: string;
  docente: string;
  secretario: string;
  students: string[]; // nombres en orden
}

export function generateInauguracionPDF(d: InauguracionData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 55 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Logo centrado arriba
    try {
      doc.image(asset("logo.png"), (doc.page.width - 90) / 2, 40, { width: 90 });
    } catch {
      /* sin logo */
    }
    doc.y = 140;

    const act = d.actoDate;
    const close = d.closeDate;

    const intro =
      `El infrascrito Secretario de la Escuela Privada de auxiliares de Enfermería ` +
      `"CARMEN MARÍA" CERTIFICA: Haber tenido a la vista el Libro de Actas autorizado ` +
      `por el Departamento de Formación y Educación en Salud del Ministerio de Salud ` +
      `Pública y Asistencia Social de fecha veinte de febrero del año dos mil diecisiete ` +
      `(20/02/2017) en el que a folios números ${d.folios ?? "____"} se encuentra el ` +
      `Acta número ${d.actaNumber}, que transcrita literalmente dice: ` +
      `--------------------------------------------------`;

    const cuerpo =
      `Acta ${d.actaNumber}. En la ciudad de ${d.city} del Departamento de ${d.department} ` +
      `siendo las ${hourWords(act.getUTCHours() || 7)} en punto del día ${DOW[act.getUTCDay()]} ` +
      `${numWords(act.getUTCDate())} de ${MONTHS[act.getUTCMonth()]} del año ${yearWords(act.getUTCFullYear())}, ` +
      `estando reunidos en oficinas administrativas de la Escuela Privada de Auxiliares de ` +
      `Enfermería "Carmen María", doce avenida tercera calle, segundo nivel edificio Veredita, ` +
      `las siguientes personas: ${d.directora}, Directora Técnica; ${d.docente}, Docente; ` +
      `Y quien suscribe la presente acta ${d.secretario}, Secretario; dejando constancia de lo ` +
      `siguiente: PRIMERO: Se da por iniciado el acto de inauguración correspondiente a la ` +
      `${d.promocion} promoción de auxiliares de enfermería del año ${yearWords(d.cohorte)}, la ` +
      `Dirección procede a dar las palabras de bienvenida a los presentes. SEGUNDO: El Secretario ` +
      `procede a presentar al personal administrativo y docente de la escuela; también hace ` +
      `presentación de la resolución Ministerial que avala al centro educativo y procede a informar ` +
      `los detalles generales del curso. TERCERO: El personal docente procede a presentarse con el ` +
      `grupo estudiantil e informa que formará parte del personal que impartirá el curso. CUARTO: ` +
      `La Dirección procede a dar lectura a la normativa número doscientos cuarenta y nueve diagonal ` +
      `dos mil veintitrés del Departamento de Formación y Educación en Salud y a la normativa interna ` +
      `de la escuela. QUINTO: El Secretario procede a informar y hacer entrega de la solicitud de ` +
      `ingreso y contrato educativo con los presentes. SEXTO: El Secretario procede a efectuar ` +
      `registro de ${numWords(d.students.length)} alumnos para la cohorte ${yearWords(d.cohorte)}, ` +
      `siendo estos los siguientes:`;

    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(11)
      .text(intro, { align: "justify", lineGap: 3 })
      .moveDown(0.5)
      .text(cuerpo, { align: "justify", lineGap: 3 })
      .moveDown(0.8);

    // --- Tabla de alumnos ---
    const rowH = 20;
    const noW = 40;
    const tableTop = doc.y;
    function tableHeader(y: number) {
      doc.rect(left, y, width, rowH).fill(BRAND);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
      doc.text("NO.", left + 6, y + 6, { width: noW - 8 });
      doc.text("NOMBRE DEL ALUMNO", left + noW + 6, y + 6);
    }
    tableHeader(tableTop);
    let y = tableTop + rowH;

    d.students.forEach((name, i) => {
      // Salto de pagina si no cabe
      if (y + rowH > doc.page.height - 70) {
        doc.addPage();
        y = doc.page.margins.top;
        tableHeader(y);
        y += rowH;
      }
      doc.rect(left, y, noW, rowH).strokeColor("#cccccc").lineWidth(0.5).stroke();
      doc.rect(left + noW, y, width - noW, rowH).strokeColor("#cccccc").lineWidth(0.5).stroke();
      doc.fillColor("#111111").font("Helvetica").fontSize(10);
      doc.text(String(i + 1), left + 6, y + 6, { width: noW - 8 });
      doc.text(name, left + noW + 6, y + 6, { width: width - noW - 12 });
      y += rowH;
    });
    doc.y = y + 12;

    // --- Cierre (SÉPTIMO / OCTAVO) ---
    const horaFin = hourWords(close.getUTCHours() || 14);
    const cierre =
      `SÉPTIMO: El Secretario procede a dejar establecido el grupo oficial para la cohorte ` +
      `${yearWords(d.cohorte)} y procede a recoger las solicitudes de ingreso firmadas por cada ` +
      `alumno. OCTAVO: No habiendo más que hacer constar se da por finalizada la presente, en el ` +
      `mismo lugar y fecha, a siete horas de su inicio, siendo las ${horaFin} en punto. Damos fé.`;

    const remite =
      `Y PARA REMITIR A DONDE CORRESPONDE, SE EXTIENDE LA PRESENTE EN PAPEL BOND MEMBRETADO, EL ` +
      `${DOW[close.getUTCDay()].toUpperCase()} ${numWords(close.getUTCDate()).toUpperCase()} DE ` +
      `${MONTHS[close.getUTCMonth()].toUpperCase()} DEL AÑO ${yearWords(close.getUTCFullYear()).toUpperCase()}.`;

    if (doc.y + 160 > doc.page.height - 70) doc.addPage();
    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(11)
      .text(cierre, left, doc.y, { align: "justify", lineGap: 3 })
      .moveDown(0.6)
      .font("Helvetica-Bold")
      .text(remite, { align: "justify", lineGap: 3 });

    // --- Firmas ---
    const signY = doc.y + 60;
    try {
      doc.image(asset("firma.png"), left + 20, signY - 35, { width: 120 });
    } catch {
      /* sin firma */
    }
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#111111")
      .text(d.secretario, left, signY, { width: 230 })
      .text("Secretario", left, signY + 14, { width: 230 });

    doc
      .font("Helvetica")
      .text(`Vo.Bo. ${d.directora}`, left, signY + 60, { width })
      .text("Directora Técnica", left, signY + 74, { width });

    doc.end();
  });
}
