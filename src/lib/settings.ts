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
