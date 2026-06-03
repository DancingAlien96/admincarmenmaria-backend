import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

type Schemas = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

// Valida y reemplaza req.body/params/query con los datos parseados (tipados)
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) {
        // req.query es de solo lectura en Express 5; en 4 se puede asignar
        Object.assign(req.query, schemas.query.parse(req.query));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
