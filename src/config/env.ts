import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET debe tener al menos 16 caracteres"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  ADMIN_EMAIL: z.string().email().default("admin@enfermeriacarmenmaria.edu.gt"),
  ADMIN_PASSWORD: z.string().min(8).default("Admin1234!"),
  ADMIN_NAME: z.string().default("Administrador"),
  WOO_URL: z.string().url().optional(),
  WOO_CONSUMER_KEY: z.string().optional(),
  WOO_CONSUMER_SECRET: z.string().optional(),
  // SMTP para envio de actas a la supervisora
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SUPERVISOR_EMAIL: z.string().optional(),
  // Almacenamiento de archivos en disco
  UPLOAD_DIR: z.string().default("uploads"),
  // URL publica base para construir los enlaces de archivos (ej. https://admin.../api)
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  // Tamano maximo de subida en MB
  MAX_UPLOAD_MB: z.coerce.number().default(15),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Variables de entorno invalidas:",
    parsed.error.format()
  );
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
