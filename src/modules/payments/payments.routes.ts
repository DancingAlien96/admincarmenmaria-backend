import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createPaymentSchema,
  annulPaymentSchema,
  linkPaymentSchema,
  linkManySchema,
  listPaymentsQuery,
  paymentIdParam,
} from "./payments.schemas.js";
import {
  listController,
  getController,
  createController,
  annulController,
  linkController,
  linkSuggestionsController,
  linkManyController,
  syncController,
  receiptController,
  pendingController,
  approveController,
  rejectController,
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

// Boletas subidas por alumnos, pendientes de revisión (rutas fijas antes de "/:id")
paymentsRouter.get("/pending", canRead, asyncHandler(pendingController));
paymentsRouter.post(
  "/:id/approve",
  canEdit,
  validate({ params: paymentIdParam }),
  asyncHandler(approveController)
);
paymentsRouter.post(
  "/:id/reject",
  canEdit,
  validate({ params: paymentIdParam }),
  asyncHandler(rejectController)
);

// Vinculacion asistida (rutas fijas antes de "/:id")
paymentsRouter.get(
  "/link-suggestions",
  canEdit,
  asyncHandler(linkSuggestionsController)
);
paymentsRouter.post(
  "/link-many",
  canEdit,
  validate({ body: linkManySchema }),
  asyncHandler(linkManyController)
);

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
