import type { Request, Response } from "express";
import * as service from "./dashboard.service.js";
import { generateDashboardPDF } from "../../lib/dashboard-pdf.js";
import { generateDashboardExcel } from "../../lib/dashboard-excel.js";
import type { DashboardQuery } from "./dashboard.schemas.js";

export async function dashboardController(req: Request, res: Response) {
  const data = await service.getDashboard(
    req.query as unknown as DashboardQuery
  );
  res.json(data);
}

// Estadisticas generales de la pagina de inicio (cualquier usuario autenticado).
export async function overviewController(_req: Request, res: Response) {
  res.json(await service.getOverview());
}

// Estado de la mensualidad del mes (pagada vs pendiente).
export async function paymentStatusController(req: Request, res: Response) {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  res.json(await service.getMonthlyPaymentStatus(month));
}

export async function dashboardReportController(req: Request, res: Response) {
  const data = await service.getDashboard(
    req.query as unknown as DashboardQuery
  );
  const pdf = await generateDashboardPDF(data);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="reporte-financiero.pdf"`
  );
  res.send(pdf);
}

export async function dashboardExcelController(req: Request, res: Response) {
  const data = await service.getDashboard(
    req.query as unknown as DashboardQuery
  );
  const xlsx = await generateDashboardExcel(data);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="reporte-financiero.xlsx"`
  );
  res.send(xlsx);
}
