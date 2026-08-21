import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  getDashboardForUser,
  changePassword,
  getCuotasForUser,
  getDocumentosForUser,
  getNotificacionesForUser,
} from "./portal.service.js";

export const portalRouter = Router();

portalRouter.use(requireAuth);

// Dashboard del alumno logueado.
portalRouter.get(
  "/dashboard",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getDashboardForUser(req.user!.id));
  })
);

// Línea de tiempo de cuotas del alumno.
portalRouter.get(
  "/cuotas",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getCuotasForUser(req.user!.id));
  })
);

// Checklist de documentación del alumno.
portalRouter.get(
  "/documentos",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getDocumentosForUser(req.user!.id));
  })
);

// Notificaciones del alumno (cuotas y documentos pendientes).
portalRouter.get(
  "/notificaciones",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getNotificacionesForUser(req.user!.id));
  })
);

// Cambiar la propia contraseña.
portalRouter.post(
  "/change-password",
  asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body ?? {};
    res.json(
      await changePassword(req.user!.id, currentPassword ?? "", newPassword ?? "")
    );
  })
);
