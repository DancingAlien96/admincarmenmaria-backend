import { z } from "zod";

const STATUS = ["ACTIVO", "EGRESADO", "BAJA"] as const;
const DOC_TYPES = [
  "DPI",
  "PARTIDA_NACIMIENTO",
  "FOTOGRAFIA",
  "CODIGO_BASICO",
  "CERTIFICADO_BASICO",
  "DIPLOMA_PREVIO",
  "CARTA_RECOMENDACION",
  "OTRO",
] as const;

const guardianSchema = z.object({
  name: z.string().min(2, "Nombre del responsable muy corto").trim(),
  relationship: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().email("Correo invalido").trim().optional().or(z.literal("")),
});

// fecha opcional en formato ISO o YYYY-MM-DD
const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));

export const createStudentSchema = z.object({
  fullName: z.string().min(3, "Nombre completo requerido").trim(),
  // DPI opcional: estudiantes creados desde un pago lo completan despues.
  dpi: z.string().trim().optional().or(z.literal("")),
  birthDate: optionalDate,
  department: z.string().trim().optional(),
  municipality: z.string().trim().optional(),
  address: z.string().trim().optional(),
  sede: z.string().trim().optional().or(z.literal("")),
  phonePrimary: z.string().trim().optional(),
  phoneAlt: z.string().trim().optional(),
  email: z.string().email("Correo invalido").trim().optional().or(z.literal("")),
  guardians: z.array(guardianSchema).default([]),
});

export const updateStudentSchema = createStudentSchema.partial();

export const listStudentsQuery = z.object({
  search: z.string().trim().optional(),
  status: z.enum(STATUS).optional(),
  sede: z.string().trim().optional(),
  // Año de inscripcion (ciclo escolar)
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  archived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const changeStatusSchema = z.object({
  status: z.enum(STATUS),
  reason: z.string().trim().optional(),
});

export const addDocumentSchema = z.object({
  type: z.enum(DOC_TYPES),
  fileName: z.string().min(1),
  fileUrl: z.string().url("URL de archivo invalida"),
  fileKey: z.string().optional(),
});

export const mergeStudentsSchema = z.object({
  keepId: z.string().min(1, "Falta el expediente a conservar"),
  dupId: z.string().min(1, "Falta el expediente duplicado"),
});

export const studentIdParam = z.object({ id: z.string().min(1) });
export const docParams = z.object({
  id: z.string().min(1),
  docId: z.string().min(1),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuery>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type AddDocumentInput = z.infer<typeof addDocumentSchema>;
