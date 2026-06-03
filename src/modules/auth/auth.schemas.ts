import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Correo invalido"),
  password: z.string().min(1, "La contrasena es requerida"),
});

export type LoginInput = z.infer<typeof loginSchema>;
