import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin } from "../../middleware/authorize.js";
import { badRequest } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import {
  listEbooks,
  createEbook,
  deleteEbook,
  setEbookAdmission,
} from "./ebooks.service.js";

export const ebooksRouter = Router();

const createEbookSchema = z.object({
  title: z.string().min(2, "El título es requerido").trim(),
  description: z.string().trim().optional().nullable(),
  author: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  fileUrl: z.string().url("Falta el archivo del material"),
  fileKey: z.string().optional().nullable(),
  coverUrl: z.string().url().optional().or(z.literal("")).nullable(),
  coverKey: z.string().optional().nullable(),
  sizeLabel: z.string().trim().optional().nullable(),
  forAdmission: z.boolean().optional(),
});

const admissionSchema = z.object({ forAdmission: z.boolean() });

const idParam = z.object({ id: z.string().min(1) });

ebooksRouter.use(requireAuth);

// Listado: el aspirante solo ve el material de admisión y el alumno admitido
// solo la biblioteca; el personal ve todo (admin incluye inactivos con ?all).
ebooksRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const all = req.query.all === "true" && req.user?.role === "ADMIN";
    let forAdmission: boolean | undefined;
    if (req.user?.role === "ESTUDIANTE") {
      const u = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { student: { select: { status: true } } },
      });
      const st = u?.student?.status;
      forAdmission = st === "ASPIRANTE" || st === "NO_ADMITIDO";
    }
    res.json({ ebooks: await listEbooks(all, forAdmission) });
  })
);

// Mover un material entre admisión (aspirantes) y la biblioteca de alumnos.
ebooksRouter.patch(
  "/:id/admission",
  requireAdmin,
  validate({ params: idParam, body: admissionSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      ebook: await setEbookAdmission(req.params.id, req.body.forAdmission),
    });
  })
);

// Alta y baja: solo administrador.
ebooksRouter.post(
  "/",
  requireAdmin,
  validate({ body: createEbookSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.body.fileUrl) throw badRequest("Sube el archivo del material");
    const ebook = await createEbook(req.body, req.user?.id);
    res.status(201).json({ ebook });
  })
);

ebooksRouter.delete(
  "/:id",
  requireAdmin,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await deleteEbook(req.params.id));
  })
);
