import path from "node:path";
import PDFDocument from "pdfkit";
import {
  numWords,
  hourWords,
  dateInWords,
  dateShort,
} from "./date-words.js";

const BRAND = "#16314f";
const ASSETS_DIR = path.resolve(process.cwd(), "assets");
const asset = (name: string) => path.join(ASSETS_DIR, name);

export interface ActaSigner {
  name: string;
  role: string;
}
export interface ActaRow {
  name: string;
  value?: string | null; // compatibilidad: equivale a values[0]
  values?: (string | null)[]; // varias columnas de notas (Teoria/Practica/Nota)
}
export interface ActaRenderInput {
  actaNumber: string;
  folios?: string | null;
  title?: string | null;
  actaDate: Date;
  closeDate?: Date | null;
  city?: string | null;
  department?: string | null;
  body: string; // con marcadores {{...}}
  vars?: Record<string, string> | null; // variables personalizadas
  columns?: string[] | null; // encabezados de la tabla
  rows?: ActaRow[] | null; // filas para {{tabla}} / {{lista}}
  signers?: ActaSigner[] | null;
}

// Construye el mapa de variables disponibles (built-in + personalizadas).
function buildVarMap(d: ActaRenderInput): Record<string, string> {
  const close = d.closeDate ?? d.actaDate;
  const total = d.rows?.length ?? 0;
  const map: Record<string, string> = {
    numero: d.actaNumber ?? "",
    folios: d.folios ?? "",
    titulo: d.title ?? "",
    ciudad: d.city ?? "",
    departamento: d.department ?? "",
    fecha: dateShort(d.actaDate),
    fecha_letras: dateInWords(d.actaDate),
    hora_letras: hourWords(d.actaDate.getUTCHours() || 0),
    fecha_cierre: dateShort(close),
    fecha_cierre_letras: dateInWords(close),
    hora_cierre_letras: hourWords(close.getUTCHours() || 0),
    total: String(total),
    total_letras: numWords(total),
  };
  // Las personalizadas pueden sobreescribir o agregar.
  for (const [k, v] of Object.entries(d.vars ?? {})) {
    map[k.toLowerCase()] = v ?? "";
  }
  return map;
}

// Reemplaza {{clave}} por su valor. Si la clave viene en MAYÚSCULAS, el valor
// también se pone en mayúsculas (útil para el cierre legal). No toca {{tabla}}
// ni {{lista}} (se procesan como bloques al renderizar).
export function resolveVariables(
  text: string,
  d: ActaRenderInput
): string {
  const map = buildVarMap(d);
  return text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (full, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (key === "tabla" || key === "lista") return full; // bloques: se dejan
    if (!(key in map)) return full; // desconocida: se deja literal
    const value = map[key];
    const isUpper = rawKey === rawKey.toUpperCase() && /[A-Z]/.test(rawKey);
    return isUpper ? value.toLocaleUpperCase("es") : value;
  });
}

export function renderActaPDF(d: ActaRenderInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 55 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // --- Membrete: logo centrado ---
    try {
      doc.image(asset("logo.png"), (doc.page.width - 90) / 2, 40, { width: 90 });
    } catch {
      /* sin logo */
    }
    doc.y = 140;

    // Título opcional (centrado, en negrita)
    if (d.title && d.title.trim()) {
      doc
        .fillColor(BRAND)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(d.title.trim().toUpperCase(), left, doc.y, {
          width,
          align: "center",
        })
        .moveDown(0.6);
    }

    // --- Cuerpo: variables resueltas, bloques {{tabla}}/{{lista}} intercalados
    const resolved = resolveVariables(d.body ?? "", d);
    const parts = resolved.split(/(\{\{\s*(?:tabla|lista)\s*\}\})/i);

    for (const part of parts) {
      if (!part) continue;
      const block = part.match(/\{\{\s*(tabla|lista)\s*\}\}/i);
      if (block) {
        const kind = block[1].toLowerCase() as "tabla" | "lista";
        renderTable(doc, left, width, d, kind === "lista");
      } else {
        const text = part.replace(/\r/g, "").trim();
        if (!text) continue;
        doc
          .fillColor("#111111")
          .font("Helvetica")
          .fontSize(11)
          .text(text, left, doc.y, { align: "justify", lineGap: 3 })
          .moveDown(0.5);
      }
    }

    // --- Firmas ---
    renderSigners(doc, left, right, width, d.signers ?? []);

    doc.end();
  });
}

// Tabla de filas. `onlyNames`=true para {{lista}} (sin columna de valor).
function renderTable(
  doc: PDFKit.PDFDocument,
  left: number,
  width: number,
  d: ActaRenderInput,
  onlyNames: boolean
) {
  const rows = d.rows ?? [];
  if (rows.length === 0) return;

  const cols = d.columns ?? [];
  const noLabel = cols[0] ?? "NO.";
  const nameLabel = cols[1] ?? "NOMBRE DEL ALUMNO";
  // Columnas de notas = las que siguen al No. y al Nombre.
  const valueLabels = onlyNames
    ? []
    : cols.length > 2
      ? cols.slice(2)
      : ["Nota Obtenida"];
  const numValues = valueLabels.length;

  const rowH = 20;
  const noW = 40;
  const valueW = numValues > 0 ? Math.min(95, Math.max(55, 300 / numValues)) : 0;
  const valuesTotal = valueW * numValues;
  const nameW = width - noW - valuesTotal;
  const valueX = (i: number) => left + noW + nameW + i * valueW;

  function header(y: number) {
    doc.rect(left, y, width, rowH).fill(BRAND);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
    doc.text(noLabel, left + 6, y + 6, { width: noW - 8 });
    doc.text(nameLabel, left + noW + 6, y + 6, { width: nameW - 8 });
    valueLabels.forEach((lbl, i) =>
      doc.text(lbl, valueX(i), y + 6, { width: valueW, align: "center" })
    );
  }

  doc.moveDown(0.2);
  let y = doc.y;
  header(y);
  y += rowH;

  rows.forEach((r, i) => {
    if (y + rowH > doc.page.height - 70) {
      doc.addPage();
      y = doc.page.margins.top;
      header(y);
      y += rowH;
    }
    const cell = (x: number, w: number) =>
      doc.rect(x, y, w, rowH).strokeColor("#cccccc").lineWidth(0.5).stroke();
    cell(left, noW);
    cell(left + noW, nameW);
    for (let c = 0; c < numValues; c++) cell(valueX(c), valueW);
    doc.fillColor("#111111").font("Helvetica").fontSize(10);
    doc.text(String(i + 1), left + 6, y + 6, { width: noW - 8 });
    doc.text(r.name, left + noW + 6, y + 6, { width: nameW - 12 });
    // valores: usa r.values[] o, si no, r.value en la primera columna.
    const vals = r.values ?? (r.value != null ? [r.value] : []);
    for (let c = 0; c < numValues; c++) {
      doc.text(vals[c] ?? "", valueX(c), y + 6, {
        width: valueW,
        align: "center",
      });
    }
    y += rowH;
  });
  doc.y = y + 12;
}

function renderSigners(
  doc: PDFKit.PDFDocument,
  left: number,
  right: number,
  width: number,
  signers: ActaSigner[]
) {
  if (signers.length === 0) return;

  // Bloque que no se parte entre páginas.
  if (doc.y + 200 > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
  const signY = doc.y + 55;
  const firmaW = 150;

  // Firma centrada, arriba del nombre del primer firmante (mismo espaciado
  // que la constancia: ~80px entre la firma y el nombre).
  try {
    doc.image(asset("firma.png"), left + (width - firmaW) / 2, signY - 10, {
      width: firmaW,
    });
  } catch {
    /* sin firma */
  }
  // Sello a la derecha (mismo tamaño que la constancia).
  try {
    doc.image(asset("sello-trim.png"), right - 135, signY - 18, { width: 130 });
  } catch {
    /* sin sello */
  }

  // Primer firmante: nombre (negrita) + cargo, centrados bajo la firma.
  doc.fillColor("#111111").font("Helvetica-Bold").fontSize(11);
  doc.text(signers[0].name, left, signY + 70, { width, align: "center" });
  doc.font("Helvetica").text(signers[0].role, left, signY + 84, {
    width,
    align: "center",
  });

  // Firmantes adicionales: Vo.Bo. centrados debajo.
  let yy = signY + 116;
  for (const s of signers.slice(1)) {
    doc.font("Helvetica-Bold").text(`Vo.Bo. ${s.name}`, left, yy, {
      width,
      align: "center",
    });
    doc.font("Helvetica").text(s.role, left, yy + 14, { width, align: "center" });
    yy += 46;
  }
}
