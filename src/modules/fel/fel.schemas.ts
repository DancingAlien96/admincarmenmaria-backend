import { z } from "zod";
import { parseTaxId } from "../../lib/nit.js";

// NIT / CUI / CF del receptor. Vacío = CF.
export const receptorIdSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => parseTaxId(v) !== null, {
    message: "NIT o CUI inválido (revisa el dígito verificador). Usa CF para consumidor final.",
  });

export const emitirReciboSchema = z.object({
  receptorId: receptorIdSchema.optional(),
  receptorNombre: z.string().trim().min(2).max(200).optional(),
  receptorCorreo: z.string().trim().email("Correo inválido").optional().or(z.literal("")),
  // Descripción de la línea del recibo (por defecto, el concepto del pago)
  descripcion: z.string().trim().min(2).max(250).optional(),
});

export const anularReciboSchema = z.object({
  motivo: z.string().trim().min(3, "Indica el motivo de la anulación").max(250),
});

export const listRecibosQuery = z.object({
  estado: z.enum(["PENDIENTE", "CERTIFICADO", "ANULADO", "ERROR"]).optional(),
  studentId: z.string().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const establecimientoSchema = z.object({
  codigo: z.string().trim().min(1).max(10),
  nombre: z.string().trim().min(2).max(200),
  sede: z.string().trim().max(60).nullable().default(null),
  direccion: z.string().trim().min(3).max(200),
  codigoPostal: z.string().trim().min(1).max(10),
  municipio: z.string().trim().min(2).max(80),
  departamento: z.string().trim().min(2).max(80),
});

export const felConfigSchema = z.object({
  habilitado: z.boolean(),
  emitirAutomatico: z.boolean(),
  enviarCorreo: z.boolean(),
  emisor: z.object({
    nit: z.string().trim().min(2).max(15),
    nombre: z.string().trim().min(2).max(200),
    nombreComercial: z.string().trim().min(2).max(200),
    afiliacionIva: z.enum(["GEN", "PEQ", "EXE"]),
    correo: z.string().trim().email().or(z.literal("")),
  }),
  establecimientos: z.array(establecimientoSchema).min(1, "Agrega al menos un establecimiento"),
  frases: z
    .array(z.object({ tipo: z.coerce.number().int().min(1).max(99), escenario: z.coerce.number().int().min(1).max(99) }))
    .min(1, "Agrega al menos una frase SAT"),
});

export const idParam = z.object({ id: z.string().min(1) });
export const paymentIdParam = z.object({ paymentId: z.string().min(1) });

export type EmitirReciboInput = z.infer<typeof emitirReciboSchema>;
export type AnularReciboInput = z.infer<typeof anularReciboSchema>;
export type ListRecibosQuery = z.infer<typeof listRecibosQuery>;
export type FelConfigInput = z.infer<typeof felConfigSchema>;
