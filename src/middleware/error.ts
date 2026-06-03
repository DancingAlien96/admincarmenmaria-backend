import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Datos invalidos",
      details: err.flatten(),
    });
  }

  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ error: err.message, details: err.details });
  }

  // Violacion de restriccion unica (ej. DPI o email duplicado)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      // En MySQL meta.target suele ser string; en otros motores, string[]
      const target = err.meta?.target;
      const raw = Array.isArray(target)
        ? target.join(", ")
        : typeof target === "string"
          ? target
          : "";
      // Traduce nombres de indice (ej. "Student_dpi_key") a etiquetas legibles
      const label = /dpi/i.test(raw)
        ? "DPI"
        : /email/i.test(raw)
          ? "correo"
          : "valor";
      return res
        .status(409)
        .json({ error: `Ya existe un registro con ese ${label}` });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    // Llave foranea invalida (ej. chargeId/feeTypeId inexistente)
    if (err.code === "P2003") {
      return res
        .status(400)
        .json({ error: "Referencia invalida: un dato relacionado no existe" });
    }
  }

  console.error("[ERROR no manejado]", err);
  return res.status(500).json({ error: "Error interno del servidor" });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Ruta no encontrada" });
}
