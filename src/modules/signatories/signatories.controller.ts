import type { Request, Response } from "express";
import * as service from "./signatories.service.js";

export async function listController(req: Request, res: Response) {
  const includeInactive = req.query.all === "true";
  const signatories = await service.listSignatories(includeInactive);
  res.json({ signatories });
}

export async function createController(req: Request, res: Response) {
  const signatory = await service.createSignatory(req.body, req.file);
  res.status(201).json({ signatory });
}

export async function updateController(req: Request, res: Response) {
  const signatory = await service.updateSignatory(
    req.params.id,
    req.body,
    req.file
  );
  res.json({ signatory });
}

export async function deleteController(req: Request, res: Response) {
  const result = await service.deleteSignatory(req.params.id);
  res.json(result);
}
