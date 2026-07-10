// Reordena un nombre "Nombres Apellidos" a "Apellidos Nombres" para ordenar
// y mostrar por apellido. Por defecto toma las 2 últimas palabras como
// apellidos, incluyendo partículas de apellidos compuestos ("De León").

const PARTICLES = new Set([
  "de", "del", "la", "las", "los", "y", "san", "santa",
  "da", "do", "dos", "van", "von", "mac", "mc",
]);

function splitName(full: string): { surnames: string[]; given: string[] } {
  const tokens = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return { surnames: tokens, given: [] };
  if (tokens.length === 2) return { surnames: [tokens[1]!], given: [tokens[0]!] };
  // Por defecto, las 2 últimas son apellidos.
  let start = tokens.length - 2;
  // Incluye partículas que preceden al apellido (De, De la, etc.).
  while (start - 1 >= 1 && PARTICLES.has(tokens[start - 1]!.toLowerCase())) {
    start--;
  }
  return { surnames: tokens.slice(start), given: tokens.slice(0, start) };
}

// "Juan Ernesto Arriaza Amador" -> "Arriaza Amador Juan Ernesto"
export function apellidoNombre(full: string): string {
  const { surnames, given } = splitName(full);
  return [...surnames, ...given].join(" ").trim() || (full ?? "").trim();
}

// Compara dos nombres por apellido (A→Z, ignorando acentos/mayúsculas).
export function compareByApellido(a: string, b: string): number {
  return apellidoNombre(a).localeCompare(apellidoNombre(b), "es", {
    sensitivity: "base",
  });
}
