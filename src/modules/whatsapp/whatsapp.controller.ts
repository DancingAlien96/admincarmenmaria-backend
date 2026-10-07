import type { Request, Response } from "express";
import * as service from "./whatsapp.service.js";
import { verifyWebhookSignature } from "../../lib/ycloud.js";
import { badRequest } from "../../lib/http-error.js";
import {
  isMailConfigured,
  sendBrandedMail,
  getEmailDesign,
  saveEmailDesign,
  renderEmailPreview,
  DEFAULT_EMAIL_DESIGN,
  type EmailDesign,
} from "../../lib/mailer.js";
import {
  sendBulkEmail,
  resolveBulkRecipients,
  loadBulkAttachments,
  searchEmailRecipients,
  type BulkAudience,
  type BulkEmailInput,
  runEmailPaymentReminders,
} from "../../lib/email-notify.js";

// Envia un correo de prueba para verificar la configuracion SMTP.
export async function testEmailController(req: Request, res: Response) {
  const to = String(req.body?.to ?? "").trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    throw badRequest("Escribe un correo válido para la prueba");
  }
  if (!isMailConfigured()) {
    throw badRequest(
      "El correo (SMTP) aún no está configurado en el servidor."
    );
  }
  // Usa la plantilla de marca, para ver el diseño real del encabezado.
  const r = await sendBrandedMail({
    to,
    subject: "Correo de prueba · Campus Carmen María",
    heading: "Correo de prueba",
    bodyHtml:
      "<p>Este es un <strong>correo de prueba</strong> del sistema de la Escuela de Enfermería Carmen María.</p><p>Si lo recibiste, el envío de correos funciona correctamente y así se ve el encabezado actual.</p>",
    text: "Este es un correo de prueba. Si lo recibiste, el envío de correos del sistema funciona correctamente.",
  });
  if (!r.sent) throw badRequest("No se pudo enviar el correo de prueba");
  res.json({ sent: true, to });
}

// Correo masivo: estudiantes (todos o una promoción), catedráticos o personas
// específicas, con adjuntos opcionales. Responde de inmediato con el número
// de destinatarios y envía en segundo plano (con adjuntos puede tardar).
export async function bulkEmailController(req: Request, res: Response) {
  const b = req.body ?? {};
  const subject = String(b.subject ?? "").trim();
  const message = String(b.message ?? "").trim();
  if (subject.length < 2) throw badRequest("Escribe un asunto");
  if (message.length < 2) throw badRequest("Escribe un mensaje");
  if (!isMailConfigured()) {
    throw badRequest("El correo (SMTP) aún no está configurado en el servidor.");
  }
  const audience: BulkAudience =
    b.audience === "teachers" || b.audience === "custom"
      ? b.audience
      : "students";
  const strArr = (v: unknown) =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : undefined;
  const input: BulkEmailInput = {
    subject,
    message,
    audience,
    year: b.year ? Number(b.year) : undefined,
    studentIds: strArr(b.studentIds),
    teacherIds: strArr(b.teacherIds),
    emails: strArr(b.emails),
    attachments: Array.isArray(b.attachments)
      ? b.attachments
          .filter((a: unknown) => a && typeof a === "object")
          .map((a: { key?: unknown; name?: unknown }) => ({
            key: String(a.key ?? ""),
            name: String(a.name ?? ""),
          }))
          .filter((a: { key: string }) => a.key)
      : [],
  };

  const recipients = await resolveBulkRecipients(input);
  if (recipients.length === 0) {
    throw badRequest("No hay destinatarios con correo para este envío");
  }
  let attachments;
  try {
    attachments = await loadBulkAttachments(input.attachments);
  } catch (err) {
    throw badRequest((err as Error).message || "No se pudieron leer los adjuntos");
  }

  void sendBulkEmail(input, recipients, attachments)
    .then((r) =>
      console.log(
        `[correo masivo] "${subject}": ${r.sent}/${r.total} enviados, ${r.skipped} con error`
      )
    )
    .catch((e) => console.error("[correo masivo]", (e as Error).message));

  res.json({ queued: recipients.length });
}

// Buscador de destinatarios (alumnos y catedráticos con correo)
export async function emailRecipientsController(req: Request, res: Response) {
  res.json(await searchEmailRecipients(String(req.query.search ?? "")));
}

// Ejecuta los recordatorios de cuotas por correo (por vencer / mora).
export async function runEmailRemindersController(_req: Request, res: Response) {
  if (!isMailConfigured()) {
    throw badRequest("El correo (SMTP) aún no está configurado en el servidor.");
  }
  const result = await runEmailPaymentReminders();
  res.json(result);
}

// --- Webhook entrante de YCloud (publico, sin auth de sesion) ---
// Valida la firma HMAC usando el raw body.
export async function webhookController(req: Request, res: Response) {
  const raw = (req as Request & { rawBody?: string }).rawBody ?? "";
  // YCloud envia un unico header "YCloud-Signature: t=...,s=..."
  const signatureHeader =
    (req.headers["ycloud-signature"] as string) ||
    (req.headers["x-ycloud-signature"] as string) ||
    "";

  if (!verifyWebhookSignature(raw, signatureHeader)) {
    return res.status(401).json({ error: "Firma invalida" });
  }

  const event = req.body as {
    type?: string;
    whatsappInboundMessage?: {
      from?: string;
      type?: string;
      text?: { body?: string };
    };
  };

  // Responder 200 rapido; procesar despues (YCloud reintenta si no es 2xx).
  res.status(200).json({ received: true });

  if (
    event.type === "whatsapp.inbound_message.received" &&
    event.whatsappInboundMessage?.type === "text"
  ) {
    const from = event.whatsappInboundMessage.from;
    const body = event.whatsappInboundMessage.text?.body;
    if (from && body) {
      // No await: ya respondimos 200
      void service.handleInbound(from, body);
    }
  }
}

// --- Endpoints del panel (con auth) ---
export async function listController(req: Request, res: Response) {
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 20);
  res.json(
    await service.listMessages({
      phone: req.query.phone as string | undefined,
      direction: req.query.direction as "INBOUND" | "OUTBOUND" | undefined,
      page: page > 0 ? page : 1,
      pageSize: pageSize > 0 && pageSize <= 100 ? pageSize : 20,
    })
  );
}

export async function getConfigController(_req: Request, res: Response) {
  res.json({ config: await service.getBotConfig() });
}

export async function updateConfigController(req: Request, res: Response) {
  const { enabled, knowledgeBase, systemPrompt } = req.body ?? {};
  res.json({
    config: await service.updateBotConfig({ enabled, knowledgeBase, systemPrompt }),
  });
}

export async function sendController(req: Request, res: Response) {
  const { phone, body } = req.body ?? {};
  if (!phone || !body) throw badRequest("phone y body son requeridos");
  const result = await service.sendAndLog(phone, body, "manual");
  if (!result.ok) throw badRequest(result.error ?? "No se pudo enviar");
  res.json({ ok: true });
}

// Envio masivo por plantilla a estudiantes (todos los activos si no se listan).
export async function bulkController(req: Request, res: Response) {
  const { templateName, studentIds } = req.body ?? {};
  if (!templateName) throw badRequest("templateName es requerido");
  const { sendBulk } = await import("./notifications.service.js");
  const result = await sendBulk({ templateName, studentIds });
  res.json(result);
}

// --- Diseño del encabezado de los correos -----------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;

function parseDesign(body: unknown): EmailDesign {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const color = str(b.color, 7);
  return {
    style: b.style === "claro" ? "claro" : "solido",
    color: HEX.test(color) ? color : DEFAULT_EMAIL_DESIGN.color,
    title: str(b.title, 80) || DEFAULT_EMAIL_DESIGN.title,
    subtitle: str(b.subtitle, 80),
    bannerKey: b.bannerKey ? str(b.bannerKey, 200) : null,
    bannerUrl: b.bannerUrl ? str(b.bannerUrl, 500) : null,
  };
}

export async function getEmailDesignController(_req: Request, res: Response) {
  const design = await getEmailDesign();
  res.json({ design, preview: renderEmailPreview(design) });
}

// Vista previa de un diseño sin guardarlo
export async function previewEmailDesignController(req: Request, res: Response) {
  res.json({ preview: renderEmailPreview(parseDesign(req.body)) });
}

export async function saveEmailDesignController(req: Request, res: Response) {
  const design = parseDesign(req.body);
  await saveEmailDesign(design);
  res.json({ design, preview: renderEmailPreview(design) });
}
