import { prisma } from "../../lib/prisma.js";
import { signToken, verifyPassword } from "../../lib/auth.js";
import { unauthorized } from "../../lib/http-error.js";
import type { LoginInput } from "./auth.schemas.js";

// Forma del usuario que se devuelve al frontend (sin passwordHash)
export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      studentId: true,
      permissions: { select: { section: true, level: true } },
    },
  });
  return user;
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user || !user.active) {
    throw unauthorized("Credenciales invalidas");
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw unauthorized("Credenciales invalidas");
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const profile = await getUserProfile(user.id);
  return { token, user: profile };
}
