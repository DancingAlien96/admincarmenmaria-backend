import type { UserRole } from "@prisma/client";

// Usuario autenticado adjuntado a la request por el middleware requireAuth
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
