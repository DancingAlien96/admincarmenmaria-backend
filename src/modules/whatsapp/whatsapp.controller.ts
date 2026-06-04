import type { Request, Response } from "express";
import * as service from "./whatsapp.service.js";
import { verifyWebhookSignature } from "../../lib/ycloud.js";
import { badRequest } from "../../lib/http-error.js";

// --- Webhook entrante de YCloud (publico, sin auth de sesion) ---
// Valida la firma HMAC usando el raw body.
export async function webhookController(req: Request, res: Response) {
  const raw = (req as Request & { rawBody?: string }).rawBody ?? "";
  // YCloud envia un unico header "YCloud-Signature: t=...,s=..."
  const signatureHeader =
    (req.headers["ycloud-signature"] as string) ||
    (req.headers["x-ycloud-signature"] as string) ||
    "";

  if (!verifyWebhookSignature(raw, signatureHeader)) {
    return res.status(401).json({ error: "Firma invalida" });
  }

  const event = req.body as {
    type?: string;
    whatsappInboundMessage?: {
      from?: string;
      type?: string;
      text?: { body?: string };
    };
  };

  // Responder 200 rapido; procesar despues (YCloud reintenta si no es 2xx).
  res.status(200).json({ received: true });

  if (
    event.type === "whatsapp.inbound_message.received" &&
    event.whatsappInboundMessage?.type === "text"
  ) {
    const from = event.whatsappInboundMessage.from;
    const body = event.whatsappInboundMessage.text?.body;
    if (from && body) {
      // No await: ya respondimos 200
      void service.handleInbound(from, body);
    }
  }
}

// --- Endpoints del panel (con auth) ---
export async function listController(req: Request, res: Response) {
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 20);
  res.json(
    await service.listMessages({
      phone: req.query.phone as string | undefined,
      direction: req.query.direction as "INBOUND" | "OUTBOUND" | undefined,
      page: page > 0 ? page : 1,
      pageSize: pageSize > 0 && pageSize <= 100 ? pageSize : 20,
    })
  );
}

export async function getConfigController(_req: Request, res: Response) {
  res.json({ config: await service.getBotConfig() });
}

export async function updateConfigController(req: Request, res: Response) {
  const { enabled, knowledgeBase, systemPrompt } = req.body ?? {};
  res.json({
    config: await service.updateBotConfig({ enabled, knowledgeBase, systemPrompt }),
  });
}

export async function sendController(req: Request, res: Response) {
  const { phone, body } = req.body ?? {};
  if (!phone || !body) throw badRequest("phone y body son requeridos");
  const result = await service.sendAndLog(phone, body, "manual");
  if (!result.ok) throw badRequest(result.error ?? "No se pudo enviar");
  res.json({ ok: true });
}
