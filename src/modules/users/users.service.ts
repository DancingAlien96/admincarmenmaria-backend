import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/auth.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import type { CreateUserInput, UpdateUserInput } from "./users.schemas.js";

const MAX_STAFF_USERS = 5; // El documento limita a 5 usuarios ademas del admin

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  permissions: { select: { section: true, level: true } },
} as const;

export function listUsers() {
  // Personal administrativo y docentes. Las cuentas de ESTUDIANTE (portal del
  // alumno) se gestionan desde su expediente, no aquí.
  return prisma.user.findMany({
    where: { role: { in: ["ADMIN", "STAFF", "DOCENTE"] } },
    select: userSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw notFound("Usuario no encontrado");
  return user;
}

export async function createUser(input: CreateUserInput) {
  if (input.role === "STAFF") {
    const staffCount = await prisma.user.count({
      where: { role: "STAFF", active: true },
    });
    if (staffCount >= MAX_STAFF_USERS) {
      throw badRequest(
        `Se alcanzo el maximo de ${MAX_STAFF_USERS} usuarios. Desactiva uno antes de crear otro.`
      );
    }
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      // El ADMIN tiene acceso total; no se le guardan permisos por seccion
      permissions:
        input.role === "STAFF"
          ? { create: input.permissions }
          : undefined,
    },
    select: userSelect,
  });
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound("Usuario no encontrado");

  const passwordHash = input.password
    ? await hashPassword(input.password)
    : undefined;

  return prisma.$transaction(async (tx) => {
    // Si se envian permisos, se reemplazan por completo
    if (input.permissions) {
      await tx.userPermission.deleteMany({ where: { userId: id } });
      const role = input.role ?? existing.role;
      if (role === "STAFF" && input.permissions.length > 0) {
        await tx.userPermission.createMany({
          data: input.permissions.map((p) => ({ ...p, userId: id })),
        });
      }
    }

    return tx.user.update({
      where: { id },
      data: {
        name: input.name,
        active: input.active,
        role: input.role,
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: userSelect,
    });
  });
}

export async function deactivateUser(id: string, requesterId: string) {
  if (id === requesterId) {
    throw badRequest("No puedes desactivar tu propia cuenta");
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound("Usuario no encontrado");

  return prisma.user.update({
    where: { id },
    data: { active: false },
    select: userSelect,
  });
}
