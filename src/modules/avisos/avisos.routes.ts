import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireSection } from "../../middleware/authorize.js";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { badRequest } from "../../lib/http-error.js";
import { isPushConfigured, isValidPushEndpoint, sendPushToUsers } from "../../lib/push.js";
import {
  enviarAviso,
  listAvisos,
  deleteAviso,
  avisoOpciones,
  misAvisos,
  marcarLeido,
} from "./avisos.service.js";

// --- Suscripción push (cualquier usuario con sesión) --------------------------
export const pushRouter = Router();
pushRouter.use(requireAuth);

pushRouter.get("/config", (_req: Request, res: Response) => {
  res.json({
    enabled: isPushConfigured(),
    publicKey: isPushConfigured() ? env.VAPID_PUBLIC_KEY : null,
  });
});

const subscribeSchema = z.object({
  endpoint: z.string().url().max(700),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(4).max(100),
  }),
});

pushRouter.post(
  "/subscribe",
  validate({ body: subscribeSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof subscribeSchema>;
    if (!isValidPushEndpoint(body.endpoint)) {
      throw badRequest("Servicio de notificaciones no reconocido");
    }
    const userAgent = (req.headers["user-agent"] ?? "").slice(0, 300) || null;
    // Un mismo dispositivo queda ligado al último usuario que inició sesión en él
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: req.user!.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
      },
      update: {
        userId: req.user!.id,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
        lastUsedAt: new Date(),
      },
    });
    res.json({ ok: true });
  })
);

pushRouter.post(
  "/unsubscribe",
  validate({ body: z.object({ endpoint: z.string().max(700) }) }),
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: req.body.endpoint, userId: req.user!.id },
    });
    res.json({ ok: true });
  })
);

// Notificación de prueba al propio usuario
pushRouter.post(
  "/test",
  asyncHandler(async (req: Request, res: Response) => {
    const n = await sendPushToUsers([req.user!.id], {
      title: "Notificaciones activadas",
      body: "Así te llegarán los avisos del Campus Carmen María.",
      url: "/",
      tag: "prueba",
    });
    res.json({ ok: n > 0 });
  })
);

// --- Avisos ------------------------------------------------------------------
export const avisosRouter = Router();
avisosRouter.use(requireAuth);

// Bandeja del usuario (alumno o docente)
avisosRouter.get(
  "/mios",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await misAvisos(req.user!.id));
  })
);
avisosRouter.post(
  "/mios/leidos",
  validate({ body: z.object({ id: z.string().min(1).optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await marcarLeido(req.user!.id, req.body.id));
  })
);

// Panel (sección Recordatorios)
const canRead = requireSection("REMINDERS", "READER");
const canEdit = requireSection("REMINDERS", "EDITOR");

// Enlace del aviso: una página del sistema (/portal/...) o una dirección https.
const linkSchema = z
  .string()
  .trim()
  .max(300)
  .refine((v) => /^\/(?!\/)/.test(v) || /^https:\/\//i.test(v), "Enlace inválido")
  .optional()
  .nullable()
  .or(z.literal(""));

const enviarSchema = z.object({
  titulo: z.string().trim().min(3, "Escribe un título").max(120),
  mensaje: z.string().trim().min(3, "Escribe el mensaje").max(2000),
  url: linkSchema,
  audience: z.enum(["students", "teachers", "custom"]),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  sede: z.string().trim().max(100).optional(),
  incluirAspirantes: z.boolean().optional(),
  studentIds: z.array(z.string()).max(500).optional(),
  teacherIds: z.array(z.string()).max(500).optional(),
  push: z.boolean().default(true),
  email: z.boolean().default(false),
});

avisosRouter.get(
  "/",
  canRead,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ avisos: await listAvisos() });
  })
);
avisosRouter.get(
  "/opciones",
  canRead,
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await avisoOpciones());
  })
);
avisosRouter.post(
  "/",
  canEdit,
  validate({ body: enviarSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof enviarSchema>;
    res.status(201).json(
      await enviarAviso({ ...body, url: body.url || null }, req.user!.id)
    );
  })
);
avisosRouter.delete(
  "/:id",
  canEdit,
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await deleteAviso(req.params.id));
  })
);
