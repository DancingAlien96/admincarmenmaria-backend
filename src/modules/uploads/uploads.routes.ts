import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/require-auth.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { badRequest } from "../../lib/http-error.js";
import { esImagen, storeFile } from "../../lib/storage.js";
import { env } from "../../config/env.js";

export const uploadsRouter = Router();

// Multer en memoria: recibimos el archivo en RAM y luego sharp lo procesa.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
});

// Tipos permitidos: PDF e imagenes (documentos, diplomas, comprobantes).
// Las fotos de celular (HEIC/HEIF, o sin tipo) se convierten a JPEG al guardar.
const esPdf = (mimetype: string, name: string) =>
  mimetype === "application/pdf" || /\.pdf$/i.test(name);

// POST /api/uploads  (campo "file") -> { url, key, name, size }
uploadsRouter.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No se recibio ningun archivo");
    const { buffer, originalname, mimetype } = req.file;
    if (!esPdf(mimetype, originalname) && !esImagen(buffer, originalname, mimetype)) {
      throw badRequest("Tipo de archivo no permitido (solo PDF o imágenes)");
    }
    let stored;
    try {
      stored = await storeFile(buffer, originalname, esPdf(mimetype, originalname) ? "application/pdf" : mimetype);
    } catch {
      throw badRequest("No se pudo leer la imagen. Intenta con otra foto o con un PDF.");
    }
    res.status(201).json(stored);
  })
);
