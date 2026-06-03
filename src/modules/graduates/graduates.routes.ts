import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createGraduateSchema,
  updateGraduateSchema,
  listGraduatesQuery,
  letterSchema,
  graduateIdParam,
} from "./graduates.schemas.js";
import {
  listController,
  getController,
  createController,
  updateController,
  addLetterController,
  constanciaController,
  recommendationController,
} from "./graduates.controller.js";

export const graduatesRouter = Router();

const canRead = requireSection("DIPLOMAS", "READER");
const canEdit = requireSection("DIPLOMAS", "EDITOR");

graduatesRouter.use(requireAuth);

graduatesRouter.get(
  "/",
  canRead,
  validate({ query: listGraduatesQuery }),
  asyncHandler(listController)
);
graduatesRouter.post(
  "/",
  canEdit,
  validate({ body: createGraduateSchema }),
  asyncHandler(createController)
);
graduatesRouter.get(
  "/:id",
  canRead,
  validate({ params: graduateIdParam }),
  asyncHandler(getController)
);
graduatesRouter.patch(
  "/:id",
  canEdit,
  validate({ params: graduateIdParam, body: updateGraduateSchema }),
  asyncHandler(updateController)
);
graduatesRouter.post(
  "/:id/letters",
  canEdit,
  validate({ params: graduateIdParam, body: letterSchema }),
  asyncHandler(addLetterController)
);
graduatesRouter.get(
  "/:id/constancia",
  canRead,
  validate({ params: graduateIdParam }),
  asyncHandler(constanciaController)
);
graduatesRouter.get(
  "/:id/recommendation",
  canRead,
  validate({ params: graduateIdParam }),
  asyncHandler(recommendationController)
);
