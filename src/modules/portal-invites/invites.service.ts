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

export interface RegisterInput {
  password: string;
  email: string;
  fullName?: string;
  dpi?: string;
  department?: string;
  municipality?: string;
  sede?: string;
  phone?: string;
}

// Consume la invitación: crea/activa la cuenta del alumno y lo deja logueado.
export async function registerFromInvite(token: string, data: RegisterInput) {
  const inv = await loadValidInvite(token);

  const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
  if (emailTaken) throw conflict("Ese correo ya tiene una cuenta");

  let studentId: string;
  if (inv.studentId) {
    studentId = inv.studentId;
  } else {
    // Inscripción nueva: evita duplicar por DPI o por nombre.
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
      studentId = existing.id;
    } else {
      const year = inv.cohorteYear ?? new Date().getFullYear();
      const expediente = await nextExpediente(year);
      const created = await prisma.student.create({
        data: {
          fullName: data.fullName ?? "Estudiante",
          dpi: data.dpi || null,
          sede: inv.sede || data.sede || null,
          department: data.department || null,
          municipality: data.municipality || null,
          phonePrimary: data.phone || null,
          email: data.email,
          status: "ACTIVO",
          expedienteNumber: expediente,
          statusHistory: {
            create: { toStatus: "ACTIVO", reason: "Inscripción por link del portal" },
          },
        },
      });
      studentId = created.id;
    }
  }

  const existingUser = await prisma.user.findFirst({ where: { studentId } });
  if (existingUser) throw conflict("Este expediente ya tiene una cuenta de acceso");

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { fullName: true, email: true },
  });
  const user = await prisma.user.create({
    data: {
      name: student?.fullName ?? "Estudiante",
      email: data.email,
      passwordHash: await hashPassword(data.password),
      role: "ESTUDIANTE",
      studentId,
    },
  });
  if (student && !student.email) {
    await prisma.student.update({ where: { id: studentId }, data: { email: data.email } });
  }

  await prisma.portalInvite.update({
    where: { id: inv.id },
    data: { status: "USED", usedAt: new Date() },
  });

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
