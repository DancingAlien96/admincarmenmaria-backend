import { prisma } from "../../lib/prisma.js";
import { sendAndLog } from "./whatsapp.service.js";
import { paidByCharge } from "../charges/charges.service.js";

function gtq(n: number): string {
  return "Q" + n.toFixed(2);
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

// Secuencia del documento: -5 (por vencer), 0 (vence hoy), +3 y +7 (mora).
const REMINDER_OFFSETS: Record<number, string> = {
  5: "recordatorio_preventivo",
  0: "aviso_vencimiento",
  [-3]: "mora_leve",
  [-7]: "mora_grave",
};

function messageFor(
  kind: string,
  studentName: string,
  concept: string,
  saldo: number,
  due: Date
): string {
  const first = studentName.split(" ")[0];
  switch (kind) {
    case "recordatorio_preventivo":
      return `Hola ${first}, le recordamos que su cuota "${concept}" por ${gtq(saldo)} vence el ${fmtDate(due)}. Escuela de Enfermeria Carmen Maria.`;
    case "aviso_vencimiento":
      return `Hola ${first}, su cuota "${concept}" por ${gtq(saldo)} vence HOY (${fmtDate(due)}). Agradecemos su pago puntual. Carmen Maria.`;
    case "mora_leve":
      return `Hola ${first}, su cuota "${concept}" por ${gtq(saldo)} vencio el ${fmtDate(due)} y esta pendiente. Por favor regularice su pago. Carmen Maria.`;
    case "mora_grave":
      return `Hola ${first}, su cuota "${concept}" por ${gtq(saldo)} tiene mas de una semana de mora (vencio ${fmtDate(due)}). Comuniquese con administracion. Carmen Maria.`;
    default:
      return `Hola ${first}, tiene un saldo pendiente de ${gtq(saldo)} en "${concept}".`;
  }
}

// Recorre los cargos pendientes y envia el recordatorio que corresponda a hoy.
// Idempotente: no reenvia el mismo kind para el mismo cargo el mismo dia.
export async function runPaymentReminders(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
}> {
  const charges = await prisma.charge.findMany({
    where: { status: "PENDIENTE" },
    include: { student: { select: { id: true, fullName: true, phonePrimary: true } } },
  });

  const paid = await paidByCharge(charges.map((c) => c.id));
  let sent = 0;
  let skipped = 0;

  for (const c of charges) {
    const offset = daysUntil(c.dueDate);
    const kind = REMINDER_OFFSETS[offset];
    if (!kind) continue; // hoy no toca recordatorio para este cargo

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
        kind,
        direction: "OUTBOUND",
        createdAt: { gte: since },
      },
    });
    if (already) {
      skipped++;
      continue;
    }

    const body = messageFor(kind, c.student!.fullName, c.concept, saldo, c.dueDate);
    const res = await sendAndLog(phone, body, kind);
    if (res.ok) sent++;
    else skipped++;
  }

  return { checked: charges.length, sent, skipped };
}

// Confirmacion de pago recibido (se llama al registrar/sincronizar un pago).
export async function notifyPaymentReceived(paymentId: string): Promise<void> {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { student: { select: { fullName: true, phonePrimary: true } } },
  });
  if (!p || !p.student?.phonePrimary || p.status !== "ACTIVO") return;
  const net = Number(p.amount) - Number(p.discount);
  const first = p.student.fullName.split(" ")[0];
  const body = `Hola ${first}, recibimos su pago de ${gtq(net)} por "${p.concept}". Gracias. Escuela de Enfermeria Carmen Maria.`;
  await sendAndLog(p.student.phonePrimary, body, "confirmacion_pago");
}

// Aviso de documento generado (acta/constancia).
export async function notifyDocument(
  phone: string,
  studentName: string,
  docDescription: string
): Promise<void> {
  const first = studentName.split(" ")[0];
  const body = `Hola ${first}, se ha generado su ${docDescription} en la Escuela de Enfermeria Carmen Maria. Pronto recibira mas informacion.`;
  await sendAndLog(phone, body, "documento");
}
