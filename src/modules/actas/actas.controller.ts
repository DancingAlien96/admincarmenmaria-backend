import type { Request, Response } from "express";
import * as service from "./actas.service.js";
import { renderActaPDF } from "../../lib/acta-render.js";
import { isMailConfigured } from "../../lib/mailer.js";
import { env } from "../../config/env.js";
import { badRequest } from "../../lib/http-error.js";
import type { ListActasQuery } from "./actas.schemas.js";

function toDateUTC(s?: string | null): Date | null {
  if (!s) return null;
  const iso = s.includes("T")
    ? s.endsWith("Z")
      ? s
      : `${s}Z`
    : `${s}T12:00:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

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
  const pdf = await renderActaPDF(service.buildRenderInput(acta));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="acta-${acta.actaNumber}.pdf"`
  );
  res.send(pdf);
}

// Vista previa: genera el PDF a partir del cuerpo enviado, sin guardar.
export async function previewController(req: Request, res: Response) {
  const b = req.body;
  const pdf = await renderActaPDF({
    actaNumber: b.actaNumber ?? "",
    folios: b.folios ?? null,
    title: b.title ?? null,
    actaDate: toDateUTC(b.actaDate) ?? new Date(),
    closeDate: toDateUTC(b.closeDate),
    city: b.city ?? "Chiquimula",
    department: b.department ?? "Chiquimula",
    body: b.body ?? "",
    vars: b.vars ?? {},
    columns: b.columns ?? [],
    rows: b.rows ?? [],
    signers: b.signers ?? [],
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="vista-previa.pdf"`);
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

// --- Plantillas ---
export async function listTemplatesController(_req: Request, res: Response) {
  res.json({ templates: await service.listTemplates() });
}

export async function getTemplateController(req: Request, res: Response) {
  res.json({ template: await service.getTemplate(req.params.id) });
}

export async function createTemplateController(req: Request, res: Response) {
  const template = await service.createTemplate(req.body, req.user?.id);
  res.status(201).json({ template });
}

export async function updateTemplateController(req: Request, res: Response) {
  const template = await service.updateTemplate(req.params.id, req.body);
  res.json({ template });
}

export async function deleteTemplateController(req: Request, res: Response) {
  res.json(await service.deleteTemplate(req.params.id));
}
