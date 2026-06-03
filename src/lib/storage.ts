import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { env } from "../config/env.js";

// Carpeta absoluta donde se guardan los archivos subidos.
export const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);

// Asegura que exista la carpeta de subidas.
export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"]);

function safeExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  // Solo permitimos un conjunto conocido; lo demas se guarda sin extension especial
  return ext.replace(/[^a-z0-9.]/g, "");
}

export interface StoredFile {
  key: string; // nombre del archivo en disco (lo guardamos en la BD)
  url: string; // URL publica para descargar/ver
  name: string; // nombre original
  size: number; // bytes finales
}

// Guarda un archivo en disco. Si es imagen, la optimiza/redimensiona.
export async function storeFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string
): Promise<StoredFile> {
  await ensureUploadDir();

  const ext = safeExt(originalName);
  const isImage = mimetype.startsWith("image/") || IMAGE_EXT.has(ext);

  // Nombre unico e impredecible (evita colisiones y enumeracion)
  const id = crypto.randomBytes(16).toString("hex");

  let outBuffer = buffer;
  let key: string;

  if (isImage && mimetype !== "image/gif") {
    // Optimiza: limita a 2000px de ancho y recomprime como JPEG de calidad 80.
    // Reduce mucho el peso de fotos de celular sin perder legibilidad.
    outBuffer = await sharp(buffer)
      .rotate() // respeta la orientacion EXIF
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    key = `${id}.jpg`;
  } else {
    // PDF u otros: se guardan tal cual, conservando su extension.
    key = ext ? `${id}${ext}` : id;
  }

  const dest = path.join(UPLOAD_ROOT, key);
  await fs.writeFile(dest, outBuffer);

  return {
    key,
    url: `${env.PUBLIC_API_URL}/uploads/${key}`,
    name: originalName,
    size: outBuffer.length,
  };
}

// Borra un archivo del disco por su key. No falla si ya no existe.
export async function deleteFile(key: string | null | undefined): Promise<void> {
  if (!key) return;
  // Seguridad: solo el nombre base, nunca rutas relativas
  const safeKey = path.basename(key);
  const target = path.join(UPLOAD_ROOT, safeKey);
  try {
    await fs.unlink(target);
  } catch (err) {
    // ENOENT (no existe) se ignora; otros errores se registran
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") {
      console.error(`[storage] no se pudo borrar ${safeKey}:`, e.message);
    }
  }
}
