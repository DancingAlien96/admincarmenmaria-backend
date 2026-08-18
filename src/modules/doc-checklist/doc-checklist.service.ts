import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import type {
  CreateRequirementInput,
  UpdateRequirementInput,
  SetDocStatusInput,
} from "./doc-checklist.schemas.js";

// --- Catálogo de documentos requeridos (editable por el admin) --------------

export function listRequirements(includeInactive = false) {
  return prisma.docRequirement.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}

export async function createRequirement(input: CreateRequirementInput) {
  // Nuevo documento se agrega al final del listado.
  const last = await prisma.docRequirement.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return prisma.docRequirement.create({
    data: { name: input.name, order: (last?.order ?? 0) + 1 },
  });
}

export async function updateRequirement(
  id: string,
  input: UpdateRequirementInput
) {
  const existing = await prisma.docRequirement.findUnique({ where: { id } });
  if (!existing) throw notFound("Documento no encontrado");
  return prisma.docRequirement.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      order: input.order ?? undefined,
      active: input.active ?? undefined,
    },
  });
}

// Desactivar = quitar del checklist sin borrar el historial de estados.
export async function deactivateRequirement(id: string) {
  const existing = await prisma.docRequirement.findUnique({ where: { id } });
  if (!existing) throw notFound("Documento no encontrado");
  return prisma.docRequirement.update({
    where: { id },
    data: { active: false },
  });
}

// --- Checklist por estudiante ------------------------------------------------

type ChecklistItem = {
  requirementId: string;
  name: string;
  delivered: boolean;
  receivedAt: Date | null;
  notes: string;
};

// Une el catálogo activo con los estados del estudiante (faltantes = pendiente).
export async function getStudentChecklist(
  studentId: string
): Promise<{ items: ChecklistItem[]; entregados: number; total: number }> {
  const [reqs, statuses] = await Promise.all([
    prisma.docRequirement.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.studentDocStatus.findMany({ where: { studentId } }),
  ]);
  const byReq = new Map(statuses.map((s) => [s.requirementId, s]));
  const items: ChecklistItem[] = reqs.map((r) => {
    const s = byReq.get(r.id);
    return {
      requirementId: r.id,
      name: r.name,
      delivered: s?.delivered ?? false,
      receivedAt: s?.receivedAt ?? null,
      notes: s?.notes ?? "",
    };
  });
  const entregados = items.filter((i) => i.delivered).length;
  return { items, entregados, total: items.length };
}

// Marca un documento como entregado/pendiente (con nota opcional).
export async function setStudentDocStatus(
  studentId: string,
  requirementId: string,
  input: SetDocStatusInput,
  userId?: string
) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw notFound("Expediente no encontrado");
  const req = await prisma.docRequirement.findUnique({
    where: { id: requirementId },
  });
  if (!req) throw notFound("Documento no encontrado");

  const existing = await prisma.studentDocStatus.findUnique({
    where: { studentId_requirementId: { studentId, requirementId } },
  });
  // receivedAt: se fija al marcar entregado (conserva la fecha previa si ya la
  // tenía); se limpia al marcar pendiente.
  const receivedAt = input.delivered
    ? (existing?.receivedAt ?? new Date())
    : null;

  await prisma.studentDocStatus.upsert({
    where: { studentId_requirementId: { studentId, requirementId } },
    create: {
      studentId,
      requirementId,
      delivered: input.delivered,
      receivedAt,
      notes: input.notes ?? null,
      updatedById: userId,
    },
    update: {
      delivered: input.delivered,
      receivedAt,
      notes: input.notes ?? null,
      updatedById: userId,
    },
  });
  return getStudentChecklist(studentId);
}
