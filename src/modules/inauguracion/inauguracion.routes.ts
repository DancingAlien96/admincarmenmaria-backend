import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createInauguracionSchema,
  listInauguracionQuery,
  inauguracionIdParam,
} from "./inauguracion.schemas.js";
import {
  listController,
  getController,
  cohortStudentsController,
  createController,
  deleteController,
  pdfController,
} from "./inauguracion.controller.js";

// Acta de inauguracion vive dentro de la seccion ACTAS
export const inauguracionRouter = Router();
const canRead = requireSection("ACTAS", "READER");
const canEdit = requireSection("ACTAS", "EDITOR");

inauguracionRouter.use(requireAuth);

inauguracionRouter.get(
  "/",
  canRead,
  validate({ query: listInauguracionQuery }),
  asyncHandler(listController)
);
// Alumnos de una cohorte (para previsualizar en el formulario)
inauguracionRouter.get("/cohort-students", canRead, asyncHandler(cohortStudentsController));
inauguracionRouter.post(
  "/",
  canEdit,
  validate({ body: createInauguracionSchema }),
  asyncHandler(createController)
);
inauguracionRouter.get(
  "/:id",
  canRead,
  validate({ params: inauguracionIdParam }),
  asyncHandler(getController)
);
inauguracionRouter.get(
  "/:id/pdf",
  canRead,
  validate({ params: inauguracionIdParam }),
  asyncHandler(pdfController)
);
inauguracionRouter.delete(
  "/:id",
  canEdit,
  validate({ params: inauguracionIdParam }),
  asyncHandler(deleteController)
);
