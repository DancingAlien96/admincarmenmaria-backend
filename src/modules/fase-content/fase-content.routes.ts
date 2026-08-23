import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdminOrDocente } from "../../middleware/authorize.js";
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

// Crear (docente o admin)
faseContentRouter.post(
  "/",
  requireAdminOrDocente,
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

// Eliminar (docente o admin)
faseContentRouter.delete(
  "/:id",
  requireAdminOrDocente,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const item = await prisma.faseItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw notFound("Elemento no encontrado");
    await prisma.faseItem.delete({ where: { id: req.params.id } });
    await deleteFile(item.fileKey);
    res.json({ ok: true });
  })
);
