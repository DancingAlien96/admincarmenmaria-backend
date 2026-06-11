import type { Request, Response } from "express";
import * as service from "./inauguracion.service.js";
import { generateInauguracionPDF } from "../../lib/inauguracion-pdf.js";
import type { ListInauguracionQuery } from "./inauguracion.schemas.js";

export async function listController(req: Request, res: Response) {
  res.json(
    await service.listInauguracion(req.query as unknown as ListInauguracionQuery)
  );
}

export async function getController(req: Request, res: Response) {
  res.json({ acta: await service.getInauguracion(req.params.id) });
}

// Previsualiza la lista de alumnos de una cohorte (para el formulario).
export async function cohortStudentsController(req: Request, res: Response) {
  const year = Number(req.query.year);
  const students = await service.studentsOfCohort(year);
  res.json({ students });
}

export async function createController(req: Request, res: Response) {
  const acta = await service.createInauguracion(req.body, req.user?.id);
  res.status(201).json({ acta });
}

export async function deleteController(req: Request, res: Response) {
  res.json(await service.deleteInauguracion(req.params.id));
}

export async function pdfController(req: Request, res: Response) {
  const a = await service.getInauguracion(req.params.id);
  const pdf = await generateInauguracionPDF({
    actaNumber: a.actaNumber,
    folios: a.folios,
    promocion: a.promocion,
    cohorte: a.cohorte,
    actoDate: a.actoDate,
    closeDate: a.closeDate,
    city: a.city,
    department: a.department,
    directora: a.directora,
    docente: a.docente,
    secretario: a.secretario,
    students: Array.isArray(a.students) ? (a.students as string[]) : [],
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="acta-inauguracion-${a.actaNumber}.pdf"`
  );
  res.send(pdf);
}
