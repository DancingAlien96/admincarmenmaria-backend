import type { Request, Response } from "express";
import * as service from "./teachers.service.js";
import type { ListTeachersQuery } from "./teachers.schemas.js";

export async function listController(req: Request, res: Response) {
  res.json(
    await service.listTeachers(req.query as unknown as ListTeachersQuery)
  );
}

export async function getController(req: Request, res: Response) {
  res.json({ teacher: await service.getTeacher(req.params.id) });
}

export async function createController(req: Request, res: Response) {
  const teacher = await service.createTeacher(req.body, req.user?.id);
  res.status(201).json({ teacher });
}

export async function updateController(req: Request, res: Response) {
  const teacher = await service.updateTeacher(req.params.id, req.body);
  res.json({ teacher });
}

export async function deactivateController(req: Request, res: Response) {
  res.json(await service.deactivateTeacher(req.params.id));
}

export async function addDocumentController(req: Request, res: Response) {
  const document = await service.addDocument(req.params.id, req.body);
  res.status(201).json({ document });
}

export async function deleteDocumentController(req: Request, res: Response) {
  res.json(await service.deleteDocument(req.params.id, req.params.docId));
}
