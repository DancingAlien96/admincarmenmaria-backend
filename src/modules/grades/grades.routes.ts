import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  requireAdminOrDocente,
  requireSection,
} from "../../middleware/authorize.js";
import { createGrade, deleteGrade, getStudentFases } from "./grades.service.js";

export const gradesRouter = Router();

const canRead = requireSection("STUDENTS", "READER");

const createGradeSchema = z.object({
  studentId: z.string().min(1),
  fase: z.coerce.number().int().min(1).max(3),
  category: z.enum([
    "TAREA",
    "PRIMER_PARCIAL",
    "SEGUNDO_PARCIAL",
    "EXAMEN_FINAL",
    "RECUPERACION",
  ]),
  name: z.string().min(1, "Nombre requerido").trim(),
  score: z.coerce.number().min(0),
  maxScore: z.coerce.number().positive().optional(),
  date: z.string().optional().nullable(),
});

const idParam = z.object({ id: z.string().min(1) });
const studentParam = z.object({ studentId: z.string().min(1) });

gradesRouter.use(requireAuth);

// Fases + calificaciones de un estudiante (lectura del personal).
gradesRouter.get(
  "/student/:studentId",
  canRead,
  validate({ params: studentParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getStudentFases(req.params.studentId));
  })
);

// Ingresar / borrar calificaciones (admin o docente).
gradesRouter.post(
  "/",
  requireAdminOrDocente,
  validate({ body: createGradeSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const grade = await createGrade(req.body, req.user?.id);
    res.status(201).json({ grade });
  })
);

gradesRouter.delete(
  "/:id",
  requireAdminOrDocente,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await deleteGrade(req.params.id));
  })
);
