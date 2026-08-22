import { z } from "zod";

const SECTIONS = [
  "STUDENTS",
  "PAYMENTS",
  "REMINDERS",
  "DASHBOARD",
  "DIPLOMAS",
  "ACTAS",
] as const;

const permissionSchema = z.object({
  section: z.enum(SECTIONS),
  level: z.enum(["READER", "EDITOR"]),
});

export const createUserSchema = z.object({
  name: z.string().min(2, "Nombre muy corto").trim(),
  email: z.string().email("Correo invalido").trim().toLowerCase(),
  password: z.string().min(8, "La contrasena debe tener al menos 8 caracteres"),
  role: z.enum(["ADMIN", "STAFF", "DOCENTE"]).default("STAFF"),
  permissions: z.array(permissionSchema).default([]),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).trim().optional(),
  password: z.string().min(8).optional(),
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "STAFF", "DOCENTE"]).optional(),
  permissions: z.array(permissionSchema).optional(),
});

export const userIdParam = z.object({ id: z.string().min(1) });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
