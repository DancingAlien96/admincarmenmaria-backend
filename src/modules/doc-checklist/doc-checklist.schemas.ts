import { z } from "zod";

export const createRequirementSchema = z.object({
  name: z.string().min(2, "Nombre del documento requerido").trim(),
});

export const updateRequirementSchema = z.object({
  name: z.string().min(2).trim().optional(),
  order: z.coerce.number().int().optional(),
  active: z.boolean().optional(),
});

export const setDocStatusSchema = z.object({
  delivered: z.boolean(),
  notes: z.string().trim().optional().nullable(),
});

export const requirementIdParam = z.object({ id: z.string().min(1) });
export const studentReqParams = z.object({
  studentId: z.string().min(1),
  requirementId: z.string().min(1),
});
export const studentIdParam = z.object({ studentId: z.string().min(1) });

export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;
export type SetDocStatusInput = z.infer<typeof setDocStatusSchema>;
