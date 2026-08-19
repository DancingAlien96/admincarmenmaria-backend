import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin } from "../../middleware/authorize.js";
import { badRequest } from "../../lib/http-error.js";
import { storeFile } from "../../lib/storage.js";
import { env } from "../../config/env.js";
import { createInviteSchema, registerSchema } from "./invites.schemas.js";
import {
  createInvite,
  getInvitePublic,
  registerFromInvite,
  assertInviteValid,
} from "./invites.service.js";

export const invitesRouter = Router();

// Subida de la foto del estudiante durante la inscripción (público, pero
// protegido por el token del link). Solo imágenes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
});
const ALLOWED_IMG = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

// Generar invitación (solo administrador).
invitesRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  validate({ body: createInviteSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invite = await createInvite(req.body, req.user?.id);
    res.status(201).json({ token: invite.token });
  })
);

// Ver datos de la invitación (público, para el formulario).
invitesRouter.get(
  "/:token",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getInvitePublic(req.params.token));
  })
);

// Subir la foto del estudiante (público, protegido por el token).
invitesRouter.post(
  "/:token/photo",
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    await assertInviteValid(req.params.token);
    if (!req.file) throw badRequest("No se recibió ninguna foto");
    if (!ALLOWED_IMG.has(req.file.mimetype)) {
      throw badRequest("La foto debe ser una imagen (JPG o PNG)");
    }
    const stored = await storeFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    res.status(201).json(stored);
  })
);

// Registrar/activar con la invitación (público).
invitesRouter.post(
  "/:token/register",
  validate({ body: registerSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await registerFromInvite(req.params.token, req.body));
  })
);
