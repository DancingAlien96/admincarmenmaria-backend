import { prisma } from "./prisma.js";

// Ajustes globales del sistema (clave/valor en AppSetting).

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

const INSCRIPCIONES_KEY = "inscripciones_abiertas";

// ¿Están abiertas las inscripciones por link? Por defecto sí (si nunca se
// configuró), para no romper los links ya generados.
export async function areInscripcionesOpen(): Promise<boolean> {
  const v = await getSetting(INSCRIPCIONES_KEY);
  return v === null ? true : v === "true";
}

export async function setInscripcionesOpen(open: boolean) {
  await setSetting(INSCRIPCIONES_KEY, open ? "true" : "false");
}

// Criterios de aprobación (aplican a todas las fases)
const CRITERIOS_KEY = "criterios_aprobacion";

export interface CriteriosAprobacion {
  notaMinima: number; // nota mínima (sobre 100) para aprobar una fase
  retoMinimo: number; // % mínimo para aprobar el Reto de Comprensión
}

export const CRITERIOS_DEFAULT: CriteriosAprobacion = { notaMinima: 70, retoMinimo: 80 };

export async function getCriterios(): Promise<CriteriosAprobacion> {
  try {
    const raw = await getSetting(CRITERIOS_KEY);
    if (!raw) return CRITERIOS_DEFAULT;
    return { ...CRITERIOS_DEFAULT, ...(JSON.parse(raw) as Partial<CriteriosAprobacion>) };
  } catch {
    return CRITERIOS_DEFAULT;
  }
}

export async function setCriterios(c: CriteriosAprobacion) {
  await setSetting(CRITERIOS_KEY, JSON.stringify(c));
  return getCriterios();
}
