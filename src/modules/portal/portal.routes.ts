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
  getFasesForUser,
  submitBoleta,
  startCardPayment,
  confirmCardPayment,
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

// Fases y calificaciones del alumno.
portalRouter.get(
  "/fases",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getFasesForUser(req.user!.id));
  })
);

// El alumno sube la boleta de una cuota (queda en revisión).
portalRouter.post(
  "/cuotas/:chargeId/boleta",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(
      await submitBoleta(req.user!.id, req.params.chargeId, req.body ?? {})
    );
  })
);

// El alumno inicia el pago con tarjeta (devuelve URL del checkout de Tilopay).
portalRouter.post(
  "/cuotas/:chargeId/pay-card",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await startCardPayment(req.user!.id, req.params.chargeId));
  })
);

// Confirma el retorno del checkout de Tilopay.
portalRouter.post(
  "/pagos/confirmar-tarjeta",
  asyncHandler(async (req: Request, res: Response) => {
    const b = req.body ?? {};
    res.json(
      await confirmCardPayment(req.user!.id, {
        order: String(b.order ?? ""),
        tpt: String(b.tpt ?? ""),
        code: String(b.code ?? ""),
        auth: String(b.auth ?? ""),
        orderHash: String(b.orderHash ?? ""),
      })
    );
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
