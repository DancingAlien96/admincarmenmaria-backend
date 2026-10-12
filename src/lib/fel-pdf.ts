// Representación gráfica del recibo electrónico (DTE RECI) certificado:
// datos del emisor, autorización/serie/número, receptor, detalle, frases SAT,
// datos del certificador y código QR de verificación en el portal de la SAT.
// Misma estructura que imprime SAT y que el PDF de ventas de bluestock.

import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "node:path";
import type { Dte } from "@prisma/client";
import { env } from "../config/env.js";
import { phraseText } from "../modules/fel/fel.config.js";
import { phrasesOf, itemsOf } from "../modules/fel/fel.payload.js";

type DocParaPdf = Dte & {
  payment?: {
    concept: string;
    method: string;
    paidAt: Date;
    registeredBy?: { name: string } | null;
    student?: { fullName: string; expedienteNumber: string | null } | null;
  } | null;
};

const BRAND = "#16314f";
const GRAY = "#666666";
const LIGHT = "#e5e7eb";
const ASSETS = path.resolve(process.cwd(), "assets");

const METHOD_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia bancaria",
  DEPOSITO: "Depósito",
  TARJETA: "Tarjeta",
};

function gtq(n: number): string {
  return "Q " + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

// URL de verificación pública de SAT (la misma que usa bluestock para el QR)
export function satVerificationUrl(doc: Pick<Dte, "authorizationNumber" | "issuerNit" | "receiverTaxId" | "grandTotal">): string {
  const monto = Number(doc.grandTotal).toFixed(2);
  return (
    "https://felpub.c.sat.gob.gt/verificador-web/publico/vistas/verificacionDte.jsf" +
    `?tipo=autorizacion&numero=${(doc.authorizationNumber ?? "").toUpperCase()}` +
    `&emisor=${doc.issuerNit}&receptor=${doc.receiverTaxId}&monto=${monto}`
  );
}

export function felReceiptFileName(doc: Pick<Dte, "series" | "number" | "id">): string {
  const base = doc.series && doc.number ? `${doc.series}-${doc.number}` : doc.id.slice(-8).toUpperCase();
  return `RECIBO-FEL-${base}.pdf`;
}

export async function generateFelReceiptPDF(doc: DocParaPdf): Promise<Buffer> {
  const qr = doc.authorizationNumber
    ? await QRCode.toBuffer(satVerificationUrl(doc), { type: "png", margin: 1, width: 300 })
    : null;

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    pdf.on("data", (c) => chunks.push(c as Buffer));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const left = pdf.page.margins.left;
    const right = pdf.page.width - pdf.page.margins.right;
    const width = right - left;

    // --- Encabezado: logo + emisor (izq) / caja del DTE (der) ---
    let logoW = 0;
    try {
      pdf.image(path.join(ASSETS, "logo.png"), left, 40, { width: 64 });
      logoW = 74;
    } catch {
      /* sin logo */
    }
    const emisorX = left + logoW;
    const emisorW = width * 0.56 - logoW;
    pdf.fillColor(BRAND).font("Helvetica-Bold").fontSize(11).text(doc.issuerCommercialName, emisorX, 42, { width: emisorW });
    pdf.fillColor("#111111").font("Helvetica").fontSize(9).text(doc.issuerName, emisorX, pdf.y + 2, { width: emisorW });
    pdf.fillColor(GRAY).text(`NIT Emisor: ${doc.issuerNit}`, emisorX, pdf.y + 1, { width: emisorW });
    pdf.text(doc.issuerAddress, emisorX, pdf.y + 1, { width: emisorW });
    pdf.text(`Establecimiento: ${doc.issuerEstablishmentCode}`, emisorX, pdf.y + 1, { width: emisorW });
    const emisorBottom = pdf.y;

    const boxX = left + width * 0.6;
    const boxW = width * 0.4;
    pdf.roundedRect(boxX, 40, boxW, 118, 6).strokeColor(LIGHT).lineWidth(1).stroke();
    pdf.fillColor(BRAND).font("Helvetica-Bold").fontSize(16).text("RECIBO", boxX, 48, { width: boxW, align: "center" });
    pdf.fillColor(GRAY).font("Helvetica").fontSize(8).text("Documento Tributario Electrónico · FEL", boxX, 68, { width: boxW, align: "center" });
    pdf.fillColor("#111111").fontSize(8.5);
    pdf.text(`Serie: ${doc.series ?? "—"}   Número: ${doc.number ?? "—"}`, boxX + 8, 86, { width: boxW - 16, align: "center" });
    pdf.fillColor(GRAY).fontSize(7.5).text("NÚMERO DE AUTORIZACIÓN", boxX + 8, 102, { width: boxW - 16, align: "center" });
    pdf.fillColor("#111111").font("Helvetica-Bold").fontSize(8).text(doc.authorizationNumber ?? "PENDIENTE", boxX + 8, 112, { width: boxW - 16, align: "center" });
    pdf.fillColor(GRAY).font("Helvetica").fontSize(7.5);
    pdf.text(`Emisión: ${fmtDateTime(doc.emittedAt)}`, boxX + 8, 128, { width: boxW - 16, align: "center" });
    pdf.text(`Certificación: ${fmtDateTime(doc.certifiedAt)}`, boxX + 8, 139, { width: boxW - 16, align: "center" });

    let y = Math.max(emisorBottom, 158) + 14;
    pdf.moveTo(left, y).lineTo(right, y).strokeColor(BRAND).lineWidth(1.5).stroke();

    // Marca de agua ANULADO
    if (doc.status === "VOIDED") {
      pdf.save();
      pdf.fillColor("#dc2626").font("Helvetica-Bold").fontSize(70).opacity(0.18)
        .rotate(-25, { origin: [pdf.page.width / 2, 400] })
        .text("ANULADO", 0, 370, { align: "center", width: pdf.page.width });
      pdf.restore();
      pdf.opacity(1);
    }

    // --- Receptor ---
    y += 12;
    const tipoLabel = doc.receiverTaxIdType === "CUI" ? "CUI" : "NIT";
    pdf.fillColor(BRAND).font("Helvetica-Bold").fontSize(9).text("RECEPTOR", left, y);
    pdf.fillColor("#111111").font("Helvetica").fontSize(9.5);
    pdf.text(`${tipoLabel} Receptor: ${doc.receiverTaxId}`, left, y + 13);
    pdf.text(`Nombre Receptor: ${doc.receiverName}`, left, y + 26, { width: width * 0.6 });
    if (doc.payment?.student?.expedienteNumber) {
      pdf.fillColor(GRAY).text(`Expediente: ${doc.payment.student.expedienteNumber}`, left, y + 39);
    }
    pdf.fillColor(GRAY).text(`Moneda: ${doc.currency}`, boxX, y + 13, { width: boxW, align: "right" });
    if (doc.payment) {
      pdf.text(`Pago: ${METHOD_LABELS[doc.payment.method] ?? doc.payment.method}`, boxX, y + 26, { width: boxW, align: "right" });
    }
    y += 60;

    // --- Detalle ---
    const items = itemsOf(doc);
    const cols = [
      { label: "#", w: 24, align: "center" as const },
      { label: "B/S", w: 54, align: "center" as const },
      { label: "Cant.", w: 40, align: "right" as const },
      { label: "Descripción", w: width - 24 - 54 - 40 - 80 - 70 - 80, align: "left" as const },
      { label: "P. Unitario (Q)", w: 80, align: "right" as const },
      { label: "Desc. (Q)", w: 70, align: "right" as const },
      { label: "Total (Q)", w: 80, align: "right" as const },
    ];
    const rowH = 22;
    pdf.rect(left, y, width, rowH).fill(BRAND);
    let x = left;
    pdf.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5);
    for (const c of cols) {
      pdf.text(c.label, x + 4, y + 7, { width: c.w - 8, align: c.align });
      x += c.w;
    }
    y += rowH;
    pdf.font("Helvetica").fontSize(9).fillColor("#111111");
    for (const it of items) {
      const descH = pdf.heightOfString(it.description, { width: cols[3]!.w - 8 });
      const h = Math.max(rowH, descH + 12);
      pdf.rect(left, y, width, h).strokeColor(LIGHT).lineWidth(1).stroke();
      const vals = [
        String(it.position),
        it.itemType === "B" ? "Bien" : "Servicio",
        String(it.quantity),
        it.description,
        it.unitPrice.toFixed(2),
        it.discount.toFixed(2),
        it.total.toFixed(2),
      ];
      x = left;
      cols.forEach((c, i) => {
        pdf.text(vals[i]!, x + 4, y + 6, { width: c.w - 8, align: c.align });
        x += c.w;
      });
      y += h;
    }
    pdf.rect(left, y, width, rowH + 2).fill("#f3f4f6");
    pdf.fillColor(BRAND).font("Helvetica-Bold").fontSize(10.5)
      .text("TOTAL", left + 8, y + 7)
      .text(gtq(Number(doc.grandTotal)), right - 150, y + 7, { width: 142, align: "right" });
    y += rowH + 2;

    // --- Frases SAT ---
    y += 16;
    pdf.fillColor("#111111").font("Helvetica").fontSize(8.5);
    for (const f of phrasesOf(doc)) {
      pdf.text(`* ${phraseText(f)}`, left, y, { width });
      y = pdf.y + 3;
    }

    // --- Certificador + QR ---
    y += 10;
    const qrSize = 110;
    pdf.fillColor(BRAND).font("Helvetica-Bold").fontSize(9).text("DATOS DEL CERTIFICADOR", left, y);
    pdf.fillColor("#111111").font("Helvetica").fontSize(9)
      .text(`${env.DIGIFACT_NAME}   NIT: ${env.DIGIFACT_TAX_ID}`, left, y + 13);
    pdf.fillColor(GRAY).fontSize(8)
      .text("Verifique este documento en el portal de la SAT escaneando el código QR o en felpub.c.sat.gob.gt", left, y + 30, { width: width - qrSize - 20 });
    if (doc.payment?.registeredBy?.name) {
      pdf.text(`Pago registrado por: ${doc.payment.registeredBy.name}`, left, y + 54, { width: width - qrSize - 20 });
    }
    if (doc.status === "VOIDED" && doc.voidedAt) {
      pdf.fillColor("#dc2626").text(
        `ANULADO el ${fmtDateTime(doc.voidedAt)}${doc.voidReason ? ` · ${doc.voidReason}` : ""}`,
        left, y + 68, { width: width - qrSize - 20 }
      );
    }
    if (qr) {
      pdf.image(qr, right - qrSize, y - 4, { width: qrSize, height: qrSize });
    }

    // --- Pie ---
    const footY = pdf.page.height - 60;
    pdf.moveTo(left, footY).lineTo(right, footY).strokeColor(LIGHT).lineWidth(1).stroke();
    pdf.fillColor(GRAY).font("Helvetica").fontSize(7.5).text(
      "Recibo electrónico emitido por el sistema administrativo de la Escuela de Enfermería Carmen María y certificado ante la SAT a través de Digifact.",
      left, footY + 8, { width, align: "center" }
    );

    pdf.end();
  });
}
