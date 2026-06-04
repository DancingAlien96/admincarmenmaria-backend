import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { sendText, toE164, isYcloudConfigured } from "../../lib/ycloud.js";
import {
  generateBotReply,
  isOpenAiConfigured,
  DEFAULT_KNOWLEDGE,
} from "../../lib/openai.js";

// --- Configuracion del bot (fila unica id=1) ---
export async function getBotConfig() {
  const existing = await prisma.botConfig.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.botConfig.create({
    data: { id: 1, enabled: true, knowledgeBase: DEFAULT_KNOWLEDGE },
  });
}

export async function updateBotConfig(data: {
  enabled?: boolean;
  knowledgeBase?: string;
  systemPrompt?: string | null;
}) {
  await getBotConfig(); // asegura que exista
  return prisma.botConfig.update({ where: { id: 1 }, data });
}

// --- Log de mensajes ---
export async function listMessages(q: {
  phone?: string;
  direction?: "INBOUND" | "OUTBOUND";
  page: number;
  pageSize: number;
}) {
  const where: Prisma.WhatsappMessageWhereInput = {
    ...(q.phone ? { phone: { contains: q.phone } } : {}),
    ...(q.direction ? { direction: q.direction } : {}),
  };
  const [total, data] = await Promise.all([
    prisma.whatsappMessage.count({ where }),
    prisma.whatsappMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { student: { select: { id: true, fullName: true } } },
    }),
  ]);
  return {
    data,
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    },
  };
}

// Busca el estudiante por telefono (para enlazar el mensaje).
async function findStudentByPhone(phone: string): Promise<string | null> {
  const e164 = toE164(phone);
  const last8 = e164.slice(-8);
  const student = await prisma.student.findFirst({
    where: {
      OR: [
        { phonePrimary: { contains: last8 } },
        { phoneAlt: { contains: last8 } },
      ],
    },
    select: { id: true },
  });
  return student?.id ?? null;
}

// Registra un mensaje en el log.
async function logMessage(data: {
  direction: "INBOUND" | "OUTBOUND";
  phone: string;
  body: string;
  status: "RECEIVED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  kind?: string;
  wamid?: string;
  error?: string;
  studentId?: string | null;
}) {
  return prisma.whatsappMessage.create({
    data: {
      direction: data.direction,
      phone: toE164(data.phone),
      body: data.body,
      status: data.status,
      kind: data.kind,
      wamid: data.wamid,
      error: data.error,
      studentId: data.studentId ?? (await findStudentByPhone(data.phone)),
    },
  });
}

// Envia un mensaje saliente (texto) y lo registra. Uso interno + manual.
export async function sendAndLog(
  phone: string,
  body: string,
  kind: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isYcloudConfigured()) {
    await logMessage({
      direction: "OUTBOUND",
      phone,
      body,
      status: "FAILED",
      kind,
      error: "YCloud no configurado",
    });
    return { ok: false, error: "WhatsApp (YCloud) no esta configurado." };
  }
  try {
    const res = await sendText(phone, body);
    await logMessage({
      direction: "OUTBOUND",
      phone,
      body,
      status: "SENT",
      kind,
      wamid: res.wamid,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar";
    await logMessage({
      direction: "OUTBOUND",
      phone,
      body,
      status: "FAILED",
      kind,
      error: msg,
    });
    return { ok: false, error: msg };
  }
}

// --- Procesa un mensaje entrante (desde el webhook) ---
export async function handleInbound(phone: string, text: string) {
  // 1. Registrar el entrante
  await logMessage({
    direction: "INBOUND",
    phone,
    body: text,
    status: "RECEIVED",
    kind: "bot",
  });

  // 2. Si el bot esta activo y hay IA, responder
  const config = await getBotConfig();
  if (!config.enabled || !isOpenAiConfigured()) return;

  // Historial reciente de este contacto (ultimos 6 mensajes) para contexto
  const recent = await prisma.whatsappMessage.findMany({
    where: { phone: toE164(phone) },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { direction: true, body: true },
  });
  const history = recent
    .reverse()
    .map((m) => ({
      role: (m.direction === "INBOUND" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.body,
    }));

  try {
    const reply = await generateBotReply({
      userMessage: text,
      knowledgeBase: config.knowledgeBase,
      extraInstructions: config.systemPrompt,
      history: history.slice(0, -1), // sin el mensaje actual (ya va aparte)
    });
    await sendAndLog(phone, reply, "bot");
  } catch (err) {
    console.error("[whatsapp] error IA:", (err as Error).message);
  }
}
