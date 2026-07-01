import { z } from "zod";
import { REPORT_TYPES } from "./reports.service.js";

export const reportQuery = z.object({
  type: z.enum(REPORT_TYPES),
  format: z.enum(["json", "pdf", "xlsx"]).default("json"),
  from: z.string().optional(),
  to: z.string().optional(),
  sede: z.string().trim().optional(),
  status: z.enum(["ACTIVO", "EGRESADO", "BAJA"]).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type ReportQuery = z.infer<typeof reportQuery>;
