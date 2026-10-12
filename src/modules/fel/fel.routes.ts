import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdmin, requireSection } from "../../middleware/authorize.js";
import { notFound } from "../../lib/http-error.js";
import { generateFelReceiptPDF, felReceiptFileName } from "../../lib/fel-pdf.js";
import { getFelConfig, setFelConfig } from "./fel.config.js";
import {
  anularReciboSchema,
  emitirReciboSchema,
  felConfigSchema,
  idParam,
  listRecibosQuery,
  paymentIdParam,
  type ListRecibosQuery,
} from "./fel.schemas.js";
import * as service from "./fel.service.js";

export const felRouter = Router();

const canRead = requireSection("PAYMENTS", "READER");
const canEdit = requireSection("PAYMENTS", "EDITOR");

felRouter.use(requireAuth);

// Estado de la integración (para mostrar/ocultar el botón "Emitir recibo FEL")
felRouter.get(
  "/estado",
  canRead,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await service.getEstadoFel());
  })
);

// Configuración del emisor (solo admin)
felRouter.get(
  "/config",
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ config: await getFelConfig(), estado: await service.getEstadoFel() });
  })
);
felRouter.put(
  "/config",
  requireAdmin,
  validate({ body: felConfigSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ config: await setFelConfig(req.body), estado: await service.getEstadoFel() });
  })
);

// Listado de recibos emitidos
felRouter.get(
  "/recibos",
  canRead,
  validate({ query: listRecibosQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await service.listRecibos(req.query as unknown as ListRecibosQuery));
  })
);

felRouter.get(
  "/recibos/:id",
  canRead,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ recibo: await service.getRecibo(req.params.id) });
  })
);

// PDF del recibo. Por defecto, la representación gráfica del sistema (con QR);
// con ?origen=sat devuelve el PDF que entregó Digifact, si se guardó.
felRouter.get(
  "/recibos/:id/pdf",
  canRead,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await service.getReciboRaw(req.params.id);
    const descargar = req.query.download === "1";
    let pdf: Buffer | null = null;
    if (req.query.origen === "sat") {
      pdf = await service.leerArchivo(doc.pdfKey);
      if (!pdf) throw notFound("Este recibo no tiene el PDF del certificador guardado");
    } else {
      pdf = await generateFelReceiptPDF(doc);
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${descargar ? "attachment" : "inline"}; filename="${felReceiptFileName(doc)}"`
    );
    res.send(pdf);
  })
);

// XML certificado (firmado por el certificador)
felRouter.get(
  "/recibos/:id/xml",
  canRead,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await service.getReciboRaw(req.params.id);
    const xml = await service.leerArchivo(doc.xmlKey);
    if (!xml) throw notFound("Este recibo no tiene XML guardado");
    res.setHeader("Content-Type", "application/xml");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${felReceiptFileName(doc).replace(/\.pdf$/, ".xml")}"`
    );
    res.send(xml);
  })
);

felRouter.post(
  "/recibos/:id/anular",
  canEdit,
  validate({ params: idParam, body: anularReciboSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await service.anularRecibo(req.params.id, req.body.motivo, req.user?.id);
    res.json({ recibo: await service.getRecibo(doc.id) });
  })
);

// Reenviar el recibo al correo del receptor
felRouter.post(
  "/recibos/:id/enviar",
  canEdit,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await service.enviarReciboPorCorreo(req.params.id));
  })
);

// Recibos (historial) de un pago
felRouter.get(
  "/pagos/:paymentId",
  canRead,
  validate({ params: paymentIdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ recibos: await service.getRecibosDePago(req.params.paymentId) });
  })
);

// Emitir (o reintentar) el recibo FEL de un pago
felRouter.post(
  "/pagos/:paymentId/emitir",
  canEdit,
  validate({ params: paymentIdParam, body: emitirReciboSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await service.emitirRecibo(req.params.paymentId, req.body, req.user?.id);
    res.status(201).json({ recibo: await service.getRecibo(doc.id) });
  })
);
