import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";

// --- Reto de Comprensión -----------------------------------------------------
// Cuestionario por fase. No afecta la nota; aprobarlo (>= 80 %) es requisito
// para desbloquear la siguiente fase (solo si la fase tiene preguntas).

export const RETO_APROBACION = 80;

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
  const [rows, attempts] = await Promise.all([
    prisma.quizQuestion.findMany({
      where: { fase, active: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.quizAttempt.findMany({
      where: { studentId, fase },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const best = attempts.reduce<number | null>(
    (m, a) => (m === null || Number(a.score) > m ? Number(a.score) : m),
    null
  );
  return {
    fase,
    aprobacion: RETO_APROBACION,
    preguntas: rows.map((q) => ({
      id: q.id,
      question: q.question,
      options: toOptions(q.options),
    })),
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
  const passed = score >= RETO_APROBACION;
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

export const ENCUESTA = [
  {
    clave: "instalaciones",
    nombre: "Instalaciones",
    criterios: [
      { clave: "aulas", nombre: "Aulas y espacios de aprendizaje", detalle: "Comodidad, iluminación, ventilación y espacio suficiente para las clases teóricas" },
      { clave: "equipamiento", nombre: "Equipamiento y material didáctico", detalle: "Proyectores, pizarras, modelos anatómicos y recursos audiovisuales disponibles" },
      { clave: "laboratorios", nombre: "Laboratorios y áreas de práctica", detalle: "Disponibilidad, estado del equipo y condiciones para prácticas de bioseguridad" },
    ],
  },
  {
    clave: "docentes",
    nombre: "Docentes",
    criterios: [
      { clave: "dominio", nombre: "Dominio del tema", detalle: "Conocimiento profundo y actualizado de los contenidos impartidos en la fase" },
      { clave: "claridad", nombre: "Claridad en la enseñanza", detalle: "Capacidad para explicar conceptos complejos de forma comprensible y estructurada" },
      { clave: "disponibilidad", nombre: "Disponibilidad para consultas", detalle: "Accesibilidad fuera del horario de clase para resolver dudas y brindar orientación" },
      { clave: "trato", nombre: "Trato y comunicación", detalle: "Respeto, empatía y retroalimentación constructiva hacia los estudiantes" },
    ],
  },
  {
    clave: "contenido",
    nombre: "Contenido",
    criterios: [
      { clave: "relevancia", nombre: "Relevancia de los temas", detalle: "Utilidad y pertinencia de los contenidos para la formación como profesional de enfermería" },
      { clave: "organizacion", nombre: "Organización del material", detalle: "Estructura lógica de las presentaciones, guías y recursos proporcionados por el docente" },
      { clave: "aplicabilidad", nombre: "Aplicabilidad práctica", detalle: "Conexión entre la teoría y los procedimientos clínicos reales en el ámbito hospitalario" },
    ],
  },
] as const;

const CLAVES = new Set<string>(ENCUESTA.flatMap((s) => s.criterios.map((c) => c.clave)));

function toRatings(v: Prisma.JsonValue | undefined): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    const n = Number(val);
    if (CLAVES.has(k) && n >= 1 && n <= 5) out[k] = n;
  }
  return out;
}

export async function getEncuesta(studentId: string, fase: number) {
  assertFase(fase);
  const r = await prisma.surveyResponse.findUnique({
    where: { studentId_fase: { studentId, fase } },
  });
  return { fase, secciones: ENCUESTA, ratings: toRatings(r?.ratings) };
}

// Guarda (o cambia) la calificación de un criterio; se autoguarda al tocar.
export async function rateEncuesta(
  studentId: string,
  fase: number,
  clave: string,
  rating: number
) {
  assertFase(fase);
  if (!CLAVES.has(clave)) throw badRequest("Criterio inválido");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw badRequest("La calificación va de 1 a 5 estrellas");
  }
  const prev = await prisma.surveyResponse.findUnique({
    where: { studentId_fase: { studentId, fase } },
  });
  const ratings = { ...toRatings(prev?.ratings), [clave]: rating };
  await prisma.surveyResponse.upsert({
    where: { studentId_fase: { studentId, fase } },
    create: { studentId, fase, ratings },
    update: { ratings },
  });
  return { ratings };
}

// Resultados de la encuesta (promedio por criterio y por sección) para el panel
export async function encuestaResumen(fase: number) {
  assertFase(fase);
  const rows = await prisma.surveyResponse.findMany({ where: { fase } });
  const all = rows.map((r) => toRatings(r.ratings));
  const avg = (vals: number[]) =>
    vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  return {
    fase,
    respuestas: rows.length,
    secciones: ENCUESTA.map((s) => {
      const criterios = s.criterios.map((c) => {
        const vals = all.map((r) => r[c.clave]).filter((v): v is number => v !== undefined);
        return { clave: c.clave, nombre: c.nombre, promedio: avg(vals), votos: vals.length };
      });
      const vals = criterios.map((c) => c.promedio).filter((v): v is number => v !== null);
      return { clave: s.clave, nombre: s.nombre, promedio: avg(vals), criterios };
    }),
  };
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
