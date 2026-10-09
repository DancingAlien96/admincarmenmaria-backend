import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import { getAsistente, preguntar, nuevaConversacion, usoAsistente } from "./asistente.service.js";

// Asistente de IA del portal del estudiante
export const asistenteRouter = Router();
asistenteRouter.use(requireAuth);

asistenteRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getAsistente(req.user!.id));
  })
);

asistenteRouter.post(
  "/preguntar",
  validate({ body: z.object({ pregunta: z.string().max(2000) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await preguntar(req.user!.id, req.body.pregunta));
  })
);

asistenteRouter.post(
  "/nueva",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await nuevaConversacion(req.user!.id));
  })
);

// Panel: cuánto se está usando
asistenteRouter.get(
  "/uso",
  requireSection("REMINDERS", "READER"),
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await usoAsistente());
  })
);
