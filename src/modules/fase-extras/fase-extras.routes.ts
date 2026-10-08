import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin, requireAdminOrDocente } from "../../middleware/authorize.js";
import {
  listQuestions,
  createQuestion,
  deleteQuestion,
  encuestaResumen,
  retoResumen,
} from "./fase-extras.service.js";
import { getCriterios, setCriterios } from "../../lib/settings.js";

// Gestión del Reto de Comprensión y resultados de la encuesta (docente/admin)
export const faseExtrasRouter = Router();

const faseQuery = z.object({ fase: z.coerce.number().int().min(1).max(3) });
const questionSchema = z.object({
  fase: z.coerce.number().int().min(1).max(3),
  question: z.string().min(3, "Escribe la pregunta").trim(),
  options: z.array(z.string()).min(2).max(6),
  correctIndex: z.coerce.number().int().min(0),
});
const idParam = z.object({ id: z.string().min(1) });

faseExtrasRouter.use(requireAuth, requireAdminOrDocente);

// Criterios de aprobación (todas las fases): lo ve el personal, lo cambia el admin
const criteriosSchema = z.object({
  notaMinima: z.coerce.number().int().min(1).max(100),
  retoMinimo: z.coerce.number().int().min(1).max(100),
});
faseExtrasRouter.get(
  "/config",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getCriterios());
  })
);
faseExtrasRouter.put(
  "/config",
  requireAdmin,
  validate({ body: criteriosSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await setCriterios(req.body));
  })
);

faseExtrasRouter.get(
  "/quiz",
  validate({ query: faseQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ preguntas: await listQuestions(Number(req.query.fase)) });
  })
);

// Crear y borrar preguntas: solo el administrador (el docente consulta)
faseExtrasRouter.post(
  "/quiz",
  requireAdmin,
  validate({ body: questionSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json({ pregunta: await createQuestion(req.body, req.user?.id) });
  })
);

faseExtrasRouter.delete(
  "/quiz/:id",
  requireAdmin,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await deleteQuestion(req.params.id));
  })
);

faseExtrasRouter.get(
  "/quiz/resultados",
  validate({ query: faseQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await retoResumen(Number(req.query.fase)));
  })
);

faseExtrasRouter.get(
  "/encuesta/resumen",
  validate({ query: faseQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await encuestaResumen(Number(req.query.fase)));
  })
);
