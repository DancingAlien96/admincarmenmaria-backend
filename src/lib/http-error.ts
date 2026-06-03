// Error HTTP con codigo de estado, para lanzar desde servicios/controladores
export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new HttpError(400, msg, details);
export const unauthorized = (msg = "No autenticado") => new HttpError(401, msg);
export const forbidden = (msg = "No autorizado") => new HttpError(403, msg);
export const notFound = (msg = "No encontrado") => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
