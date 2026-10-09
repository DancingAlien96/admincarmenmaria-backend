import { prisma } from "./prisma.js";
import { hoyGT, TZ_GT } from "./fecha-gt.js";
import { runEmailPaymentReminders } from "./email-notify.js";
import { runPushPaymentReminders } from "../modules/avisos/avisos.service.js";

// Recordatorios de cuotas (correo + notificación push), una vez al día.
// El propio servidor los programa: cada 10 minutos revisa si ya son las 8:00
// en Guatemala y si hoy todavía no se enviaron. La marca del día se guarda en
// AppSetting, así que aunque el servidor se reinicie, o también corra el cron
// del servidor o alguien presione "Ejecutar ahora", nadie recibe duplicados.

const KEY = "recordatorios_ultima_ejecucion";
const HORA_ENVIO = 8; // 8:00 a. m. hora de Guatemala
const CADA_MS = 10 * 60 * 1000;

function hoyTexto(): string {
  return hoyGT().toISOString().slice(0, 10); // AAAA-MM-DD (Guatemala)
}

// Reserva el día de hoy. Devuelve false si ya se ejecutó hoy.
async function reservarHoy(): Promise<boolean> {
  const hoy = hoyTexto();
  const valor = `${hoy} ${new Date().toISOString()}`;
  const r = await prisma.appSetting.updateMany({
    where: { key: KEY, NOT: { value: { startsWith: hoy } } },
    data: { value: valor },
  });
  if (r.count === 1) return true;
  try {
    await prisma.appSetting.create({ data: { key: KEY, value: valor } });
    return true; // primera vez
  } catch {
    return false; // ya existe con la fecha de hoy
  }
}

export async function ultimaEjecucion(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return row?.value.split(" ")[1] ?? null;
}

export interface ResultadoRecordatorios {
  ejecutado: boolean; // false = ya se habían enviado hoy
  ultimaEjecucion: string | null;
  correo?: { checked: number; sent: number; skipped: number };
  push?: { checked: number; sent: number };
}

export async function runDailyReminders(origen: string): Promise<ResultadoRecordatorios> {
  if (!(await reservarHoy())) {
    return { ejecutado: false, ultimaEjecucion: await ultimaEjecucion() };
  }
  const stamp = `[recordatorios ${origen} ${hoyTexto()}]`;
  let correo: ResultadoRecordatorios["correo"];
  let push: ResultadoRecordatorios["push"];
  try {
    correo = await runEmailPaymentReminders();
    console.log(`${stamp} correo: revisados=${correo.checked} enviados=${correo.sent} omitidos=${correo.skipped}`);
  } catch (err) {
    console.error(`${stamp} correo ERROR:`, (err as Error).message);
  }
  try {
    push = await runPushPaymentReminders();
    console.log(`${stamp} push: revisados=${push.checked} enviados=${push.sent}`);
  } catch (err) {
    console.error(`${stamp} push ERROR:`, (err as Error).message);
  }
  return { ejecutado: true, ultimaEjecucion: await ultimaEjecucion(), correo, push };
}

function horaGT(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ_GT, hour: "numeric", hourCycle: "h23" }).format(
      new Date()
    )
  );
}

// Arranca el programador (solo en producción; lo llama server.ts).
export function iniciarRecordatoriosDiarios(): void {
  const revisar = () => {
    if (horaGT() < HORA_ENVIO) return;
    void runDailyReminders("auto").catch((e) =>
      console.error("[recordatorios auto]", (e as Error).message)
    );
  };
  setTimeout(revisar, 60 * 1000); // un minuto después de arrancar
  setInterval(revisar, CADA_MS).unref();
  console.log(`⏰ Recordatorios de cuotas programados a diario a las ${HORA_ENVIO}:00 (Guatemala)`);
}
