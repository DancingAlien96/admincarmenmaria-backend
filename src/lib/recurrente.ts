import crypto from "node:crypto";
import { env } from "../config/env.js";

// Cliente de la pasarela Recurrente (checkout hospedado). NO manejamos datos
// de tarjeta: creamos el checkout y redirigimos al alumno a Recurrente.
// Docs: https://docs.recurrente.com — autenticación con X-SECRET-KEY; los
// webhooks se firman con Svix (secreto whsec_...).

export function isRecurrenteConfigured(): boolean {
  return Boolean(env.RECURRENTE_SECRET_KEY);
}

function base(): string {
  return env.RECURRENTE_BASE_URL.replace(/\/$/, "");
}

export class RecurrenteError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RecurrenteError";
    this.status = status;
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(base() + path, {
    method,
    headers: {
      "X-SECRET-KEY": env.RECURRENTE_SECRET_KEY ?? "",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`[recurrente] ${method} ${path} falló:`, res.status, JSON.stringify(data).slice(0, 500));
    const msg = data.error ?? data.message ?? data.errors;
    throw new RecurrenteError(
      typeof msg === "string" ? msg : `Recurrente respondió ${res.status}`,
      res.status
    );
  }
  return data as T;
}

// Crea el checkout y devuelve su id (ch_...) y la URL de pago.
export async function createCheckout(input: {
  name: string; // concepto de la cuota
  amount: number; // en quetzales
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const cents = Math.round(input.amount * 100);
  if (cents < 500) throw new RecurrenteError("El monto mínimo para pagar con tarjeta es Q5.00", 400);
  const data = await call<{ id?: string; checkout_url?: string }>("POST", "/checkouts", {
    items: [
      {
        name: input.name.slice(0, 120),
        amount_in_cents: cents,
        currency: "GTQ",
        quantity: 1,
      },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: input.metadata,
  });
  if (!data.id || !data.checkout_url) {
    throw new RecurrenteError("Recurrente no devolvió el enlace de pago", 502);
  }
  return { id: data.id, url: data.checkout_url };
}

// Estado de un checkout: unpaid | paid | payment_in_progress | expired
export async function getCheckout(id: string) {
  return call<{
    id: string;
    status: string;
    total_in_cents?: number;
    currency?: string;
    live_mode?: boolean;
  }>("GET", `/checkouts/${encodeURIComponent(id)}`);
}

// Verifica la firma Svix del webhook (svix-id, svix-timestamp, svix-signature).
// Usa el cuerpo ORIGINAL de la petición. Rechaza firmas de más de 5 minutos.
export function verifyWebhook(
  rawBody: string,
  headers: { id?: string; timestamp?: string; signature?: string }
): boolean {
  const secret = env.RECURRENTE_WEBHOOK_SECRET;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest("base64");
  // La cabecera puede traer varias firmas separadas por espacio: "v1,xxx v1,yyy"
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
