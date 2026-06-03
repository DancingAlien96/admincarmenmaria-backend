import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";
import { unauthorized } from "../lib/http-error.js";

// Lee el token del header Authorization: Bearer <token> o de la cookie "token"
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.token;
  return cookieToken ?? null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    throw unauthorized("Falta el token de autenticacion");
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    throw unauthorized("Token invalido o expirado");
  }
}
