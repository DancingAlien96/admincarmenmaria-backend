import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createPaymentSchema,
  annulPaymentSchema,
  linkPaymentSchema,
  listPaymentsQuery,
  paymentIdParam,
} from "./payments.schemas.js";
import {
  listController,
  getController,
  createController,
  annulController,
  linkController,
  syncController,
  receiptController,
} from "./payments.controller.js";

export const paymentsRouter = Router();

const canRead = requireSection("PAYMENTS", "READER");
const canEdit = requireSection("PAYMENTS", "EDITOR");

paymentsRouter.use(requireAuth);

paymentsRouter.get(
  "/",
  canRead,
  validate({ query: listPaymentsQuery }),
  asyncHandler(listController)
);
paymentsRouter.post(
  "/",
  canEdit,
  validate({ body: createPaymentSchema }),
  asyncHandler(createController)
);
paymentsRouter.post("/sync", canEdit, asyncHandler(syncController));
paymentsRouter.get(
  "/:id",
  canRead,
  validate({ params: paymentIdParam }),
  asyncHandler(getController)
);
paymentsRouter.get(
  "/:id/receipt",
  canRead,
  validate({ params: paymentIdParam }),
  asyncHandler(receiptController)
);
paymentsRouter.post(
  "/:id/annul",
  canEdit,
  validate({ params: paymentIdParam, body: annulPaymentSchema }),
  asyncHandler(annulController)
);
paymentsRouter.post(
  "/:id/link",
  canEdit,
  validate({ params: paymentIdParam, body: linkPaymentSchema }),
  asyncHandler(linkController)
);
