import crypto from "node:crypto";
import { env } from "../config/env.js";

// Cliente de la pasarela Tilopay (checkout hospedado). NO manejamos datos de
// tarjeta: creamos el pago y redirigimos al alumno al formulario de Tilopay.

export function isTilopayConfigured(): boolean {
  return Boolean(
    env.TILOPAY_API_KEY && env.TILOPAY_API_USER && env.TILOPAY_API_PASSWORD
  );
}

function base(): string {
  // Garantiza barra final.
  return env.TILOPAY_BASE_URL.endsWith("/")
    ? env.TILOPAY_BASE_URL
    : env.TILOPAY_BASE_URL + "/";
}

// Error devuelto por Tilopay (se registra el detalle; al alumno se le muestra
// un mensaje claro en vez de "Error interno del servidor").
export class TilopayError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TilopayError";
    this.status = status;
  }
}

// Tilopay usa varias formas de error según el endpoint: message/description/type.
function tilopayMessage(data: Record<string, unknown>, fallback: string) {
  const m = data.message ?? data.description ?? data.type;
  return typeof m === "string" && m.trim() ? m : fallback;
}

async function login(): Promise<string> {
  const res = await fetch(base() + "login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      apiuser: env.TILOPAY_API_USER,
      password: env.TILOPAY_API_PASSWORD,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof data.access_token !== "string") {
    console.error("[tilopay] login falló:", res.status, JSON.stringify(data).slice(0, 500));
    throw new TilopayError(
      tilopayMessage(data, "No se pudo autenticar con Tilopay"),
      res.status
    );
  }
  return data.access_token;
}

export interface ProcessPaymentInput {
  amount: number;
  orderNumber: string;
  redirect: string; // URL de retorno
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
}

// Crea el pago y devuelve la URL del checkout hospedado de Tilopay.
export async function createCheckout(input: ProcessPaymentInput): Promise<string> {
  const token = await login();
  const body = {
    redirect: input.redirect,
    key: env.TILOPAY_API_KEY,
    amount: input.amount.toFixed(2),
    currency: env.TILOPAY_CURRENCY,
    billToFirstName: input.firstName || "Estudiante",
    billToLastName: input.lastName || "-",
    billToAddress: input.address || "Ciudad",
    billToAddress2: "",
    billToCity: input.city || "Guatemala",
    billToState: input.state || "Guatemala",
    billToZipPostCode: "01001",
    billToCountry: input.country || "GT",
    billToTelephone: input.phone || "00000000",
    billToEmail: input.email,
    // Tilopay exige también los datos de envío: se usan los de facturación.
    shipToFirstName: input.firstName || "Estudiante",
    shipToLastName: input.lastName || "-",
    shipToAddress: input.address || "Ciudad",
    shipToAddress2: "",
    shipToCity: input.city || "Guatemala",
    shipToState: input.state || "Guatemala",
    shipToZipPostCode: "01001",
    shipToCountry: input.country || "GT",
    shipToTelephone: input.phone || "00000000",
    orderNumber: input.orderNumber,
    capture: "1",
    subscription: "0",
    platform: "api",
    lang: "es",
    hashVersion: "V2",
    returnData: Buffer.from(input.orderNumber).toString("base64"),
  };
  const res = await fetch(base() + "processPayment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof data.url !== "string") {
    console.error(
      "[tilopay] processPayment falló:",
      res.status,
      JSON.stringify(data).slice(0, 500)
    );
    throw new TilopayError(
      tilopayMessage(data, "Tilopay no devolvió el enlace de pago"),
      res.status
    );
  }
  return data.url;
}

export interface ReturnParams {
  order: string; // orderNumber que enviamos (external_orden_id)
  tpt: string; // id de transacción de Tilopay
  code: string; // "1" = aprobado
  auth: string;
  orderHash: string;
  amount: number; // el monto que cobramos (de nuestro registro)
  email: string; // el correo que enviamos como billToEmail
}

// Verifica la firma del retorno (HMAC-SHA256), replicando exactamente el cálculo
// de Tilopay. Devuelve true solo si la firma coincide.
export function verifyReturn(p: ReturnParams): boolean {
  if (!p.orderHash || !p.tpt) return false;
  const hashKey = `${p.tpt}|${env.TILOPAY_API_KEY}|${env.TILOPAY_API_PASSWORD}`;
  // Orden EXACTO de los campos (igual que http_build_query en PHP).
  const params = new URLSearchParams();
  params.append("api_Key", env.TILOPAY_API_KEY ?? "");
  params.append("api_user", env.TILOPAY_API_USER ?? "");
  params.append("orderId", p.tpt);
  params.append("external_orden_id", p.order);
  params.append("amount", p.amount.toFixed(2));
  params.append("currency", env.TILOPAY_CURRENCY);
  params.append("responseCode", p.code);
  params.append("auth", p.auth);
  params.append("email", p.email);
  const own = crypto
    .createHmac("sha256", hashKey)
    .update(params.toString())
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(own),
      Buffer.from(p.orderHash)
    );
  } catch {
    return false;
  }
}

// ¿El pago fue aprobado? code=1 y auth válido (>=6) y firma correcta.
export function isApproved(p: ReturnParams): boolean {
  return (
    p.code === "1" && (p.auth?.length ?? 0) >= 6 && verifyReturn(p)
  );
}
