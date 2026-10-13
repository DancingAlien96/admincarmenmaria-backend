// Configuración de los recibos electrónicos (FEL): interruptores de emisión
// (DteSettings), datos del emisor (DteIssuer), establecimientos por sede
// (DteEstablishment) y frases SAT (DtePhrase). El administrador la edita desde
// el panel; las credenciales de Digifact van en variables de entorno (ver
// src/lib/digifact.ts).

import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export type TaxAffiliation = "GEN" | "PEQ" | "EXE";

export interface FelEstablishment {
  id?: number;
  code: string; // código de establecimiento registrado en SAT
  commercialName: string; // nombre comercial del establecimiento
  sede: string | null; // sede del sistema a la que corresponde (ej. "Chiquimula")
  address: string;
  postalCode: string;
  municipality: string;
  department: string;
  isDefault: boolean; // se usa cuando la sede del pago no coincide con ninguno
  isActive: boolean; // los inactivos se conservan pero no se usan para emitir
}

export interface FelPhrase {
  phraseType: number; // TipoFrase (catálogo SAT)
  scenarioCode: number; // CodigoEscenario
  description?: string | null; // qué significa la frase; se imprime en el recibo
  isActive?: boolean; // las inactivas se conservan pero no van en el recibo
}

export interface FelConfig {
  enabled: boolean; // permitir emitir recibos FEL
  autoIssue: boolean; // emitir al aplicar un pago (manual, boleta aprobada, tarjeta)
  sendEmail: boolean; // enviar el recibo al correo del alumno al emitir a mano
  issuer: {
    nit: string;
    name: string; // nombre o razón social (NombreEmisor)
    commercialName: string;
    taxAffiliation: TaxAffiliation;
    email: string;
  };
  establishments: FelEstablishment[];
  phrases: FelPhrase[];
}

// Texto de respaldo por (tipo, escenario) para frases guardadas sin descripción.
export const PHRASE_TEXTS: Record<string, string> = {
  "1-1": "Sujeto a pagos trimestrales ISR",
  "1-2": "Sujeto a retención definitiva ISR",
  "1-3": "Sujeto a pago directo ISR",
  "2-1": "Agente de Retención del IVA",
  "3-1": "No genera derecho a crédito fiscal",
  "4-8": "Cuotas centros educativos. Exenta del IVA (art. 8 núm. 1 Ley del IVA)",
  "8-2": "Exenciones generales centros educativos privados. Exenta del ISR (art. 8 núm. 3 Ley de Actualización Tributaria)",
};

export function phraseText(p: FelPhrase): string {
  return (
    p.description?.trim() ||
    PHRASE_TEXTS[`${p.phraseType}-${p.scenarioCode}`] ||
    `Frase tipo ${p.phraseType}, escenario ${p.scenarioCode}`
  );
}

// Las filas iniciales (emisor, establecimiento 4 y frases 8/2 y 4/8) las crea
// la migración; si faltaran, la emisión queda desactivada y sin emisor.
// Devuelve también los establecimientos y frases inactivos (para administrarlos).
export async function getFelConfig(): Promise<FelConfig> {
  const [settings, issuer, establishments, phrases] = await Promise.all([
    prisma.dteSettings.findUnique({ where: { id: 1 } }),
    prisma.dteIssuer.findUnique({ where: { id: 1 } }),
    prisma.dteEstablishment.findMany({ orderBy: [{ isDefault: "desc" }, { id: "asc" }] }),
    prisma.dtePhrase.findMany({ orderBy: [{ phraseType: "asc" }, { scenarioCode: "asc" }] }),
  ]);
  return {
    enabled: settings?.enabled ?? false,
    autoIssue: settings?.autoIssue ?? false,
    sendEmail: settings?.sendEmail ?? true,
    issuer: {
      nit: issuer?.nit ?? "",
      name: issuer?.name ?? "",
      commercialName: issuer?.commercialName ?? "",
      taxAffiliation: (issuer?.taxAffiliation as TaxAffiliation | undefined) ?? "GEN",
      email: issuer?.email ?? "",
    },
    establishments: establishments.map((e) => ({
      id: e.id,
      code: e.code,
      commercialName: e.commercialName,
      sede: e.sede,
      address: e.address,
      postalCode: e.postalCode,
      municipality: e.municipality,
      department: e.department,
      isDefault: e.isDefault,
      isActive: e.isActive,
    })),
    phrases: phrases.map((p) => ({
      phraseType: p.phraseType,
      scenarioCode: p.scenarioCode,
      description: p.description,
      isActive: p.isActive,
    })),
  };
}

// Sedes entre las que se elige la de cada establecimiento: las dos de la
// escuela más cualquier otra que ya esté en uso en expedientes o pagos.
export const BASE_SEDES = ["Chiquimula", "Morales Izabal"];

export async function listSedes(): Promise<string[]> {
  const [students, payments, establishments] = await Promise.all([
    prisma.student.findMany({ where: { sede: { not: null } }, distinct: ["sede"], select: { sede: true } }),
    prisma.payment.findMany({ where: { sede: { not: null } }, distinct: ["sede"], select: { sede: true } }),
    prisma.dteEstablishment.findMany({ where: { sede: { not: null } }, select: { sede: true } }),
  ]);
  const seen = new Map<string, string>();
  for (const s of [...BASE_SEDES, ...[...students, ...payments, ...establishments].map((r) => r.sede)]) {
    const name = s?.trim();
    if (name && !seen.has(normalize(name))) seen.set(normalize(name), name);
  }
  return [...seen.values()];
}

// Guarda la configuración completa. Los establecimientos y frases que ya no
// vienen se eliminan (los recibos emitidos conservan su copia de los datos);
// para dejar de usarlos sin perderlos se marcan como inactivos.
export async function setFelConfig(cfg: FelConfig): Promise<FelConfig> {
  // Exactamente un establecimiento predeterminado, y activo: el marcado, o el primero activo.
  const activos = cfg.establishments.filter((e) => e.isActive);
  const defaultCode = (activos.find((e) => e.isDefault) ?? activos[0])?.code;
  const settings = { enabled: cfg.enabled, autoIssue: cfg.autoIssue, sendEmail: cfg.sendEmail };
  const issuer = {
    nit: cfg.issuer.nit,
    name: cfg.issuer.name,
    commercialName: cfg.issuer.commercialName,
    taxAffiliation: cfg.issuer.taxAffiliation,
    email: cfg.issuer.email || null,
  };

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.dteSettings.upsert({ where: { id: 1 }, create: { id: 1, ...settings }, update: settings }),
    prisma.dteIssuer.upsert({ where: { id: 1 }, create: { id: 1, ...issuer }, update: issuer }),
    prisma.dteEstablishment.deleteMany({
      where: { code: { notIn: cfg.establishments.map((e) => e.code) } },
    }),
    // La sede es única: se libera antes de reasignarla para poder intercambiarlas.
    prisma.dteEstablishment.updateMany({ data: { sede: null } }),
    prisma.dtePhrase.deleteMany({
      where: {
        NOT: { OR: cfg.phrases.map((p) => ({ phraseType: p.phraseType, scenarioCode: p.scenarioCode })) },
      },
    }),
  ];
  for (const e of cfg.establishments) {
    const data = {
      commercialName: e.commercialName,
      sede: e.sede?.trim() || null,
      address: e.address,
      postalCode: e.postalCode,
      municipality: e.municipality,
      department: e.department,
      isDefault: e.code === defaultCode,
      isActive: e.isActive,
    };
    ops.push(
      prisma.dteEstablishment.upsert({ where: { code: e.code }, create: { code: e.code, ...data }, update: data })
    );
  }
  for (const p of cfg.phrases) {
    const description = p.description?.trim() || null;
    const isActive = p.isActive ?? true;
    ops.push(
      prisma.dtePhrase.upsert({
        where: { phraseType_scenarioCode: { phraseType: p.phraseType, scenarioCode: p.scenarioCode } },
        create: { phraseType: p.phraseType, scenarioCode: p.scenarioCode, description, isActive },
        update: { description, isActive },
      })
    );
  }
  await prisma.$transaction(ops);
  return getFelConfig();
}

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Frases activas, tal como se copian en el recibo.
export function activePhrases(cfg: FelConfig): FelPhrase[] {
  return cfg.phrases
    .filter((p) => p.isActive !== false)
    .map((p) => ({ phraseType: p.phraseType, scenarioCode: p.scenarioCode, description: p.description ?? null }));
}

// Establecimiento activo para una sede del sistema (Chiquimula / Morales
// Izabal). Si ninguno coincide se usa el predeterminado.
export function establishmentForSede(
  cfg: FelConfig,
  sede: string | null | undefined
): FelEstablishment {
  const activos = cfg.establishments.filter((e) => e.isActive);
  const key = normalize(sede);
  if (key) {
    const match = activos.find((e) => {
      const es = normalize(e.sede);
      return es && (key.includes(es) || es.includes(key));
    });
    if (match) return match;
  }
  const fallback = activos.find((e) => e.isDefault) ?? activos[0];
  if (!fallback) throw new Error("No hay establecimientos FEL activos");
  return fallback;
}
