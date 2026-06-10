import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { deleteFile } from "../../lib/storage.js";
import type {
  CreateTeacherInput,
  UpdateTeacherInput,
  ListTeachersQuery,
  AddDocumentInput,
} from "./teachers.schemas.js";

const clean = (v?: string | null) => (v && v.length > 0 ? v : null);

const detailInclude = {
  roles: { select: { role: true } },
  documents: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.TeacherInclude;

// Aplana roles [{role}] -> ["TEORIA", ...] para el cliente.
function serialize<T extends { roles: { role: string }[] }>(t: T) {
  return { ...t, roles: t.roles.map((r) => r.role) };
}

export async function listTeachers(q: ListTeachersQuery) {
  const where: Prisma.TeacherWhereInput = {
    ...(q.search
      ? {
          OR: [
            { fullName: { contains: q.search } },
            { dpi: { contains: q.search } },
            { specialty: { contains: q.search } },
          ],
        }
      : {}),
    ...(q.role ? { roles: { some: { role: q.role } } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      include: { roles: { select: { role: true } }, _count: { select: { documents: true } } },
      orderBy: { fullName: "asc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return {
    data: rows.map((t) => ({
      id: t.id,
      fullName: t.fullName,
      dpi: t.dpi,
      phone: t.phone,
      email: t.email,
      specialty: t.specialty,
      active: t.active,
      roles: t.roles.map((r) => r.role),
      _count: t._count,
    })),
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
  };
}

export async function getTeacher(id: string) {
  const t = await prisma.teacher.findUnique({
    where: { id },
    include: detailInclude,
  });
  if (!t) throw notFound("Catedrático no encontrado");
  return serialize(t);
}

export async function createTeacher(input: CreateTeacherInput, userId?: string) {
  const t = await prisma.teacher.create({
    data: {
      fullName: input.fullName,
      dpi: clean(input.dpi),
      phone: clean(input.phone),
      email: clean(input.email),
      title: clean(input.title),
      collegiate: clean(input.collegiate),
      specialty: clean(input.specialty),
      notes: clean(input.notes),
      createdById: userId,
      roles: {
        create: (input.roles ?? []).map((role) => ({ role })),
      },
    },
    include: detailInclude,
  });
  return serialize(t);
}

export async function updateTeacher(id: string, input: UpdateTeacherInput) {
  const existing = await prisma.teacher.findUnique({ where: { id } });
  if (!existing) throw notFound("Catedrático no encontrado");

  return prisma.$transaction(async (tx) => {
    // Si llegan roles, se reemplazan por completo
    if (input.roles) {
      await tx.teacherRoleAssignment.deleteMany({ where: { teacherId: id } });
      await tx.teacherRoleAssignment.createMany({
        data: input.roles.map((role) => ({ teacherId: id, role })),
      });
    }
    const t = await tx.teacher.update({
      where: { id },
      data: {
        fullName: input.fullName,
        dpi: input.dpi !== undefined ? clean(input.dpi) : undefined,
        phone: input.phone !== undefined ? clean(input.phone) : undefined,
        email: input.email !== undefined ? clean(input.email) : undefined,
        title: input.title !== undefined ? clean(input.title) : undefined,
        collegiate:
          input.collegiate !== undefined ? clean(input.collegiate) : undefined,
        specialty:
          input.specialty !== undefined ? clean(input.specialty) : undefined,
        notes: input.notes !== undefined ? clean(input.notes) : undefined,
      },
      include: detailInclude,
    });
    return serialize(t);
  });
}

// No se elimina; se desactiva (igual que usuarios).
export async function deactivateTeacher(id: string) {
  const existing = await prisma.teacher.findUnique({ where: { id } });
  if (!existing) throw notFound("Catedrático no encontrado");
  await prisma.teacher.update({ where: { id }, data: { active: false } });
  return { ok: true };
}

export async function addDocument(teacherId: string, input: AddDocumentInput) {
  const t = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!t) throw notFound("Catedrático no encontrado");
  return prisma.teacherDocument.create({
    data: {
      teacherId,
      type: input.type,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      fileKey: input.fileKey,
    },
  });
}

export async function deleteDocument(teacherId: string, docId: string) {
  const doc = await prisma.teacherDocument.findFirst({
    where: { id: docId, teacherId },
  });
  if (!doc) throw notFound("Documento no encontrado");
  await prisma.teacherDocument.delete({ where: { id: docId } });
  await deleteFile(doc.fileKey);
  return { ok: true };
}
