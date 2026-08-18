import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound, badRequest, conflict } from "../../lib/http-error.js";
import { deleteFile } from "../../lib/storage.js";
import { hashPassword } from "../../lib/auth.js";
import { assignExpedienteIfMissing } from "../../lib/expediente.js";
import { normalizeName } from "../../lib/normalize.js";
import { apellidoNombre, compareByApellido } from "../../lib/name-order.js";
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
    ...(q.sede ? { sede: q.sede } : {}),
    ...(q.year
      ? {
          enrollmentDate: {
            gte: new Date(q.year, 0, 1),
            lt: new Date(q.year + 1, 0, 1),
          },
        }
      : {}),
    ...(q.search
      ? {
          OR: [
            { fullName: { contains: q.search } },
            { dpi: { contains: q.search } },
          ],
        }
      : {}),
  };

  // Se ordena por apellido (Apellidos Nombres), que no es un campo de la BD;
  // por eso se traen todos los que coinciden y se pagina en memoria.
  const all = await prisma.student.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      dpi: true,
      status: true,
      sede: true,
      phonePrimary: true,
      enrollmentDate: true,
      _count: { select: { documents: true } },
    },
  });
  all.sort((a, b) => compareByApellido(a.fullName, b.fullName));

  const total = all.length;
  const start = (q.page - 1) * q.pageSize;
  const data = all.slice(start, start + q.pageSize).map((s) => ({
    ...s,
    // Nombre reordenado para mostrar en la lista.
    sortName: apellidoNombre(s.fullName),
  }));

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
      portalUser: { select: { email: true, active: true, createdAt: true } },
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
      dpi: clean(input.dpi),
      birthDate: input.birthDate,
      department: clean(input.department),
      municipality: clean(input.municipality),
      address: clean(input.address),
      sede: clean(input.sede),
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
        dpi: input.dpi !== undefined ? clean(input.dpi) : undefined,
        birthDate: input.birthDate,
        department:
          input.department !== undefined ? clean(input.department) : undefined,
        municipality:
          input.municipality !== undefined
            ? clean(input.municipality)
            : undefined,
        address: input.address !== undefined ? clean(input.address) : undefined,
        sede: input.sede !== undefined ? clean(input.sede) : undefined,
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

// Crea la cuenta del portal para un estudiante con una contraseña por defecto
// (su DPI; o el número de expediente si no tiene DPI). El alumno puede
// cambiarla luego desde el portal.
export async function createPortalAccount(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true, email: true, dpi: true, expedienteNumber: true },
  });
  if (!student) throw notFound("Expediente no encontrado");
  if (!student.email) {
    throw badRequest(
      "El expediente no tiene correo. Agrégale un correo antes de crear su acceso."
    );
  }
  const existing = await prisma.user.findFirst({ where: { studentId } });

  await assignExpedienteIfMissing(studentId);
  const expediente = (
    await prisma.student.findUnique({
      where: { id: studentId },
      select: { expedienteNumber: true },
    })
  )?.expedienteNumber;

  // El DPI puede venir con espacios (ej. "337593264 2004"); se quitan todos
  // para que la contraseña por defecto no lleve espacios.
  const dpiClean = student.dpi?.replace(/\s+/g, "");
  const defaultPassword = dpiClean || expediente || student.id.slice(-8);
  const passwordHash = await hashPassword(defaultPassword);

  // Si ya tiene cuenta, se reinicia su contraseña por defecto (sirve para
  // corregir credenciales o resetear cuando el alumno la olvida).
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash },
    });
    return { email: existing.email, defaultPassword, reset: true };
  }

  const emailTaken = await prisma.user.findUnique({ where: { email: student.email } });
  if (emailTaken) throw conflict("Ese correo ya está usado por otra cuenta");

  await prisma.user.create({
    data: {
      name: student.fullName,
      email: student.email,
      passwordHash,
      role: "ESTUDIANTE",
      studentId,
    },
  });
  return { email: student.email, defaultPassword, reset: false };
}

// --- Integridad: deteccion y fusion de expedientes duplicados ---------------

// Agrupa expedientes (no archivados) por nombre normalizado y devuelve los
// grupos con mas de un registro: posibles duplicados.
export async function findDuplicateGroups() {
  const rows = await prisma.student.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fullName: true,
      dpi: true,
      email: true,
      phonePrimary: true,
      sede: true,
      status: true,
      enrollmentDate: true,
      createdAt: true,
      _count: {
        select: { payments: true, documents: true, charges: true, guardians: true },
      },
    },
  });

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = normalizeName(r.fullName);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, students]) => ({ key, students }));
}

const MERGE_FIELDS = [
  "dpi", "birthDate", "department", "municipality", "address", "sede",
  "phonePrimary", "phoneAlt", "email",
] as const;

// Fusiona el expediente `dupId` dentro de `keepId`: reasigna todas sus
// relaciones, completa los campos vacios del principal y elimina el duplicado.
export async function mergeStudents(keepId: string, dupId: string) {
  if (keepId === dupId) {
    throw badRequest("No se puede fusionar un expediente consigo mismo");
  }
  const [keep, dup] = await Promise.all([
    prisma.student.findUnique({ where: { id: keepId } }),
    prisma.student.findUnique({ where: { id: dupId } }),
  ]);
  if (!keep) throw notFound("Expediente a conservar no encontrado");
  if (!dup) throw notFound("Expediente duplicado no encontrado");
  if (keep.dpi && dup.dpi && keep.dpi !== dup.dpi) {
    throw badRequest(
      "Ambos expedientes tienen un DPI distinto; no parecen ser la misma persona."
    );
  }

  return prisma.$transaction(async (tx) => {
    const where = { studentId: dupId };
    const data = { studentId: keepId };
    // Reasigna todas las relaciones del duplicado al principal.
    await tx.payment.updateMany({ where, data });
    await tx.charge.updateMany({ where, data });
    await tx.studentDocument.updateMany({ where, data });
    await tx.guardian.updateMany({ where, data });
    await tx.studentStatusHistory.updateMany({ where, data });
    await tx.whatsappMessage.updateMany({ where, data });

    // Graduate es 1:1. Solo se mueve si el principal aun no tiene uno.
    const dupGrad = await tx.graduate.findUnique({ where: { studentId: dupId } });
    if (dupGrad) {
      const keepGrad = await tx.graduate.findUnique({
        where: { studentId: keepId },
      });
      await tx.graduate.update({
        where: { studentId: dupId },
        data: { studentId: keepGrad ? null : keepId },
      });
    }

    // Borra el duplicado ANTES de copiar campos (libera dpi/email unicos).
    await tx.student.delete({ where: { id: dupId } });

    // Completa los campos vacios del principal con los del duplicado.
    const fill: Record<string, unknown> = {};
    for (const f of MERGE_FIELDS) {
      if (!keep[f] && dup[f]) fill[f] = dup[f];
    }
    if (Object.keys(fill).length > 0) {
      await tx.student.update({ where: { id: keepId }, data: fill });
    }

    return tx.student.findUnique({
      where: { id: keepId },
      include: { guardians: true },
    });
  });
}
