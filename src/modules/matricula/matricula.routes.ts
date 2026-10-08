import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin, requireSection } from "../../middleware/authorize.js";
import {
  getTemplate,
  setTemplate,
  getMatricula,
  reviewMatricula,
  countPendientes,
} from "./matricula.service.js";

// Matrícula (panel): plantilla del formulario y revisión por expediente
export const matriculaRouter = Router();

const canRead = requireSection("STUDENTS", "READER");
const canEdit = requireSection("STUDENTS", "EDITOR");

const templateSchema = z.object({
  url: z.string().url(),
  key: z.string().min(1),
  name: z.string().trim().min(1).max(200),
});
const reviewSchema = z.object({
  status: z.enum(["APROBADA", "RECHAZADA"]),
  note: z.string().trim().max(1000).optional(),
});
const idParam = z.object({ id: z.string().min(1) });
const studentParam = z.object({ studentId: z.string().min(1) });

matriculaRouter.use(requireAuth);

matriculaRouter.get(
  "/template",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ template: await getTemplate() });
  })
);
matriculaRouter.put(
  "/template",
  requireAdmin,
  validate({ body: templateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ template: await setTemplate(req.body) });
  })
);
matriculaRouter.delete(
  "/template",
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ template: await setTemplate(null) });
  })
);

matriculaRouter.get(
  "/pendientes",
  canRead,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ pendientes: await countPendientes() });
  })
);

matriculaRouter.get(
  "/student/:studentId",
  canRead,
  validate({ params: studentParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getMatricula(req.params.studentId));
  })
);

matriculaRouter.post(
  "/:id/review",
  canEdit,
  validate({ params: idParam, body: reviewSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ matricula: await reviewMatricula(req.params.id, req.body, req.user?.id) });
  })
);
