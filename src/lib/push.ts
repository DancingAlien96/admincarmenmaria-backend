import webpush from "web-push";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

// Notificaciones push (PWA) con llaves VAPID. Sin llaves configuradas, todo
// lo de push se omite en silencio (los avisos siguen en el portal y correo).

export function isPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

let ready = false;
function setup(): boolean {
  if (ready) return true;
  if (!isPushConfigured()) return false;
  // El "subject" identifica al remitente ante Google/Apple/Mozilla: debe ser https o mailto.
  const subject = env.FRONTEND_URL.startsWith("https://")
    ? env.FRONTEND_URL
    : "https://admin.enfermeriacarmenmaria.edu.gt";
  webpush.setVapidDetails(subject, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  ready = true;
  return true;
}

// Solo se aceptan suscripciones de los servicios push de los navegadores
// (evita que el servidor haga peticiones a direcciones arbitrarias).
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

export function isValidPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return false;
    return PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
}

// Envía la notificación a todos los dispositivos de esos usuarios. Devuelve
// cuántos usuarios la recibieron en al menos un dispositivo. Las suscripciones
// vencidas (404/410) se eliminan.
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  if (!userIds.length || !setup()) return 0;
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
  });
  if (!subs.length) return 0;

  const data = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 300),
    url: payload.url || "/",
    tag: payload.tag,
  });
  const reached = new Set<string>();
  const dead: string[] = [];

  // Lotes de 20 para no saturar la red
  for (let i = 0; i < subs.length; i += 20) {
    await Promise.all(
      subs.slice(i, i + 20).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            data,
            { TTL: 3 * 24 * 3600, urgency: "normal" }
          );
          reached.add(s.userId);
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.id);
          else console.error("[push] envío falló:", code ?? (err as Error).message);
        }
      })
    );
  }
  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
  if (reached.size) {
    await prisma.pushSubscription.updateMany({
      where: { userId: { in: [...reached] } },
      data: { lastUsedAt: new Date() },
    });
  }
  return reached.size;
}
