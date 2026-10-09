import type { GradeCategory } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound, badRequest } from "../../lib/http-error.js";
import { normalizeName } from "../../lib/normalize.js";
import { getCriterios } from "../../lib/settings.js";

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
  { clave: "tareas", nombre: "Tareas", peso: 50, categorias: ["TAREA", "ACTIVIDAD"] },
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
  ACTIVIDAD: 1,
  PRIMER_PARCIAL: 2,
  SEGUNDO_PARCIAL: 3,
  EXAMEN_FINAL: 4,
  RECUPERACION: 5,
};

export interface CreateGradeInput {
  studentId: string;
  fase: number;
  category: GradeCategory;
  name: string;
  score: number;
  maxScore?: number;
  date?: string | null;
  // Actividad de la fase que se califica (define cuántos puntos vale)
  faseItemId?: string | null;
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
  if (input.faseItemId) {
    const item = await prisma.faseItem.findUnique({
      where: { id: input.faseItemId },
      select: { fase: true, active: true, kind: true },
    });
    if (!item || !item.active || item.kind === "MATERIAL") {
      throw badRequest("La actividad seleccionada no existe");
    }
    if (item.fase !== input.fase) {
      throw badRequest("La actividad no pertenece a esa fase");
    }
  }
  const grade = await prisma.grade.create({
    data: {
      studentId: input.studentId,
      fase: input.fase,
      category: input.category,
      name: input.name,
      score: input.score,
      maxScore,
      date: input.date ? new Date(input.date) : null,
      faseItemId: input.faseItemId || null,
      createdById: userId,
    },
  });
  void import("../avisos/avisos.service.js")
    .then((m) =>
      m.notificarAlumno(input.studentId, {
        tipo: "calificacion",
        titulo: "Nueva calificación",
        mensaje: `Fase ${input.fase} · ${input.name}: ${input.score}/${maxScore}`,
        url: "/portal/fases/",
      })
    )
    .catch((e) => console.error("[aviso nota]", (e as Error).message));
  return grade;
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
  const [rows, actividades, criterios] = await Promise.all([
    prisma.grade.findMany({
      where: { studentId },
      orderBy: [{ fase: "asc" }, { createdAt: "asc" }],
    }),
    // Actividades con puntos (ponderación por actividad)
    prisma.faseItem.findMany({
      where: { active: true, kind: { not: "MATERIAL" }, puntos: { gt: 0 } },
      select: { id: true, fase: true, kind: true, title: true, puntos: true },
    }),
    getCriterios(),
  ]);

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
          faseItemId: r.faseItemId,
          // Se completan abajo en el modo por puntos
          puntos: null as number | null,
          ptsObtenidos: null as number | null,
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

    // --- Ponderación por actividad (si la fase tiene actividades con puntos)
    const acts = actividades.filter((a) => a.fase === f.fase);
    if (acts.length > 0) {
      // Cada nota se enlaza a su actividad (directo o, si es antigua, por nombre)
      const porNombre = new Map(acts.map((a) => [normalizeName(a.title), a]));
      const notaDe = new Map<string, (typeof items)[number]>();
      for (const it of items) {
        const act =
          (it.faseItemId && acts.find((a) => a.id === it.faseItemId)) ||
          porNombre.get(normalizeName(it.name));
        if (!act) continue;
        it.puntos = act.puntos!;
        it.ptsObtenidos = round1((it.pct / 100) * act.puntos!);
        notaDe.set(act.id, it); // la más reciente prevalece
      }
      const totales = acts.reduce((s, a) => s + (a.puntos ?? 0), 0);
      const calificadas = acts.filter((a) => notaDe.has(a.id));
      const evaluados = calificadas.reduce((s, a) => s + (a.puntos ?? 0), 0);
      const obtenidos = calificadas.reduce(
        (s, a) => s + (notaDe.get(a.id)!.ptsObtenidos ?? 0),
        0
      );
      const grupos: { clave: "tareas" | "actividades" | "examenes"; nombre: string; kind: string }[] = [
        { clave: "tareas", nombre: "Tareas", kind: "TAREA" },
        { clave: "actividades", nombre: "Actividades", kind: "ACTIVIDAD" },
        { clave: "examenes", nombre: "Exámenes", kind: "EXAMEN" },
      ];
      const desglosePts = grupos
        .map((g) => {
          const del = acts.filter((a) => a.kind === g.kind);
          const peso = del.reduce((s, a) => s + (a.puntos ?? 0), 0);
          const cal = del.filter((a) => notaDe.has(a.id));
          const ev = cal.reduce((s, a) => s + (a.puntos ?? 0), 0);
          const ob = cal.reduce((s, a) => s + (notaDe.get(a.id)!.ptsObtenidos ?? 0), 0);
          return {
            clave: g.clave,
            nombre: g.nombre,
            peso,
            evaluaciones: cal.length,
            promedio: ev > 0 ? round1((ob / ev) * 100) : null,
            puntos: cal.length > 0 ? round1(ob) : null,
          };
        })
        .filter((d) => d.peso > 0);
      return {
        ...f,
        items,
        modo: "puntos" as const,
        puntosTotales: totales,
        puntosEvaluados: evaluados,
        puntosObtenidos: round1(obtenidos),
        // Nota = puntos obtenidos sobre los puntos ya evaluados (al terminar,
        // equivale a la nota sobre el total de la fase).
        promedio: evaluados > 0 ? round1((obtenidos / evaluados) * 100) : null,
        estado:
          calificadas.length === acts.length
            ? ("completado" as const)
            : items.length > 0
              ? ("en-progreso" as const)
              : ("pendiente" as const),
        desglose: desglosePts,
      };
    }

    return {
      ...f,
      items,
      promedio,
      estado,
      desglose,
      modo: "categorias" as const,
      puntosTotales: null,
      puntosEvaluados: null,
      puntosObtenidos: null,
    };
  });

  // Resultado de cada fase completa según la nota mínima configurada
  const conResultado = fases.map((f) => ({
    ...f,
    resultado:
      f.estado === "completado" && f.promedio !== null
        ? f.promedio >= criterios.notaMinima
          ? ("aprobada" as const)
          : ("reprobada" as const)
        : null,
  }));

  const conNota = fases.filter((f) => f.promedio !== null);
  const promedioGeneral =
    conNota.length > 0
      ? round1(
          conNota.reduce((s, f) => s + (f.promedio ?? 0), 0) / conNota.length
        )
      : null;

  return { fases: conResultado, promedioGeneral, notaMinima: criterios.notaMinima };
}
