import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import type {
  CreateInauguracionInput,
  ListInauguracionQuery,
} from "./inauguracion.schemas.js";

const clean = (v?: string | null) => (v && v.length > 0 ? v : null);

// Lista de alumnos de una cohorte (estudiantes inscritos ese año, alfabetico).
export async function studentsOfCohort(year: number): Promise<string[]> {
  const students = await prisma.student.findMany({
    where: {
      archived: false,
      enrollmentDate: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      },
    },
    orderBy: { fullName: "asc" },
    select: { fullName: true },
  });
  return students.map((s) => s.fullName);
}

export async function listInauguracion(q: ListInauguracionQuery) {
  const [total, data] = await Promise.all([
    prisma.inauguracionActa.count(),
    prisma.inauguracionActa.findMany({
      orderBy: { cohorte: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        actaNumber: true,
        promocion: true,
        cohorte: true,
        actoDate: true,
        students: true,
      },
    }),
  ]);
  return {
    data: data.map((a) => ({
      id: a.id,
      actaNumber: a.actaNumber,
      promocion: a.promocion,
      cohorte: a.cohorte,
      actoDate: a.actoDate,
      studentCount: Array.isArray(a.students) ? a.students.length : 0,
    })),
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
  };
}

export async function getInauguracion(id: string) {
  const acta = await prisma.inauguracionActa.findUnique({ where: { id } });
  if (!acta) throw notFound("Acta de inauguración no encontrada");
  return acta;
}

export async function createInauguracion(
  input: CreateInauguracionInput,
  userId?: string
) {
  // Si no mandan la lista, se arma con los estudiantes de la cohorte.
  const students =
    input.students && input.students.length > 0
      ? input.students
      : await studentsOfCohort(input.cohorte);

  return prisma.inauguracionActa.create({
    data: {
      actaNumber: input.actaNumber,
      folios: clean(input.folios),
      promocion: input.promocion,
      cohorte: input.cohorte,
      actoDate: new Date(input.actoDate),
      closeDate: new Date(input.closeDate),
      city: input.city,
      department: input.department,
      directora: input.directora,
      docente: input.docente,
      secretario: input.secretario,
      notes: clean(input.notes),
      students: students as Prisma.InputJsonValue,
      createdById: userId,
    },
  });
}

export async function deleteInauguracion(id: string) {
  const existing = await prisma.inauguracionActa.findUnique({ where: { id } });
  if (!existing) throw notFound("Acta de inauguración no encontrada");
  await prisma.inauguracionActa.delete({ where: { id } });
  return { ok: true };
}
