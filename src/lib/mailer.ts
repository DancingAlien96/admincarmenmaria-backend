import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

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

// --- Correo de bienvenida al Campus (con logo) ------------------------------

const LOGO_PATH = path.resolve(process.cwd(), "assets", "logo.png");
const BRAND = "#16314f";

function loadLogo(): MailAttachment | null {
  try {
    return {
      filename: "logo.png",
      content: readFileSync(LOGO_PATH),
      contentType: "image/png",
      cid: "logocarmenmaria",
    };
  } catch {
    return null; // si falta el logo, el correo se envia sin imagen
  }
}

function welcomeHtml(name: string, username: string, password: string, loginUrl: string) {
  const logo = loadLogo();
  const logoImg = logo
    ? `<img src="cid:logocarmenmaria" width="64" height="64" alt="Carmen María" style="display:block;margin:0 auto 12px;object-fit:contain;" />`
    : "";
  return `
  <div style="background:#f3f4f6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:${BRAND};padding:24px;text-align:center;">
        ${logoImg}
        <div style="color:#ffffff;font-size:18px;font-weight:bold;">Campus Virtual</div>
        <div style="color:#c7d2df;font-size:13px;">Escuela de Enfermería Carmen María</div>
      </div>
      <div style="padding:28px 28px 8px;color:#111827;">
        <p style="font-size:16px;margin:0 0 4px;">¡Bienvenido/a, ${name}!</p>
        <p style="font-size:14px;color:#4b5563;margin:0 0 20px;">
          Tu cuenta del Campus ya está lista. Con ella puedes ver tus pagos,
          tu documentación y tu información como estudiante.
        </p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:20px;">
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Tus datos de acceso:</p>
          <p style="margin:0 0 4px;font-size:14px;color:#111827;"><strong>Usuario:</strong> ${username}</p>
          <p style="margin:0;font-size:14px;color:#111827;"><strong>Contraseña:</strong> ${password}</p>
        </div>
        <div style="text-align:center;margin-bottom:20px;">
          <a href="${loginUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px;">
            Entrar al Campus
          </a>
        </div>
        <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">
          Por tu seguridad, cambia tu contraseña al ingresar, en la sección
          “Cambiar contraseña”.
        </p>
      </div>
      <div style="padding:16px 28px 24px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:11px;text-align:center;">
        Escuela Privada de Auxiliares de Enfermería Carmen María
      </div>
    </div>
  </div>`;
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
  const html = welcomeHtml(input.name, input.to, input.password, loginUrl);
  const text =
    `¡Bienvenido/a, ${input.name}!\n\n` +
    `Tu cuenta del Campus de la Escuela de Enfermería Carmen María ya está lista.\n\n` +
    `Usuario: ${input.to}\n` +
    `Contraseña: ${input.password}\n\n` +
    `Entra al Campus: ${loginUrl}\n\n` +
    `Por tu seguridad, cambia tu contraseña al ingresar.`;
  try {
    const logo = loadLogo();
    await sendMail({
      to: input.to,
      subject: "Bienvenido/a al Campus · Enfermería Carmen María",
      text,
      html,
      attachments: logo ? [logo] : undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error("[mailer] no se pudo enviar el correo de bienvenida:", err);
    return { sent: false };
  }
}
