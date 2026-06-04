import { prisma } from "../../lib/prisma.js";
import { sendTemplateAndLog } from "./whatsapp.service.js";
import { paidByCharge } from "../charges/charges.service.js";

// Idioma de las plantillas aprobadas en YCloud/Meta.
const LANG = "es";

function fmtMoney(n: number): string {
  return n.toFixed(2);
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

// Dias entre hoy y la fecha de vencimiento (negativo = ya vencio).
function daysUntil(due: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

// Que plantilla usar segun los dias hasta el vencimiento.
// 5 dias antes y el dia mismo -> recordatorio_pago; 3 y 7 dias despues -> aviso_mora.
function reminderForOffset(
  offset: number
): { template: string; kind: string } | null {
  if (offset === 5 || offset === 0)
    return { template: "recordatorio_pago", kind: `recordatorio_${offset}` };
  if (offset === -3 || offset === -7)
    return { template: "aviso_mora", kind: `mora_${Math.abs(offset)}` };
  return null;
}

// Recorre los cargos pendientes y envia el recordatorio (por PLANTILLA) que
// corresponda a hoy. Idempotente: no reenvia el mismo kind el mismo dia.
export async function runPaymentReminders(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
}> {
  const charges = await prisma.charge.findMany({
    where: { status: "PENDIENTE" },
    include: {
      student: { select: { id: true, fullName: true, phonePrimary: true } },
    },
  });

  const paid = await paidByCharge(charges.map((c) => c.id));
  let sent = 0;
  let skipped = 0;

  for (const c of charges) {
    const reminder = reminderForOffset(daysUntil(c.dueDate));
    if (!reminder) continue; // hoy no toca recordatorio para este cargo

    const saldo = Number(c.amount) - (paid.get(c.id) ?? 0);
    if (saldo <= 0) continue; // ya esta cubierto

    const phone = c.student?.phonePrimary;
    if (!phone) {
      skipped++;
      continue;
    }

    // Dedupe: ya se envio este kind para este cargo en las ultimas 20h?
    const since = new Date(Date.now() - 20 * 3600 * 1000);
    const already = await prisma.whatsappMessage.findFirst({
      where: {
        studentId: c.student?.id,
        kind: reminder.kind,
        direction: "OUTBOUND",
        createdAt: { gte: since },
      },
    });
    if (already) {
      skipped++;
      continue;
    }

    const first = c.student!.fullName.split(" ")[0];
    // Variables de la plantilla: {{1}} nombre, {{2}} concepto, {{3}} monto, {{4}} fecha
    const vars = [first, c.concept, fmtMoney(saldo), fmtDate(c.dueDate)];
    const preview = `[${reminder.template}] ${first} · ${c.concept} · Q${fmtMoney(saldo)} · ${fmtDate(c.dueDate)}`;
    const res = await sendTemplateAndLog(
      phone,
      reminder.template,
      LANG,
      vars,
      reminder.kind,
      preview
    );
    if (res.ok) sent++;
    else skipped++;
  }

  return { checked: charges.length, sent, skipped };
}

// Envio masivo: una plantilla a varios estudiantes.
// La plantilla debe usar como unica variable {{1}} = nombre del estudiante.
// `studentIds` vacio => todos los estudiantes ACTIVOS con telefono.
export async function sendBulk(input: {
  templateName: string;
  studentIds?: string[];
}): Promise<{ total: number; sent: number; skipped: number }> {
  const where =
    input.studentIds && input.studentIds.length > 0
      ? { id: { in: input.studentIds } }
      : { status: "ACTIVO" as const };

  const students = await prisma.student.findMany({
    where,
    select: { id: true, fullName: true, phonePrimary: true },
  });

  let sent = 0;
  let skipped = 0;
  for (const s of students) {
    if (!s.phonePrimary) {
      skipped++;
      continue;
    }
    const first = s.fullName.split(" ")[0];
    const preview = `[${input.templateName}] ${s.fullName}`;
    const res = await sendTemplateAndLog(
      s.phonePrimary,
      input.templateName,
      LANG,
      [first],
      "masivo",
      preview
    );
    if (res.ok) sent++;
    else skipped++;
  }
  return { total: students.length, sent, skipped };
}

// Confirmacion de pago recibido (plantilla confirmacion_pago).
// Vars: {{1}} nombre, {{2}} monto, {{3}} concepto.
export async function notifyPaymentReceived(paymentId: string): Promise<void> {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { student: { select: { fullName: true, phonePrimary: true } } },
  });
  if (!p || !p.student?.phonePrimary || p.status !== "ACTIVO") return;
  const net = Number(p.amount) - Number(p.discount);
  const first = p.student.fullName.split(" ")[0];
  const vars = [first, fmtMoney(net), p.concept];
  const preview = `[confirmacion_pago] ${first} · Q${fmtMoney(net)} · ${p.concept}`;
  await sendTemplateAndLog(
    p.student.phonePrimary,
    "confirmacion_pago",
    LANG,
    vars,
    "confirmacion_pago",
    preview
  );
}
