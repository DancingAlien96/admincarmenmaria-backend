import type { Request, Response, NextFunction, RequestHandler } from "express";

// Envuelve handlers async y reenvia errores al middleware de error
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
