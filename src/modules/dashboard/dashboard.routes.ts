import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import { dashboardQuery } from "./dashboard.schemas.js";
import {
  dashboardController,
  dashboardReportController,
  dashboardExcelController,
  overviewController,
} from "./dashboard.controller.js";

export const dashboardRouter = Router();

const canRead = requireSection("DASHBOARD", "READER");

dashboardRouter.use(requireAuth);

// Overview de inicio: cualquier usuario autenticado (no requiere seccion DASHBOARD)
dashboardRouter.get("/overview", asyncHandler(overviewController));

dashboardRouter.get(
  "/",
  canRead,
  validate({ query: dashboardQuery }),
  asyncHandler(dashboardController)
);
dashboardRouter.get(
  "/report",
  canRead,
  validate({ query: dashboardQuery }),
  asyncHandler(dashboardReportController)
);
dashboardRouter.get(
  "/report.xlsx",
  canRead,
  validate({ query: dashboardQuery }),
  asyncHandler(dashboardExcelController)
);
