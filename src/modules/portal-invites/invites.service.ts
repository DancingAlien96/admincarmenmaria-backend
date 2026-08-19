import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, signToken } from "../../lib/auth.js";
import { badRequest, notFound, conflict } from "../../lib/http-error.js";
import { normalizeName } from "../../lib/normalize.js";
import { nextExpediente } from "../../lib/expediente.js";

// El admin genera una invitación. Con studentId = activar acceso de un
// expediente existente; sin studentId = inscripción nueva.
export async function createInvite(
  input: {
    studentId?: string | null;
    prefillName?: string | null;
    sede?: string | null;
    cohorteYear?: number | null;
  },
  userId?: string
) {
  const token = crypto.randomBytes(24).toString("hex");
  return prisma.portalInvite.create({
    data: {
      token,
      studentId: input.studentId || null,
      prefillName: input.prefillName || null,
      sede: input.sede || null,
      cohorteYear: input.cohorteYear || null,
      createdById: userId,
    },
  });
}

async function loadValidInvite(token: string) {
  const inv = await prisma.portalInvite.findUnique({ where: { token } });
  if (!inv || inv.status !== "PENDING") {
    throw notFound("La invitación no es válida o ya fue utilizada");
  }
  if (inv.expiresAt && inv.expiresAt < new Date()) {
    throw badRequest("La invitación ya expiró");
  }
  return inv;
}

// Valida el token para operaciones públicas (ej. subir la foto).
export async function assertInviteValid(token: string) {
  await loadValidInvite(token);
}

// Datos públicos de la invitación (para pintar el formulario).
export async function getInvitePublic(token: string) {
  const inv = await loadValidInvite(token);
  if (inv.studentId) {
    const s = await prisma.student.findUnique({
      where: { id: inv.studentId },
      select: { fullName: true, email: true, expedienteNumber: true, sede: true },
    });
    return {
      mode: "activacion" as const,
      studentName: s?.fullName ?? null,
      studentEmail: s?.email ?? null,
      expediente: s?.expedienteNumber ?? null,
      sede: s?.sede ?? null,
    };
  }
  return {
    mode: "inscripcion" as const,
    prefillName: inv.prefillName,
    sede: inv.sede,
    cohorteYear: inv.cohorteYear,
  };
}

export interface RegisterGuardian {
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
}

export interface RegisterInput {
  password?: string;
  email: string;
  fullName?: string;
  dpi?: string;
  birthDate?: string;
  department?: string;
  municipality?: string;
  address?: string;
  sede?: string;
  phone?: string;
  phoneAlt?: string;
  startYear?: number;
  photoUrl?: string;
  photoKey?: string;
  guardians?: RegisterGuardian[];
}

// Verifica que la inscripción nueva traiga TODOS los datos obligatorios.
function assertInscripcionComplete(data: RegisterInput) {
  const req: [keyof RegisterInput, string][] = [
    ["fullName", "el nombre completo"],
    ["dpi", "el DPI"],
    ["birthDate", "la fecha de nacimiento"],
    ["department", "el departamento"],
    ["municipality", "el municipio"],
    ["address", "la dirección"],
    ["sede", "la sede"],
    ["phone", "el teléfono"],
    ["startYear", "el año en que inicia sus estudios"],
    ["photoUrl", "la fotografía"],
  ];
  for (const [key, label] of req) {
    if (!data[key]) throw badRequest(`Falta ${label}.`);
  }
  if (!data.guardians || data.guardians.length === 0) {
    throw badRequest("Agrega al menos una persona responsable.");
  }
}

// Consume la invitación: crea/activa la cuenta del alumno y lo deja logueado.
export async function registerFromInvite(token: string, data: RegisterInput) {
  const inv = await loadValidInvite(token);

  const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
  if (emailTaken) throw conflict("Ese correo ya tiene una cuenta");

  let studentId: string;
  if (inv.studentId) {
    // Modo activación: el expediente ya existe (solo crea la cuenta).
    studentId = inv.studentId;
  } else {
    // Inscripción nueva: se exigen todos los datos del expediente.
    assertInscripcionComplete(data);

    // Evita duplicar por DPI o por nombre.
    let existing = data.dpi
      ? await prisma.student.findFirst({ where: { dpi: data.dpi } })
      : null;
    if (!existing && data.fullName) {
      const key = normalizeName(data.fullName);
      const all = await prisma.student.findMany({ select: { id: true, fullName: true } });
      const match = all.find((s) => normalizeName(s.fullName) === key);
      if (match) existing = await prisma.student.findUnique({ where: { id: match.id } });
    }
    if (existing) {
      throw conflict(
        "Ya existe un expediente con estos datos. Comunícate con la escuela."
      );
    }

    // El año de inicio define la promoción (fecha de inscripción = 1 de enero
    // de ese año), y el correlativo del expediente.
    const year = data.startYear ?? inv.cohorteYear ?? new Date().getFullYear();
    const expediente = await nextExpediente(year);
    const created = await prisma.student.create({
      data: {
        fullName: data.fullName!,
        dpi: data.dpi || null,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        enrollmentDate: new Date(Date.UTC(year, 0, 1)),
        sede: data.sede || inv.sede || null,
        department: data.department || null,
        municipality: data.municipality || null,
        address: data.address || null,
        phonePrimary: data.phone || null,
        phoneAlt: data.phoneAlt || null,
        email: data.email,
        photoUrl: data.photoUrl || null,
        photoKey: data.photoKey || null,
        status: "ACTIVO",
        expedienteNumber: expediente,
        guardians: {
          create: (data.guardians ?? []).map((g) => ({
            name: g.name,
            relationship: g.relationship || null,
            phone: g.phone || null,
            email: g.email || null,
          })),
        },
        statusHistory: {
          create: { toStatus: "ACTIVO", reason: "Inscripción por link del portal" },
        },
      },
    });
    studentId = created.id;
  }

  const existingUser = await prisma.user.findFirst({ where: { studentId } });
  if (existingUser) throw conflict("Este expediente ya tiene una cuenta de acceso");

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { fullName: true, email: true },
  });

  // En la inscripción la contraseña por defecto es el DPI (sin espacios); el
  // alumno la cambia luego en el portal. En la activación la define el alumno.
  const dpiClean = data.dpi?.replace(/\s+/g, "");
  const effectivePassword = inv.studentId ? data.password : dpiClean;
  if (!effectivePassword || effectivePassword.length < 6) {
    throw badRequest("No se pudo definir la contraseña de acceso.");
  }

  const user = await prisma.user.create({
    data: {
      name: student?.fullName ?? "Estudiante",
      email: data.email,
      passwordHash: await hashPassword(effectivePassword),
      role: "ESTUDIANTE",
      studentId,
    },
  });
  if (student && !student.email) {
    await prisma.student.update({ where: { id: studentId }, data: { email: data.email } });
  }

  // El link de inscripción es reutilizable (varios alumnos con el mismo link).
  // El de activación (un expediente puntual) sí se marca como usado.
  if (inv.studentId) {
    await prisma.portalInvite.update({
      where: { id: inv.id },
      data: { status: "USED", usedAt: new Date() },
    });
  }

  const authToken = signToken({ sub: user.id, email: user.email, role: user.role });
  return {
    token: authToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId,
    },
  };
}
