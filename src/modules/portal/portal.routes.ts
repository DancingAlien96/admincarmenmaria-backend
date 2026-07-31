import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { getDashboardForUser } from "./portal.service.js";

export const portalRouter = Router();

portalRouter.use(requireAuth);

// Dashboard del alumno logueado.
portalRouter.get(
  "/dashboard",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getDashboardForUser(req.user!.id));
  })
);
