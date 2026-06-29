import { z } from "zod";

const rowSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  value: z.string().trim().optional().nullable(),
});

const signerSchema = z.object({
  name: z.string().trim().min(1, "Nombre del firmante requerido"),
  role: z.string().trim().min(1, "Cargo del firmante requerido"),
});

export const createActaSchema = z.object({
  actaNumber: z.string().min(1, "No. de acta requerido").trim(),
  folios: z.string().trim().optional().or(z.literal("")),
  title: z.string().trim().optional().or(z.literal("")),
  actaDate: z.string().min(1, "Fecha requerida"),
  closeDate: z.string().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  department: z.string().trim().optional().or(z.literal("")),
  body: z.string().min(1, "El cuerpo del acta es requerido"),
  vars: z.record(z.string(), z.string()).optional(),
  columns: z.array(z.string()).optional(),
  rows: z.array(rowSchema).optional(),
  signers: z.array(signerSchema).optional(),
  notes: z.string().trim().optional().or(z.literal("")),
  templateId: z.string().optional().or(z.literal("")),
});

export const updateActaSchema = createActaSchema.partial();

export const listActasQuery = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const actaIdParam = z.object({ id: z.string().min(1) });

export const sendActaSchema = z.object({
  to: z.string().email("Correo invalido").optional(),
  cc: z.string().email("Correo CC invalido").optional(),
});

// --- Plantillas de acta ---
export const createTemplateSchema = z.object({
  name: z.string().min(1, "Nombre requerido").trim(),
  title: z.string().trim().optional().or(z.literal("")),
  body: z.string().min(1, "El cuerpo de la plantilla es requerido"),
  columns: z.array(z.string()).optional(),
  signers: z.array(signerSchema).optional(),
  vars: z.record(z.string(), z.string()).optional(),
  block: z.enum(["tabla", "lista"]).optional().or(z.literal("")),
});

export const updateTemplateSchema = createTemplateSchema.partial();
export const templateIdParam = z.object({ id: z.string().min(1) });

export type CreateActaInput = z.infer<typeof createActaSchema>;
export type UpdateActaInput = z.infer<typeof updateActaSchema>;
export type ListActasQuery = z.infer<typeof listActasQuery>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
