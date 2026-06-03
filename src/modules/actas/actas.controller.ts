import type { Request, Response } from "express";
import * as service from "./actas.service.js";
import { generateActaPDF } from "../../lib/acta-pdf.js";
import { isMailConfigured } from "../../lib/mailer.js";
import { env } from "../../config/env.js";
import { badRequest } from "../../lib/http-error.js";
import type { ListActasQuery } from "./actas.schemas.js";

export async function listController(req: Request, res: Response) {
  res.json(await service.listActas(req.query as unknown as ListActasQuery));
}

export async function getController(req: Request, res: Response) {
  res.json({ acta: await service.getActa(req.params.id) });
}

export async function createController(req: Request, res: Response) {
  const acta = await service.createActa(req.body, req.user?.id);
  res.status(201).json({ acta });
}

export async function updateController(req: Request, res: Response) {
  const acta = await service.updateActa(req.params.id, req.body);
  res.json({ acta });
}

export async function deleteController(req: Request, res: Response) {
  res.json(await service.deleteActa(req.params.id));
}

export async function pdfController(req: Request, res: Response) {
  const acta = await service.getActa(req.params.id);
  const pdf = await generateActaPDF(acta);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="acta-${acta.actaNumber}.pdf"`
  );
  res.send(pdf);
}

export async function sendController(req: Request, res: Response) {
  if (!isMailConfigured()) {
    throw badRequest(
      "El correo no esta configurado. Define SMTP_HOST, SMTP_USER y SMTP_PASS en el servidor."
    );
  }
  const to = req.body.to ?? env.SUPERVISOR_EMAIL;
  if (!to) {
    throw badRequest(
      "No se indico destinatario y no hay SUPERVISOR_EMAIL configurado."
    );
  }
  const acta = await service.sendActaByEmail(req.params.id, to, req.body.cc);
  res.json({ ok: true, sentTo: to, sentAt: acta.sentAt });
}
