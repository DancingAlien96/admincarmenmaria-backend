import { z } from "zod";

export const createInviteSchema = z.object({
  studentId: z.string().optional().nullable(),
  prefillName: z.string().trim().optional().nullable(),
  sede: z.string().trim().optional().nullable(),
  cohorteYear: z.coerce.number().int().min(2000).max(2100).optional().nullable(),
});

const registerGuardianSchema = z.object({
  name: z.string().trim().min(2, "Nombre del responsable requerido"),
  relationship: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().email("Correo inválido").trim().optional().or(z.literal("")),
});

export const registerSchema = z.object({
  email: z.string().email("Correo inválido").trim(),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  fullName: z.string().trim().optional(),
  dpi: z.string().trim().optional(),
  birthDate: z.string().trim().optional(),
  department: z.string().trim().optional(),
  municipality: z.string().trim().optional(),
  address: z.string().trim().optional(),
  sede: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  phoneAlt: z.string().trim().optional(),
  // Año en que inicia sus estudios (promoción).
  startYear: z.coerce.number().int().min(2000).max(2100).optional(),
  photoUrl: z.string().trim().optional(),
  photoKey: z.string().trim().optional(),
  guardians: z.array(registerGuardianSchema).optional(),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type RegisterSchemaInput = z.infer<typeof registerSchema>;
