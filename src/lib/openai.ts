import { env } from "../config/env.js";

// Cliente minimo de OpenAI (Chat Completions) para el bot de dudas.
const OPENAI_API = "https://api.openai.com/v1/chat/completions";

export function isOpenAiConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

// Informacion base de la academia si no hay nada configurado en BotConfig.
export const DEFAULT_KNOWLEDGE = `
Escuela de Enfermeria Carmen Maria (Guatemala).
- Es una escuela que forma profesionales de enfermeria.
- Sitio web y portal de pagos: enfermeriacarmenmaria.edu.gt
- Conceptos de pago: Inscripcion, Mensualidad (teoria y practica), Admisiones, Tramite de titulo.
- Para inscripciones y requisitos especificos, indicar que se comunicaran con el personal administrativo.
`.trim();

interface ReplyInput {
  userMessage: string;
  knowledgeBase: string;
  extraInstructions?: string | null;
  // Historial reciente para dar contexto (opcional)
  history?: { role: "user" | "assistant"; content: string }[];
}

// Genera una respuesta del bot a partir del mensaje del usuario.
export async function generateBotReply(input: ReplyInput): Promise<string> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OpenAI no configurado (falta API key)");
  }

  const system = [
    "Eres el asistente virtual de la Escuela de Enfermeria Carmen Maria.",
    "Respondes por WhatsApp, en espanol, de forma breve, cordial y clara.",
    "Solo respondes sobre la academia usando la INFORMACION proporcionada.",
    "Si no sabes algo o piden tramites personales (notas, estados de cuenta),",
    "indica amablemente que un miembro del personal le atendera pronto.",
    "No inventes datos (precios, fechas) que no esten en la informacion.",
    "",
    "INFORMACION DE LA ACADEMIA:",
    input.knowledgeBase || DEFAULT_KNOWLEDGE,
    input.extraInstructions ? `\nINSTRUCCIONES EXTRA:\n${input.extraInstructions}` : "",
  ].join("\n");

  const messages = [
    { role: "system", content: system },
    ...(input.history ?? []),
    { role: "user", content: input.userMessage },
  ];

  const res = await fetch(OPENAI_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 400,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message ?? `OpenAI respondio ${res.status}`);
  }
  return (
    data.choices?.[0]?.message?.content?.trim() ??
    "Disculpa, no pude procesar tu consulta en este momento."
  );
}
