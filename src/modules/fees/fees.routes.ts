import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createFeeSchema,
  updateFeeSchema,
  feeIdParam,
} from "./fees.schemas.js";
import {
  listFeesController,
  createFeeController,
  updateFeeController,
} from "./fees.controller.js";

export const feesRouter = Router();

// Las cuotas pertenecen a la seccion PAYMENTS
const canRead = requireSection("PAYMENTS", "READER");
const canEdit = requireSection("PAYMENTS", "EDITOR");

feesRouter.use(requireAuth);

feesRouter.get("/", canRead, asyncHandler(listFeesController));
feesRouter.post(
  "/",
  canEdit,
  validate({ body: createFeeSchema }),
  asyncHandler(createFeeController)
);
feesRouter.patch(
  "/:id",
  canEdit,
  validate({ params: feeIdParam, body: updateFeeSchema }),
  asyncHandler(updateFeeController)
);
