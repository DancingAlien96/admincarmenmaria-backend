import { z } from "zod";

const STATUS = ["PENDIENTE", "PAGADO", "ANULADO"] as const;

export const createChargeSchema = z.object({
  studentId: z.string().min(1, "Estudiante requerido"),
  feeTypeId: z.string().optional().nullable(),
  concept: z.string().min(2, "Concepto requerido").trim(),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  dueDate: z.string().min(1, "Fecha de vencimiento requerida"),
});

// Asignacion masiva: el mismo cargo a varios estudiantes
export const bulkChargeSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, "Selecciona al menos un estudiante"),
  feeTypeId: z.string().optional().nullable(),
  concept: z.string().min(2, "Concepto requerido").trim(),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  dueDate: z.string().min(1, "Fecha de vencimiento requerida"),
});

export const annulChargeSchema = z.object({
  reason: z.string().min(3, "Indica el motivo").trim(),
});

// Plan de cuotas estándar (Admisión + N mensualidades + Trámite)
export const cuotaPlanSchema = z.object({
  inscripcion: z.coerce.number().min(0).default(0),
  mensualidad: z.coerce.number().positive("La mensualidad debe ser mayor a 0"),
  numCuotas: z.coerce.number().int().min(1).max(36),
  tramite: z.coerce.number().min(0).default(0),
  startMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Mes de inicio inválido (AAAA-MM)"),
});

export const listChargesQuery = z.object({
  studentId: z.string().optional(),
  status: z.enum(STATUS).optional(),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const chargeIdParam = z.object({ id: z.string().min(1) });

export type CreateChargeInput = z.infer<typeof createChargeSchema>;
export type BulkChargeInput = z.infer<typeof bulkChargeSchema>;
export type AnnulChargeInput = z.infer<typeof annulChargeSchema>;
export type ListChargesQuery = z.infer<typeof listChargesQuery>;
export type CuotaPlanInput = z.infer<typeof cuotaPlanSchema>;
