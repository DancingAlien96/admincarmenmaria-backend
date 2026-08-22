import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireAdminOrDocente } from "../../middleware/authorize.js";
import { prisma } from "../../lib/prisma.js";
import { getStudentFases } from "../grades/grades.service.js";

export const docenteRouter = Router();

docenteRouter.use(requireAuth, requireAdminOrDocente);

// Resumen del docente (para el inicio).
docenteRouter.get(
  "/summary",
  asyncHandler(async (_req: Request, res: Response) => {
    const totalStudents = await prisma.student.count({
      where: { archived: false, status: "ACTIVO" },
    });
    res.json({ totalStudents, fases: 3 });
  })
);

// Roster de estudiantes (activos), con búsqueda y filtro por sede.
docenteRouter.get(
  "/students",
  asyncHandler(async (req: Request, res: Response) => {
    const search = String(req.query.search ?? "").trim();
    const sede = String(req.query.sede ?? "").trim();
    const students = await prisma.student.findMany({
      where: {
        archived: false,
        status: "ACTIVO",
        ...(sede ? { sede } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search } },
                { expedienteNumber: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        expedienteNumber: true,
        sede: true,
        photoUrl: true,
      },
      take: 300,
    });
    res.json({ students });
  })
);

// Fases + calificaciones de un estudiante (para calificar).
docenteRouter.get(
  "/students/:id/fases",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getStudentFases(req.params.id));
  })
);
