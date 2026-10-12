import { z } from "zod";
import { parseTaxId } from "../../lib/nit.js";

// NIT / CUI / CF del receptor. Vacío = CF.
export const receiverTaxIdSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => parseTaxId(v) !== null, {
    message: "NIT o CUI inválido (revisa el dígito verificador). Usa CF para consumidor final.",
  });

export const issueReceiptSchema = z.object({
  receiverTaxId: receiverTaxIdSchema.optional(),
  receiverName: z.string().trim().min(2).max(200).optional(),
  receiverEmail: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  // Descripción de la línea del recibo (por defecto, el concepto del pago)
  description: z.string().trim().min(2).max(250).optional(),
});

export const voidReceiptSchema = z.object({
  reason: z.string().trim().min(3, "Indica el motivo de la anulación").max(250),
});

export const listReceiptsQuery = z.object({
  status: z.enum(["PENDING", "CERTIFIED", "VOIDED", "ERROR"]).optional(),
  studentId: z.string().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const establishmentSchema = z.object({
  id: z.number().int().optional(),
  code: z.string().trim().min(1).max(10),
  commercialName: z.string().trim().min(2).max(200),
  sede: z.string().trim().max(60).nullable().default(null),
  address: z.string().trim().min(3).max(200),
  postalCode: z.string().trim().min(1).max(10),
  municipality: z.string().trim().min(2).max(80),
  department: z.string().trim().min(2).max(80),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const felConfigSchema = z.object({
  enabled: z.boolean(),
  autoIssue: z.boolean(),
  sendEmail: z.boolean(),
  issuer: z.object({
    nit: z.string().trim().min(2).max(15),
    name: z.string().trim().min(2).max(200),
    commercialName: z.string().trim().min(2).max(200),
    taxAffiliation: z.enum(["GEN", "PEQ", "EXE"]),
    email: z.string().trim().email().or(z.literal("")),
  }),
  establishments: z
    .array(establishmentSchema)
    .min(1, "Agrega al menos un establecimiento")
    .refine((list) => new Set(list.map((e) => e.code)).size === list.length, {
      message: "Hay códigos de establecimiento repetidos",
    })
    .refine((list) => list.some((e) => e.isActive), {
      message: "Debe quedar al menos un establecimiento activo",
    }),
  phrases: z
    .array(
      z.object({
        phraseType: z.coerce.number().int().min(1).max(99),
        scenarioCode: z.coerce.number().int().min(1).max(99),
        description: z.string().trim().max(255).nullish(),
        isActive: z.boolean().default(true),
      })
    )
    .min(1, "Agrega al menos una frase SAT")
    .refine((list) => new Set(list.map((p) => `${p.phraseType}-${p.scenarioCode}`)).size === list.length, {
      message: "Hay frases repetidas (mismo tipo y escenario)",
    })
    .refine((list) => list.some((p) => p.isActive), {
      message: "Debe quedar al menos una frase activa",
    }),
});

export const idParam = z.object({ id: z.string().min(1) });
export const paymentIdParam = z.object({ paymentId: z.string().min(1) });

export type IssueReceiptInput = z.infer<typeof issueReceiptSchema>;
export type VoidReceiptInput = z.infer<typeof voidReceiptSchema>;
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuery>;
export type FelConfigInput = z.infer<typeof felConfigSchema>;
