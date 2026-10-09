// Fechas en hora de Guatemala (UTC-6, sin horario de verano).
//
// Las fechas de vencimiento (Charge.dueDate) son fechas de calendario guardadas
// como medianoche UTC (ej. 16 oct -> 2026-10-16T00:00:00Z). El servidor corre en
// UTC, así que "hoy" se calcula con el calendario de Guatemala, no del servidor:
// de 18:00 a 24:00 en Guatemala el servidor ya está en el día siguiente.

export const TZ_GT = "America/Guatemala";

// Fecha de hoy en Guatemala, como medianoche UTC (mismo formato que dueDate).
export function hoyGT(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_GT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00Z`);
}

// Días desde hoy (Guatemala) hasta el vencimiento: 0 = vence hoy, negativo = ya venció.
export function diasHasta(due: Date, now: Date = new Date()): number {
  const d = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((d - hoyGT(now).getTime()) / 86_400_000);
}

// Una cuota está vencida cuando su fecha ya pasó (el mismo día aún no lo está).
export function estaVencida(due: Date, now: Date = new Date()): boolean {
  return diasHasta(due, now) < 0;
}

// Fecha de vencimiento en texto ("16 de octubre de 2026"). Se formatea en UTC
// porque es una fecha de calendario; en hora de Guatemala saldría un día antes.
export function fmtVencimiento(due: Date): string {
  return new Intl.DateTimeFormat("es-GT", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(due);
}
