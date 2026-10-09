import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import { getCriterios } from "../../lib/settings.js";
import { getStudentFases } from "../grades/grades.service.js";

// --- Reto de Comprensión -----------------------------------------------------
// Cuestionario por fase. No afecta la nota; se habilita cuando la fase está
// completa, y aprobarlo (mínimo configurable) es requisito para desbloquear
// la siguiente fase (solo si la fase tiene preguntas).

// ¿La fase del alumno está completa? (el reto se desbloquea al terminarla)
async function faseCompleta(studentId: string, fase: number) {
  const { fases } = await getStudentFases(studentId);
  return fases.find((f) => f.fase === fase)?.estado === "completado";
}


function assertFase(fase: number) {
  if (![1, 2, 3].includes(fase)) throw badRequest("Fase inválida");
}

function toOptions(v: Prisma.JsonValue): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

// Preguntas con la respuesta correcta (docente / admin)
export async function listQuestions(fase: number) {
  assertFase(fase);
  const rows = await prisma.quizQuestion.findMany({
    where: { fase, active: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((q) => ({
    id: q.id,
    fase: q.fase,
    question: q.question,
    options: toOptions(q.options),
    correctIndex: q.correctIndex,
  }));
}

export async function createQuestion(
  input: { fase: number; question: string; options: string[]; correctIndex: number },
  userId?: string
) {
  assertFase(input.fase);
  const options = input.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) throw badRequest("Escribe al menos 2 opciones");
  if (input.correctIndex < 0 || input.correctIndex >= options.length) {
    throw badRequest("Marca cuál es la respuesta correcta");
  }
  const last = await prisma.quizQuestion.findFirst({
    where: { fase: input.fase },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return prisma.quizQuestion.create({
    data: {
      fase: input.fase,
      question: input.question.trim(),
      options,
      correctIndex: input.correctIndex,
      order: (last?.order ?? 0) + 1,
      createdById: userId,
    },
  });
}

export async function updateQuestion(
  id: string,
  input: { question: string; options: string[]; correctIndex: number }
) {
  const q = await prisma.quizQuestion.findUnique({ where: { id } });
  if (!q || !q.active) throw notFound("Pregunta no encontrada");
  const options = input.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) throw badRequest("Escribe al menos 2 opciones");
  if (input.correctIndex < 0 || input.correctIndex >= options.length) {
    throw badRequest("Marca cuál es la respuesta correcta");
  }
  return prisma.quizQuestion.update({
    where: { id },
    data: { question: input.question.trim(), options, correctIndex: input.correctIndex },
  });
}

export async function deleteQuestion(id: string) {
  const q = await prisma.quizQuestion.findUnique({ where: { id } });
  if (!q) throw notFound("Pregunta no encontrada");
  // Se desactiva para conservar el historial de intentos
  await prisma.quizQuestion.update({ where: { id }, data: { active: false } });
  return { ok: true };
}

// Estado del reto por fase para un alumno: ¿hay preguntas? ¿ya aprobó?
export async function retoStatusByFase(studentId: string) {
  const [counts, passed] = await Promise.all([
    prisma.quizQuestion.groupBy({
      by: ["fase"],
      where: { active: true },
      _count: true,
    }),
    prisma.quizAttempt.findMany({
      where: { studentId, passed: true },
      select: { fase: true },
      distinct: ["fase"],
    }),
  ]);
  const passedSet = new Set(passed.map((p) => p.fase));
  const byFase: Record<number, { preguntas: number; aprobado: boolean }> = {};
  for (const f of [1, 2, 3]) {
    byFase[f] = {
      preguntas: counts.find((c) => c.fase === f)?._count ?? 0,
      aprobado: passedSet.has(f),
    };
  }
  return byFase;
}

// Reto para el alumno (sin revelar respuestas) + su historial
export async function getRetoForStudent(studentId: string, fase: number) {
  assertFase(fase);
  const [rows, attempts, criterios, completa] = await Promise.all([
    prisma.quizQuestion.findMany({
      where: { fase, active: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.quizAttempt.findMany({
      where: { studentId, fase },
      orderBy: { createdAt: "desc" },
    }),
    getCriterios(),
    faseCompleta(studentId, fase),
  ]);
  const best = attempts.reduce<number | null>(
    (m, a) => (m === null || Number(a.score) > m ? Number(a.score) : m),
    null
  );
  return {
    fase,
    aprobacion: criterios.retoMinimo,
    // Bloqueado hasta completar la fase: no se envían las preguntas
    bloqueado: !completa,
    totalPreguntas: rows.length,
    preguntas: completa
      ? rows.map((q) => ({
          id: q.id,
          question: q.question,
          options: toOptions(q.options),
        }))
      : [],
    intentos: attempts.length,
    aprobado: attempts.some((a) => a.passed),
    mejor: best,
    ultimo: attempts[0]
      ? {
          score: Number(attempts[0].score),
          correct: attempts[0].correct,
          total: attempts[0].total,
          passed: attempts[0].passed,
          fecha: attempts[0].createdAt,
        }
      : null,
  };
}

// Califica un intento. answers: { questionId: optionIndex }
export async function submitReto(
  studentId: string,
  fase: number,
  answers: Record<string, number>
) {
  assertFase(fase);
  const rows = await prisma.quizQuestion.findMany({
    where: { fase, active: true },
  });
  if (rows.length === 0) throw badRequest("Este reto aún no tiene preguntas");
  if (!(await faseCompleta(studentId, fase))) {
    throw badRequest("El reto se habilita cuando completes la fase");
  }
  const faltan = rows.filter((q) => answers[q.id] === undefined).length;
  if (faltan > 0) {
    throw badRequest(`Responde todas las preguntas (faltan ${faltan})`);
  }
  const resultado = rows.map((q) => ({
    id: q.id,
    correcta: answers[q.id] === q.correctIndex,
  }));
  const correct = resultado.filter((r) => r.correcta).length;
  const score = Math.round((correct / rows.length) * 10000) / 100;
  const passed = score >= (await getCriterios()).retoMinimo;
  await prisma.quizAttempt.create({
    data: {
      studentId,
      fase,
      correct,
      total: rows.length,
      score,
      passed,
      answers,
    },
  });
  // Se indica qué preguntas fallaron (sin revelar la respuesta correcta)
  return { correct, total: rows.length, score, passed, resultado };
}

// --- Encuesta de satisfacción ------------------------------------------------
// Los criterios los configura el administrador por fase (SurveyCriterion),
// agrupados en secciones. La calificación (1-5) se guarda por `clave`.

type Criterio = {
  id: string;
  grupo: string;
  clave: string;
  nombre: string;
  detalle: string | null;
  order: number;
};

async function criteriosDeFase(fase: number): Promise<Criterio[]> {
  return prisma.surveyCriterion.findMany({
    where: { fase, active: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, grupo: true, clave: true, nombre: true, detalle: true, order: true },
  });
}

// Agrupa los criterios en secciones, respetando el orden de aparición
function agrupar(criterios: Criterio[]) {
  const secciones: { clave: string; nombre: string; criterios: Criterio[] }[] = [];
  for (const c of criterios) {
    let s = secciones.find((x) => x.nombre === c.grupo);
    if (!s) {
      s = { clave: c.grupo.toLowerCase(), nombre: c.grupo, criterios: [] };
      secciones.push(s);
    }
    s.criterios.push(c);
  }
  return secciones;
}

function toRatings(
  v: Prisma.JsonValue | undefined,
  claves: Set<string>
): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    const n = Number(val);
    if (claves.has(k) && n >= 1 && n <= 5) out[k] = n;
  }
  return out;
}

export async function getEncuesta(studentId: string, fase: number) {
  assertFase(fase);
  const [criterios, r] = await Promise.all([
    criteriosDeFase(fase),
    prisma.surveyResponse.findUnique({
      where: { studentId_fase: { studentId, fase } },
    }),
  ]);
  const claves = new Set(criterios.map((c) => c.clave));
  return {
    fase,
    secciones: agrupar(criterios).map((s) => ({
      clave: s.clave,
      nombre: s.nombre,
      criterios: s.criterios.map((c) => ({
        clave: c.clave,
        nombre: c.nombre,
        detalle: c.detalle ?? "",
      })),
    })),
    ratings: toRatings(r?.ratings, claves),
  };
}

// Guarda (o cambia) la calificación de un criterio; se autoguarda al tocar.
export async function rateEncuesta(
  studentId: string,
  fase: number,
  clave: string,
  rating: number
) {
  assertFase(fase);
  const criterios = await criteriosDeFase(fase);
  const claves = new Set(criterios.map((c) => c.clave));
  if (!claves.has(clave)) throw badRequest("Criterio inválido");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw badRequest("La calificación va de 1 a 5 estrellas");
  }
  const prev = await prisma.surveyResponse.findUnique({
    where: { studentId_fase: { studentId, fase } },
  });
  // Se conservan también calificaciones de criterios ya desactivados
  const anteriores =
    prev?.ratings && typeof prev.ratings === "object" && !Array.isArray(prev.ratings)
      ? (prev.ratings as Record<string, number>)
      : {};
  const ratings = { ...anteriores, [clave]: rating };
  await prisma.surveyResponse.upsert({
    where: { studentId_fase: { studentId, fase } },
    create: { studentId, fase, ratings },
    update: { ratings },
  });
  return { ratings: toRatings(ratings, claves) };
}

// Resultados de la encuesta (promedio por criterio y por sección) para el panel
export async function encuestaResumen(fase: number) {
  assertFase(fase);
  const [criterios, rows] = await Promise.all([
    criteriosDeFase(fase),
    prisma.surveyResponse.findMany({ where: { fase } }),
  ]);
  const claves = new Set(criterios.map((c) => c.clave));
  const all = rows.map((r) => toRatings(r.ratings, claves));
  const avg = (vals: number[]) =>
    vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  return {
    fase,
    respuestas: rows.length,
    secciones: agrupar(criterios).map((s) => {
      const crit = s.criterios.map((c) => {
        const vals = all.map((r) => r[c.clave]).filter((v): v is number => v !== undefined);
        return { clave: c.clave, nombre: c.nombre, promedio: avg(vals), votos: vals.length };
      });
      const vals = crit.map((c) => c.promedio).filter((v): v is number => v !== null);
      return { clave: s.clave, nombre: s.nombre, promedio: avg(vals), criterios: crit };
    }),
  };
}

// --- Gestión de criterios (admin) -------------------------------------------

export async function listCriteriosAdmin(fase: number) {
  assertFase(fase);
  return criteriosDeFase(fase);
}

export async function createCriterio(input: {
  fase: number;
  grupo: string;
  nombre: string;
  detalle?: string | null;
}) {
  assertFase(input.fase);
  const last = await prisma.surveyCriterion.findFirst({
    where: { fase: input.fase },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  // Clave estable y única dentro de la fase
  const clave = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return prisma.surveyCriterion.create({
    data: {
      fase: input.fase,
      grupo: input.grupo.trim(),
      clave,
      nombre: input.nombre.trim(),
      detalle: input.detalle?.trim() || null,
      order: (last?.order ?? 0) + 1,
    },
  });
}

export async function updateCriterio(
  id: string,
  input: { grupo?: string; nombre?: string; detalle?: string | null }
) {
  const c = await prisma.surveyCriterion.findUnique({ where: { id } });
  if (!c || !c.active) throw notFound("Criterio no encontrado");
  return prisma.surveyCriterion.update({
    where: { id },
    data: {
      grupo: input.grupo?.trim() || undefined,
      nombre: input.nombre?.trim() || undefined,
      detalle: input.detalle !== undefined ? input.detalle?.trim() || null : undefined,
    },
  });
}

// Se desactiva (no se borra) para conservar las respuestas anteriores
export async function deleteCriterio(id: string) {
  const c = await prisma.surveyCriterion.findUnique({ where: { id } });
  if (!c) throw notFound("Criterio no encontrado");
  await prisma.surveyCriterion.update({ where: { id }, data: { active: false } });
  return { ok: true };
}

// Resultados del reto (quién aprobó) para el panel
export async function retoResumen(fase: number) {
  assertFase(fase);
  const attempts = await prisma.quizAttempt.findMany({
    where: { fase },
    orderBy: { createdAt: "desc" },
    include: { student: { select: { id: true, fullName: true } } },
  });
  const porAlumno = new Map<
    string,
    { id: string; nombre: string; intentos: number; mejor: number; aprobado: boolean }
  >();
  for (const a of attempts) {
    const prev = porAlumno.get(a.studentId);
    const score = Number(a.score);
    porAlumno.set(a.studentId, {
      id: a.studentId,
      nombre: a.student.fullName,
      intentos: (prev?.intentos ?? 0) + 1,
      mejor: Math.max(prev?.mejor ?? 0, score),
      aprobado: (prev?.aprobado ?? false) || a.passed,
    });
  }
  return { fase, alumnos: [...porAlumno.values()] };
}
