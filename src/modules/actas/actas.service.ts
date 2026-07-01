import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import type { ActaRenderInput } from "../../lib/acta-render.js";
import type {
  CreateActaInput,
  UpdateActaInput,
  ListActasQuery,
  CreateTemplateInput,
  UpdateTemplateInput,
} from "./actas.schemas.js";

const clean = (v?: string | null) => (v && v.length > 0 ? v : null);

// Convierte una fecha de formulario a Date. Solo-fecha -> mediodia UTC (evita
// desfase de dia); con hora -> se interpreta como UTC.
function toDate(s?: string | null): Date | null {
  if (!s) return null;
  const iso = s.includes("T")
    ? s.endsWith("Z")
      ? s
      : `${s}Z`
    : `${s}T12:00:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

const asJson = (v: unknown) =>
  v === undefined ? undefined : (v as Prisma.InputJsonValue);

// --- Actas -----------------------------------------------------------------

export async function listActas(q: ListActasQuery) {
  const where: Prisma.ActaWhereInput = q.search
    ? {
        OR: [
          { actaNumber: { contains: q.search } },
          { title: { contains: q.search } },
        ],
      }
    : {};

  const [total, data] = await Promise.all([
    prisma.acta.count({ where }),
    prisma.acta.findMany({
      where,
      orderBy: { actaDate: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        actaNumber: true,
        title: true,
        folios: true,
        actaDate: true,
        rows: true,
      },
    }),
  ]);

  return {
    data: data.map((a) => ({
      id: a.id,
      actaNumber: a.actaNumber,
      title: a.title,
      folios: a.folios,
      actaDate: a.actaDate,
      rowCount: Array.isArray(a.rows) ? a.rows.length : 0,
    })),
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
  };
}

export async function getActa(id: string) {
  const acta = await prisma.acta.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true } } },
  });
  if (!acta) throw notFound("Acta no encontrada");
  return acta;
}

export async function createActa(input: CreateActaInput, userId?: string) {
  return prisma.acta.create({
    data: {
      actaNumber: input.actaNumber,
      folios: clean(input.folios),
      title: clean(input.title),
      actaDate: toDate(input.actaDate)!,
      closeDate: toDate(input.closeDate),
      city: clean(input.city) ?? "Chiquimula",
      department: clean(input.department) ?? "Chiquimula",
      body: input.body,
      vars: asJson(input.vars ?? {}),
      columns: asJson(input.columns ?? []),
      rows: asJson(input.rows ?? []),
      signers: asJson(input.signers ?? []),
      notes: clean(input.notes),
      templateId: clean(input.templateId),
      createdById: userId,
    },
  });
}

export async function updateActa(id: string, input: UpdateActaInput) {
  const existing = await prisma.acta.findUnique({ where: { id } });
  if (!existing) throw notFound("Acta no encontrada");

  return prisma.acta.update({
    where: { id },
    data: {
      actaNumber: input.actaNumber,
      folios: input.folios !== undefined ? clean(input.folios) : undefined,
      title: input.title !== undefined ? clean(input.title) : undefined,
      actaDate: input.actaDate ? toDate(input.actaDate)! : undefined,
      closeDate:
        input.closeDate !== undefined ? toDate(input.closeDate) : undefined,
      city:
        input.city !== undefined ? clean(input.city) ?? "Chiquimula" : undefined,
      department:
        input.department !== undefined
          ? clean(input.department) ?? "Chiquimula"
          : undefined,
      body: input.body,
      vars: asJson(input.vars),
      columns: asJson(input.columns),
      rows: asJson(input.rows),
      signers: asJson(input.signers),
      notes: input.notes !== undefined ? clean(input.notes) : undefined,
      templateId:
        input.templateId !== undefined ? clean(input.templateId) : undefined,
    },
  });
}

export async function deleteActa(id: string) {
  const existing = await prisma.acta.findUnique({ where: { id } });
  if (!existing) throw notFound("Acta no encontrada");
  await prisma.acta.delete({ where: { id } });
  return { ok: true };
}

// Construye el input para el motor de render a partir de un acta de la BD.
export function buildRenderInput(acta: {
  actaNumber: string;
  folios: string | null;
  title: string | null;
  actaDate: Date;
  closeDate: Date | null;
  city: string;
  department: string;
  body: string;
  vars: unknown;
  columns: unknown;
  rows: unknown;
  signers: unknown;
}): ActaRenderInput {
  return {
    actaNumber: acta.actaNumber,
    folios: acta.folios,
    title: acta.title,
    actaDate: acta.actaDate,
    closeDate: acta.closeDate,
    city: acta.city,
    department: acta.department,
    body: acta.body,
    vars: (acta.vars as Record<string, string>) ?? {},
    columns: (acta.columns as string[]) ?? [],
    rows:
      (acta.rows as {
        name: string;
        value?: string | null;
        values?: (string | null)[];
      }[]) ?? [],
    signers:
      (acta.signers as {
        name: string;
        role: string;
        signatureKey?: string | null;
      }[]) ?? [],
  };
}

// Envia el acta (PDF adjunto) por correo y guarda la traza.
export async function sendActaByEmail(
  id: string,
  to: string,
  cc: string | undefined
) {
  const acta = await getActa(id);
  const { renderActaPDF } = await import("../../lib/acta-render.js");
  const { sendMail } = await import("../../lib/mailer.js");

  const pdf = await renderActaPDF(buildRenderInput(acta));
  await sendMail({
    to,
    cc,
    subject: `Acta ${acta.actaNumber}${acta.title ? ` — ${acta.title}` : ""}`,
    text:
      `Adjunto el acta No. ${acta.actaNumber}` +
      `${acta.title ? ` (${acta.title})` : ""}, de fecha ` +
      `${acta.actaDate.toLocaleDateString("es-GT")}.\n\n` +
      `Escuela de Enfermería Carmen María.`,
    attachments: [
      {
        filename: `acta-${acta.actaNumber}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  return prisma.acta.update({
    where: { id },
    data: { sentAt: new Date(), sentTo: to },
  });
}

// --- Plantillas ------------------------------------------------------------

export async function listTemplates() {
  return prisma.actaTemplate.findMany({ orderBy: { name: "asc" } });
}

export async function getTemplate(id: string) {
  const t = await prisma.actaTemplate.findUnique({ where: { id } });
  if (!t) throw notFound("Plantilla no encontrada");
  return t;
}

export async function createTemplate(
  input: CreateTemplateInput,
  userId?: string
) {
  return prisma.actaTemplate.create({
    data: {
      name: input.name,
      title: clean(input.title),
      body: input.body,
      columns: asJson(input.columns ?? []),
      signers: asJson(input.signers ?? []),
      vars: asJson(input.vars ?? {}),
      block: clean(input.block),
      createdById: userId,
    },
  });
}

export async function updateTemplate(id: string, input: UpdateTemplateInput) {
  const existing = await prisma.actaTemplate.findUnique({ where: { id } });
  if (!existing) throw notFound("Plantilla no encontrada");
  return prisma.actaTemplate.update({
    where: { id },
    data: {
      name: input.name,
      title: input.title !== undefined ? clean(input.title) : undefined,
      body: input.body,
      columns: asJson(input.columns),
      signers: asJson(input.signers),
      vars: asJson(input.vars),
      block: input.block !== undefined ? clean(input.block) : undefined,
    },
  });
}

export async function deleteTemplate(id: string) {
  const existing = await prisma.actaTemplate.findUnique({ where: { id } });
  if (!existing) throw notFound("Plantilla no encontrada");
  await prisma.actaTemplate.delete({ where: { id } });
  return { ok: true };
}
