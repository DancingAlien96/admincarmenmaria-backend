import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin } from "../../middleware/authorize.js";
import { createInviteSchema, registerSchema } from "./invites.schemas.js";
import {
  createInvite,
  getInvitePublic,
  registerFromInvite,
} from "./invites.service.js";

export const invitesRouter = Router();

// Generar invitación (solo administrador).
invitesRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  validate({ body: createInviteSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const invite = await createInvite(req.body, req.user?.id);
    res.status(201).json({ token: invite.token });
  })
);

// Ver datos de la invitación (público, para el formulario).
invitesRouter.get(
  "/:token",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getInvitePublic(req.params.token));
  })
);

// Registrar/activar con la invitación (público).
invitesRouter.post(
  "/:token/register",
  validate({ body: registerSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await registerFromInvite(req.params.token, req.body));
  })
);
