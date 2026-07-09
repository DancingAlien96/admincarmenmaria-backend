import type { Request, Response } from "express";
import * as service from "./payments.service.js";
import { isWooConfigured } from "../../lib/woocommerce.js";
import { badRequest } from "../../lib/http-error.js";
import {
  generateReceiptPDF,
  receiptFileName,
} from "../../lib/receipt-pdf.js";
import type { ListPaymentsQuery } from "./payments.schemas.js";

export async function listController(req: Request, res: Response) {
  const result = await service.listPayments(
    req.query as unknown as ListPaymentsQuery
  );
  res.json(result);
}

export async function getController(req: Request, res: Response) {
  res.json({ payment: await service.getPayment(req.params.id) });
}

export async function createController(req: Request, res: Response) {
  const payment = await service.createManualPayment(req.body, req.user?.id);
  res.status(201).json({ payment });
}

export async function annulController(req: Request, res: Response) {
  const payment = await service.annulPayment(
    req.params.id,
    req.body,
    req.user?.id
  );
  res.json({ payment });
}

export async function linkController(req: Request, res: Response) {
  const payment = await service.linkPayment(req.params.id, req.body.studentId);
  res.json({ payment });
}

export async function linkSuggestionsController(_req: Request, res: Response) {
  res.json({ groups: await service.getLinkSuggestions() });
}

export async function linkManyController(req: Request, res: Response) {
  const result = await service.linkManyPayments(
    req.body.paymentIds,
    req.body.studentId
  );
  res.json(result);
}

export async function receiptController(req: Request, res: Response) {
  const payment = await service.getPaymentForReceipt(req.params.id);
  const pdf = await generateReceiptPDF(payment);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${receiptFileName(payment)}"`
  );
  res.send(pdf);
}

export async function syncController(req: Request, res: Response) {
  if (!isWooConfigured()) {
    throw badRequest(
      "WooCommerce no esta configurado. Agrega WOO_CONSUMER_KEY y WOO_CONSUMER_SECRET."
    );
  }
  const full = req.query.full === "true";
  const result = await service.syncWooCommerce({ full });
  res.json(result);
}
