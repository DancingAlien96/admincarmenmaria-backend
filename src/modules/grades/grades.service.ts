import type { GradeCategory } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound, badRequest } from "../../lib/http-error.js";

export const FASES: { fase: number; nombre: string; subtitulo: string }[] = [
  { fase: 1, nombre: "Fase I", subtitulo: "Fundamentos Básicos" },
  { fase: 2, nombre: "Fase II", subtitulo: "Fundamentos Clínicos" },
  { fase: 3, nombre: "Fase III", subtitulo: "Práctica Supervisada" },
];

// Ponderación de la nota de cada fase (suma 100).
const PESOS: {
  clave: "tareas" | "parciales" | "final";
  nombre: string;
  peso: number;
  categorias: GradeCategory[];
}[] = [
  { clave: "tareas", nombre: "Tareas", peso: 50, categorias: ["TAREA"] },
  {
    clave: "parciales",
    nombre: "Parciales",
    peso: 30,
    categorias: ["PRIMER_PARCIAL", "SEGUNDO_PARCIAL", "RECUPERACION"],
  },
  { clave: "final", nombre: "Examen Final", peso: 20, categorias: ["EXAMEN_FINAL"] },
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

    // Nota ponderada: Tareas 50 %, Parciales (incl. recuperación) 30 %,
    // Examen final 20 %. Si falta una categoría, se reparte entre las que hay.
    const desglose = PESOS.map((p) => {
      const del = items.filter((i) => p.categorias.includes(i.category));
      const prom =
        del.length > 0 ? del.reduce((s, i) => s + i.pct, 0) / del.length : null;
      return {
        clave: p.clave,
        nombre: p.nombre,
        peso: p.peso,
        evaluaciones: del.length,
        promedio: prom === null ? null : round1(prom),
        puntos: prom === null ? null : round1((prom * p.peso) / 100),
      };
    });
    const conNotas = desglose.filter((d) => d.promedio !== null);
    const pesoTotal = conNotas.reduce((s, d) => s + d.peso, 0);
    const promedio =
      pesoTotal > 0
        ? round1(
            conNotas.reduce((s, d) => s + (d.promedio ?? 0) * d.peso, 0) /
              pesoTotal
          )
        : null;
    const tieneFinal = items.some((i) => i.category === "EXAMEN_FINAL");
    const estado: "completado" | "en-progreso" | "pendiente" =
      tieneFinal ? "completado" : items.length > 0 ? "en-progreso" : "pendiente";

    return { ...f, items, promedio, estado, desglose };
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
