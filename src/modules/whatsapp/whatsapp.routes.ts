import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  webhookController,
  listController,
  getConfigController,
  updateConfigController,
  sendController,
  bulkController,
  testEmailController,
  bulkEmailController,
  runEmailRemindersController,
} from "./whatsapp.controller.js";

// Rutas del panel (requieren sesion + seccion REMINDERS)
export const whatsappRouter = Router();
const canRead = requireSection("REMINDERS", "READER");
const canEdit = requireSection("REMINDERS", "EDITOR");

whatsappRouter.use(requireAuth);
whatsappRouter.get("/messages", canRead, asyncHandler(listController));
whatsappRouter.get("/config", canRead, asyncHandler(getConfigController));
whatsappRouter.put("/config", canEdit, asyncHandler(updateConfigController));
whatsappRouter.post("/send", canEdit, asyncHandler(sendController));
whatsappRouter.post("/bulk", canEdit, asyncHandler(bulkController));
whatsappRouter.post("/test-email", canEdit, asyncHandler(testEmailController));
whatsappRouter.post("/bulk-email", canEdit, asyncHandler(bulkEmailController));
whatsappRouter.post(
  "/run-email-reminders",
  canEdit,
  asyncHandler(runEmailRemindersController)
);

// Webhook publico (sin auth de sesion; se valida por firma HMAC)
export const whatsappWebhookRouter = Router();
whatsappWebhookRouter.post("/", asyncHandler(webhookController));
