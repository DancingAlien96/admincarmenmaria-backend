import { z } from "zod";
import { parseTaxId } from "./nit.js";

// Datos de facturación del alumno para los recibos electrónicos (FEL).
// Los usan el expediente (panel), la inscripción y el portal del alumno.

// NIT (con dígito verificador) o CUI/DPI (13 dígitos). Vacío o "CF" = consumidor
// final, que se guarda como vacío. Se guarda ya normalizado (sin guiones).
export const taxIdField = z
  .string()
  .trim()
  .max(20)
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || parseTaxId(v) !== null, {
    message: "NIT o DPI inválido (revisa el dígito verificador del NIT o que el DPI tenga 13 dígitos)",
  })
  .transform((v) => {
    if (!v) return v;
    const p = parseTaxId(v)!;
    return p.tipo === "CF" ? "" : p.id;
  });

export const billingFields = {
  taxId: taxIdField,
  // Titular del NIT/DPI (p. ej. el padre o la madre). Vacío = nombre del alumno.
  billingName: z.string().trim().max(200).optional().or(z.literal("")),
  billingAddress: z.string().trim().max(190).optional().or(z.literal("")),
  billingEmail: z.string().trim().email("Correo de facturación inválido").max(190).optional().or(z.literal("")),
};

export const billingSchema = z.object(billingFields);
export type BillingInput = z.infer<typeof billingSchema>;

// Valores para guardar: vacío -> null; undefined -> sin cambio.
export function billingData(input: Partial<BillingInput>) {
  const v = (x: string | undefined) => (x === undefined ? undefined : x.trim() ? x.trim() : null);
  return {
    taxId: v(input.taxId),
    billingName: v(input.billingName),
    billingAddress: v(input.billingAddress),
    billingEmail: v(input.billingEmail),
  };
}

export const BILLING_SELECT = {
  taxId: true,
  billingName: true,
  billingAddress: true,
  billingEmail: true,
} as const;
