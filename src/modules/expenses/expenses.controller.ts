import type { Request, Response } from "express";
import * as service from "./expenses.service.js";
import type { ListExpensesQuery } from "./expenses.schemas.js";

export async function listController(req: Request, res: Response) {
  res.json(
    await service.listExpenses(req.query as unknown as ListExpensesQuery)
  );
}

export async function createController(req: Request, res: Response) {
  const expense = await service.createExpense(req.body, req.user?.id);
  res.status(201).json({ expense });
}

export async function updateController(req: Request, res: Response) {
  const expense = await service.updateExpense(req.params.id, req.body);
  res.json({ expense });
}

export async function deleteController(req: Request, res: Response) {
  res.json(await service.deleteExpense(req.params.id));
}
