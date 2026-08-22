import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { isMailConfigured } from "./lib/mailer.js";
import { isTilopayConfigured } from "./lib/tilopay.js";
import { UPLOAD_ROOT, ensureUploadDir } from "./lib/storage.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { uploadsRouter } from "./modules/uploads/uploads.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { studentsRouter } from "./modules/students/students.routes.js";
import { feesRouter } from "./modules/fees/fees.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { expensesRouter } from "./modules/expenses/expenses.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { chargesRouter } from "./modules/charges/charges.routes.js";
import { graduatesRouter } from "./modules/graduates/graduates.routes.js";
import { actasRouter } from "./modules/actas/actas.routes.js";
import {
  whatsappRouter,
  whatsappWebhookRouter,
} from "./modules/whatsapp/whatsapp.routes.js";
import { teachersRouter } from "./modules/teachers/teachers.routes.js";
import { signatoriesRouter } from "./modules/signatories/signatories.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { portalRouter } from "./modules/portal/portal.routes.js";
import { invitesRouter } from "./modules/portal-invites/invites.routes.js";
import { docChecklistRouter } from "./modules/doc-checklist/doc-checklist.routes.js";
import { ebooksRouter } from "./modules/ebooks/ebooks.routes.js";
import { gradesRouter } from "./modules/grades/grades.routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    })
  );
  // Guarda el raw body (necesario para validar la firma del webhook de YCloud).
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody =
          buf.toString("utf8");
      },
    })
  );
  app.use(cookieParser());

  // Crea la carpeta de subidas al arrancar.
  void ensureUploadDir();

  // Sirve los archivos subidos de forma estatica (descarga/visualizacion).
  app.use(
    "/uploads",
    express.static(UPLOAD_ROOT, {
      maxAge: "7d",
      // Evita ejecutar nada; solo servir como adjunto/inline seguro.
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    })
  );

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "carmenmaria-backend",
      mailConfigured: isMailConfigured(),
      cardEnabled: isTilopayConfigured(),
    });
  });

  // Rutas de la API
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/students", studentsRouter);
  app.use("/api/fees", feesRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/expenses", expensesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/charges", chargesRouter);
  app.use("/api/graduates", graduatesRouter);
  app.use("/api/actas", actasRouter);
  app.use("/api/uploads", uploadsRouter);
  // El webhook va ANTES del router autenticado: es publico (validado por firma).
  app.use("/api/whatsapp/webhook", whatsappWebhookRouter);
  app.use("/api/whatsapp", whatsappRouter);
  app.use("/api/teachers", teachersRouter);
  app.use("/api/signatories", signatoriesRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/portal", portalRouter);
  app.use("/api/portal-invites", invitesRouter);
  app.use("/api/doc-checklist", docChecklistRouter);
  app.use("/api/ebooks", ebooksRouter);
  app.use("/api/grades", gradesRouter);

  // 404 + manejo de errores (siempre al final)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
