import type { Request, Response } from "express";
import * as service from "./graduates.service.js";
import {
  generateConstanciaPDF,
  generateRecommendationPDF,
} from "../../lib/graduate-pdf.js";
import { notFound } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import type { ListGraduatesQuery } from "./graduates.schemas.js";

export async function listController(req: Request, res: Response) {
  res.json(
    await service.listGraduates(req.query as unknown as ListGraduatesQuery)
  );
}

export async function getController(req: Request, res: Response) {
  res.json({ graduate: await service.getGraduate(req.params.id) });
}

export async function createController(req: Request, res: Response) {
  const graduate = await service.createGraduate(req.body, req.user?.id);
  res.status(201).json({ graduate });
}

export async function updateController(req: Request, res: Response) {
  const graduate = await service.updateGraduate(req.params.id, req.body);
  res.json({ graduate });
}

export async function addLetterController(req: Request, res: Response) {
  const letter = await service.addLetter(req.params.id, req.body, req.user?.id);
  res.status(201).json({ letter });
}

export async function constanciaController(req: Request, res: Response) {
  const graduate = await prisma.graduate.findUnique({
    where: { id: req.params.id },
  });
  if (!graduate) throw notFound("Egresado no encontrado");
  const pdf = await generateConstanciaPDF(graduate);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="constancia-${graduate.diplomaNumber}.pdf"`
  );
  res.send(pdf);
}

export async function recommendationController(req: Request, res: Response) {
  const graduate = await prisma.graduate.findUnique({
    where: { id: req.params.id },
  });
  if (!graduate) throw notFound("Egresado no encontrado");
  // Fecha de emision: la del query (?date=) o la de hoy
  const issueDate = req.query.date
    ? new Date(String(req.query.date))
    : new Date();
  const pdf = await generateRecommendationPDF(graduate, issueDate);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="carta-recomendacion-${graduate.diplomaNumber}.pdf"`
  );
  res.send(pdf);
}
