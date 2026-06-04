import crypto from "node:crypto";
import { env } from "../config/env.js";

// Cliente minimo de YCloud para enviar mensajes de WhatsApp.
// Docs: POST https://api.ycloud.com/v2/whatsapp/messages/sendDirectly
const YCLOUD_API = "https://api.ycloud.com/v2";

export function isYcloudConfigured(): boolean {
  return Boolean(env.YCLOUD_API_KEY && env.YCLOUD_FROM);
}

interface SendResult {
  wamid?: string;
  id?: string;
}

// Normaliza un telefono a E.164 (+502 para Guatemala si viene sin codigo).
export function toE164(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p;
  // 8 digitos => numero local de Guatemala
  if (p.length === 8) return `+502${p}`;
  if (p.startsWith("502")) return `+${p}`;
  return `+${p}`;
}

async function ycloudPost(path: string, body: unknown): Promise<SendResult> {
  if (!env.YCLOUD_API_KEY) throw new Error("YCloud no configurado (falta API key)");
  const res = await fetch(`${YCLOUD_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.YCLOUD_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (data?.message as string) || `YCloud respondio ${res.status}`;
    throw new Error(msg);
  }
  return { wamid: data.wamid as string, id: data.id as string };
}

// Mensaje de texto libre (solo valido dentro de la ventana de 24h).
export async function sendText(to: string, body: string): Promise<SendResult> {
  return ycloudPost("/whatsapp/messages/sendDirectly", {
    from: env.YCLOUD_FROM,
    to: toE164(to),
    type: "text",
    text: { body },
  });
}

// Mensaje de plantilla pre-aprobada (valido fuera de la ventana de 24h).
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  variables: string[] = []
): Promise<SendResult> {
  const components =
    variables.length > 0
      ? [
          {
            type: "body",
            parameters: variables.map((v) => ({ type: "text", text: v })),
          },
        ]
      : [];
  return ycloudPost("/whatsapp/messages/sendDirectly", {
    from: env.YCLOUD_FROM,
    to: toE164(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });
}

// Valida la firma HMAC-SHA256 del webhook de YCloud.
// YCloud envia UN header "YCloud-Signature: t={unixSeconds},s={hexSig}"
// y firma el payload `{timestamp}.{rawBody}.` (con punto final).
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // +/- 5 minutos

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string
): boolean {
  // Sin secreto: en produccion se rechaza (fail-closed); en dev se permite.
  if (!env.YCLOUD_WEBHOOK_SECRET) {
    if (env.NODE_ENV === "production") {
      console.error(
        "[ycloud] YCLOUD_WEBHOOK_SECRET no configurado: webhook rechazado en produccion"
      );
      return false;
    }
    return true;
  }

  if (!signatureHeader) return false;

  // Parsea "t=...,s=..." (el orden puede variar).
  let timestamp = "";
  let signature = "";
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k?.trim() === "t") timestamp = (v ?? "").trim();
    if (k?.trim() === "s") signature = (v ?? "").trim();
  }
  if (!timestamp || !signature) return false;

  // Anti-replay: timestamp en segundos Unix, debe ser reciente.
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > REPLAY_WINDOW_MS) {
    return false;
  }

  // OJO: YCloud firma con un punto al final del cuerpo.
  const signed = `${timestamp}.${rawBody}.`;
  const expected = crypto
    .createHmac("sha256", env.YCLOUD_WEBHOOK_SECRET)
    .update(signed)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}
