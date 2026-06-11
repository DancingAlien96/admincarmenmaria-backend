import { z } from "zod";

export const createInauguracionSchema = z.object({
  actaNumber: z.string().min(1, "Número de acta requerido").trim(),
  folios: z.string().trim().optional().or(z.literal("")),
  promocion: z.string().min(1, "Promoción requerida").trim(),
  cohorte: z.coerce.number().int().min(2000).max(2100),
  actoDate: z.string().min(1, "Fecha del acto requerida"),
  closeDate: z.string().min(1, "Fecha de cierre requerida"),
  city: z.string().trim().default("Chiquimula"),
  department: z.string().trim().default("Chiquimula"),
  directora: z.string().min(1, "Directora requerida").trim(),
  docente: z.string().min(1, "Docente requerido").trim(),
  secretario: z.string().min(1, "Secretario requerido").trim(),
  notes: z.string().trim().optional().or(z.literal("")),
  // Lista de nombres (snapshot). Si no se envia, el service la arma del año.
  students: z.array(z.string()).optional(),
});

export const listInauguracionQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const inauguracionIdParam = z.object({ id: z.string().min(1) });

export type CreateInauguracionInput = z.infer<typeof createInauguracionSchema>;
export type ListInauguracionQuery = z.infer<typeof listInauguracionQuery>;
