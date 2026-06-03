import { z } from "zod";

const METHODS = ["EFECTIVO", "TRANSFERENCIA", "DEPOSITO", "TARJETA"] as const;
const STATUS = ["ACTIVO", "ANULADO"] as const;
const SOURCES = ["MANUAL", "WOOCOMMERCE"] as const;

export const createPaymentSchema = z.object({
  studentId: z.string().min(1, "Estudiante requerido"),
  feeTypeId: z.string().optional().nullable(),
  chargeId: z.string().optional().nullable(),
  concept: z.string().min(2, "Concepto requerido").trim(),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  discount: z.coerce.number().nonnegative().default(0),
  method: z.enum(METHODS),
  paidAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
  receiptUrl: z.string().url().optional().or(z.literal("")),
  receiptKey: z.string().optional(),
});

export const annulPaymentSchema = z.object({
  reason: z.string().min(3, "Indica el motivo de la anulacion").trim(),
});

// Vincular un pago de WooCommerce a un estudiante
export const linkPaymentSchema = z.object({
  studentId: z.string().min(1),
});

export const listPaymentsQuery = z.object({
  studentId: z.string().optional(),
  status: z.enum(STATUS).optional(),
  source: z.enum(SOURCES).optional(),
  method: z.enum(METHODS).optional(),
  unlinked: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const paymentIdParam = z.object({ id: z.string().min(1) });

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type AnnulPaymentInput = z.infer<typeof annulPaymentSchema>;
export type LinkPaymentInput = z.infer<typeof linkPaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuery>;
