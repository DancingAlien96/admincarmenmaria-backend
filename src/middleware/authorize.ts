import type { Request, Response, NextFunction } from "express";
import type { ModuleSection, PermissionLevel } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { forbidden, unauthorized } from "../lib/http-error.js";
import { asyncHandler } from "../lib/async-handler.js";

// Exige que el usuario sea ADMIN
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  if (req.user.role !== "ADMIN") {
    throw forbidden("Se requiere rol de administrador");
  }
  next();
}

// Exige permiso sobre una seccion. EDITOR implica tambien lectura.
// El ADMIN siempre tiene acceso total.
export function requireSection(
  section: ModuleSection,
  level: PermissionLevel = "READER"
) {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) throw unauthorized();

    if (req.user.role === "ADMIN") return next();

    const permission = await prisma.userPermission.findUnique({
      where: { userId_section: { userId: req.user.id, section } },
    });

    if (!permission) {
      throw forbidden("No tienes acceso a este modulo");
    }

    // Si se requiere EDITOR, el lector no pasa
    if (level === "EDITOR" && permission.level !== "EDITOR") {
      throw forbidden("Solo tienes permiso de lectura en este modulo");
    }

    next();
  });
}
