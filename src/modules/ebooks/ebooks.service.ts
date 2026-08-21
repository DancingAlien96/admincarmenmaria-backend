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
}

export function listEbooks(includeInactive = false) {
  return prisma.ebook.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { createdAt: "desc" },
  });
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
