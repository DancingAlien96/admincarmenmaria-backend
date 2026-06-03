import type { Request, Response } from "express";
import * as service from "./charges.service.js";
import type { ListChargesQuery } from "./charges.schemas.js";

export async function listController(req: Request, res: Response) {
  res.json(
    await service.listCharges(req.query as unknown as ListChargesQuery)
  );
}

export async function createController(req: Request, res: Response) {
  const charge = await service.createCharge(req.body, req.user?.id);
  res.status(201).json({ charge });
}

export async function bulkController(req: Request, res: Response) {
  const result = await service.bulkCreateCharges(req.body, req.user?.id);
  res.status(201).json(result);
}

export async function annulController(req: Request, res: Response) {
  const charge = await service.annulCharge(req.params.id, req.body, req.user?.id);
  res.json({ charge });
}

export async function accountController(req: Request, res: Response) {
  res.json(await service.studentAccount(req.params.studentId));
}
