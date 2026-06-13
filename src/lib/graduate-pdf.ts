import path from "node:path";
import PDFDocument from "pdfkit";
import type { Graduate } from "@prisma/client";

const BRAND = "#16314f";
const GRAY = "#444444";
const LIGHT = "#e5e7eb";

// Carpeta de imagenes (logo, firma, sello), en la raiz del backend.
// Tanto en dev (tsx desde la raiz) como en el contenedor, cwd = raiz del proyecto.
const ASSETS_DIR = path.resolve(process.cwd(), "assets");
const asset = (name: string) => path.join(ASSETS_DIR, name);

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

// Fecha larga en español: "Abril 13, 2026".
// Usa getters UTC: las fechas se guardan como medianoche UTC (dia calendario),
// asi el dia no se corre por la zona horaria del servidor.
function fmtLongDate(d: Date): string {
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return `${meses[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// "Hoy" en zona horaria de Guatemala, empaquetado como mediodia UTC para que
// los getUTC* devuelvan el dia/mes/año correctos sin desfase (el server corre en UTC).
function todayInGuatemala(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 12));
}

// Numeros a palabras (para la fecha en letras del cuerpo legal).
const UNIDADES = [
  "", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis",
  "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
  "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete",
  "veintiocho", "veintinueve", "treinta", "treinta y uno",
];
const DIAS_SEMANA = [
  "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
];
const MESES_LOWER = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];
function dayInWords(n: number): string {
  return UNIDADES[n] ?? String(n);
}
function yearInWords(year: number): string {
  // Funciona para 2000-2099 (dos mil ...)
  const resto = year - 2000;
  if (resto === 0) return "dos mil";
  return `dos mil ${UNIDADES[resto] ?? String(resto)}`;
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

// Datos institucionales fijos (del modelo oficial).
const INST = {
  carrera: "AUXILIAR DE ENFERMERÍA",
  avalMinisterial: "23/2017",
  municipio: "CHIQUIMULA",
  departamento: "CHIQUIMULA",
  directora: "Licda. Carmen Alcira Reyes Cerón",
  cargo: "Directora Técnica",
  web: "enfermeriacarmenmaria.edu.gt",
  tel: "5855-0168",
  correo: "carmenmaria.edu@gmail.com",
  direccion1: "12 avenida 3ra calle zona 1.",
  direccion2: "Segundo Nivel Edificio Veredita",
};

// Constancia / carta de egreso — replica el formato oficial membretado.
// `g` aporta: fullName, dpi, graduationDate (ciclo escolar = año de graduacion).
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

    // --- Encabezado: logo (izq) + ubicacion (der) ---
    try {
      doc.image(asset("logo.png"), left, 45, { width: 120 });
    } catch {
      /* si falta el logo, se omite */
    }
    doc
      .fillColor("#111111")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`${INST.municipio.charAt(0)}${INST.municipio.slice(1).toLowerCase()},`, right - 200, 55, {
        width: 200,
        align: "right",
      })
      .text("Guatemala", right - 200, 69, { width: 200, align: "right" });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(GRAY)
      .text(INST.direccion1, right - 200, 88, { width: 200, align: "right" })
      .text(INST.direccion2, right - 200, 99, { width: 200, align: "right" });
    doc.moveTo(right - 200, 116).lineTo(right, 116).strokeColor(LIGHT).lineWidth(1).stroke();

    // --- Fecha de emision = fecha actual (no la de graduacion) ---
    const emision = todayInGuatemala();
    doc
      .fillColor("#111111")
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(fmtLongDate(emision), left, 150, { width, align: "right" });

    // --- A QUIEN INTERESE ---
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("A QUIEN INTERESE", left, 195);

    // --- Cuerpo principal ---
    const ciclo = g.graduationDate.getUTCFullYear();
    const cuerpo =
      `Por medio de la presente se hace constar que: ${g.fullName} quien se identifica ` +
      `con Documento Personal de Identificación No. ${g.dpi}, extendida por RENAP; ` +
      `cursó legalmente en este establecimiento educativo, la carrera de ${INST.carrera}, ` +
      `en el ciclo escolar ${ciclo}, plan diario; demostrando competencias adecuadas para ` +
      `el desempeño del mismo, así como principios éticos de respeto, responsabilidad, ` +
      `empatía; con mucho carisma y con muchos deseos de superación.`;
    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(12)
      .text(cuerpo, left, 225, { width, align: "justify", lineGap: 5 });

    // --- Cierre legal con fecha en letras (fecha de emision) ---
    const gd = emision;
    const fechaLetras =
      `EL DÍA ${DIAS_SEMANA[gd.getUTCDay()].toUpperCase()} ${dayInWords(gd.getUTCDate()).toUpperCase()} ` +
      `DEL MES DE ${MESES_LOWER[gd.getUTCMonth()].toUpperCase()} DEL AÑO ${yearInWords(gd.getUTCFullYear()).toUpperCase()}.`;
    const cierre =
      `Y PARA LOS USOS LEGALES QUE A LA INTERESADA CONVENGA; LE EXTIENDO, FIRMO Y SELLO ` +
      `LA PRESENTE EN UNA HOJA DE PAPEL BOND MEMBRETADA DE LA ESCUELA, CON AVAL MINISTERIAL ` +
      `No. ${INST.avalMinisterial}; EN EL MUNICIPIO DE ${INST.municipio}, DEPARTAMENTO DE ` +
      `${INST.departamento}, ${fechaLetras}`;
    doc.text(cierre, left, doc.y + 24, { width, align: "justify", lineGap: 5 });

    // --- Firma + sello ---
    const signY = doc.y + 55;
    const firmaW = 150;
    try {
      // Firma centrada, encima del nombre (que tambien va centrado).
      doc.image(asset("firma.png"), left + (width - firmaW) / 2, signY - 10, {
        width: firmaW,
      });
    } catch {
      /* sin firma */
    }
    try {
      // Sello recortado (sin margen) y mas grande, anclado a la derecha.
      doc.image(asset("sello-trim.png"), right - 135, signY - 18, {
        width: 130,
      });
    } catch {
      /* sin sello */
    }
    doc
      .fillColor("#111111")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(INST.directora, left, signY + 70, { width, align: "center" })
      .text(INST.cargo, left, signY + 84, { width, align: "center" });

    // --- Pie: contactos (posicion fija con margen amplio, sin pagina extra) ---
    const footY = doc.page.height - 95;
    doc.moveTo(left, footY).lineTo(right, footY).strokeColor(LIGHT).lineWidth(1).stroke();
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(
        `${INST.web}     ${INST.tel}     ${INST.correo}`,
        left,
        footY + 14,
        { width, align: "center", lineBreak: false }
      );

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
