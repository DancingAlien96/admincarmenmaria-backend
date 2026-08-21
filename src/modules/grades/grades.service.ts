import type { GradeCategory } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound, badRequest } from "../../lib/http-error.js";

export const FASES: { fase: number; nombre: string; subtitulo: string }[] = [
  { fase: 1, nombre: "Fase I", subtitulo: "Fundamentos Básicos" },
  { fase: 2, nombre: "Fase II", subtitulo: "Fundamentos Clínicos" },
  { fase: 3, nombre: "Fase III", subtitulo: "Práctica Supervisada" },
];

// Orden de aparición de las categorías dentro de una fase.
const CAT_ORDER: Record<GradeCategory, number> = {
  TAREA: 0,
  PRIMER_PARCIAL: 1,
  SEGUNDO_PARCIAL: 2,
  EXAMEN_FINAL: 3,
  RECUPERACION: 4,
};

export interface CreateGradeInput {
  studentId: string;
  fase: number;
  category: GradeCategory;
  name: string;
  score: number;
  maxScore?: number;
  date?: string | null;
}

export async function createGrade(input: CreateGradeInput, userId?: string) {
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
  });
  if (!student) throw badRequest("El estudiante no existe");
  if (![1, 2, 3].includes(input.fase)) throw badRequest("Fase inválida");
  const maxScore = input.maxScore ?? 100;
  if (input.score < 0 || input.score > maxScore) {
    throw badRequest("La nota debe estar entre 0 y el máximo");
  }
  return prisma.grade.create({
    data: {
      studentId: input.studentId,
      fase: input.fase,
      category: input.category,
      name: input.name,
      score: input.score,
      maxScore,
      date: input.date ? new Date(input.date) : null,
      createdById: userId,
    },
  });
}

export async function deleteGrade(id: string) {
  const g = await prisma.grade.findUnique({ where: { id } });
  if (!g) throw notFound("Calificación no encontrada");
  await prisma.grade.delete({ where: { id } });
  return { ok: true };
}

const num = (v: unknown) => Number(v ?? 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

// Estructura por fases del estudiante (para el portal y el expediente).
export async function getStudentFases(studentId: string) {
  const rows = await prisma.grade.findMany({
    where: { studentId },
    orderBy: [{ fase: "asc" }, { createdAt: "asc" }],
  });

  const fases = FASES.map((f) => {
    const items = rows
      .filter((r) => r.fase === f.fase)
      .map((r) => {
        const score = num(r.score);
        const maxScore = num(r.maxScore) || 100;
        return {
          id: r.id,
          category: r.category,
          name: r.name,
          score,
          maxScore,
          pct: round1((score / maxScore) * 100),
          date: r.date,
        };
      })
      .sort(
        (a, b) =>
          CAT_ORDER[a.category] - CAT_ORDER[b.category]
      );

    const promedio =
      items.length > 0
        ? round1(items.reduce((s, i) => s + i.pct, 0) / items.length)
        : null;
    const tieneFinal = items.some((i) => i.category === "EXAMEN_FINAL");
    const estado: "completado" | "en-progreso" | "pendiente" =
      tieneFinal ? "completado" : items.length > 0 ? "en-progreso" : "pendiente";

    return { ...f, items, promedio, estado };
  });

  const conNota = fases.filter((f) => f.promedio !== null);
  const promedioGeneral =
    conNota.length > 0
      ? round1(
          conNota.reduce((s, f) => s + (f.promedio ?? 0), 0) / conNota.length
        )
      : null;

  return { fases, promedioGeneral };
}
