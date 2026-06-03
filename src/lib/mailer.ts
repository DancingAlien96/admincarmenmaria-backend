import nodemailer from "nodemailer";
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
}

export interface SendMailInput {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}

// Envia un correo. Lanza si SMTP no esta configurado.
export async function sendMail(input: SendMailInput) {
  if (!isMailConfigured()) {
    throw new Error(
      "El correo no esta configurado. Define SMTP_HOST, SMTP_USER y SMTP_PASS."
    );
  }
  const from = env.SMTP_FROM ?? env.SMTP_USER!;
  const transport = getTransport();
  const info = await transport.sendMail({
    from,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
  });
  return { messageId: info.messageId };
}
