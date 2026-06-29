// Fechas y números en palabras (español), para el cuerpo legal de las actas.

const UNITS = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis",
  "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
  "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete",
  "veintiocho", "veintinueve", "treinta", "treinta y uno",
];
const TENS: Record<number, string> = {
  30: "treinta", 40: "cuarenta", 50: "cincuenta", 60: "sesenta",
  70: "setenta", 80: "ochenta", 90: "noventa",
};
const DOW = [
  "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];

// Número en palabras 0..99 (suficiente para días, horas y conteos de alumnos).
export function numWords(n: number): string {
  if (n <= 31) return UNITS[n] ?? String(n);
  if (n < 100) {
    const t = Math.floor(n / 10) * 10;
    const u = n % 10;
    return u === 0 ? TENS[t]! : `${TENS[t]} y ${UNITS[u]}`;
  }
  return String(n);
}

export function yearWords(y: number): string {
  const r = y - 2000;
  if (r === 0) return "dos mil";
  return `dos mil ${numWords(r)}`;
}

export function hourWords(h: number): string {
  return `${numWords(h)} horas`;
}

// "lunes veintiséis de enero del año dos mil veintiséis" (usa getUTC* — las
// fechas se guardan a mediodía UTC para no desfasar el día calendario).
export function dateInWords(d: Date): string {
  return (
    `${DOW[d.getUTCDay()]} ${numWords(d.getUTCDate())} de ` +
    `${MONTHS[d.getUTCMonth()]} del año ${yearWords(d.getUTCFullYear())}`
  );
}

// "26/01/2026"
export function dateShort(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
