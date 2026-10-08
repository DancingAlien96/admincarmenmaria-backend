import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin } from "../../middleware/authorize.js";
import { notFound } from "../../lib/http-error.js";
import { deleteFile } from "../../lib/storage.js";
import { prisma } from "../../lib/prisma.js";

export const faseContentRouter = Router();

const createSchema = z.object({
  fase: z.coerce.number().int().min(1).max(3),
  kind: z.enum(["TAREA", "ACTIVIDAD", "EXAMEN", "MATERIAL"]),
  title: z.string().min(2, "Título requerido").trim(),
  description: z.string().trim().optional().nullable(),
  date: z.string().optional().nullable(),
  meta: z.string().trim().optional().nullable(),
  fileUrl: z.string().url().optional().or(z.literal("")).nullable(),
  fileKey: z.string().optional().nullable(),
  sizeLabel: z.string().optional().nullable(),
});
const idParam = z.object({ id: z.string().min(1) });

faseContentRouter.use(requireAuth);

// Listado (lo ven alumnos, docentes y admin). Opcional ?fase=1
faseContentRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const fase = req.query.fase ? Number(req.query.fase) : undefined;
    const items = await prisma.faseItem.findMany({
      where: { active: true, ...(fase ? { fase } : {}) },
      orderBy: [{ fase: "asc" }, { createdAt: "asc" }],
    });
    res.json({ items });
  })
);

// Crear (solo administrador)
faseContentRouter.post(
  "/",
  requireAdmin,
  validate({ body: createSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const b = req.body;
    const item = await prisma.faseItem.create({
      data: {
        fase: b.fase,
        kind: b.kind,
        title: b.title,
        description: b.description || null,
        date: b.date ? new Date(b.date) : null,
        meta: b.meta || null,
        fileUrl: b.fileUrl || null,
        fileKey: b.fileKey || null,
        sizeLabel: b.sizeLabel || null,
        createdById: req.user?.id,
      },
    });
    res.status(201).json({ item });
  })
);

// Editar (solo administrador). Si llega un archivo nuevo (material), se
// reemplaza y se borra el anterior del disco.
const updateSchema = z.object({
  title: z.string().min(2, "Título requerido").trim().optional(),
  description: z.string().trim().optional().nullable(),
  date: z.string().optional().nullable(),
  meta: z.string().trim().optional().nullable(),
  fileUrl: z.string().url().optional().nullable(),
  fileKey: z.string().optional().nullable(),
  sizeLabel: z.string().optional().nullable(),
});

faseContentRouter.patch(
  "/:id",
  requireAdmin,
  validate({ params: idParam, body: updateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const prev = await prisma.faseItem.findUnique({ where: { id: req.params.id } });
    if (!prev) throw notFound("Elemento no encontrado");
    const b = req.body as z.infer<typeof updateSchema>;
    const nuevoArchivo = !!b.fileUrl;
    const item = await prisma.faseItem.update({
      where: { id: req.params.id },
      data: {
        title: b.title ?? undefined,
        description: b.description !== undefined ? b.description || null : undefined,
        date: b.date !== undefined ? (b.date ? new Date(b.date) : null) : undefined,
        meta: b.meta !== undefined ? b.meta || null : undefined,
        ...(nuevoArchivo
          ? {
              fileUrl: b.fileUrl,
              fileKey: b.fileKey || null,
              sizeLabel: b.sizeLabel || null,
            }
          : {}),
      },
    });
    if (nuevoArchivo && prev.fileKey && prev.fileKey !== b.fileKey) {
      await deleteFile(prev.fileKey);
    }
    res.json({ item });
  })
);

// Eliminar (solo administrador)
faseContentRouter.delete(
  "/:id",
  requireAdmin,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const item = await prisma.faseItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound("Elemento no encontrado");
    await prisma.faseItem.delete({ where: { id: req.params.id } });
    await deleteFile(item.fileKey);
    res.json({ ok: true });
  })
);
