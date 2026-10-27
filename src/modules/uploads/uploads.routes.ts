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

// Materiales de clase (?tipo=material, solo personal): se acepta cualquier
// archivo (Word, PowerPoint, Excel, video, ZIP...) excepto los que podrían
// ejecutarse en el navegador o en la computadora de quien lo descargue.
const BLOQUEADOS =
  /\.(html?|xhtml|shtml|svgz?|xml|xsl|js|mjs|cjs|jsx|ts|php\d?|phtml|asp|aspx|jsp|cgi|pl|py|rb|sh|bash|ps1|psm1|bat|cmd|com|exe|msi|msp|scr|pif|cpl|dll|jar|vbs|vbe|wsf|wsh|hta|lnk|reg|apk|app|dmg)$/i;

// POST /api/uploads  (campo "file") -> { url, key, name, size }
uploadsRouter.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No se recibio ningun archivo");
    const { buffer, originalname, mimetype } = req.file;
    const material = req.query.tipo === "material" && req.user?.role !== "ESTUDIANTE";
    if (material) {
      if (BLOQUEADOS.test(originalname) || !/\.[a-z0-9]{1,8}$/i.test(originalname)) {
        throw badRequest(
          "Por seguridad no se permite ese tipo de archivo (páginas web, scripts o programas). Comprímelo en .zip si necesitas compartirlo."
        );
      }
    } else if (!esPdf(mimetype, originalname) && !esImagen(buffer, originalname, mimetype)) {
      throw badRequest("Tipo de archivo no permitido (solo PDF o imágenes)");
    }
    let stored;
    try {
      stored = await storeFile(buffer, originalname, esPdf(mimetype, originalname) ? "application/pdf" : mimetype);
    } catch {
      throw badRequest(
        material
          ? "No se pudo guardar el archivo. Intenta de nuevo."
          : "No se pudo leer la imagen. Intenta con otra foto o con un PDF."
      );
    }
    res.status(201).json(stored);
  })
);
