import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import type {
  CreateActaInput,
  UpdateActaInput,
  ListActasQuery,
} from "./actas.schemas.js";

const clean = (v?: string | null) => (v && v.length > 0 ? v : null);

export async function listActas(q: ListActasQuery) {
  const where: Prisma.ActaWhereInput = q.search
    ? {
        OR: [
          { actaNumber: { contains: q.search } },
          { phase: { contains: q.search } },
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
        folios: true,
        phase: true,
        actaDate: true,
        _count: { select: { entries: true } },
      },
    }),
  ]);

  return {
    data,
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
    include: {
      entries: { orderBy: { studentName: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!acta) throw notFound("Acta no encontrada");
  return acta;
}

export async function createActa(input: CreateActaInput, userId?: string) {
  return prisma.acta.create({
    data: {
      actaNumber: input.actaNumber,
      folios: clean(input.folios),
      phase: input.phase,
      actaDate: new Date(input.actaDate),
      notes: clean(input.notes),
      createdById: userId,
      entries: {
        create: input.entries.map((e) => ({
          studentId: clean(e.studentId),
          studentName: e.studentName,
          score: e.score,
        })),
      },
    },
    include: { entries: true },
  });
}

export async function updateActa(id: string, input: UpdateActaInput) {
  const existing = await prisma.acta.findUnique({ where: { id } });
  if (!existing) throw notFound("Acta no encontrada");

  return prisma.$transaction(async (tx) => {
    // Si se envian entries, se reemplazan por completo
    if (input.entries) {
      await tx.actaEntry.deleteMany({ where: { actaId: id } });
      await tx.actaEntry.createMany({
        data: input.entries.map((e) => ({
          actaId: id,
          studentId: clean(e.studentId),
          studentName: e.studentName,
          score: e.score,
        })),
      });
    }

    return tx.acta.update({
      where: { id },
      data: {
        actaNumber: input.actaNumber,
        folios: input.folios !== undefined ? clean(input.folios) : undefined,
        phase: input.phase,
        actaDate: input.actaDate ? new Date(input.actaDate) : undefined,
        notes: input.notes !== undefined ? clean(input.notes) : undefined,
      },
      include: { entries: true },
    });
  });
}

export async function deleteActa(id: string) {
  const existing = await prisma.acta.findUnique({ where: { id } });
  if (!existing) throw notFound("Acta no encontrada");
  await prisma.acta.delete({ where: { id } });
  return { ok: true };
}

// Envia el acta (PDF adjunto) por correo a la supervisora y guarda la traza.
export async function sendActaByEmail(
  id: string,
  to: string,
  cc: string | undefined
) {
  const acta = await getActa(id);
  const { generateActaPDF } = await import("../../lib/acta-pdf.js");
  const { sendMail } = await import("../../lib/mailer.js");

  const pdf = await generateActaPDF(acta);
  await sendMail({
    to,
    cc,
    subject: `Acta de calificaciones ${acta.actaNumber} — ${acta.phase}`,
    text:
      `Adjunto el acta de calificaciones No. ${acta.actaNumber} ` +
      `(${acta.phase}), de fecha ${acta.actaDate.toLocaleDateString("es-GT")}.\n\n` +
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
    include: { entries: true },
  });
}
