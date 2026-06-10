import { z } from "zod";

const ROLES = ["PRACTICA_HOSPITALARIA", "PRACTICA_COMUNITARIA", "TEORIA"] as const;
const DOC_TYPES = ["CV", "DPI", "TITULO", "COLEGIADO", "OTRO"] as const;

export const createTeacherSchema = z.object({
  fullName: z.string().min(2, "Nombre requerido").trim(),
  dpi: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().optional().or(z.literal("")),
  title: z.string().trim().optional().or(z.literal("")),
  collegiate: z.string().trim().optional().or(z.literal("")),
  specialty: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
  roles: z.array(z.enum(ROLES)).default([]),
});

export const updateTeacherSchema = createTeacherSchema.partial();

export const listTeachersQuery = z.object({
  search: z.string().optional(),
  role: z.enum(ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const addDocumentSchema = z.object({
  type: z.enum(DOC_TYPES),
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
  fileKey: z.string().optional(),
});

export const teacherIdParam = z.object({ id: z.string().min(1) });
export const docParam = z.object({
  id: z.string().min(1),
  docId: z.string().min(1),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;
export type ListTeachersQuery = z.infer<typeof listTeachersQuery>;
export type AddDocumentInput = z.infer<typeof addDocumentSchema>;
