// Emisión y anulación de recibos electrónicos (DTE tipo RECI) con Digifact.
//
// Flujo (igual que la certificación de ventas en bluestock):
//   1. Se crea el Dte en PENDIENTE con una copia del emisor/receptor.
//   2. Se arma el NUC JSON y se envía a Digifact.
//   3. Si certifica: CERTIFICADO + autorización, serie, número, XML y PDF.
//      Si falla: ERROR con el mensaje (se puede reintentar desde el panel).

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Prisma, type Dte } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, conflict, notFound } from "../../lib/http-error.js";
import { parseTaxId } from "../../lib/nit.js";
import {
  voidDte,
  certifyNuc,
  DigifactError,
  digifactEnvironment,
  isDigifactConfigured,
} from "../../lib/digifact.js";
import { UPLOAD_ROOT, ensureUploadDir, deleteFile } from "../../lib/storage.js";
import { activePhrases, establishmentForSede, getFelConfig, type FelConfig } from "./fel.config.js";
import { buildReciPayload, type FelItem } from "./fel.payload.js";
import type { IssueReceiptInput, ListReceiptsQuery } from "./fel.schemas.js";

// Campos del recibo que viajan con cada pago al frontend
export const FEL_SELECT = {
  id: true,
  status: true,
  documentType: true,
  authorizationNumber: true,
  series: true,
  number: true,
  emittedAt: true,
  certifiedAt: true,
  receiverTaxId: true,
  receiverTaxIdType: true,
  receiverName: true,
  grandTotal: true,
  error: true,
  voidedAt: true,
  voidReason: true,
  pdfKey: true,
  xmlKey: true,
  createdAt: true,
} satisfies Prisma.DteSelect;

export type FelSummary = Prisma.DteGetPayload<{ select: typeof FEL_SELECT }>;

export function serializeFel<T extends { grandTotal: unknown; pdfKey?: string | null; xmlKey?: string | null }>(f: T) {
  return {
    ...f,
    grandTotal: Number(f.grandTotal),
    pdfKey: undefined,
    xmlKey: undefined,
    hasXml: Boolean(f.xmlKey),
    hasSatPdf: Boolean(f.pdfKey),
  };
}

const paymentInclude = {
  student: {
    select: {
      id: true,
      fullName: true,
      taxId: true,
      billingName: true,
      billingAddress: true,
      billingEmail: true,
      email: true,
      sede: true,
      address: true,
      municipality: true,
      department: true,
    },
  },
  dtes: { orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.PaymentInclude;

type PaymentConFel = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export async function getFelStatus() {
  const cfg = await getFelConfig();
  return {
    configured: isDigifactConfigured(),
    environment: digifactEnvironment(),
    enabled: cfg.enabled,
    autoIssue: cfg.autoIssue,
    sendEmail: cfg.sendEmail,
    issuerNit: cfg.issuer.nit,
  };
}

// --- Receptor ----------------------------------------------------------------

function direccionDe(s: PaymentConFel["student"]): string | null {
  if (!s) return null;
  const partes = [s.address, s.municipality, s.department].filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}

// Receptor del recibo: lo que indique el usuario, o el NIT del expediente, o CF.
export function resolveReceiver(payment: PaymentConFel, input: IssueReceiptInput) {
  const raw = input.receiverTaxId ?? payment.student?.taxId ?? "CF";
  const parsed = parseTaxId(raw);
  if (!parsed) {
    throw badRequest(`La identificación fiscal "${raw}" no es válida. Corrige la del expediente o emite a CF.`);
  }
  // Con NIT/DPI, el nombre es el del titular (datos de facturación); en CF se
  // usa el del titular si lo hay, y si no el del alumno.
  const nombreBase =
    input.receiverName?.trim() ||
    payment.student?.billingName ||
    payment.student?.fullName ||
    payment.payerName ||
    "CONSUMIDOR FINAL";
  const correo =
    input.receiverEmail !== undefined
      ? input.receiverEmail || null
      : payment.student?.billingEmail ?? payment.student?.email ?? payment.payerEmail ?? null;
  return {
    taxId: parsed.id,
    taxIdType: parsed.tipo,
    name: nombreBase.slice(0, 200),
    email: correo,
    address: payment.student?.billingAddress || direccionDe(payment.student),
  };
}

// --- Emisión -----------------------------------------------------------------

async function cargarPago(paymentId: string): Promise<PaymentConFel> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: paymentInclude,
  });
  if (!payment) throw notFound("Pago no encontrado");
  return payment;
}

function exigirConfiguracion(cfg: FelConfig) {
  if (!isDigifactConfigured()) {
    throw badRequest(
      "Digifact no está configurado en el servidor (DIGIFACT_API_URL, DIGIFACT_USERNAME, DIGIFACT_PASSWORD)."
    );
  }
  if (!cfg.enabled) {
    throw badRequest("La emisión de recibos FEL está desactivada en la configuración.");
  }
}

async function guardarArchivo(base64: string, nombre: string): Promise<string> {
  await ensureUploadDir();
  const key = `fel-${crypto.randomBytes(8).toString("hex")}-${nombre}`;
  await fs.writeFile(path.join(UPLOAD_ROOT, key), Buffer.from(base64, "base64"));
  return key;
}

// Una emisión que quedó PENDIENTE sin respuesta (p. ej. el servidor se reinició
// mientras Digifact certificaba) se cierra como ERROR con un aviso: no se debe
// reintentar a ciegas porque el documento pudo quedar certificado en SAT.
export const ORPHANED_PENDING_MIN = 3;
export const INTERRUPTED_MESSAGE =
  "La emisión se interrumpió antes de recibir la respuesta de Digifact (por ejemplo, por un reinicio del servidor). " +
  "Antes de reintentar, verifique en el portal de Digifact que el documento no haya quedado certificado, para no duplicarlo.";

export async function closeOrphanedPending(minutos = ORPHANED_PENDING_MIN): Promise<number> {
  const limite = new Date(Date.now() - minutos * 60_000);
  const r = await prisma.dte.updateMany({
    where: { status: "PENDING", updatedAt: { lt: limite } },
    data: { status: "ERROR", error: INTERRUPTED_MESSAGE },
  });
  if (r.count > 0) console.warn(`[fel] ${r.count} emisión(es) interrumpida(s) marcadas como ERROR`);
  return r.count;
}

export async function issueReceipt(
  paymentId: string,
  input: IssueReceiptInput = {},
  userId?: string,
  opts: { auto?: boolean } = {}
): Promise<Dte> {
  const cfg = await getFelConfig();
  exigirConfiguracion(cfg);
  await closeOrphanedPending();

  const payment = await cargarPago(paymentId);
  if (payment.status !== "ACTIVO") {
    throw badRequest("Solo se emiten recibos de pagos activos (aprobados y no anulados).");
  }
  const ultimo = payment.dtes[0] ?? null;
  if (ultimo?.status === "CERTIFIED") {
    throw conflict("Este pago ya tiene un recibo FEL certificado. Anúlalo antes de emitir otro.");
  }
  if (ultimo?.status === "PENDING") {
    throw conflict("Ya hay una emisión en proceso para este pago. Espera un momento.");
  }

  const neto = Number(payment.amount) - Number(payment.discount);
  if (neto <= 0) throw badRequest("El monto neto del pago debe ser mayor a 0 para emitir un recibo.");
  const monto = Math.round(neto * 100) / 100;

  const receptor = resolveReceiver(payment, input);
  const est = establishmentForSede(cfg, payment.sede ?? payment.student?.sede);
  // Se certifica el monto realmente recibido (neto de beca/descuento), como en bluestock.
  const items: FelItem[] = [
    {
      position: 1,
      itemType: "S",
      description: (input.description ?? payment.concept).slice(0, 250),
      quantity: 1,
      unitOfMeasure: "UNI",
      unitPrice: monto,
      discount: 0,
      total: monto,
    },
  ];

  const datos = {
    status: "PENDING" as const,
    error: null,
    establishmentId: est.id ?? null,
    issuerNit: cfg.issuer.nit,
    issuerName: cfg.issuer.name,
    issuerCommercialName: est.commercialName || cfg.issuer.commercialName,
    issuerTaxAffiliation: cfg.issuer.taxAffiliation,
    issuerEstablishmentCode: est.code,
    issuerAddress: est.address,
    issuerPostalCode: est.postalCode,
    issuerMunicipality: est.municipality,
    issuerDepartment: est.department,
    issuerEmail: cfg.issuer.email || null,
    receiverTaxId: receptor.taxId,
    receiverTaxIdType: receptor.taxIdType,
    receiverName: receptor.name,
    receiverEmail: receptor.email,
    receiverAddress: receptor.address,
    items: items as unknown as Prisma.InputJsonValue,
    phrases: activePhrases(cfg) as unknown as Prisma.InputJsonValue,
    currency: "GTQ",
    grandTotal: monto,
    createdById: userId ?? null,
  };

  // Un intento fallido se reutiliza; un recibo anulado queda en el historial.
  const doc =
    ultimo && ultimo.status === "ERROR"
      ? await prisma.dte.update({ where: { id: ultimo.id }, data: datos })
      : await prisma.dte.create({
          data: { ...datos, paymentId: payment.id, internalUuid: crypto.randomUUID() },
        });

  const emittedAt = new Date();
  let payload: Record<string, unknown>;
  try {
    payload = buildReciPayload(doc, emittedAt);
  } catch (err) {
    const msg = (err as Error).message;
    await prisma.dte.update({ where: { id: doc.id }, data: { status: "ERROR", error: msg } });
    throw badRequest(`No se pudo armar el recibo: ${msg}`);
  }
  await prisma.dte.update({
    where: { id: doc.id },
    data: { payload: payload as Prisma.InputJsonValue },
  });

  try {
    const r = await certifyNuc(payload, cfg.issuer.nit);
    const [xmlKey, pdfKey] = await Promise.all([
      r.xmlBase64 ? guardarArchivo(r.xmlBase64, "recibo.xml") : Promise.resolve(null),
      r.pdfBase64 ? guardarArchivo(r.pdfBase64, "recibo.pdf") : Promise.resolve(null),
    ]);
    const certificado = await prisma.dte.update({
      where: { id: doc.id },
      data: {
        status: "CERTIFIED",
        error: null,
        authorizationNumber: r.authorizationNumber,
        series: r.series || null,
        number: r.number || null,
        emittedAt: r.emittedAt ?? emittedAt,
        certifiedAt: r.certifiedAt ?? r.emittedAt ?? emittedAt,
        xmlKey,
        pdfKey,
        response: r.response as Prisma.InputJsonValue,
        // El JSON enviado solo sirve para diagnosticar rechazos: una vez
        // certificado, el XML firmado y la copia de datos de esta fila son el registro.
        payload: Prisma.DbNull,
      },
    });
    console.log(
      `[fel] recibo certificado pago=${payment.id} serie=${certificado.series} numero=${certificado.number} aut=${certificado.authorizationNumber}`
    );
    // En la emisión automática el recibo viaja en el correo de confirmación
    // del pago (ver lib/pago-aplicado.ts); aquí solo se avisa en la manual.
    if (cfg.sendEmail && !opts.auto) {
      void sendReceiptEmail(certificado.id).catch((e) =>
        console.error("[fel] correo del recibo:", (e as Error).message)
      );
    }
    return certificado;
  } catch (err) {
    const msg = err instanceof DigifactError ? err.message : (err as Error).message;
    const detalle = err instanceof DigifactError ? err.detail : undefined;
    console.error(`[fel] error al certificar pago=${payment.id}:`, msg);
    await prisma.dte.update({
      where: { id: doc.id },
      data: {
        status: "ERROR",
        error: msg.slice(0, 4000),
        response:
          detalle && typeof detalle === "object"
            ? (detalle as Prisma.InputJsonValue)
            : typeof detalle === "string"
              ? { raw: detalle }
              : undefined,
      },
    });
    throw badRequest(`No se pudo certificar el recibo: ${msg}`);
  }
}

// Emisión automática al aplicar un pago (no lanza: solo registra). Se emite a
// CF salvo que el expediente tenga NIT. Si falla, queda en ERROR para reintentar
// desde el panel. Devuelve el recibo certificado (nuevo o ya existente) o null.
export async function autoIssueReceipt(paymentId: string): Promise<Dte | null> {
  try {
    const cfg = await getFelConfig();
    if (!cfg.enabled || !cfg.autoIssue || !isDigifactConfigured()) return null;
    const existente = await prisma.dte.findFirst({
      where: { paymentId, status: { in: ["CERTIFIED", "PENDING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existente) return existente.status === "CERTIFIED" ? existente : null;
    return await issueReceipt(paymentId, {}, undefined, { auto: true });
  } catch (err) {
    console.error(`[fel] emisión automática del pago ${paymentId}:`, (err as Error).message);
    return null;
  }
}

// --- Anulación ---------------------------------------------------------------

export async function voidReceipt(
  docId: string,
  motivo: string,
  userId?: string
): Promise<Dte> {
  const doc = await prisma.dte.findUnique({ where: { id: docId } });
  if (!doc) throw notFound("Recibo no encontrado");
  if (doc.status === "VOIDED") return doc;
  if (doc.status !== "CERTIFIED" || !doc.authorizationNumber) {
    // Nunca llegó a SAT: solo se descarta.
    return prisma.dte.update({
      where: { id: doc.id },
      data: { status: "VOIDED", voidedAt: new Date(), voidReason: motivo, voidedById: userId ?? null },
    });
  }
  const cfg = await getFelConfig();
  if (!isDigifactConfigured()) {
    throw badRequest("Digifact no está configurado en el servidor.");
  }
  const usuario = userId
    ? (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? "sistema"
    : "sistema";
  try {
    const response = await voidDte({
      issuerNit: doc.issuerNit || cfg.issuer.nit,
      authorizationNumber: doc.authorizationNumber,
      receiverTaxId: doc.receiverTaxId,
      emittedAt: doc.emittedAt ?? doc.createdAt,
      reason: motivo,
      username: usuario,
    });
    return prisma.dte.update({
      where: { id: doc.id },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidReason: motivo,
        voidedById: userId ?? null,
        response: { certification: doc.response ?? null, cancellation: response } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    const msg = err instanceof DigifactError ? err.message : (err as Error).message;
    console.error(`[fel] error al anular recibo ${doc.id}:`, msg);
    throw badRequest(`No se pudo anular el recibo FEL: ${msg}`);
  }
}

// Al anular un pago: si tiene recibo certificado, se anula primero ante SAT.
// Si Digifact falla, lanza y el pago NO se anula (para no dejar un recibo
// vigente de un pago anulado).
export async function voidPaymentReceipt(
  paymentId: string,
  motivo: string,
  userId?: string
): Promise<void> {
  const vigente = await prisma.dte.findFirst({
    where: { paymentId, status: "CERTIFIED" },
    orderBy: { createdAt: "desc" },
  });
  if (vigente) await voidReceipt(vigente.id, motivo, userId);
}

// --- Consulta ----------------------------------------------------------------

const detailInclude = {
  payment: {
    select: {
      id: true,
      concept: true,
      amount: true,
      discount: true,
      method: true,
      paidAt: true,
      status: true,
      student: { select: { id: true, fullName: true, expedienteNumber: true, taxId: true, sede: true } },
      registeredBy: { select: { name: true } },
    },
  },
  createdBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
} satisfies Prisma.DteInclude;

export type FelDetail = Prisma.DteGetPayload<{ include: typeof detailInclude }>;

function serializeDetail(d: FelDetail) {
  const { payload: _p, response: _r, pdfKey, xmlKey, ...rest } = d;
  return {
    ...rest,
    grandTotal: Number(d.grandTotal),
    hasXml: Boolean(xmlKey),
    hasSatPdf: Boolean(pdfKey),
    payment: {
      ...d.payment,
      amount: Number(d.payment.amount),
      discount: Number(d.payment.discount),
    },
  };
}

export async function getReceipt(id: string) {
  const doc = await prisma.dte.findUnique({ where: { id }, include: detailInclude });
  if (!doc) throw notFound("Recibo no encontrado");
  return serializeDetail(doc);
}

export async function getReceiptRaw(id: string): Promise<FelDetail> {
  const doc = await prisma.dte.findUnique({ where: { id }, include: detailInclude });
  if (!doc) throw notFound("Recibo no encontrado");
  return doc;
}

// Historial de recibos de un pago (el más reciente primero)
export async function getPaymentReceipts(paymentId: string) {
  const docs = await prisma.dte.findMany({
    where: { paymentId },
    orderBy: { createdAt: "desc" },
    include: detailInclude,
  });
  return docs.map(serializeDetail);
}

export async function listReceipts(q: ListReceiptsQuery) {
  const where: Prisma.DteWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.studentId ? { payment: { studentId: q.studentId } } : {}),
    ...(q.search
      ? {
          OR: [
            { authorizationNumber: { contains: q.search } },
            { number: { contains: q.search } },
            { receiverName: { contains: q.search } },
            { receiverTaxId: { contains: q.search } },
            { payment: { student: { fullName: { contains: q.search } } } },
          ],
        }
      : {}),
  };
  const [total, rows, suma] = await Promise.all([
    prisma.dte.count({ where }),
    prisma.dte.findMany({
      where,
      include: detailInclude,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.dte.aggregate({ where: { ...where, status: "CERTIFIED" }, _sum: { grandTotal: true } }),
  ]);
  return {
    data: rows.map(serializeDetail),
    pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
    totals: { certified: Number(suma._sum.grandTotal ?? 0) },
  };
}

// Archivo XML/PDF certificado guardado en /uploads
export async function readFile(key: string | null): Promise<Buffer | null> {
  if (!key) return null;
  try {
    return await fs.readFile(path.join(UPLOAD_ROOT, path.basename(key)));
  } catch {
    return null;
  }
}

// Borra los archivos de un recibo (solo para limpieza manual; no se usa en el flujo normal)
export async function deleteFiles(doc: Pick<Dte, "xmlKey" | "pdfKey">) {
  await Promise.all([deleteFile(doc.xmlKey), deleteFile(doc.pdfKey)]);
}

// --- Correo al alumno --------------------------------------------------------

export async function sendReceiptEmail(docId: string): Promise<{ sent: boolean }> {
  const doc = await getReceiptRaw(docId);
  if (doc.status !== "CERTIFIED") return { sent: false };
  const to = doc.receiverEmail;
  if (!to) return { sent: false };
  const [{ sendBrandedMail }, { dteEmailBlock }] = await Promise.all([
    import("../../lib/mailer.js"),
    import("../../lib/fel-email.js"),
  ]);
  const dte = await dteEmailBlock(doc);
  const nombre = (doc.payment.student?.fullName ?? doc.receiverName).trim().split(/\s+/)[0] ?? "estudiante";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bodyHtml = `
    <p>Hola, ${esc(nombre)}:</p>
    <p>Te compartimos tu recibo electrónico certificado ante la SAT por el pago de <strong>${esc(doc.payment.concept)}</strong>.</p>
    ${dte.html}`;
  const text =
    `Hola, ${nombre}:\n\nTe compartimos tu recibo electrónico certificado ante la SAT por el pago de ${doc.payment.concept}.\n\n` +
    dte.text;
  return sendBrandedMail({
    to,
    subject: "Recibo electrónico (FEL) · Escuela de Enfermería Carmen María",
    heading: "Tu recibo electrónico",
    bodyHtml,
    text,
    attachments: [...dte.inline, ...dte.adjuntos],
  });
}
