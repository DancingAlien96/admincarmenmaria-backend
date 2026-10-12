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
  voidReceiptSchema,
  issueReceiptSchema,
  felConfigSchema,
  idParam,
  listReceiptsQuery,
  paymentIdParam,
  type ListReceiptsQuery,
} from "./fel.schemas.js";
import * as service from "./fel.service.js";

export const felRouter = Router();

const canRead = requireSection("PAYMENTS", "READER");
const canEdit = requireSection("PAYMENTS", "EDITOR");

felRouter.use(requireAuth);

// Estado de la integración (para mostrar/ocultar el botón "Emitir recibo FEL")
felRouter.get(
  "/status",
  canRead,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await service.getFelStatus());
  })
);

// Configuración del emisor (solo admin)
felRouter.get(
  "/config",
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ config: await getFelConfig(), status: await service.getFelStatus() });
  })
);
felRouter.put(
  "/config",
  requireAdmin,
  validate({ body: felConfigSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ config: await setFelConfig(req.body), status: await service.getFelStatus() });
  })
);

// Listado de recibos emitidos
felRouter.get(
  "/receipts",
  canRead,
  validate({ query: listReceiptsQuery }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await service.listReceipts(req.query as unknown as ListReceiptsQuery));
  })
);

felRouter.get(
  "/receipts/:id",
  canRead,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ receipt: await service.getReceipt(req.params.id) });
  })
);

// PDF del recibo. Por defecto, la representación gráfica del sistema (con QR);
// con ?source=sat devuelve el PDF que entregó Digifact, si se guardó.
felRouter.get(
  "/receipts/:id/pdf",
  canRead,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await service.getReceiptRaw(req.params.id);
    const descargar = req.query.download === "1";
    let pdf: Buffer | null = null;
    if (req.query.source === "sat") {
      pdf = await service.readFile(doc.pdfKey);
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
  "/receipts/:id/xml",
  canRead,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await service.getReceiptRaw(req.params.id);
    const xml = await service.readFile(doc.xmlKey);
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
  "/receipts/:id/void",
  canEdit,
  validate({ params: idParam, body: voidReceiptSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await service.voidReceipt(req.params.id, req.body.reason, req.user?.id);
    res.json({ receipt: await service.getReceipt(doc.id) });
  })
);

// Reenviar el recibo al correo del receptor
felRouter.post(
  "/receipts/:id/send",
  canEdit,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await service.sendReceiptEmail(req.params.id));
  })
);

// Recibos (historial) de un pago
felRouter.get(
  "/payments/:paymentId",
  canRead,
  validate({ params: paymentIdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ receipts: await service.getPaymentReceipts(req.params.paymentId) });
  })
);

// Emitir (o reintentar) el recibo FEL de un pago
felRouter.post(
  "/payments/:paymentId/issue",
  canEdit,
  validate({ params: paymentIdParam, body: issueReceiptSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await service.issueReceipt(req.params.paymentId, req.body, req.user?.id);
    res.status(201).json({ receipt: await service.getReceipt(doc.id) });
  })
);
