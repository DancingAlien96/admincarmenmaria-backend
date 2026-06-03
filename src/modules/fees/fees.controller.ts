import type { Request, Response } from "express";
import * as service from "./fees.service.js";

export async function listFeesController(req: Request, res: Response) {
  const includeInactive = req.query.all === "true";
  res.json({ fees: await service.listFees(includeInactive) });
}

export async function createFeeController(req: Request, res: Response) {
  res.status(201).json({ fee: await service.createFee(req.body) });
}

export async function updateFeeController(req: Request, res: Response) {
  res.json({ fee: await service.updateFee(req.params.id, req.body) });
}
