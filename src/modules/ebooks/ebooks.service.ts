import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { deleteFile } from "../../lib/storage.js";

export interface CreateEbookInput {
  title: string;
  description?: string | null;
  author?: string | null;
  category?: string | null;
  fileUrl: string;
  fileKey?: string | null;
  coverUrl?: string | null;
  coverKey?: string | null;
  sizeLabel?: string | null;
  forAdmission?: boolean;
}

// forAdmission: true = solo material de admisión, false = solo biblioteca de
// alumnos, undefined = todo.
export function listEbooks(includeInactive = false, forAdmission?: boolean) {
  return prisma.ebook.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(forAdmission === undefined ? {} : { forAdmission }),
    },
    orderBy: { createdAt: "desc" },
  });
}

export interface UpdateEbookInput {
  title?: string;
  description?: string | null;
  author?: string | null;
  category?: string | null;
  // Portada nueva (ya subida) o removeCover para quitarla
  coverUrl?: string | null;
  coverKey?: string | null;
  removeCover?: boolean;
}

// Edita los datos de un material; al cambiar o quitar la portada se borra el
// archivo anterior del disco.
export async function updateEbook(id: string, input: UpdateEbookInput) {
  const eb = await prisma.ebook.findUnique({ where: { id } });
  if (!eb) throw notFound("Material no encontrado");
  const newCover = !!input.coverUrl;
  const updated = await prisma.ebook.update({
    where: { id },
    data: {
      title: input.title ?? undefined,
      description:
        input.description !== undefined ? input.description || null : undefined,
      author: input.author !== undefined ? input.author || null : undefined,
      category: input.category !== undefined ? input.category || null : undefined,
      ...(newCover
        ? { coverUrl: input.coverUrl, coverKey: input.coverKey || null }
        : input.removeCover
          ? { coverUrl: null, coverKey: null }
          : {}),
    },
  });
  if ((newCover || input.removeCover) && eb.coverKey) {
    await deleteFile(eb.coverKey);
  }
  return updated;
}

export async function setEbookAdmission(id: string, forAdmission: boolean) {
  const eb = await prisma.ebook.findUnique({ where: { id } });
  if (!eb) throw notFound("Material no encontrado");
  return prisma.ebook.update({ where: { id }, data: { forAdmission } });
}

export async function createEbook(input: CreateEbookInput, userId?: string) {
  return prisma.ebook.create({
    data: {
      title: input.title,
      description: input.description || null,
      author: input.author || null,
      category: input.category || null,
      fileUrl: input.fileUrl,
      fileKey: input.fileKey || null,
      coverUrl: input.coverUrl || null,
      coverKey: input.coverKey || null,
      sizeLabel: input.sizeLabel || null,
      forAdmission: input.forAdmission ?? false,
      createdById: userId,
    },
  });
}

export async function deleteEbook(id: string) {
  const eb = await prisma.ebook.findUnique({ where: { id } });
  if (!eb) throw notFound("Material no encontrado");
  await prisma.ebook.delete({ where: { id } });
  // Borra los archivos del disco (no falla si ya no existen).
  await deleteFile(eb.fileKey);
  await deleteFile(eb.coverKey);
  return { ok: true };
}
