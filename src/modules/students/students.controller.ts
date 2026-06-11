import type { Request, Response } from "express";
import * as service from "./students.service.js";
import type { ListStudentsQuery } from "./students.schemas.js";

export async function listController(req: Request, res: Response) {
  const result = await service.listStudents(
    req.query as unknown as ListStudentsQuery
  );
  res.json(result);
}

export async function getController(req: Request, res: Response) {
  res.json({ student: await service.getStudent(req.params.id) });
}

export async function createController(req: Request, res: Response) {
  const student = await service.createStudent(req.body, req.user?.id);
  res.status(201).json({ student });
}

// Sincroniza expedientes desde los pagos de WooCommerce (crea estudiantes
// nuevos a partir de pagos de inscripcion). Reutiliza el sync completo de pagos.
export async function syncController(_req: Request, res: Response) {
  const { syncWooCommerce } = await import(
    "../payments/payments.service.js"
  );
  const result = await syncWooCommerce({ full: true });
  res.json(result);
}

export async function updateController(req: Request, res: Response) {
  const student = await service.updateStudent(req.params.id, req.body);
  res.json({ student });
}

export async function changeStatusController(req: Request, res: Response) {
  const student = await service.changeStatus(
    req.params.id,
    req.body,
    req.user?.id
  );
  res.json({ student });
}

export async function addDocumentController(req: Request, res: Response) {
  const document = await service.addDocument(
    req.params.id,
    req.body,
    req.user?.id
  );
  res.status(201).json({ document });
}

export async function deleteDocumentController(req: Request, res: Response) {
  const result = await service.deleteDocument(req.params.id, req.params.docId);
  res.json(result);
}
