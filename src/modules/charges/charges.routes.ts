import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createChargeSchema,
  bulkChargeSchema,
  annulChargeSchema,
  listChargesQuery,
  chargeIdParam,
  cuotaPlanSchema,
} from "./charges.schemas.js";
import {
  listController,
  createController,
  bulkController,
  annulController,
  accountController,
  planController,
} from "./charges.controller.js";

export const chargesRouter = Router();

// Los cargos pertenecen al Control de Pagos
const canRead = requireSection("PAYMENTS", "READER");
const canEdit = requireSection("PAYMENTS", "EDITOR");

chargesRouter.use(requireAuth);

chargesRouter.get(
  "/",
  canRead,
  validate({ query: listChargesQuery }),
  asyncHandler(listController)
);
chargesRouter.post(
  "/",
  canEdit,
  validate({ body: createChargeSchema }),
  asyncHandler(createController)
);
chargesRouter.post(
  "/bulk",
  canEdit,
  validate({ body: bulkChargeSchema }),
  asyncHandler(bulkController)
);
chargesRouter.get(
  "/student/:studentId",
  canRead,
  asyncHandler(accountController)
);
// Genera el plan de cuotas estándar para un estudiante
chargesRouter.post(
  "/student/:studentId/plan",
  canEdit,
  validate({ body: cuotaPlanSchema }),
  asyncHandler(planController)
);
chargesRouter.post(
  "/:id/annul",
  canEdit,
  validate({ params: chargeIdParam, body: annulChargeSchema }),
  asyncHandler(annulController)
);
