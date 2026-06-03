import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuery,
  expenseIdParam,
} from "./expenses.schemas.js";
import {
  listController,
  createController,
  updateController,
  deleteController,
} from "./expenses.controller.js";

export const expensesRouter = Router();

// Los egresos pertenecen al Dashboard Financiero
const canRead = requireSection("DASHBOARD", "READER");
const canEdit = requireSection("DASHBOARD", "EDITOR");

expensesRouter.use(requireAuth);

expensesRouter.get(
  "/",
  canRead,
  validate({ query: listExpensesQuery }),
  asyncHandler(listController)
);
expensesRouter.post(
  "/",
  canEdit,
  validate({ body: createExpenseSchema }),
  asyncHandler(createController)
);
expensesRouter.patch(
  "/:id",
  canEdit,
  validate({ params: expenseIdParam, body: updateExpenseSchema }),
  asyncHandler(updateController)
);
expensesRouter.delete(
  "/:id",
  canEdit,
  validate({ params: expenseIdParam }),
  asyncHandler(deleteController)
);
