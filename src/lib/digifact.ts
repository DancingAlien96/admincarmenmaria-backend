// Cliente de la API de Digifact (certificador FEL) para emitir y anular DTE.
//
// Portado del flujo de bluestock (Django): token de sesión guardado en la base
// de datos y renovado al vencer o cuando Digifact responde 401; certificación
// con el formato NUC JSON (`/v2/transform/nuc_json`) y anulación con
// `/CancelFelGT`. Aquí se usa `fetch` nativo de Node y Prisma.

import { env } from "../config/env.js";
import { prisma } from "./prisma.js";
import { fechaIsoGuatemala } from "./fecha-gt.js";

export class DigifactError extends Error {
  status?: number;
  detalle?: unknown;
  constructor(message: string, status?: number, detalle?: unknown) {
    super(message);
    this.name = "DigifactError";
    this.status = status;
    this.detalle = detalle;
  }
}

export function isDigifactConfigured(): boolean {
  return Boolean(
    env.DIGIFACT_API_URL && env.DIGIFACT_USERNAME && env.DIGIFACT_PASSWORD
  );
}

// "pruebas" si la URL apunta al ambiente de pruebas de Digifact.
export function digifactAmbiente(): "pruebas" | "produccion" | null {
  if (!env.DIGIFACT_API_URL) return null;
  return /test/i.test(env.DIGIFACT_API_URL) ? "pruebas" : "produccion";
}

const TOKEN_FALLBACK_HOURS = 4;
const TIMEOUT_MS = 60_000;

// Copia en memoria del token (evita una consulta por llamada y permite usar el
// cliente aunque la tabla aún no exista, p. ej. desde la CLI de prueba).
let memToken: { token: string; expiresAt: Date | null } | null = null;

function baseUrl(): string {
  return (env.DIGIFACT_API_URL ?? "").replace(/\/+$/, "");
}

type JsonRecord = Record<string, unknown>;

interface HttpResult {
  status: number;
  json: JsonRecord | null;
  text: string;
}

// Fechas que devuelve Digifact: "5/24/2026 10:49:13 PM" (hora de Guatemala) o
// ISO 8601 con o sin zona horaria (sin zona = hora de Guatemala).
export function parseFechaDigifact(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;

  const us = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i
  );
  if (us) {
    let hour = Number(us[4]);
    const ampm = us[7]?.toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const iso = `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${us[5]}:${us[6]}-06:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const isoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text);
  const d = new Date(isoLike && !hasZone ? `${text}-06:00` : text);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchJson(
  method: "GET" | "POST",
  url: string,
  opts: { body?: unknown; params?: Record<string, string>; token?: string }
): Promise<HttpResult> {
  const target = new URL(url);
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    target.searchParams.set(k, v);
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = opts.token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: JsonRecord | null = null;
    try {
      const parsed: unknown = text ? JSON.parse(text) : null;
      if (parsed && typeof parsed === "object") json = parsed as JsonRecord;
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  } catch (err) {
    const e = err as Error;
    throw new DigifactError(
      e.name === "AbortError"
        ? "Digifact no respondió a tiempo"
        : `No se pudo conectar con Digifact: ${e.message}`
    );
  } finally {
    clearTimeout(timer);
  }
}

function lowerKeys(obj: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])
  );
}

function pick(obj: JsonRecord, keys: string[]): unknown {
  const lower = lowerKeys(obj);
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function errorDetail(json: JsonRecord | null, text: string): string {
  if (json) {
    const msg = pick(json, ["message", "Mensaje", "description", "error", "ResponseDATA1", "responseData1"]);
    if (typeof msg === "string") return msg;
    if (msg && typeof msg === "object") return JSON.stringify(msg);
    return JSON.stringify(json).slice(0, 600);
  }
  return text.slice(0, 600) || "sin detalle";
}

function codigoRespuesta(json: JsonRecord): number | string | null {
  const code = pick(json, ["code", "Codigo", "codigo"]);
  if (code === undefined) return null;
  return code as number | string;
}

// --- Token -------------------------------------------------------------------

async function requestNewToken(): Promise<string> {
  const { status, json, text } = await fetchJson("POST", `${baseUrl()}/login/get_token`, {
    body: { Username: env.DIGIFACT_USERNAME, Password: env.DIGIFACT_PASSWORD },
  });
  const token = json ? pick(json, ["Token", "token"]) : undefined;
  if (status !== 200 || typeof token !== "string" || !token) {
    throw new DigifactError(
      `No se pudo obtener el token de Digifact: ${errorDetail(json, text)}`,
      status,
      json
    );
  }
  const expiresAt =
    parseFechaDigifact(json ? pick(json, ["expira_en", "expiresAt"]) : null) ??
    new Date(Date.now() + TOKEN_FALLBACK_HOURS * 3600_000);
  memToken = { token, expiresAt };
  try {
    await prisma.felToken.upsert({
      where: { id: 1 },
      create: { id: 1, token, expiresAt },
      update: { token, expiresAt },
    });
  } catch (err) {
    console.warn("[digifact] no se pudo guardar el token:", (err as Error).message);
  }
  console.log(`[digifact] token nuevo, vence ${expiresAt.toISOString()}`);
  return token;
}

async function getToken(): Promise<string> {
  const limit = Date.now() + 60_000; // margen de 1 minuto
  if (memToken && (!memToken.expiresAt || memToken.expiresAt.getTime() > limit)) {
    return memToken.token;
  }
  try {
    const row = await prisma.felToken.findUnique({ where: { id: 1 } });
    if (row?.token && (!row.expiresAt || row.expiresAt.getTime() > limit)) {
      memToken = { token: row.token, expiresAt: row.expiresAt };
      return row.token;
    }
  } catch (err) {
    console.warn("[digifact] no se pudo leer el token guardado:", (err as Error).message);
  }
  return requestNewToken();
}

// Llama a Digifact con el token; si responde 401 pide uno nuevo y reintenta
// una vez (Digifact no tiene "refresh": el 401 es la única señal confiable).
export async function digifactRequest(
  method: "GET" | "POST",
  path: string,
  opts: { body?: unknown; params?: Record<string, string> } = {}
): Promise<HttpResult> {
  if (!isDigifactConfigured()) {
    throw new DigifactError(
      "Digifact no está configurado. Define DIGIFACT_API_URL, DIGIFACT_USERNAME y DIGIFACT_PASSWORD."
    );
  }
  const url = `${baseUrl()}${path}`;
  const token = await getToken();
  let res = await fetchJson(method, url, { ...opts, token });
  if (res.status === 401) {
    console.warn(`[digifact] token rechazado (401) en ${path}; se solicita uno nuevo`);
    const fresh = await requestNewToken();
    if (fresh !== token) res = await fetchJson(method, url, { ...opts, token: fresh });
  }
  return res;
}

// --- Certificación -----------------------------------------------------------

// NIT sin guiones completado con ceros a 12 caracteres (como pide la API).
export function padTaxId(nit: string): string {
  return nit.toUpperCase().replace(/[^0-9K]/g, "").padStart(12, "0");
}

export interface CertificacionResultado {
  autorizacion: string;
  serie: string;
  numero: string;
  fechaEmision: Date | null;
  fechaCertificacion: Date | null;
  xmlBase64: string | null;
  pdfBase64: string | null;
  // Respuesta sin los archivos en base64 (para guardarla en la BD)
  respuesta: JsonRecord;
}

// La respuesta útil puede venir en la raíz o anidada (message / response / RESPONSE[0]).
function extraerDatos(json: JsonRecord): JsonRecord {
  const nested = pick(json, ["message", "response"]);
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...json, ...(nested as JsonRecord) };
  }
  const list = pick(json, ["RESPONSE"]);
  if (Array.isArray(list) && list[0] && typeof list[0] === "object") {
    return { ...json, ...(list[0] as JsonRecord) };
  }
  return json;
}

function sinBase64(json: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(json).filter(([k]) => !/^responsedata\d$/i.test(k))
  );
}

export async function certificarNuc(
  payload: unknown,
  nitEmisor: string
): Promise<CertificacionResultado> {
  const res = await digifactRequest("POST", "/v2/transform/nuc_json", {
    body: payload,
    params: {
      TAXID: padTaxId(nitEmisor),
      USERNAME: env.DIGIFACT_USERNAME ?? "",
      FORMAT: "XML|PDF",
    },
  });
  const json = res.json;
  if (res.status >= 400 || !json) {
    throw new DigifactError(
      `Digifact rechazó el documento (${res.status}): ${errorDetail(json, res.text)}`,
      res.status,
      json ? sinBase64(json) : res.text
    );
  }
  const code = codigoRespuesta(json);
  if (code !== null && Number(code) !== 1) {
    throw new DigifactError(
      `Digifact: ${errorDetail(json, res.text)}`,
      res.status,
      sinBase64(json)
    );
  }

  const data = extraerDatos(json);
  const autorizacion = pick(data, ["authNumber", "uuid", "Autorizacion", "authorization_number"]);
  if (typeof autorizacion !== "string" || !autorizacion) {
    throw new DigifactError(
      "Digifact no devolvió el número de autorización",
      res.status,
      sinBase64(json)
    );
  }
  const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  const fechaEmision = parseFechaDigifact(pick(data, ["issuedTimeStamp", "fecha", "Fecha_DTE", "date"]));
  return {
    autorizacion: autorizacion.toUpperCase(),
    serie: str(pick(data, ["batch", "serie", "series", "Serie"])),
    numero: str(pick(data, ["serial", "numero", "number", "NUMERO", "Numero"])),
    fechaEmision,
    fechaCertificacion:
      parseFechaDigifact(pick(data, ["enrolledTimeStamp", "Fecha_de_certificacion", "certified_at"])) ??
      fechaEmision,
    xmlBase64: str(pick(data, ["responseData1", "ResponseDATA1"])) || null,
    pdfBase64: str(pick(data, ["responseData3", "ResponseDATA3"])) || null,
    respuesta: sinBase64(json),
  };
}

// --- Anulación ---------------------------------------------------------------

function yaCancelado(json: JsonRecord): boolean {
  return Object.values(json).some(
    (v) => typeof v === "string" && v.includes("DocumentoYaCancelado")
  );
}

export async function anularDte(input: {
  nitEmisor: string;
  autorizacion: string;
  idReceptor: string;
  fechaEmision: Date;
  motivo: string;
  usuario: string;
}): Promise<JsonRecord> {
  const body = {
    Taxid: input.nitEmisor,
    Autorizacion: input.autorizacion,
    IdReceptor: input.idReceptor,
    FechaEmisionDocumentoAnular: fechaIsoGuatemala(input.fechaEmision),
    MotivoAnulacion: input.motivo,
    Username: input.usuario,
  };
  const res = await digifactRequest("POST", "/CancelFelGT", { body });
  const json: JsonRecord = res.json ?? { raw: res.text };

  // Si SAT ya lo tenía anulado, lo damos por anulado.
  if (yaCancelado(json)) return { ...json, yaCancelado: true };

  if (res.status >= 400) {
    throw new DigifactError(
      `Digifact no pudo anular el documento (${res.status}): ${errorDetail(res.json, res.text)}`,
      res.status,
      json
    );
  }
  const code = codigoRespuesta(json);
  if (code !== null && String(code) !== "1") {
    throw new DigifactError(
      `Digifact no pudo anular el documento: ${errorDetail(json, res.text)}`,
      res.status,
      json
    );
  }
  return json;
}
