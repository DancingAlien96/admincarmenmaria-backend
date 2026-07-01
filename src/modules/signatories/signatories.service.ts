import { prisma } from "../../lib/prisma.js";
import { notFound, badRequest } from "../../lib/http-error.js";
import { storeSignature } from "../../lib/storage.js";
import type {
  CreateSignatoryInput,
  UpdateSignatoryInput,
} from "./signatories.schemas.js";

const clean = (v?: string | null) => (v && v.length > 0 ? v : null);

export async function listSignatories(includeInactive = false) {
  return prisma.signatory.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
  });
}

export async function createSignatory(
  input: CreateSignatoryInput,
  file?: Express.Multer.File
) {
  if (!file) throw badRequest("Debes subir la imagen de la firma");
  const stored = await storeSignature(file.buffer, file.originalname);
  return prisma.signatory.create({
    data: {
      name: input.name,
      role: input.role,
      sede: clean(input.sede),
      signatureKey: stored.key,
      signatureUrl: stored.url,
    },
  });
}

export async function updateSignatory(
  id: string,
  input: UpdateSignatoryInput,
  file?: Express.Multer.File
) {
  const existing = await prisma.signatory.findUnique({ where: { id } });
  if (!existing) throw notFound("Firma no encontrada");

  const data: Record<string, unknown> = {
    name: input.name,
    role: input.role,
    sede: input.sede !== undefined ? clean(input.sede) : undefined,
    active: input.active,
  };

  // Si suben una nueva imagen, se reemplaza (la anterior se borra: las actas
  // ya emitidas guardan su propia key, así que no se ven afectadas).
  if (file) {
    const stored = await storeSignature(file.buffer, file.originalname);
    data.signatureKey = stored.key;
    data.signatureUrl = stored.url;
  }

  return prisma.signatory.update({ where: { id }, data });
}

export async function deleteSignatory(id: string) {
  const existing = await prisma.signatory.findUnique({ where: { id } });
  if (!existing) throw notFound("Firma no encontrada");
  // Baja lógica: se desactiva (no se borra el archivo para no afectar actas
  // ya emitidas que lo referencian).
  await prisma.signatory.update({ where: { id }, data: { active: false } });
  return { ok: true };
}
