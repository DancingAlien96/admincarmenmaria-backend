import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin } from "../../middleware/authorize.js";
import { env } from "../../config/env.js";
import {
  createSignatorySchema,
  updateSignatorySchema,
  signatoryIdParam,
} from "./signatories.schemas.js";
import {
  listController,
  createController,
  updateController,
  deleteController,
} from "./signatories.controller.js";

export const signatoriesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
});

// Solo el administrador gestiona las firmas del personal.
signatoriesRouter.use(requireAuth, requireAdmin);

signatoriesRouter.get("/", asyncHandler(listController));
signatoriesRouter.post(
  "/",
  upload.single("file"),
  validate({ body: createSignatorySchema }),
  asyncHandler(createController)
);
signatoriesRouter.patch(
  "/:id",
  upload.single("file"),
  validate({ params: signatoryIdParam, body: updateSignatorySchema }),
  asyncHandler(updateController)
);
signatoriesRouter.delete(
  "/:id",
  validate({ params: signatoryIdParam }),
  asyncHandler(deleteController)
);
