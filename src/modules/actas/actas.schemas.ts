import { z } from "zod";

const entrySchema = z.object({
  studentId: z.string().optional().nullable(),
  studentName: z.string().min(2, "Nombre requerido").trim(),
  score: z.coerce
    .number()
    .min(0, "El punteo no puede ser negativo")
    .max(100, "El punteo maximo es 100"),
});

export const createActaSchema = z.object({
  actaNumber: z.string().min(1, "No. de acta requerido").trim(),
  folios: z.string().trim().optional(),
  phase: z.string().min(2, "Fase requerida").trim(),
  actaDate: z.string().min(1, "Fecha requerida"),
  closeDate: z.string().optional().or(z.literal("")),
  directora: z.string().trim().optional().or(z.literal("")),
  secretario: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
  entries: z.array(entrySchema).min(1, "Agrega al menos un estudiante"),
});

export const updateActaSchema = createActaSchema.partial();

export const listActasQuery = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const actaIdParam = z.object({ id: z.string().min(1) });

// Envio del acta por correo. Si no se da "to", se usa SUPERVISOR_EMAIL del .env.
export const sendActaSchema = z.object({
  to: z.string().email("Correo invalido").optional(),
  cc: z.string().email("Correo CC invalido").optional(),
});

export type CreateActaInput = z.infer<typeof createActaSchema>;
export type UpdateActaInput = z.infer<typeof updateActaSchema>;
export type ListActasQuery = z.infer<typeof listActasQuery>;
