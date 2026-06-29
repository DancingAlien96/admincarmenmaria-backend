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
  createTemplateSchema,
  updateTemplateSchema,
  templateIdParam,
} from "./actas.schemas.js";
import {
  listController,
  getController,
  createController,
  updateController,
  deleteController,
  pdfController,
  previewController,
  sendController,
  listTemplatesController,
  getTemplateController,
  createTemplateController,
  updateTemplateController,
  deleteTemplateController,
} from "./actas.controller.js";

export const actasRouter = Router();

const canRead = requireSection("ACTAS", "READER");
const canEdit = requireSection("ACTAS", "EDITOR");

actasRouter.use(requireAuth);

// --- Plantillas (rutas fijas antes de "/:id") ---
actasRouter.get("/templates", canRead, asyncHandler(listTemplatesController));
actasRouter.post(
  "/templates",
  canEdit,
  validate({ body: createTemplateSchema }),
  asyncHandler(createTemplateController)
);
actasRouter.get(
  "/templates/:id",
  canRead,
  validate({ params: templateIdParam }),
  asyncHandler(getTemplateController)
);
actasRouter.patch(
  "/templates/:id",
  canEdit,
  validate({ params: templateIdParam, body: updateTemplateSchema }),
  asyncHandler(updateTemplateController)
);
actasRouter.delete(
  "/templates/:id",
  canEdit,
  validate({ params: templateIdParam }),
  asyncHandler(deleteTemplateController)
);

// Vista previa del PDF sin guardar
actasRouter.post("/preview", canRead, asyncHandler(previewController));

// --- Actas ---
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
