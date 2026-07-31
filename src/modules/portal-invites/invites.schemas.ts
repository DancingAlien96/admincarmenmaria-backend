import { z } from "zod";

export const createInviteSchema = z.object({
  studentId: z.string().optional().nullable(),
  prefillName: z.string().trim().optional().nullable(),
  sede: z.string().trim().optional().nullable(),
  cohorteYear: z.coerce.number().int().min(2000).max(2100).optional().nullable(),
});

export const registerSchema = z.object({
  email: z.string().email("Correo inválido").trim(),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  fullName: z.string().trim().optional(),
  dpi: z.string().trim().optional(),
  department: z.string().trim().optional(),
  municipality: z.string().trim().optional(),
  sede: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type RegisterSchemaInput = z.infer<typeof registerSchema>;
