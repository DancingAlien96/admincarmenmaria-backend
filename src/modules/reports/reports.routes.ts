import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import { reportQuery } from "./reports.schemas.js";
import { reportController } from "./reports.controller.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

// Reportes administrativos/financieros: permiso de Dashboard.
reportsRouter.get(
  "/",
  requireSection("DASHBOARD", "READER"),
  validate({ query: reportQuery }),
  asyncHandler(reportController)
);
