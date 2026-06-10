import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { deleteFile } from "../../lib/storage.js";
import { migrateStudentToGraduate } from "../graduates/graduates.service.js";
import type {
  CreateStudentInput,
  UpdateStudentInput,
  ListStudentsQuery,
  ChangeStatusInput,
  AddDocumentInput,
} from "./students.schemas.js";

// Normaliza emails vacios ("") a null
const clean = (v?: string | null) => (v && v.length > 0 ? v : null);

export async function listStudents(q: ListStudentsQuery) {
  const where: Prisma.StudentWhereInput = {
    archived: q.archived ?? false,
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { fullName: { contains: q.search } },
            { dpi: { contains: q.search } },
          ],
        }
      : {}),
  };

  const [total, data] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        fullName: true,
        dpi: true,
        status: true,
        phonePrimary: true,
        enrollmentDate: true,
        _count: { select: { documents: true } },
      },
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

export async function getStudent(id: string) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      guardians: true,
      documents: { orderBy: { createdAt: "desc" } },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
      createdBy: { select: { name: true } },
    },
  });
  if (!student) throw notFound("Expediente no encontrado");
  return student;
}

export async function createStudent(
  input: CreateStudentInput,
  userId?: string
) {
  return prisma.student.create({
    data: {
      fullName: input.fullName,
      dpi: input.dpi,
      birthDate: input.birthDate,
      department: clean(input.department),
      municipality: clean(input.municipality),
      address: clean(input.address),
      phonePrimary: clean(input.phonePrimary),
      phoneAlt: clean(input.phoneAlt),
      email: clean(input.email),
      createdById: userId,
      guardians: {
        create: input.guardians.map((g) => ({
          name: g.name,
          relationship: clean(g.relationship),
          phone: clean(g.phone),
          email: clean(g.email),
        })),
      },
      // Registro inicial de estado
      statusHistory: {
        create: {
          toStatus: "ACTIVO",
          reason: "Expediente creado",
          changedById: userId,
        },
      },
    },
    include: { guardians: true },
  });
}

export async function updateStudent(id: string, input: UpdateStudentInput) {
  const existing = await prisma.student.findUnique({ where: { id } });
  if (!existing) throw notFound("Expediente no encontrado");

  return prisma.$transaction(async (tx) => {
    // Si se envian responsables, se reemplazan por completo
    if (input.guardians) {
      await tx.guardian.deleteMany({ where: { studentId: id } });
      if (input.guardians.length > 0) {
        await tx.guardian.createMany({
          data: input.guardians.map((g) => ({
            studentId: id,
            name: g.name,
            relationship: clean(g.relationship),
            phone: clean(g.phone),
            email: clean(g.email),
          })),
        });
      }
    }

    return tx.student.update({
      where: { id },
      data: {
        fullName: input.fullName,
        dpi: input.dpi,
        birthDate: input.birthDate,
        department:
          input.department !== undefined ? clean(input.department) : undefined,
        municipality:
          input.municipality !== undefined
            ? clean(input.municipality)
            : undefined,
        address: input.address !== undefined ? clean(input.address) : undefined,
        phonePrimary:
          input.phonePrimary !== undefined
            ? clean(input.phonePrimary)
            : undefined,
        phoneAlt:
          input.phoneAlt !== undefined ? clean(input.phoneAlt) : undefined,
        email: input.email !== undefined ? clean(input.email) : undefined,
      },
      include: { guardians: true },
    });
  });
}

export async function changeStatus(
  id: string,
  input: ChangeStatusInput,
  userId?: string
) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw notFound("Expediente no encontrado");

  // BAJA archiva el expediente; otros estados lo reactivan
  const archived = input.status === "BAJA";

  const updated = await prisma.$transaction(async (tx) => {
    await tx.studentStatusHistory.create({
      data: {
        studentId: id,
        fromStatus: student.status,
        toStatus: input.status,
        reason: input.reason ?? null,
        changedById: userId,
      },
    });
    return tx.student.update({
      where: { id },
      data: { status: input.status, archived },
      include: { guardians: true },
    });
  });

  // Migracion automatica a la banca de diplomas al egresar (idempotente)
  if (input.status === "EGRESADO") {
    await migrateStudentToGraduate(id, userId);
  }

  return updated;
}

export async function addDocument(
  studentId: string,
  input: AddDocumentInput,
  userId?: string
) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw notFound("Expediente no encontrado");

  return prisma.studentDocument.create({
    data: {
      studentId,
      type: input.type,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      fileKey: input.fileKey,
      uploadedById: userId,
    },
  });
}

export async function deleteDocument(studentId: string, docId: string) {
  const doc = await prisma.studentDocument.findFirst({
    where: { id: docId, studentId },
  });
  if (!doc) throw notFound("Documento no encontrado");
  await prisma.studentDocument.delete({ where: { id: docId } });
  // Borra el archivo fisico del disco (no falla si ya no existe).
  await deleteFile(doc.fileKey);
  return { ok: true };
}
