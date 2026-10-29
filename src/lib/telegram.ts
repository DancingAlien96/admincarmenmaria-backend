import crypto from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

// Bot de Telegram para avisos y recordatorios de cobranza. Telegram solo deja
// escribir a quien ya inició conversación con el bot, así que cada usuario
// enlaza su chat una vez (código desde el portal o compartiendo su número).

export function isTelegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

const API = () => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

// Clave que Telegram manda en cada webhook (derivada del token: no requiere
// otro secreto). Así solo Telegram puede llamar al webhook.
export function telegramWebhookSecret(): string {
  return crypto.createHash("sha256").update(`webhook:${env.TELEGRAM_BOT_TOKEN ?? ""}`).digest("hex").slice(0, 48);
}

export class TelegramError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

export async function telegramApi<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
  if (!data.ok) throw new TelegramError(data.description ?? `Telegram respondió ${res.status}`, data.error_code ?? res.status);
  return data.result as T;
}

// Texto seguro para parse_mode HTML
export function tgEsc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendTelegram(chatId: string, html: string, extra: Record<string, unknown> = {}) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

// Envía el mensaje a los usuarios que tienen Telegram enlazado. Devuelve a
// cuántos les llegó. Si alguien bloqueó al bot, se desenlaza.
export async function sendTelegramToUsers(userIds: string[], html: string): Promise<number> {
  if (!isTelegramConfigured() || !userIds.length) return 0;
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] }, active: true, telegramChatId: { not: null } },
    select: { id: true, telegramChatId: true },
  });
  let enviados = 0;
  for (const u of users) {
    try {
      await sendTelegram(u.telegramChatId!, html);
      enviados++;
    } catch (err) {
      const code = (err as TelegramError).code;
      if (code === 403 || code === 400) {
        // Bloqueó al bot o el chat ya no existe
        await prisma.user.update({ where: { id: u.id }, data: { telegramChatId: null } }).catch(() => undefined);
      } else {
        console.error("[telegram] envío falló:", (err as Error).message);
      }
    }
  }
  return enviados;
}

// Aviso con título, mensaje y enlace al Campus (para avisos y recordatorios)
export function formatoAviso(titulo: string, mensaje: string, url?: string | null): string {
  const enlace = url
    ? `\n\n<a href="${tgEsc(/^https?:\/\//.test(url) ? url : `${env.FRONTEND_URL}${url}`)}">Abrir en el Campus</a>`
    : "";
  return `<b>${tgEsc(titulo)}</b>\n${tgEsc(mensaje)}${enlace}`;
}

let usuarioBot: string | null = null;
export async function botUsername(): Promise<string | null> {
  if (!isTelegramConfigured()) return null;
  if (usuarioBot) return usuarioBot;
  try {
    const me = await telegramApi<{ username: string }>("getMe");
    usuarioBot = me.username;
  } catch (err) {
    console.error("[telegram] getMe falló:", (err as Error).message);
  }
  return usuarioBot;
}

// Registra el webhook y los comandos del bot (al arrancar en producción).
export async function configurarTelegram(): Promise<void> {
  if (!isTelegramConfigured()) return;
  const url = `${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/webhooks/telegram`;
  await telegramApi("setWebhook", {
    url,
    secret_token: telegramWebhookSecret(),
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  await telegramApi("setMyCommands", {
    commands: [
      { command: "start", description: "Conectar mi cuenta del Campus" },
      { command: "saldo", description: "Ver mis cuotas pendientes" },
      { command: "desconectar", description: "Dejar de recibir avisos aquí" },
    ],
  });
  console.log(`🤖 Telegram: webhook en ${url} (@${(await botUsername()) ?? "?"})`);
}
