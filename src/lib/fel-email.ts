// Bloque del recibo electrónico (DTE) para los correos: autorización, serie,
// número, fechas y código QR de verificación ante SAT, como lo muestra el
// documento oficial. Se usa en la confirmación de pago y en el reenvío del recibo.
// El correo no lleva adjuntos: solo la información en el cuerpo y el QR; el PDF
// se descarga desde el panel o el portal.

import QRCode from "qrcode";
import type { FelDocumento } from "@prisma/client";
import type { MailAttachment } from "./mailer.js";
import { generateFelReceiptPDF, felReceiptFileName, urlVerificacionSat } from "./fel-pdf.js";
import { env } from "../config/env.js";

const QR_CID = "qrfelsat";

type DocCorreo = FelDocumento & {
  payment?: {
    concept: string;
    method: string;
    paidAt: Date;
    registeredBy?: { name: string } | null;
    student?: { fullName: string; expedienteNumber: string | null } | null;
  } | null;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtFecha(d: Date | null): string {
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

export interface BloqueDte {
  html: string;
  text: string;
  inline: MailAttachment[]; // QR embebido (cid)
  adjuntos: MailAttachment[]; // vacío por defecto; con conPdf=true, el PDF del recibo
}

// Arma el bloque. `conPdf` (opcional) adjunta además la representación gráfica.
export async function bloqueDteParaCorreo(doc: DocCorreo, conPdf = false): Promise<BloqueDte> {
  const url = urlVerificacionSat(doc);
  const qr = await QRCode.toBuffer(url, { type: "png", margin: 1, width: 220 });
  const tipo = doc.receptorTipo === "CUI" ? "CUI" : "NIT";
  const total = `Q${Number(doc.granTotal).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fila = (k: string, v: string) =>
    `<tr><td style="padding:3px 10px 3px 0;color:#6b7280;white-space:nowrap;">${k}</td><td style="padding:3px 0;color:#111827;word-break:break-all;">${v}</td></tr>`;

  const html = `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin:16px 0;">
      <p style="margin:0 0 10px;font-weight:bold;color:#16314f;">Recibo electrónico (FEL) certificado ante la SAT</p>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;width:100%;">
        <tr>
          <td style="vertical-align:top;">
            <table cellpadding="0" cellspacing="0" style="font-size:13px;">
              ${fila("Número de autorización", `<strong>${esc(doc.autorizacion ?? "")}</strong>`)}
              ${fila("Serie", esc(doc.serie ?? ""))}
              ${fila("Número de DTE", esc(doc.numero ?? ""))}
              ${fila("Fecha de emisión", esc(fmtFecha(doc.fechaEmision)))}
              ${fila("Fecha de certificación", esc(fmtFecha(doc.fechaCertificacion)))}
              ${fila("NIT emisor", esc(doc.emisorNit))}
              ${fila(`${tipo} receptor`, esc(doc.receptorId))}
              ${fila("Nombre receptor", esc(doc.receptorNombre))}
              ${fila("Total", `<strong>${total}</strong>`)}
            </table>
          </td>
          <td style="vertical-align:top;text-align:center;width:130px;">
            <img src="cid:${QR_CID}" width="110" height="110" alt="QR de verificación SAT" style="display:block;margin:0 auto;" />
            <a href="${esc(url)}" style="font-size:11px;color:#16314f;">Verificar en SAT</a>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-size:11px;color:#9ca3af;">
        Certificador: ${esc(env.DIGIFACT_NAME)} · NIT ${esc(env.DIGIFACT_TAX_ID)}. Escanea el código QR para consultar este documento en el portal de la SAT.
      </p>
    </div>`;

  const text =
    `Recibo electrónico (FEL) certificado ante la SAT\n` +
    `Número de autorización: ${doc.autorizacion ?? ""}\n` +
    `Serie: ${doc.serie ?? ""}  Número de DTE: ${doc.numero ?? ""}\n` +
    `Fecha de emisión: ${fmtFecha(doc.fechaEmision)}\n` +
    `Fecha de certificación: ${fmtFecha(doc.fechaCertificacion)}\n` +
    `NIT emisor: ${doc.emisorNit}  ${tipo} receptor: ${doc.receptorId}\n` +
    `Total: ${total}\n` +
    `Verificar en SAT: ${url}\n`;

  const adjuntos: MailAttachment[] = [];
  if (conPdf) {
    adjuntos.push({
      filename: felReceiptFileName(doc),
      content: await generateFelReceiptPDF(doc),
      contentType: "application/pdf",
    });
  }
  return {
    html,
    text,
    inline: [{ filename: "qr-sat.png", content: qr, contentType: "image/png", cid: QR_CID }],
    adjuntos,
  };
}
