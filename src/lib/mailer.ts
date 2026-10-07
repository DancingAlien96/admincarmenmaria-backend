import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { getSetting, setSetting } from "./settings.js";
import { UPLOAD_ROOT } from "./storage.js";

export function isMailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function getTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string; // para imagenes inline (ej. logo en el HTML)
}

export interface SendMailInput {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

// Envia un correo. Lanza si SMTP no esta configurado.
export async function sendMail(input: SendMailInput) {
  if (!isMailConfigured()) {
    throw new Error(
      "El correo no esta configurado. Define SMTP_HOST, SMTP_USER y SMTP_PASS."
    );
  }
  // Remitente con nombre visible (si SMTP_FROM ya trae "Nombre <correo>", se usa tal cual).
  const rawFrom = env.SMTP_FROM || env.SMTP_USER!;
  const from = rawFrom.includes("<")
    ? rawFrom
    : `"Escuela de Enfermería Carmen María" <${rawFrom}>`;
  const transport = getTransport();
  const info = await transport.sendMail({
    from,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });
  return { messageId: info.messageId };
}

// --- Plantilla de marca (encabezado configurable desde el panel) -------------

const LOGO_PATH = path.resolve(process.cwd(), "assets", "logo.png");
const LOGO_CID = "logocarmenmaria";
const BANNER_CID = "bannercarmenmaria";
const DESIGN_KEY = "email_design";

// Diseño del encabezado de los correos (se guarda en AppSetting).
export interface EmailDesign {
  style: "solido" | "claro"; // fondo de color o fondo blanco con franja
  color: string; // color de marca (encabezado y botones)
  title: string; // línea principal bajo el logo
  subtitle: string; // línea secundaria
  bannerKey: string | null; // imagen opcional arriba del encabezado
  bannerUrl: string | null;
}

export const DEFAULT_EMAIL_DESIGN: EmailDesign = {
  style: "solido",
  color: "#16314f",
  title: "Escuela de Enfermería Carmen María",
  subtitle: "Campus Virtual",
  bannerKey: null,
  bannerUrl: null,
};

export async function getEmailDesign(): Promise<EmailDesign> {
  try {
    const raw = await getSetting(DESIGN_KEY);
    if (!raw) return DEFAULT_EMAIL_DESIGN;
    return { ...DEFAULT_EMAIL_DESIGN, ...(JSON.parse(raw) as Partial<EmailDesign>) };
  } catch {
    return DEFAULT_EMAIL_DESIGN;
  }
}

export async function saveEmailDesign(d: EmailDesign) {
  await setSetting(DESIGN_KEY, JSON.stringify(d));
}

function loadLogo(): MailAttachment | null {
  try {
    return {
      filename: "logo.png",
      content: readFileSync(LOGO_PATH),
      contentType: "image/png",
      cid: LOGO_CID,
    };
  } catch {
    return null; // si falta el logo, el correo se envia sin imagen
  }
}

function loadBanner(key: string | null): MailAttachment | null {
  if (!key) return null;
  try {
    const safe = path.basename(key);
    return {
      filename: safe,
      content: readFileSync(path.join(UPLOAD_ROOT, safe)),
      cid: BANNER_CID,
    };
  } catch {
    return null;
  }
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Arma el HTML completo del correo con el encabezado de marca. Para la vista
// previa del panel, las imágenes van como URL/data URI en vez de adjuntos.
function layoutHtml(
  d: EmailDesign,
  heading: string,
  bodyHtml: string,
  img: { logo: string | null; banner: string | null }
): string {
  const solid = d.style === "solido";
  const logoImg = img.logo
    ? `<img src="${img.logo}" width="${solid ? 64 : 84}" height="${solid ? 64 : 84}" alt="Carmen María" style="display:block;margin:0 auto 10px;object-fit:contain;${solid ? "background:#ffffff;border-radius:12px;padding:4px;" : ""}" />`
    : "";
  const banner = img.banner
    ? `<img src="${esc(img.banner)}" alt="" width="520" style="display:block;width:100%;height:auto;" />`
    : "";
  const header = solid
    ? `<div style="background:${d.color};padding:24px;text-align:center;">
        ${logoImg}
        <div style="color:#ffffff;font-size:17px;font-weight:bold;">${esc(d.title)}</div>
        ${d.subtitle ? `<div style="color:#ffffffcc;font-size:13px;margin-top:2px;">${esc(d.subtitle)}</div>` : ""}
      </div>`
    : `<div style="background:#ffffff;padding:24px 24px 18px;text-align:center;border-bottom:4px solid ${d.color};">
        ${logoImg}
        <div style="color:${d.color};font-size:18px;font-weight:bold;">${esc(d.title)}</div>
        ${d.subtitle ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">${esc(d.subtitle)}</div>` : ""}
      </div>`;
  const headingBar = heading
    ? `<div style="padding:22px 28px 0;color:${d.color};font-size:18px;font-weight:bold;">${esc(heading)}</div>`
    : "";
  return `
  <div style="background:#f3f4f6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      ${banner}
      ${header}
      ${headingBar}
      <div style="padding:16px 28px 24px;color:#111827;font-size:14px;line-height:1.55;">
        ${bodyHtml}
      </div>
      <div style="padding:14px 28px 22px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:11px;text-align:center;">
        Escuela Privada de Auxiliares de Enfermería Carmen María
      </div>
    </div>
  </div>`;
}

function buttonHtml(d: EmailDesign, href: string, label: string) {
  return `<div style="text-align:center;margin:20px 0;">
    <a href="${href}" style="display:inline-block;background:${d.color};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px;">${label}</a>
  </div>`;
}

// HTML + adjuntos inline (logo y banner) listos para enviar.
async function renderForEmail(heading: string, bodyHtml: (d: EmailDesign) => string) {
  const d = await getEmailDesign();
  const logo = loadLogo();
  const banner = loadBanner(d.bannerKey);
  const html = layoutHtml(d, heading, bodyHtml(d), {
    logo: logo ? `cid:${LOGO_CID}` : null,
    banner: banner ? `cid:${BANNER_CID}` : null,
  });
  return { html, inline: [logo, banner].filter(Boolean) as MailAttachment[] };
}

// Vista previa del diseño para el panel (sin enviar nada).
export function renderEmailPreview(d: EmailDesign): string {
  let logo: string | null = null;
  try {
    logo = `data:image/png;base64,${readFileSync(LOGO_PATH).toString("base64")}`;
  } catch {
    logo = null;
  }
  const body = `<p>Hola, María:</p>
    <p>Este es un ejemplo de cómo se verán los avisos de la escuela: recordatorios de cuotas, confirmaciones de pago y correos masivos.</p>
    ${buttonHtml(d, "#", "Entrar al Campus")}`;
  return layoutHtml(d, "Aviso de ejemplo", body, { logo, banner: d.bannerUrl });
}

// Correo con la plantilla de marca (encabezado con logo + contenido). Nunca
// lanza: si el correo no está configurado o falla, solo lo registra.
export async function sendBrandedMail(input: {
  to: string;
  subject: string;
  heading: string;
  bodyHtml: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<{ sent: boolean }> {
  if (!isMailConfigured()) return { sent: false };
  try {
    const { html, inline } = await renderForEmail(input.heading, () => input.bodyHtml);
    await sendMail({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html,
      attachments: [...inline, ...(input.attachments ?? [])],
    });
    return { sent: true };
  } catch (err) {
    console.error("[mailer] no se pudo enviar el correo:", err);
    return { sent: false };
  }
}

// Envia el correo de bienvenida. Nunca lanza: si el correo no está configurado
// o falla, solo lo registra (la creación de la cuenta no debe romperse).
export async function sendWelcomeEmail(input: {
  to: string;
  name: string;
  password: string;
}): Promise<{ sent: boolean }> {
  if (!isMailConfigured()) return { sent: false };
  const loginUrl = `${env.FRONTEND_URL}/login`;
  const text =
    `¡Bienvenido/a, ${input.name}!\n\n` +
    `Tu cuenta del Campus de la Escuela de Enfermería Carmen María ya está lista.\n\n` +
    `Usuario: ${input.to}\n` +
    `Contraseña: ${input.password}\n\n` +
    `Entra al Campus: ${loginUrl}\n\n` +
    `Por tu seguridad, cambia tu contraseña al ingresar.`;
  try {
    const { html, inline } = await renderForEmail(
      `¡Bienvenido/a, ${input.name}!`,
      (d) => `
        <p style="color:#4b5563;margin:0 0 20px;">
          Tu cuenta del Campus ya está lista. Con ella puedes ver tus pagos,
          tu documentación y tu información como estudiante.
        </p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Tus datos de acceso:</p>
          <p style="margin:0 0 4px;"><strong>Usuario:</strong> ${esc(input.to)}</p>
          <p style="margin:0;"><strong>Contraseña:</strong> ${esc(input.password)}</p>
        </div>
        ${buttonHtml(d, loginUrl, "Entrar al Campus")}
        <p style="font-size:12px;color:#9ca3af;margin:0;">
          Por tu seguridad, cambia tu contraseña al ingresar, en la sección
          “Cambiar contraseña”.
        </p>`
    );
    await sendMail({
      to: input.to,
      subject: "Bienvenido/a al Campus · Enfermería Carmen María",
      text,
      html,
      attachments: inline,
    });
    return { sent: true };
  } catch (err) {
    console.error("[mailer] no se pudo enviar el correo de bienvenida:", err);
    return { sent: false };
  }
}
