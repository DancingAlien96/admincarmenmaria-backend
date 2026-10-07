import { prisma } from "./prisma.js";
import fs from "node:fs/promises";
import path from "node:path";
import { sendBrandedMail, type MailAttachment } from "./mailer.js";
import { UPLOAD_ROOT } from "./storage.js";
import { paidByCharge } from "../modules/charges/charges.service.js";

function fmtMoney(n: number): string {
  return `Q${n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "estudiante";
}

// --- 1. Confirmación de pago -------------------------------------------------

export async function sendPaymentReceiptEmail(paymentId: string): Promise<void> {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { student: { select: { fullName: true, email: true } } },
  });
  if (!p || !p.student?.email || p.status !== "ACTIVO") return;
  const monto = Number(p.amount) - Number(p.discount);
  const body = `
    <p>Hola, ${firstName(p.student.fullName)}:</p>
    <p>Confirmamos que recibimos tu pago. ¡Gracias!</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin:14px 0;">
      <p style="margin:0 0 4px;"><strong>Concepto:</strong> ${escapeHtml(p.concept)}</p>
      <p style="margin:0 0 4px;"><strong>Monto:</strong> ${fmtMoney(monto)}</p>
      <p style="margin:0;"><strong>Fecha:</strong> ${fmtDate(p.paidAt)}</p>
    </div>
    <p style="color:#6b7280;font-size:13px;">Puedes ver tu estado de cuenta en el Campus, en la sección de Pagos.</p>`;
  const text =
    `Hola, ${firstName(p.student.fullName)}:\n\n` +
    `Confirmamos tu pago.\n` +
    `Concepto: ${p.concept}\nMonto: ${fmtMoney(monto)}\nFecha: ${fmtDate(p.paidAt)}\n\n` +
    `Puedes ver tu estado de cuenta en el Campus.`;
  await sendBrandedMail({
    to: p.student.email,
    subject: "Confirmación de pago · Campus Carmen María",
    heading: "Pago recibido",
    bodyHtml: body,
    text,
  });
}

// --- 2. Correo masivo ------------------------------------------------------
// Destinatarios: estudiantes (todos o una promoción), catedráticos, o personas
// específicas (alumnos/catedráticos elegidos y correos escritos a mano).
// Admite adjuntos ya subidos a /api/uploads (se leen del disco por su key).

export type BulkAudience = "students" | "teachers" | "custom";

export interface BulkEmailInput {
  subject: string;
  message: string;
  audience: BulkAudience;
  year?: number;
  studentIds?: string[];
  teacherIds?: string[];
  emails?: string[];
  attachments?: { key: string; name: string }[];
}

interface Recipient {
  email: string;
  name: string | null;
}

const MAX_ATTACHMENTS = 5;
const MAX_ATTACH_BYTES = 15 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Docentes: catedráticos del registro + usuarios con rol DOCENTE.
async function teacherRecipients(ids?: string[]): Promise<Recipient[]> {
  const [teachers, users] = await Promise.all([
    prisma.teacher.findMany({
      where: {
        active: true,
        email: { not: null },
        ...(ids ? { id: { in: ids } } : {}),
      },
      select: { email: true, fullName: true },
    }),
    ids
      ? Promise.resolve([] as { email: string; name: string }[])
      : prisma.user.findMany({
          where: { role: "DOCENTE", active: true },
          select: { email: true, name: true },
        }),
  ]);
  return [
    ...teachers.map((t) => ({ email: t.email as string, name: t.fullName })),
    ...users.map((u) => ({ email: u.email, name: u.name })),
  ];
}

export async function resolveBulkRecipients(
  input: BulkEmailInput
): Promise<Recipient[]> {
  let list: Recipient[] = [];
  if (input.audience === "students") {
    const students = await prisma.student.findMany({
      where: {
        archived: false,
        status: "ACTIVO",
        email: { not: null },
        ...(input.year
          ? {
              enrollmentDate: {
                gte: new Date(Date.UTC(input.year, 0, 1)),
                lt: new Date(Date.UTC(input.year + 1, 0, 1)),
              },
            }
          : {}),
      },
      select: { email: true, fullName: true },
    });
    list = students.map((s) => ({ email: s.email as string, name: s.fullName }));
  } else if (input.audience === "teachers") {
    list = await teacherRecipients();
  } else {
    const [students, teachers] = await Promise.all([
      input.studentIds?.length
        ? prisma.student.findMany({
            where: { id: { in: input.studentIds }, email: { not: null } },
            select: { email: true, fullName: true },
          })
        : Promise.resolve([]),
      input.teacherIds?.length
        ? teacherRecipients(input.teacherIds)
        : Promise.resolve([]),
    ]);
    list = [
      ...students.map((s) => ({ email: s.email as string, name: s.fullName })),
      ...teachers,
      ...(input.emails ?? [])
        .map((e) => e.trim())
        .filter((e) => EMAIL_RE.test(e))
        .map((e) => ({ email: e, name: null })),
    ];
  }
  // Sin duplicados (mismo correo una sola vez)
  const seen = new Set<string>();
  return list.filter((r) => {
    const k = r.email.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Lee los adjuntos del disco (solo archivos subidos al sistema).
export async function loadBulkAttachments(
  files: { key: string; name: string }[] = []
): Promise<MailAttachment[]> {
  if (files.length > MAX_ATTACHMENTS) {
    throw new Error(`Máximo ${MAX_ATTACHMENTS} archivos adjuntos`);
  }
  const out: MailAttachment[] = [];
  let total = 0;
  for (const f of files) {
    const key = path.basename(f.key); // evita rutas fuera de uploads
    const content = await fs.readFile(path.join(UPLOAD_ROOT, key));
    total += content.length;
    if (total > MAX_ATTACH_BYTES) {
      throw new Error("Los adjuntos superan 15 MB en total");
    }
    out.push({ filename: f.name || key, content });
  }
  return out;
}

export async function sendBulkEmail(
  input: BulkEmailInput,
  recipients: Recipient[],
  attachments: MailAttachment[]
): Promise<{ total: number; sent: number; skipped: number }> {
  const bodyMsg = escapeHtml(input.message).replace(/\n/g, "<br>");
  let sent = 0;
  let skipped = 0;
  for (const r of recipients) {
    const hello = r.name ? `Hola, ${firstName(r.name)}:` : "Hola:";
    const res = await sendBrandedMail({
      to: r.email,
      subject: input.subject,
      heading: input.subject,
      bodyHtml: `<p>${hello}</p><p>${bodyMsg}</p>`,
      text: `${hello}\n\n${input.message}`,
      attachments,
    });
    if (res.sent) sent++;
    else skipped++;
  }
  return { total: recipients.length, sent, skipped };
}

// Buscador de destinatarios para "personas específicas".
export async function searchEmailRecipients(search: string) {
  const q = search.trim();
  if (q.length < 2) return { students: [], teachers: [] };
  const [students, teachers] = await Promise.all([
    prisma.student.findMany({
      where: { email: { not: null }, fullName: { contains: q } },
      select: { id: true, fullName: true, email: true, status: true },
      take: 10,
    }),
    prisma.teacher.findMany({
      where: { active: true, email: { not: null }, fullName: { contains: q } },
      select: { id: true, fullName: true, email: true },
      take: 10,
    }),
  ]);
  return { students, teachers };
}

// --- 3. Recordatorios de cuotas por correo (programado a diario) -------------

// Días hasta el vencimiento (positivo = falta; negativo = ya venció).
function daysUntil(due: Date): number {
  const today = new Date();
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((b - a) / 86400000);
}

// 5 días antes y el día del vencimiento -> "por vencer"; 3 y 7 días después -> "mora".
function reminderKind(offset: number): "por_vencer" | "mora" | null {
  if (offset === 5 || offset === 0) return "por_vencer";
  if (offset === -3 || offset === -7) return "mora";
  return null;
}

export async function runEmailPaymentReminders(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
}> {
  // Cargos pendientes con vencimiento en la ventana relevante (-8 a +6 días).
  const now = new Date();
  const from = new Date(now.getTime() - 8 * 86400000);
  const to = new Date(now.getTime() + 6 * 86400000);
  const charges = await prisma.charge.findMany({
    where: {
      status: "PENDIENTE",
      dueDate: { gte: from, lte: to },
      student: { archived: false, status: "ACTIVO", email: { not: null } },
    },
    include: { student: { select: { fullName: true, email: true } } },
  });

  const paid = await paidByCharge(charges.map((c) => c.id));
  let sent = 0;
  let skipped = 0;

  for (const c of charges) {
    const saldo = Number(c.amount) - (paid.get(c.id) ?? 0);
    if (saldo <= 0) {
      skipped++;
      continue;
    }
    const kind = reminderKind(daysUntil(c.dueDate));
    if (!kind || !c.student?.email) {
      skipped++;
      continue;
    }

    const heading =
      kind === "por_vencer" ? "Recordatorio de pago" : "Cuota pendiente";
    const intro =
      kind === "por_vencer"
        ? `Te recordamos que tu cuota está por vencer.`
        : `Tienes una cuota pendiente de pago. Por favor regularízala lo antes posible.`;
    const body = `
      <p>Hola, ${firstName(c.student.fullName)}:</p>
      <p>${intro}</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin:14px 0;">
        <p style="margin:0 0 4px;"><strong>Concepto:</strong> ${escapeHtml(c.concept)}</p>
        <p style="margin:0 0 4px;"><strong>Saldo:</strong> ${fmtMoney(saldo)}</p>
        <p style="margin:0;"><strong>Vence:</strong> ${fmtDate(c.dueDate)}</p>
      </div>
      <p style="color:#6b7280;font-size:13px;">Si ya realizaste el pago, ignora este mensaje.</p>`;
    const text =
      `Hola, ${firstName(c.student.fullName)}:\n\n${intro}\n` +
      `Concepto: ${c.concept}\nSaldo: ${fmtMoney(saldo)}\nVence: ${fmtDate(c.dueDate)}\n\n` +
      `Si ya pagaste, ignora este mensaje.`;
    const r = await sendBrandedMail({
      to: c.student.email,
      subject:
        kind === "por_vencer"
          ? "Recordatorio de pago · Carmen María"
          : "Cuota pendiente · Carmen María",
      heading,
      bodyHtml: body,
      text,
    });
    if (r.sent) sent++;
    else skipped++;
  }
  return { checked: charges.length, sent, skipped };
}
