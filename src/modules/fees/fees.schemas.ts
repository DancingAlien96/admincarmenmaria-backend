import { z } from "zod";

const CATEGORIES = [
  "INSCRIPCION",
  "MENSUALIDAD",
  "MATERIALES",
  "REPOSICION_DIPLOMA",
  "OTROS",
] as const;

export const createFeeSchema = z.object({
  name: z.string().min(2, "Nombre requerido").trim(),
  category: z.enum(CATEGORIES),
  amount: z.coerce.number().nonnegative("El monto no puede ser negativo"),
  active: z.boolean().default(true),
});

export const updateFeeSchema = createFeeSchema.partial();

export const feeIdParam = z.object({ id: z.string().min(1) });

export type CreateFeeInput = z.infer<typeof createFeeSchema>;
export type UpdateFeeInput = z.infer<typeof updateFeeSchema>;
