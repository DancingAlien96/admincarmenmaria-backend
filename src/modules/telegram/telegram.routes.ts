import crypto from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { badRequest } from "../../lib/http-error.js";
import { env } from "../../config/env.js";
import { fmtVencimiento } from "../../lib/fecha-gt.js";
import {
  botUsername,
  isTelegramConfigured,
  sendTelegram,
  telegramWebhookSecret,
  tgEsc,
} from "../../lib/telegram.js";
import { studentAccount } from "../charges/charges.service.js";

// --- Webhook (lo llama Telegram) ----------------------------------------------

interface TgMessage {
  chat: { id: number; type: string };
  from?: { id: number; first_name?: string };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
}

const PEDIR_NUMERO = {
  reply_markup: {
    keyboard: [[{ text: "Compartir mi número", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};
const QUITAR_TECLADO = { reply_markup: { remove_keyboard: true } };

const q = (n: number) =>
  `Q${n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soloDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

// Un chat solo puede estar enlazado a una cuenta: se libera de cualquier otra.
async function enlazar(userId: string, chatId: string) {
  await prisma.$transaction([
    prisma.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: userId } }, data: { telegramChatId: null } }),
    prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: chatId, telegramLinkCode: null, telegramLinkExpires: null },
    }),
  ]);
}

async function bienvenidaEnlazado(chatId: string, nombre: string) {
  await sendTelegram(
    chatId,
    `¡Listo, <b>${tgEsc(nombre.split(" ")[0])}</b>! Tu cuenta del Campus Carmen María quedó conectada.\n\n` +
      "Aquí te llegarán tus avisos y los recordatorios de tus cuotas.\n" +
      "Escribe /saldo para ver tus cuotas pendientes.",
    QUITAR_TECLADO
  );
}

async function vincularPorCodigo(code: string, chatId: string) {
  const u = await prisma.user.findFirst({
    where: { telegramLinkCode: code, telegramLinkExpires: { gt: new Date() }, active: true },
    select: { id: true, name: true },
  });
  if (!u) {
    await sendTelegram(
      chatId,
      "Ese enlace ya venció o no es válido. Vuelve a tocar «Conectar con Telegram» en el Campus, o comparte tu número.",
      PEDIR_NUMERO
    );
    return;
  }
  await enlazar(u.id, chatId);
  await bienvenidaEnlazado(chatId, u.name);
}

// Busca la cuenta por el teléfono registrado (expediente del alumno o
// registro del catedrático). Telegram garantiza que el contacto es del propio usuario.
async function vincularPorTelefono(telefono: string, chatId: string) {
  const ultimos8 = soloDigitos(telefono).slice(-8);
  if (ultimos8.length < 8) {
    await sendTelegram(chatId, "No pude leer tu número. Conéctate desde el Campus con el botón «Conectar con Telegram».");
    return;
  }
  const coincide = (t: string | null) => soloDigitos(t).slice(-8) === ultimos8;
  const [alumnos, docentes] = await Promise.all([
    prisma.student.findMany({
      where: { archived: false, portalUser: { is: { active: true } } },
      select: {
        phonePrimary: true,
        phoneAlt: true,
        portalUser: { select: { id: true, name: true, telegramChatId: true } },
      },
    }),
    prisma.teacher.findMany({
      where: { active: true, userId: { not: null }, user: { is: { active: true } } },
      select: { phone: true, user: { select: { id: true, name: true, telegramChatId: true } } },
    }),
  ]);
  const cuentas = [
    ...alumnos.filter((s) => coincide(s.phonePrimary) || coincide(s.phoneAlt)).map((s) => s.portalUser!),
    ...docentes.filter((t) => coincide(t.phone)).map((t) => t.user!),
  ];
  const unicas = [...new Map(cuentas.map((c) => [c.id, c])).values()];
  if (unicas.length === 1) {
    const cuenta = unicas[0];
    // Si ya tiene otro Telegram conectado, el número no basta para cambiarlo:
    // debe hacerlo desde el Campus (con su sesión).
    if (cuenta.telegramChatId && cuenta.telegramChatId !== chatId) {
      await sendTelegram(
        chatId,
        "Esta cuenta ya tiene otro Telegram conectado. Para cambiarlo, entra al Campus → Notificaciones → «Conectar con Telegram».",
        QUITAR_TECLADO
      );
      return;
    }
    await enlazar(cuenta.id, chatId);
    await bienvenidaEnlazado(chatId, cuenta.name);
    return;
  }
  await sendTelegram(
    chatId,
    unicas.length > 1
      ? "Ese número aparece en varias cuentas. Conéctate desde el Campus: en Notificaciones toca «Conectar con Telegram»."
      : "No encontramos tu número en el Campus. Conéctate desde el portal (Notificaciones → «Conectar con Telegram») o pide a la escuela que actualice tu teléfono.",
    QUITAR_TECLADO
  );
}

async function saldo(chatId: string) {
  const u = await prisma.user.findUnique({
    where: { telegramChatId: chatId },
    select: { studentId: true, name: true },
  });
  if (!u) {
    await sendTelegram(chatId, "Aún no has conectado tu cuenta. Comparte tu número o conéctate desde el Campus.", PEDIR_NUMERO);
    return;
  }
  if (!u.studentId) {
    await sendTelegram(chatId, "Esta cuenta no tiene cuotas.");
    return;
  }
  const { charges, summary } = await studentAccount(u.studentId);
  const pendientes = charges
    .filter((c) => c.status === "PENDIENTE" && c.saldo > 0)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  if (!pendientes.length) {
    await sendTelegram(chatId, "¡Estás al día! No tienes cuotas pendientes.");
    return;
  }
  const lineas = pendientes
    .slice(0, 8)
    .map((c) => `• ${tgEsc(c.concept)}: <b>${q(c.saldo)}</b> — vence ${fmtVencimiento(new Date(c.dueDate))}${c.overdue ? " (vencida)" : ""}`);
  await sendTelegram(
    chatId,
    `<b>Tus cuotas pendientes</b>\n${lineas.join("\n")}${pendientes.length > 8 ? `\n• y ${pendientes.length - 8} más` : ""}\n\n` +
      `Total pendiente: <b>${q(summary.totalDue)}</b>\n<a href="${env.FRONTEND_URL}/portal/pagos/">Pagar en el Campus</a>`
  );
}

async function procesar(msg: TgMessage) {
  if (msg.chat.type !== "private") return;
  const chatId = String(msg.chat.id);

  if (msg.contact) {
    // Solo vale el número propio: Telegram incluye user_id = remitente únicamente
    // cuando se usa el botón «Compartir mi número». Un contacto de la agenda (o
    // reenviado) no trae user_id o trae el de otra persona.
    if (!msg.from || !msg.contact.user_id || msg.contact.user_id !== msg.from.id) {
      await sendTelegram(chatId, "Comparte tu propio número con el botón «Compartir mi número».", PEDIR_NUMERO);
      return;
    }
    await vincularPorTelefono(msg.contact.phone_number, chatId);
    return;
  }

  const texto = (msg.text ?? "").trim();
  if (texto.startsWith("/start")) {
    const code = texto.split(/\s+/)[1];
    if (code) return vincularPorCodigo(code, chatId);
    const ya = await prisma.user.findUnique({ where: { telegramChatId: chatId }, select: { name: true } });
    if (ya) return bienvenidaEnlazado(chatId, ya.name);
    await sendTelegram(
      chatId,
      "¡Hola! Soy el asistente de avisos del <b>Campus Carmen María</b>.\n\n" +
        "Para recibir tus avisos y recordatorios de pago, toca <b>Compartir mi número</b> " +
        "(debe ser el mismo teléfono registrado en la escuela), o conéctate desde el Campus en Notificaciones.",
      PEDIR_NUMERO
    );
    return;
  }
  if (texto.startsWith("/saldo")) return saldo(chatId);
  if (texto.startsWith("/desconectar")) {
    await prisma.user.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } });
    await sendTelegram(chatId, "Listo, ya no recibirás avisos aquí. Para volver a conectarte escribe /start.", QUITAR_TECLADO);
    return;
  }
  await sendTelegram(
    chatId,
    "Comandos disponibles:\n/saldo — ver tus cuotas pendientes\n/desconectar — dejar de recibir avisos\n\nPara otras dudas usa el Asistente virtual del Campus."
  );
}

export const telegramWebhookRouter = Router();
telegramWebhookRouter.post("/", (req: Request, res: Response) => {
  const firma = req.header("x-telegram-bot-api-secret-token") ?? "";
  const esperada = telegramWebhookSecret();
  const valida =
    isTelegramConfigured() &&
    firma.length === esperada.length &&
    crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
  if (!valida) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  // Se responde de inmediato; el mensaje se procesa aparte
  res.json({ ok: true });
  const msg = (req.body as { message?: TgMessage })?.message;
  if (msg?.chat) {
    void procesar(msg).catch((e) => console.error("[telegram] procesar:", (e as Error).message));
  }
});

// --- Portal: conectar / desconectar Telegram (cualquier usuario con sesión) ---

export const telegramRouter = Router();
telegramRouter.use(requireAuth);

telegramRouter.get(
  "/estado",
  asyncHandler(async (req: Request, res: Response) => {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { telegramChatId: true } });
    res.json({
      configurado: isTelegramConfigured(),
      conectado: !!u?.telegramChatId,
      bot: await botUsername(),
    });
  })
);

// Código de un solo uso (15 min) para el enlace t.me/<bot>?start=<código>
telegramRouter.post(
  "/enlace",
  asyncHandler(async (req: Request, res: Response) => {
    if (!isTelegramConfigured()) throw badRequest("Telegram aún no está configurado.");
    const bot = await botUsername();
    if (!bot) throw badRequest("No se pudo contactar al bot de Telegram. Intenta más tarde.");
    const code = crypto.randomBytes(12).toString("base64url");
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { telegramLinkCode: code, telegramLinkExpires: new Date(Date.now() + 15 * 60_000) },
    });
    res.json({ url: `https://t.me/${bot}?start=${code}` });
  })
);

telegramRouter.delete(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { telegramChatId: null, telegramLinkCode: null, telegramLinkExpires: null },
    });
    res.json({ ok: true });
  })
);
