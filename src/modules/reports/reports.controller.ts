import type { Request, Response } from "express";
import { buildReport } from "./reports.service.js";
import type { ReportQuery } from "./reports.schemas.js";
import { renderReportPDF, renderReportExcel } from "../../lib/report-render.js";

export async function reportController(req: Request, res: Response) {
  const q = req.query as unknown as ReportQuery;
  const filters = {
    from: q.from,
    to: q.to,
    sede: q.sede,
    status: q.status,
    year: q.year,
  };
  const data = await buildReport(q.type, filters);

  if (q.format === "pdf") {
    const pdf = await renderReportPDF(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="reporte-${q.type}.pdf"`
    );
    res.send(pdf);
    return;
  }

  if (q.format === "xlsx") {
    const xlsx = await renderReportExcel(data);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="reporte-${q.type}.xlsx"`
    );
    res.send(xlsx);
    return;
  }

  res.json(data);
}
