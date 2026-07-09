import { normalizeName } from "./normalize.js";

// Distancia de edición (Levenshtein) entre dos cadenas.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n]!;
}

// Dos palabras "coinciden" si son iguales o difieren en 1 (typo) — para
// palabras de 4+ letras se toleran 2 diferencias.
function wordMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const d = levenshtein(a, b);
  const tol = Math.min(a.length, b.length) >= 5 ? 2 : 1;
  return d <= tol;
}

const tokens = (s: string) =>
  normalizeName(s)
    .split(" ")
    .filter((w) => w.length >= 2); // descarta "de", "y", iniciales sueltas

// Similitud 0..1 entre el nombre de un pago y el de un estudiante.
// Mide qué proporción de las palabras del pago aparece (aprox.) en el
// estudiante; penaliza cuando hay muy pocas palabras (nombres ambiguos).
export function nameSimilarity(payer: string, student: string): number {
  const p = tokens(payer);
  const s = tokens(student);
  if (p.length === 0 || s.length === 0) return 0;
  let matched = 0;
  for (const tp of p) if (s.some((ts) => wordMatch(tp, ts))) matched++;
  const ratio = matched / p.length;
  // Con 1 sola palabra coincidente el match es débil (muchas "Marías").
  if (matched < 2) return ratio * 0.45;
  return ratio;
}
