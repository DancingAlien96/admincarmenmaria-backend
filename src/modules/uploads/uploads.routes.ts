import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/require-auth.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { badRequest } from "../../lib/http-error.js";
import { storeFile } from "../../lib/storage.js";
import { env } from "../../config/env.js";

export const uploadsRouter = Router();

// Multer en memoria: recibimos el archivo en RAM y luego sharp lo procesa.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
});

// Tipos permitidos: PDF e imagenes (documentos, diplomas, comprobantes).
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

// POST /api/uploads  (campo "file") -> { url, key, name, size }
uploadsRouter.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No se recibio ningun archivo");
    if (!ALLOWED.has(req.file.mimetype)) {
      throw badRequest("Tipo de archivo no permitido (solo PDF o imagenes)");
    }
    const stored = await storeFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    res.status(201).json(stored);
  })
);
