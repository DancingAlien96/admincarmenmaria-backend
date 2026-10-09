import path from "node:path";
import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import { getSetting, setSetting } from "../../lib/settings.js";
import { deleteFile } from "../../lib/storage.js";
import { env } from "../../config/env.js";

// Matrícula: formulario que la escuela publica (plantilla) y que el alumno
// admitido descarga, firma y sube en PDF; uno por año (ciclo).

const TEMPLATE_KEY = "matricula_template";

export interface MatriculaTemplate {
  url: string;
  key: string;
  name: string;
}

export const cicloActual = () => new Date().getFullYear();

export async function getTemplate(): Promise<MatriculaTemplate | null> {
  try {
    const raw = await getSetting(TEMPLATE_KEY);
    return raw ? (JSON.parse(raw) as MatriculaTemplate) : null;
  } catch {
    return null;
  }
}

// Sube o reemplaza la plantilla (el archivo anterior se borra del disco)
export async function setTemplate(t: MatriculaTemplate | null) {
  const prev = await getTemplate();
  if (t) {
    if (!/\.pdf$/i.test(t.key)) throw badRequest("El formulario debe ser un PDF");
    await setSetting(TEMPLATE_KEY, JSON.stringify(t));
  } else {
    await setSetting(TEMPLATE_KEY, "");
  }
  if (prev && prev.key !== t?.key) await deleteFile(prev.key);
  return getTemplate();
}

function serialize(m: {
  id: string;
  year: number;
  fileUrl: string;
  fileName: string | null;
  status: string;
  note: string | null;
  uploadedAt: Date;
  reviewedAt: Date | null;
}) {
  return {
    id: m.id,
    year: m.year,
    fileUrl: m.fileUrl,
    fileName: m.fileName,
    status: m.status,
    note: m.note,
    uploadedAt: m.uploadedAt,
    reviewedAt: m.reviewedAt,
  };
}

// Estado de la matrícula de un alumno: la del ciclo actual + historial
export async function getMatricula(studentId: string) {
  const [rows, template] = await Promise.all([
    prisma.studentMatricula.findMany({
      where: { studentId },
      orderBy: { year: "desc" },
    }),
    getTemplate(),
  ]);
  const year = cicloActual();
  const actual = rows.find((r) => r.year === year) ?? null;
  return {
    year,
    template,
    actual: actual ? serialize(actual) : null,
    historial: rows.filter((r) => r.year !== year).map(serialize),
  };
}

// El alumno sube (o vuelve a subir) su matrícula firmada del ciclo actual.
export async function submitMatricula(
  studentId: string,
  input: { fileKey: string; fileName?: string }
) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { status: true },
  });
  if (!student) throw notFound("Expediente no encontrado");
  if (student.status !== "ACTIVO") {
    throw badRequest("La matrícula es solo para alumnos admitidos");
  }
  // Solo archivos subidos al sistema y en PDF
  const key = path.basename(input.fileKey ?? "");
  if (!key || key !== input.fileKey || !/\.pdf$/i.test(key)) {
    throw badRequest("Sube tu matrícula firmada en formato PDF");
  }
  const year = cicloActual();
  const prev = await prisma.studentMatricula.findUnique({
    where: { studentId_year: { studentId, year } },
  });
  if (prev?.status === "APROBADA") {
    throw badRequest("Tu matrícula de este año ya fue aprobada");
  }
  // Un mismo archivo no puede ser la matrícula de otra persona
  const usado = await prisma.studentMatricula.findFirst({
    where: { fileKey: key, NOT: { studentId } },
    select: { id: true },
  });
  if (usado) throw badRequest("Sube tu propio archivo PDF de matrícula");
  const data = {
    // La URL se arma en el servidor a partir de la clave validada (no se
    // confía en la que envía el navegador).
    fileUrl: `${env.PUBLIC_API_URL}/uploads/${key}`,
    fileKey: key,
    fileName: input.fileName?.slice(0, 190) || null,
    status: "EN_REVISION" as const,
    note: null,
    uploadedAt: new Date(),
    reviewedAt: null,
    reviewedById: null,
  };
  const saved = await prisma.studentMatricula.upsert({
    where: { studentId_year: { studentId, year } },
    create: { studentId, year, ...data },
    update: data,
  });
  // Al reemplazar NO se borra el archivo anterior: la clave la envía el
  // navegador y podría apuntar a un archivo de otra sección del sistema.
  return serialize(saved);
}

// La administración aprueba o rechaza (con motivo) una matrícula
export async function reviewMatricula(
  id: string,
  input: { status: "APROBADA" | "RECHAZADA"; note?: string },
  userId?: string
) {
  const m = await prisma.studentMatricula.findUnique({ where: { id } });
  if (!m) throw notFound("Matrícula no encontrada");
  if (input.status === "RECHAZADA" && !input.note?.trim()) {
    throw badRequest("Indica el motivo del rechazo para que el alumno lo corrija");
  }
  const saved = await prisma.studentMatricula.update({
    where: { id },
    data: {
      status: input.status,
      note: input.note?.trim() || null,
      reviewedAt: new Date(),
      reviewedById: userId ?? null,
    },
  });
  const aprobada = input.status === "APROBADA";
  void import("../avisos/avisos.service.js")
    .then((mod) =>
      mod.notificarAlumno(m.studentId, {
        tipo: "matricula",
        titulo: aprobada ? `Matrícula ${m.year} aprobada` : `Matrícula ${m.year} rechazada`,
        mensaje: aprobada
          ? "La administración aprobó tu matrícula."
          : `Motivo: ${input.note?.trim()}. Corrígela y vuelve a subirla.`,
        url: "/portal/matricula/",
      })
    )
    .catch((e) => console.error("[aviso matrícula]", (e as Error).message));
  return serialize(saved);
}

// Matrículas por revisar (para avisos en el panel)
export async function countPendientes() {
  return prisma.studentMatricula.count({ where: { status: "EN_REVISION" } });
}
