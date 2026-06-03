import { z } from "zod";

const CATEGORIES = [
  "SALARIOS",
  "INSUMOS",
  "SERVICIOS",
  "MANTENIMIENTO",
  "ADMINISTRATIVOS",
  "IMPREVISTOS",
] as const;

export const createExpenseSchema = z.object({
  category: z.enum(CATEGORIES),
  concept: z.string().min(2, "Concepto requerido").trim(),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  spentAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : new Date())),
  notes: z.string().trim().optional(),
  receiptUrl: z.string().url().optional().or(z.literal("")),
  receiptKey: z.string().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const listExpensesQuery = z.object({
  category: z.enum(CATEGORIES).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const expenseIdParam = z.object({ id: z.string().min(1) });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuery>;
