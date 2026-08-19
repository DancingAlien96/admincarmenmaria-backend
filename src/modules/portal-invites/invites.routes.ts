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
// Los teléfonos suben en formatos muy variados (HEIC/HEIF de iPhone, webp,
// etc.). Aceptamos cualquier imagen y el servidor la convierte a JPEG liviano
// (sharp soporta HEIF de entrada). Algunos móviles mandan mimetype vacío u
// "octet-stream", por eso también se valida por extensión.
const IMG_EXT = /\.(jpe?g|png|webp|heic|heif|avif|bmp|tiff?|gif)$/i;
function looksLikeImage(mimetype?: string, name?: string) {
  return (mimetype?.startsWith("image/") ?? false) || IMG_EXT.test(name ?? "");
}

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
    if (!looksLikeImage(req.file.mimetype, req.file.originalname)) {
      throw badRequest("El archivo debe ser una imagen");
    }
    // storeFile convierte cualquier imagen (incluido HEIC de iPhone) a JPEG
    // optimizado. Si el formato no se pudo decodificar, error amable.
    let stored;
    try {
      stored = await storeFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
    } catch {
      throw badRequest(
        "No se pudo procesar la foto. Intenta con otra imagen (JPG o PNG)."
      );
    }
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
