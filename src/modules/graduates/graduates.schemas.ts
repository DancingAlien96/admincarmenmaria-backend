import { z } from "zod";

export const createGraduateSchema = z.object({
  studentId: z.string().optional().nullable(),
  fullName: z.string().min(3, "Nombre completo requerido").trim(),
  dpi: z.string().min(5, "DPI invalido").trim(),
  email: z.string().email("Correo invalido").trim().optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  mspasCode: z.string().trim().optional(),
  // Si no se envia, el sistema genera el correlativo
  diplomaNumber: z.string().trim().optional(),
  graduationDate: z.string().min(1, "Fecha de graduacion requerida"),
  diplomaUrl: z.string().url().optional().or(z.literal("")),
  diplomaKey: z.string().optional(),
});

export const updateGraduateSchema = z.object({
  fullName: z.string().min(3).trim().optional(),
  email: z.string().email().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  mspasCode: z.string().trim().optional(),
  graduationDate: z.string().optional(),
  diplomaUrl: z.string().url().optional().or(z.literal("")),
  diplomaKey: z.string().optional(),
});

export const listGraduatesQuery = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const letterSchema = z.object({
  issueDate: z.string().min(1, "Fecha requerida"),
  notes: z.string().trim().optional(),
});

export const graduateIdParam = z.object({ id: z.string().min(1) });

export type CreateGraduateInput = z.infer<typeof createGraduateSchema>;
export type UpdateGraduateInput = z.infer<typeof updateGraduateSchema>;
export type ListGraduatesQuery = z.infer<typeof listGraduatesQuery>;
export type LetterInput = z.infer<typeof letterSchema>;
