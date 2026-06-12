import { env } from "../config/env.js";
import { HttpError } from "./http-error.js";

// Cliente minimo de la API REST v3 de WooCommerce (solo lectura de pedidos).
// Node 22 trae fetch nativo.

export interface WooMeta {
  key?: string;
  display_key?: string;
  value: unknown;
}

export interface WooLineItem {
  name: string;
  quantity: number;
  total: string;
  meta_data?: WooMeta[];
}

export interface WooOrder {
  id: number;
  status: string;
  currency: string;
  total: string;
  date_paid_gmt: string | null;
  date_created_gmt: string;
  payment_method: string;
  payment_method_title: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  line_items: WooLineItem[];
  meta_data?: WooMeta[];
}

// Normaliza la sede a un nombre canonico. Devuelve null si no la reconoce.
export function normalizeSede(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("izabal") || s.includes("morales")) return "Morales Izabal";
  if (s.includes("chiquimula")) return "Chiquimula";
  // Sede desconocida: la guardamos capitalizada tal cual vino.
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Extrae la sede de un pedido: primero la meta "Sede" de cualquier line item,
// luego el patron "... - Chiquimula/Izabal" en el nombre del producto.
export function extractSede(order: WooOrder): string | null {
  for (const li of order.line_items ?? []) {
    for (const m of li.meta_data ?? []) {
      const k = String(m.display_key ?? m.key ?? "").toLowerCase();
      if (k === "sede" && m.value) return normalizeSede(String(m.value));
    }
  }
  for (const li of order.line_items ?? []) {
    const mm = /\b-\s*(chiquimula|morales\s*izabal|izabal|morales)/i.exec(
      li.name ?? ""
    );
    if (mm) return normalizeSede(mm[1]);
  }
  return null;
}

export function isWooConfigured(): boolean {
  return Boolean(env.WOO_URL && env.WOO_CONSUMER_KEY && env.WOO_CONSUMER_SECRET);
}

function authHeader(): string {
  const creds = `${env.WOO_CONSUMER_KEY}:${env.WOO_CONSUMER_SECRET}`;
  return "Basic " + Buffer.from(creds).toString("base64");
}

interface FetchOrdersOptions {
  perPage?: number;
  page?: number;
  status?: string; // any | completed | processing | on-hold ...
  after?: string; // ISO date, solo pedidos despues de esta fecha
}

// Trae una pagina de pedidos
export async function fetchOrders(
  opts: FetchOrdersOptions = {}
): Promise<{ orders: WooOrder[]; totalPages: number }> {
  if (!isWooConfigured()) {
    throw new Error("WooCommerce no esta configurado (faltan claves)");
  }

  const params = new URLSearchParams({
    per_page: String(opts.perPage ?? 50),
    page: String(opts.page ?? 1),
    status: opts.status ?? "any",
    orderby: "date",
    order: "desc",
  });
  if (opts.after) params.set("after", opts.after);

  const url = `${env.WOO_URL}/wp-json/wc/v3/orders?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader() },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    // Fallo de red: timeout de conexion, DNS, tienda caida, etc.
    throw new HttpError(
      504,
      "No se pudo conectar con la tienda en linea (WooCommerce). " +
        "Puede estar lenta o fuera de servicio; intenta de nuevo en unos minutos."
    );
  }

  if (!res.ok) {
    const body = await res.text();
    const status = res.status === 401 ? 401 : 502;
    throw new HttpError(
      status,
      status === 401
        ? "Credenciales de WooCommerce invalidas o sin permiso."
        : `La tienda en linea respondio con un error (${res.status}).`,
      body.slice(0, 200)
    );
  }

  const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1");
  const orders = (await res.json()) as WooOrder[];
  return { orders, totalPages };
}
