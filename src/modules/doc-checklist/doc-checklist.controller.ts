import type { Request, Response } from "express";
import * as service from "./doc-checklist.service.js";

export async function listRequirementsController(req: Request, res: Response) {
  const includeInactive = req.query.all === "true";
  res.json({ requirements: await service.listRequirements(includeInactive) });
}

export async function createRequirementController(req: Request, res: Response) {
  const requirement = await service.createRequirement(req.body);
  res.status(201).json({ requirement });
}

export async function updateRequirementController(req: Request, res: Response) {
  const requirement = await service.updateRequirement(req.params.id, req.body);
  res.json({ requirement });
}

export async function deleteRequirementController(req: Request, res: Response) {
  const requirement = await service.deactivateRequirement(req.params.id);
  res.json({ requirement });
}

export async function studentChecklistController(req: Request, res: Response) {
  res.json(await service.getStudentChecklist(req.params.studentId));
}

export async function setStudentDocStatusController(
  req: Request,
  res: Response
) {
  const result = await service.setStudentDocStatus(
    req.params.studentId,
    req.params.requirementId,
    req.body,
    req.user?.id
  );
  res.json(result);
}
