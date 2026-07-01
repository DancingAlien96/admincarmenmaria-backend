import { z } from "zod";

export const createSignatorySchema = z.object({
  name: z.string().min(3, "Nombre requerido").trim(),
  role: z.string().min(2, "Cargo requerido").trim(),
  sede: z.string().trim().optional().or(z.literal("")),
});

export const updateSignatorySchema = z.object({
  name: z.string().min(3).trim().optional(),
  role: z.string().min(2).trim().optional(),
  sede: z.string().trim().optional().or(z.literal("")),
  // En multipart llega como texto "true"/"false".
  active: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) => (typeof v === "string" ? v === "true" : v)),
});

export const signatoryIdParam = z.object({ id: z.string().min(1) });

export type CreateSignatoryInput = z.infer<typeof createSignatorySchema>;
export type UpdateSignatoryInput = z.infer<typeof updateSignatorySchema>;
