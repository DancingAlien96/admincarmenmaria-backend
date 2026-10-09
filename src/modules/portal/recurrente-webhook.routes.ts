import { Router } from "express";
import type { Request, Response } from "express";
import { verifyWebhook } from "../../lib/recurrente.js";
import { aplicarPagoRecurrente } from "./portal.service.js";

// Webhook de Recurrente (firmado con Svix). Público: la autenticidad se
// valida con la firma. Siempre responde 2xx a eventos válidos para que
// Recurrente no reintente; los no usados (suscripciones) se ignoran.
export const recurrenteWebhookRouter = Router();

recurrenteWebhookRouter.post("/", async (req: Request, res: Response) => {
  const raw = (req as Request & { rawBody?: string }).rawBody ?? "";
  const ok = verifyWebhook(raw, {
    id: req.header("svix-id"),
    timestamp: req.header("svix-timestamp"),
    signature: req.header("svix-signature"),
  });
  if (!ok) {
    console.error("[recurrente] webhook con firma inválida");
    return res.status(401).json({ error: "Firma inválida" });
  }
  const b = (req.body ?? {}) as Record<string, any>;
  const evento = String(b.event_type ?? b.type ?? "");
  try {
    if (evento === "intent.succeeded" || evento === "payment_intent.succeeded") {
      const r = await aplicarPagoRecurrente({
        checkoutId: b.checkout?.id ?? null,
        paymentId: b.checkout?.metadata?.paymentId ?? null,
        amountInCents: typeof b.amount_in_cents === "number" ? b.amount_in_cents : null,
        intentId: b.id ?? null,
      });
      console.log(`[recurrente] ${evento} ${b.checkout?.id ?? ""}: ${r.status}`);
    } else if (evento === "intent.failed") {
      // El alumno puede reintentar en el mismo checkout: no se borra nada
      console.log(`[recurrente] pago fallido en ${b.checkout?.id ?? ""}`);
    }
    return res.json({ received: true });
  } catch (err) {
    console.error("[recurrente] error procesando webhook:", (err as Error).message);
    // 500 => Recurrente reintenta más tarde
    return res.status(500).json({ error: "No se pudo procesar" });
  }
});
