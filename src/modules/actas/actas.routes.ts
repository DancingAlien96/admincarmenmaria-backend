import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createActaSchema,
  updateActaSchema,
  listActasQuery,
  actaIdParam,
  sendActaSchema,
} from "./actas.schemas.js";
import {
  listController,
  getController,
  createController,
  updateController,
  deleteController,
  pdfController,
  sendController,
} from "./actas.controller.js";

export const actasRouter = Router();

const canRead = requireSection("ACTAS", "READER");
const canEdit = requireSection("ACTAS", "EDITOR");

actasRouter.use(requireAuth);

actasRouter.get(
  "/",
  canRead,
  validate({ query: listActasQuery }),
  asyncHandler(listController)
);
actasRouter.post(
  "/",
  canEdit,
  validate({ body: createActaSchema }),
  asyncHandler(createController)
);
actasRouter.get(
  "/:id",
  canRead,
  validate({ params: actaIdParam }),
  asyncHandler(getController)
);
actasRouter.get(
  "/:id/pdf",
  canRead,
  validate({ params: actaIdParam }),
  asyncHandler(pdfController)
);
actasRouter.post(
  "/:id/send",
  canEdit,
  validate({ params: actaIdParam, body: sendActaSchema }),
  asyncHandler(sendController)
);
actasRouter.patch(
  "/:id",
  canEdit,
  validate({ params: actaIdParam, body: updateActaSchema }),
  asyncHandler(updateController)
);
actasRouter.delete(
  "/:id",
  canEdit,
  validate({ params: actaIdParam }),
  asyncHandler(deleteController)
);
