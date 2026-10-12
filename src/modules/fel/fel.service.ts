// Emisión y anulación de recibos electrónicos (DTE tipo RECI) con Digifact.
//
// Flujo (igual que la certificación de ventas en bluestock):
//   1. Se crea el FelDocumento en PENDIENTE con una copia del emisor/receptor.
//   2. Se arma el NUC JSON y se envía a Digifact.
//   3. Si certifica: CERTIFICADO + autorización, serie, número, XML y PDF.
//      Si falla: ERROR con el mensaje (se puede reintentar desde el panel).

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Prisma, FelDocumento } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, conflict, notFound } from "../../lib/http-error.js";
import { parseTaxId } from "../../lib/nit.js";
import {
  anularDte,
  certificarNuc,
  DigifactError,
  digifactAmbiente,
  isDigifactConfigured,
} from "../../lib/digifact.js";
import { UPLOAD_ROOT, ensureUploadDir, deleteFile } from "../../lib/storage.js";
import { establecimientoParaSede, getFelConfig, type FelConfig } from "./fel.config.js";
import { buildReciPayload, type FelItem } from "./fel.payload.js";
import type { EmitirReciboInput, ListRecibosQuery } from "./fel.schemas.js";

// Campos del recibo que viajan con cada pago al frontend
export const FEL_SELECT = {
  id: true,
  estado: true,
  tipo: true,
  autorizacion: true,
  serie: true,
  numero: true,
  fechaEmision: true,
  fechaCertificacion: true,
  receptorId: true,
  receptorTipo: true,
  receptorNombre: true,
  granTotal: true,
  error: true,
  anuladoAt: true,
  anuladoMotivo: true,
  pdfKey: true,
  xmlKey: true,
  createdAt: true,
} satisfies Prisma.FelDocumentoSelect;

export type FelResumen = Prisma.FelDocumentoGetPayload<{ select: typeof FEL_SELECT }>;

export function serializeFel<T extends { granTotal: unknown; pdfKey?: string | null; xmlKey?: string | null }>(f: T) {
  return {
    ...f,
    granTotal: Number(f.granTotal),
    pdfKey: undefined,
    xmlKey: undefined,
    tieneXml: Boolean(f.xmlKey),
    tienePdfSat: Boolean(f.pdfKey),
  };
}

const paymentInclude = {
  student: {
    select: {
      id: true,
      fullName: true,
      taxId: true,
      email: true,
      sede: true,
      address: true,
      municipality: true,
      department: true,
    },
  },
  felDocumentos: { orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.PaymentInclude;

type PaymentConFel = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export async function getEstadoFel() {
  const cfg = await getFelConfig();
  return {
    configurado: isDigifactConfigured(),
    ambiente: digifactAmbiente(),
    habilitado: cfg.habilitado,
    emitirAutomatico: cfg.emitirAutomatico,
    enviarCorreo: cfg.enviarCorreo,
    emisorNit: cfg.emisor.nit,
  };
}

// --- Receptor ----------------------------------------------------------------

function direccionDe(s: PaymentConFel["student"]): string | null {
  if (!s) return null;
  const partes = [s.address, s.municipality, s.department].filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}

// Receptor del recibo: lo que indique el usuario, o el NIT del expediente, o CF.
export function resolverReceptor(payment: PaymentConFel, input: EmitirReciboInput) {
  const raw = input.receptorId ?? payment.student?.taxId ?? "CF";
  const parsed = parseTaxId(raw);
  if (!parsed) {
    throw badRequest(`La identificación fiscal "${raw}" no es válida. Corrige la del expediente o emite a CF.`);
  }
  const nombreBase =
    input.receptorNombre?.trim() ||
    payment.student?.fullName ||
    payment.payerName ||
    "CONSUMIDOR FINAL";
  const correo =
    input.receptorCorreo !== undefined
      ? input.receptorCorreo || null
      : payment.student?.email ?? payment.payerEmail ?? null;
  return {
    id: parsed.id,
    tipo: parsed.tipo,
    nombre: nombreBase.slice(0, 200),
    correo,
    direccion: direccionDe(payment.student),
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
  if (!cfg.habilitado) {
    throw badRequest("La emisión de recibos FEL está desactivada en la configuración.");
  }
}

async function guardarArchivo(base64: string, nombre: string): Promise<string> {
  await ensureUploadDir();
  const key = `fel-${crypto.randomBytes(8).toString("hex")}-${nombre}`;
  await fs.writeFile(path.join(UPLOAD_ROOT, key), Buffer.from(base64, "base64"));
  return key;
}

export async function emitirRecibo(
  paymentId: string,
  input: EmitirReciboInput = {},
  userId?: string,
  opts: { auto?: boolean } = {}
): Promise<FelDocumento> {
  const cfg = await getFelConfig();
  exigirConfiguracion(cfg);

  const payment = await cargarPago(paymentId);
  if (payment.status !== "ACTIVO") {
    throw badRequest("Solo se emiten recibos de pagos activos (aprobados y no anulados).");
  }
  const ultimo = payment.felDocumentos[0] ?? null;
  if (ultimo?.estado === "CERTIFICADO") {
    throw conflict("Este pago ya tiene un recibo FEL certificado. Anúlalo antes de emitir otro.");
  }
  if (ultimo?.estado === "PENDIENTE" && Date.now() - ultimo.updatedAt.getTime() < 2 * 60_000) {
    throw conflict("Ya hay una emisión en proceso para este pago. Espera un momento.");
  }

  const neto = Number(payment.amount) - Number(payment.discount);
  if (neto <= 0) throw badRequest("El monto neto del pago debe ser mayor a 0 para emitir un recibo.");
  const monto = Math.round(neto * 100) / 100;

  const receptor = resolverReceptor(payment, input);
  const est = establecimientoParaSede(cfg, payment.sede ?? payment.student?.sede);
  // Se certifica el monto realmente recibido (neto de beca/descuento), como en bluestock.
  const items: FelItem[] = [
    {
      numero: 1,
      tipo: "S",
      descripcion: (input.descripcion ?? payment.concept).slice(0, 250),
      cantidad: 1,
      unidad: "UNI",
      precio: monto,
      descuento: 0,
      total: monto,
    },
  ];

  const datos = {
    estado: "PENDIENTE" as const,
    error: null,
    emisorNit: cfg.emisor.nit,
    emisorNombre: cfg.emisor.nombre,
    emisorNombreComercial: est.nombre || cfg.emisor.nombreComercial,
    emisorAfiliacion: cfg.emisor.afiliacionIva,
    emisorEstablecimiento: est.codigo,
    emisorDireccion: est.direccion,
    emisorCodigoPostal: est.codigoPostal,
    emisorMunicipio: est.municipio,
    emisorDepartamento: est.departamento,
    emisorCorreo: cfg.emisor.correo || null,
    receptorId: receptor.id,
    receptorTipo: receptor.tipo,
    receptorNombre: receptor.nombre,
    receptorCorreo: receptor.correo,
    receptorDireccion: receptor.direccion,
    items: items as unknown as Prisma.InputJsonValue,
    frases: cfg.frases as unknown as Prisma.InputJsonValue,
    moneda: "GTQ",
    granTotal: monto,
    createdById: userId ?? null,
  };

  // Un intento fallido se reutiliza; un recibo anulado queda en el historial.
  const doc =
    ultimo && (ultimo.estado === "ERROR" || ultimo.estado === "PENDIENTE")
      ? await prisma.felDocumento.update({ where: { id: ultimo.id }, data: datos })
      : await prisma.felDocumento.create({
          data: { ...datos, paymentId: payment.id, internalUuid: crypto.randomUUID() },
        });

  const fechaEmision = new Date();
  let payload: Record<string, unknown>;
  try {
    payload = buildReciPayload(doc, fechaEmision);
  } catch (err) {
    const msg = (err as Error).message;
    await prisma.felDocumento.update({ where: { id: doc.id }, data: { estado: "ERROR", error: msg } });
    throw badRequest(`No se pudo armar el recibo: ${msg}`);
  }
  await prisma.felDocumento.update({
    where: { id: doc.id },
    data: { payload: payload as Prisma.InputJsonValue },
  });

  try {
    const r = await certificarNuc(payload, cfg.emisor.nit);
    const [xmlKey, pdfKey] = await Promise.all([
      r.xmlBase64 ? guardarArchivo(r.xmlBase64, "recibo.xml") : Promise.resolve(null),
      r.pdfBase64 ? guardarArchivo(r.pdfBase64, "recibo.pdf") : Promise.resolve(null),
    ]);
    const certificado = await prisma.felDocumento.update({
      where: { id: doc.id },
      data: {
        estado: "CERTIFICADO",
        error: null,
        autorizacion: r.autorizacion,
        serie: r.serie || null,
        numero: r.numero || null,
        fechaEmision: r.fechaEmision ?? fechaEmision,
        fechaCertificacion: r.fechaCertificacion ?? r.fechaEmision ?? fechaEmision,
        xmlKey,
        pdfKey,
        respuesta: r.respuesta as Prisma.InputJsonValue,
      },
    });
    console.log(
      `[fel] recibo certificado pago=${payment.id} serie=${certificado.serie} numero=${certificado.numero} aut=${certificado.autorizacion}`
    );
    // En la emisión automática el recibo viaja en el correo de confirmación
    // del pago (ver lib/pago-aplicado.ts); aquí solo se avisa en la manual.
    if (cfg.enviarCorreo && !opts.auto) {
      void enviarReciboPorCorreo(certificado.id).catch((e) =>
        console.error("[fel] correo del recibo:", (e as Error).message)
      );
    }
    return certificado;
  } catch (err) {
    const msg = err instanceof DigifactError ? err.message : (err as Error).message;
    const detalle = err instanceof DigifactError ? err.detalle : undefined;
    console.error(`[fel] error al certificar pago=${payment.id}:`, msg);
    await prisma.felDocumento.update({
      where: { id: doc.id },
      data: {
        estado: "ERROR",
        error: msg.slice(0, 4000),
        respuesta:
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
export async function emitirAutomatico(paymentId: string): Promise<FelDocumento | null> {
  try {
    const cfg = await getFelConfig();
    if (!cfg.habilitado || !cfg.emitirAutomatico || !isDigifactConfigured()) return null;
    const existente = await prisma.felDocumento.findFirst({
      where: { paymentId, estado: { in: ["CERTIFICADO", "PENDIENTE"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existente) return existente.estado === "CERTIFICADO" ? existente : null;
    return await emitirRecibo(paymentId, {}, undefined, { auto: true });
  } catch (err) {
    console.error(`[fel] emisión automática del pago ${paymentId}:`, (err as Error).message);
    return null;
  }
}

// --- Anulación ---------------------------------------------------------------

export async function anularRecibo(
  docId: string,
  motivo: string,
  userId?: string
): Promise<FelDocumento> {
  const doc = await prisma.felDocumento.findUnique({ where: { id: docId } });
  if (!doc) throw notFound("Recibo no encontrado");
  if (doc.estado === "ANULADO") return doc;
  if (doc.estado !== "CERTIFICADO" || !doc.autorizacion) {
    // Nunca llegó a SAT: solo se descarta.
    return prisma.felDocumento.update({
      where: { id: doc.id },
      data: { estado: "ANULADO", anuladoAt: new Date(), anuladoMotivo: motivo, anuladoById: userId ?? null },
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
    const respuesta = await anularDte({
      nitEmisor: doc.emisorNit || cfg.emisor.nit,
      autorizacion: doc.autorizacion,
      idReceptor: doc.receptorId,
      fechaEmision: doc.fechaEmision ?? doc.createdAt,
      motivo,
      usuario,
    });
    return prisma.felDocumento.update({
      where: { id: doc.id },
      data: {
        estado: "ANULADO",
        anuladoAt: new Date(),
        anuladoMotivo: motivo,
        anuladoById: userId ?? null,
        respuesta: { certificacion: doc.respuesta ?? null, anulacion: respuesta } as Prisma.InputJsonValue,
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
export async function anularReciboDePago(
  paymentId: string,
  motivo: string,
  userId?: string
): Promise<void> {
  const vigente = await prisma.felDocumento.findFirst({
    where: { paymentId, estado: "CERTIFICADO" },
    orderBy: { createdAt: "desc" },
  });
  if (vigente) await anularRecibo(vigente.id, motivo, userId);
}

// --- Consulta ----------------------------------------------------------------

const detalleInclude = {
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
  anuladoBy: { select: { name: true } },
} satisfies Prisma.FelDocumentoInclude;

export type FelDetalle = Prisma.FelDocumentoGetPayload<{ include: typeof detalleInclude }>;

function serializeDetalle(d: FelDetalle) {
  const { payload: _p, respuesta: _r, pdfKey, xmlKey, ...rest } = d;
  return {
    ...rest,
    granTotal: Number(d.granTotal),
    tieneXml: Boolean(xmlKey),
    tienePdfSat: Boolean(pdfKey),
    payment: {
      ...d.payment,
      amount: Number(d.payment.amount),
      discount: Number(d.payment.discount),
    },
  };
}

export async function getRecibo(id: string) {
  const doc = await prisma.felDocumento.findUnique({ where: { id }, include: detalleInclude });
  if (!doc) throw notFound("Recibo no encontrado");
  return serializeDetalle(doc);
}

export async function getReciboRaw(id: string): Promise<FelDetalle> {
  const doc = await prisma.felDocumento.findUnique({ where: { id }, include: detalleInclude });
  if (!doc) throw notFound("Recibo no encontrado");
  return doc;
}

// Historial de recibos de un pago (el más reciente primero)
export async function getRecibosDePago(paymentId: string) {
  const docs = await prisma.felDocumento.findMany({
    where: { paymentId },
    orderBy: { createdAt: "desc" },
    include: detalleInclude,
  });
  return docs.map(serializeDetalle);
}

export async function listRecibos(q: ListRecibosQuery) {
  const where: Prisma.FelDocumentoWhereInput = {
    ...(q.estado ? { estado: q.estado } : {}),
    ...(q.studentId ? { payment: { studentId: q.studentId } } : {}),
    ...(q.search
      ? {
          OR: [
            { autorizacion: { contains: q.search } },
            { numero: { contains: q.search } },
            { receptorNombre: { contains: q.search } },
            { receptorId: { contains: q.search } },
            { payment: { student: { fullName: { contains: q.search } } } },
          ],
        }
      : {}),
  };
  const [total, rows, suma] = await Promise.all([
    prisma.felDocumento.count({ where }),
    prisma.felDocumento.findMany({
      where,
      include: detalleInclude,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.felDocumento.aggregate({ where: { ...where, estado: "CERTIFICADO" }, _sum: { granTotal: true } }),
  ]);
  return {
    data: rows.map(serializeDetalle),
    pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) },
    totales: { certificado: Number(suma._sum.granTotal ?? 0) },
  };
}

// Archivo XML/PDF certificado guardado en /uploads
export async function leerArchivo(key: string | null): Promise<Buffer | null> {
  if (!key) return null;
  try {
    return await fs.readFile(path.join(UPLOAD_ROOT, path.basename(key)));
  } catch {
    return null;
  }
}

// Borra los archivos de un recibo (solo para limpieza manual; no se usa en el flujo normal)
export async function borrarArchivos(doc: Pick<FelDocumento, "xmlKey" | "pdfKey">) {
  await Promise.all([deleteFile(doc.xmlKey), deleteFile(doc.pdfKey)]);
}

// --- Correo al alumno --------------------------------------------------------

export async function enviarReciboPorCorreo(docId: string): Promise<{ sent: boolean }> {
  const doc = await getReciboRaw(docId);
  if (doc.estado !== "CERTIFICADO") return { sent: false };
  const to = doc.receptorCorreo;
  if (!to) return { sent: false };
  const [{ sendBrandedMail }, { bloqueDteParaCorreo }] = await Promise.all([
    import("../../lib/mailer.js"),
    import("../../lib/fel-email.js"),
  ]);
  const dte = await bloqueDteParaCorreo(doc);
  const nombre = (doc.payment.student?.fullName ?? doc.receptorNombre).trim().split(/\s+/)[0] ?? "estudiante";
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
