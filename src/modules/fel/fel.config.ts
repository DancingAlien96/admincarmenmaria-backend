// Configuración de los recibos electrónicos (FEL): datos del emisor,
// establecimientos por sede y frases SAT. Se guarda en AppSetting para que el
// administrador la edite desde el panel; las credenciales de Digifact van en
// variables de entorno (ver src/lib/digifact.ts).

import { getSetting, setSetting } from "../../lib/settings.js";

const CONFIG_KEY = "fel_config";

export interface FelEstablecimiento {
  codigo: string; // código de establecimiento registrado en SAT
  nombre: string; // nombre comercial del establecimiento
  sede: string | null; // sede del sistema a la que corresponde (ej. "Chiquimula")
  direccion: string;
  codigoPostal: string;
  municipio: string;
  departamento: string;
}

export interface FelFrase {
  tipo: number; // TipoFrase (catálogo SAT)
  escenario: number; // CodigoEscenario
}

export interface FelConfig {
  habilitado: boolean; // permitir emitir recibos FEL
  emitirAutomatico: boolean; // emitir al aplicar un pago (manual, boleta aprobada, tarjeta)
  enviarCorreo: boolean; // enviar el recibo PDF al correo del alumno
  emisor: {
    nit: string;
    nombre: string; // nombre o razón social (NombreEmisor)
    nombreComercial: string;
    afiliacionIva: "GEN" | "PEQ" | "EXE";
    correo: string;
  };
  establecimientos: FelEstablecimiento[];
  frases: FelFrase[];
}

// Valores tomados del recibo que la academia emite hoy desde el portal de SAT.
export const FEL_CONFIG_DEFAULT: FelConfig = {
  habilitado: false,
  emitirAutomatico: false,
  enviarCorreo: true,
  emisor: {
    nit: "25531395",
    nombre: "CARMEN ALCIRA , REYES CERÓN DE SARMIENTO",
    nombreComercial: "ESCUELA PRIVADA DE AUXILIARES DE ENFERMERÍA CARMEN MARÍA",
    afiliacionIva: "GEN",
    correo: "",
  },
  establecimientos: [
    {
      codigo: "4",
      nombre: "ESCUELA PRIVADA DE AUXILIARES DE ENFERMERÍA CARMEN MARÍA",
      sede: "Chiquimula",
      direccion: "12 AVENIDA 2-61 zona 1, CHIQUIMULA, CHIQUIMULA",
      codigoPostal: "20001",
      municipio: "CHIQUIMULA",
      departamento: "CHIQUIMULA",
    },
  ],
  // 8/2: exenta del ISR (centros educativos privados) · 4/8: exenta del IVA (cuotas de centros educativos)
  frases: [
    { tipo: 8, escenario: 2 },
    { tipo: 4, escenario: 8 },
  ],
};

// Texto que SAT imprime para cada frase (tipo, escenario). Se muestra en el PDF.
export const FRASE_TEXTOS: Record<string, string> = {
  "1-1": "Sujeto a pagos trimestrales ISR",
  "1-2": "Sujeto a retención definitiva ISR",
  "1-3": "Sujeto a pago directo ISR",
  "2-1": "Agente de Retención del IVA",
  "3-1": "No genera derecho a crédito fiscal",
  "4-8": "Cuotas centros educativos. Exenta del IVA (art. 8 núm. 1 Ley del IVA)",
  "8-2": "Exenciones generales centros educativos privados. Exenta del ISR (art. 8 núm. 3 Ley de Actualización Tributaria)",
};

export function textoFrase(f: FelFrase): string {
  return FRASE_TEXTOS[`${f.tipo}-${f.escenario}`] ?? `Frase tipo ${f.tipo}, escenario ${f.escenario}`;
}

export async function getFelConfig(): Promise<FelConfig> {
  try {
    const raw = await getSetting(CONFIG_KEY);
    if (!raw) return FEL_CONFIG_DEFAULT;
    const stored = JSON.parse(raw) as Partial<FelConfig>;
    return {
      ...FEL_CONFIG_DEFAULT,
      ...stored,
      emisor: { ...FEL_CONFIG_DEFAULT.emisor, ...(stored.emisor ?? {}) },
      establecimientos: stored.establecimientos?.length
        ? stored.establecimientos
        : FEL_CONFIG_DEFAULT.establecimientos,
      frases: stored.frases?.length ? stored.frases : FEL_CONFIG_DEFAULT.frases,
    };
  } catch {
    return FEL_CONFIG_DEFAULT;
  }
}

export async function setFelConfig(cfg: FelConfig): Promise<FelConfig> {
  await setSetting(CONFIG_KEY, JSON.stringify(cfg));
  return getFelConfig();
}

function normalizar(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Establecimiento para una sede del sistema (Chiquimula / Morales Izabal). Si
// ninguno coincide se usa el primero (casa matriz).
export function establecimientoParaSede(
  cfg: FelConfig,
  sede: string | null | undefined
): FelEstablecimiento {
  const key = normalizar(sede);
  if (key) {
    const match = cfg.establecimientos.find((e) => {
      const es = normalizar(e.sede);
      return es && (key.includes(es) || es.includes(key));
    });
    if (match) return match;
  }
  const first = cfg.establecimientos[0];
  if (!first) throw new Error("No hay establecimientos FEL configurados");
  return first;
}
