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
  getMeForUser,
  getActividadForUser,
  getComprobanteForUser,
  getRetoForUser,
  submitRetoForUser,
  getEncuestaForUser,
  rateEncuestaForUser,
  getMatriculaForUser,
  submitMatriculaForUser,
} from "./portal.service.js";
import { generateReceiptPDF, receiptFileName } from "../../lib/receipt-pdf.js";

export const portalRouter = Router();

portalRouter.use(requireAuth);

// Dashboard del alumno logueado.
// Matrícula del alumno: formulario, estado y subida del PDF firmado
portalRouter.get(
  "/matricula",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getMatriculaForUser(req.user!.id));
  })
);
portalRouter.post(
  "/matricula",
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      matricula: await submitMatriculaForUser(req.user!.id, {
        fileKey: String(req.body?.fileKey ?? ""),
        fileName: req.body?.fileName ? String(req.body.fileName) : undefined,
      }),
    });
  })
);

// Reto de Comprensión de una fase
portalRouter.get(
  "/reto/:fase",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getRetoForUser(req.user!.id, Number(req.params.fase)));
  })
);
portalRouter.post(
  "/reto/:fase",
  asyncHandler(async (req: Request, res: Response) => {
    const raw = (req.body?.answers ?? {}) as Record<string, unknown>;
    const answers: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) answers[k] = Number(v);
    res.json(await submitRetoForUser(req.user!.id, Number(req.params.fase), answers));
  })
);

// Encuesta de satisfacción de una fase (se autoguarda por criterio)
portalRouter.get(
  "/encuesta/:fase",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getEncuestaForUser(req.user!.id, Number(req.params.fase)));
  })
);
portalRouter.put(
  "/encuesta/:fase",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(
      await rateEncuestaForUser(
        req.user!.id,
        Number(req.params.fase),
        String(req.body?.clave ?? ""),
        Number(req.body?.rating)
      )
    );
  })
);

portalRouter.get(
  "/me",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getMeForUser(req.user!.id));
  })
);

portalRouter.get(
  "/actividad",
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ eventos: await getActividadForUser(req.user!.id) });
  })
);

// Recibo PDF del pago aprobado de una cuota
portalRouter.get(
  "/cuotas/:chargeId/comprobante",
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await getComprobanteForUser(req.user!.id, req.params.chargeId);
    const pdf = await generateReceiptPDF(payment);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${receiptFileName(payment)}"`
    );
    res.send(pdf);
  })
);

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
