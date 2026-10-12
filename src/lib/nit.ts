// Identificación tributaria del receptor de un DTE (Guatemala): NIT, CUI (DPI)
// o CF (consumidor final). Mismas reglas que usa bluestock, más el dígito
// verificador del NIT para no enviar a SAT un NIT mal escrito.

export type TaxIdTipo = "NIT" | "CUI" | "CF";

export interface TaxIdParsed {
  id: string; // valor listo para enviar a SAT ("CF", NIT sin ceros a la izquierda, CUI)
  tipo: TaxIdTipo;
}

const CF_VALUES = new Set(["CF", "C/F", "CONSUMIDOR FINAL", "CONSUMIDORFINAL"]);

// Mayúsculas y solo letras/números (quita guiones, espacios y puntos).
export function compactTaxId(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Vacío, "CF", "C/F" o "Consumidor final" cuentan como consumidor final.
export function isCF(value: string | null | undefined): boolean {
  const upper = (value ?? "").trim().toUpperCase();
  if (!upper) return true;
  return CF_VALUES.has(upper) || compactTaxId(value) === "CF";
}

// CUI (DPI) de Guatemala: 13 dígitos.
export function isValidCui(value: string | null | undefined): boolean {
  return /^\d{13}$/.test(compactTaxId(value));
}

// NIT de Guatemala con dígito verificador (módulo 11; "K" equivale a 10).
export function isValidNit(value: string | null | undefined): boolean {
  const compact = compactTaxId(value);
  if (!/^\d{1,12}[0-9K]$/.test(compact) || compact.length < 2) return false;
  const body = compact.slice(0, -1);
  const check = compact.slice(-1);
  let sum = 0;
  let weight = body.length + 1;
  for (const ch of body) {
    sum += Number(ch) * weight;
    weight--;
  }
  const mod = (11 - (sum % 11)) % 11;
  return check === (mod === 10 ? "K" : String(mod));
}

// Interpreta lo que escribió el usuario. Devuelve null si no es CF, ni un CUI,
// ni un NIT válido.
export function parseTaxId(value: string | null | undefined): TaxIdParsed | null {
  if (isCF(value)) return { id: "CF", tipo: "CF" };
  const compact = compactTaxId(value);
  if (isValidCui(compact)) return { id: compact, tipo: "CUI" };
  if (isValidNit(compact)) {
    return { id: compact.replace(/^0+(?=[0-9K])/, ""), tipo: "NIT" };
  }
  return null;
}
