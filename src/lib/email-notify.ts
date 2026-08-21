import { prisma } from "./prisma.js";
import { sendBrandedMail } from "./mailer.js";
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

// --- 2. Correo masivo a estudiantes -----------------------------------------

export async function sendBulkEmailToStudents(input: {
  subject: string;
  message: string;
  year?: number;
}): Promise<{ total: number; sent: number; skipped: number }> {
  const where: Record<string, unknown> = {
    archived: false,
    status: "ACTIVO",
    email: { not: null },
  };
  if (input.year) {
    where.enrollmentDate = {
      gte: new Date(Date.UTC(input.year, 0, 1)),
      lt: new Date(Date.UTC(input.year + 1, 0, 1)),
    };
  }
  const students = await prisma.student.findMany({
    where,
    select: { email: true, fullName: true },
  });

  const bodyMsg = escapeHtml(input.message).replace(/\n/g, "<br>");
  let sent = 0;
  let skipped = 0;
  for (const s of students) {
    if (!s.email) {
      skipped++;
      continue;
    }
    const body = `<p>Hola, ${firstName(s.fullName)}:</p><p>${bodyMsg}</p>`;
    const r = await sendBrandedMail({
      to: s.email,
      subject: input.subject,
      heading: input.subject,
      bodyHtml: body,
      text: `Hola, ${firstName(s.fullName)}:\n\n${input.message}`,
    });
    if (r.sent) sent++;
    else skipped++;
  }
  return { total: students.length, sent, skipped };
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
