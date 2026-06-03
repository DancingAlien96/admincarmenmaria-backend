import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import { deleteFile } from "../../lib/storage.js";
import type {
  CreateGraduateInput,
  UpdateGraduateInput,
  ListGraduatesQuery,
  LetterInput,
} from "./graduates.schemas.js";

// Genera el siguiente numero de diploma correlativo: CM-AAAA-NNN
// Se ejecuta dentro de una transaccion para evitar duplicados por concurrencia.
async function nextDiplomaNumber(
  tx: Prisma.TransactionClient | PrismaClient,
  year: number
): Promise<string> {
  const prefix = `CM-${year}-`;
  // Busca el ultimo diploma de ese año
  const last = await tx.graduate.findFirst({
    where: { diplomaNumber: { startsWith: prefix } },
    orderBy: { diplomaNumber: "desc" },
    select: { diplomaNumber: true },
  });
  let seq = 1;
  if (last) {
    const n = parseInt(last.diplomaNumber.slice(prefix.length), 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

const clean = (v?: string | null) => (v && v.length > 0 ? v : null);

const listSelect = {
  id: true,
  fullName: true,
  dpi: true,
  email: true,
  phone: true,
  mspasCode: true,
  diplomaNumber: true,
  graduationDate: true,
  diplomaUrl: true,
} satisfies Prisma.GraduateSelect;

export async function listGraduates(q: ListGraduatesQuery) {
  const where: Prisma.GraduateWhereInput = q.search
    ? {
        OR: [
          { fullName: { contains: q.search } },
          { dpi: { contains: q.search } },
          { diplomaNumber: { contains: q.search } },
        ],
      }
    : {};

  const [total, data] = await Promise.all([
    prisma.graduate.count({ where }),
    prisma.graduate.findMany({
      where,
      select: listSelect,
      orderBy: { graduationDate: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
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

export async function getGraduate(id: string) {
  const graduate = await prisma.graduate.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, fullName: true } },
      letters: { orderBy: { issueDate: "desc" } },
    },
  });
  if (!graduate) throw notFound("Egresado no encontrado");
  return graduate;
}

export async function createGraduate(
  input: CreateGraduateInput,
  userId?: string
) {
  const gradDate = new Date(input.graduationDate);
  return prisma.$transaction(async (tx) => {
    const diplomaNumber =
      clean(input.diplomaNumber) ??
      (await nextDiplomaNumber(tx, gradDate.getFullYear()));

    return tx.graduate.create({
      data: {
        studentId: clean(input.studentId),
        fullName: input.fullName,
        dpi: input.dpi,
        email: clean(input.email),
        phone: clean(input.phone),
        mspasCode: clean(input.mspasCode),
        diplomaNumber,
        graduationDate: gradDate,
        diplomaUrl: clean(input.diplomaUrl),
        diplomaKey: clean(input.diplomaKey),
        createdById: userId,
      },
    });
  });
}

export async function updateGraduate(id: string, input: UpdateGraduateInput) {
  const existing = await prisma.graduate.findUnique({ where: { id } });
  if (!existing) throw notFound("Egresado no encontrado");

  // Si llega un diploma nuevo y ya habia uno distinto, borra el archivo viejo.
  if (
    input.diplomaKey !== undefined &&
    existing.diplomaKey &&
    existing.diplomaKey !== input.diplomaKey
  ) {
    await deleteFile(existing.diplomaKey);
  }

  return prisma.graduate.update({
    where: { id },
    data: {
      fullName: input.fullName,
      email: input.email !== undefined ? clean(input.email) : undefined,
      phone: input.phone !== undefined ? clean(input.phone) : undefined,
      mspasCode:
        input.mspasCode !== undefined ? clean(input.mspasCode) : undefined,
      graduationDate: input.graduationDate
        ? new Date(input.graduationDate)
        : undefined,
      diplomaUrl:
        input.diplomaUrl !== undefined ? clean(input.diplomaUrl) : undefined,
      diplomaKey:
        input.diplomaKey !== undefined ? clean(input.diplomaKey) : undefined,
    },
  });
}

// Migracion automatica: crea el egresado a partir de un estudiante.
// Se llama cuando el estudiante pasa a estado EGRESADO. Idempotente:
// si ya existe un egresado para ese estudiante, no hace nada.
export async function migrateStudentToGraduate(
  studentId: string,
  userId?: string
) {
  const existing = await prisma.graduate.findUnique({ where: { studentId } });
  if (existing) return existing;

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return null;

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    // Reverifica dentro de la transaccion (evita doble creacion concurrente)
    const dup = await tx.graduate.findUnique({ where: { studentId } });
    if (dup) return dup;

    const diplomaNumber = await nextDiplomaNumber(tx, now.getFullYear());
    return tx.graduate.create({
      data: {
        studentId: student.id,
        fullName: student.fullName,
        dpi: student.dpi,
        email: student.email,
        phone: student.phonePrimary,
        diplomaNumber,
        graduationDate: now,
        createdById: userId,
      },
    });
  });
}

export async function addLetter(
  graduateId: string,
  input: LetterInput,
  userId?: string
) {
  const graduate = await prisma.graduate.findUnique({
    where: { id: graduateId },
  });
  if (!graduate) throw badRequest("El egresado no existe");

  return prisma.recommendationLetter.create({
    data: {
      graduateId,
      issueDate: new Date(input.issueDate),
      notes: clean(input.notes),
      createdById: userId,
    },
  });
}
