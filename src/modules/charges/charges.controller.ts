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

export async function planController(req: Request, res: Response) {
  const result = await service.generateCuotaPlan(
    req.params.studentId,
    req.body,
    req.user?.id
  );
  res.status(201).json(result);
}

export async function applyCohortController(req: Request, res: Response) {
  const result = await service.applyPlanToCohort(req.body, req.user?.id);
  res.json(result);
}

// --- Plan de cuotas general (plantilla) -------------------------------------

export async function listPlanTemplateController(req: Request, res: Response) {
  const includeInactive = req.query.all === "true";
  res.json({ items: await service.listPlanTemplate(includeInactive) });
}

export async function createPlanItemController(req: Request, res: Response) {
  const item = await service.createPlanItem(req.body);
  res.status(201).json({ item });
}

export async function updatePlanItemController(req: Request, res: Response) {
  const item = await service.updatePlanItem(req.params.id, req.body);
  res.json({ item });
}

export async function deletePlanItemController(req: Request, res: Response) {
  const item = await service.deactivatePlanItem(req.params.id);
  res.json({ item });
}
