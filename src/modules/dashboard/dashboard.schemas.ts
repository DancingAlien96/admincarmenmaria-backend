import { z } from "zod";

// Periodo del dashboard. Por defecto el mes en curso.
export const dashboardQuery = z.object({
  // YYYY-MM-DD. Si no se da, se usa el mes actual.
  from: z.string().optional(),
  to: z.string().optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuery>;
