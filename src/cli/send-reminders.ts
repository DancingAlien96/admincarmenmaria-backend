// CLI de recordatorios de pago (WhatsApp + correo + push).
// Lo ejecuta el cron diario: docker exec carmenmaria-backend node dist/cli/send-reminders.js
import { runPaymentReminders } from "../modules/whatsapp/notifications.service.js";
import { runDailyReminders } from "../lib/recordatorios-diarios.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  const stamp = new Date().toISOString();
  try {
    const r = await runPaymentReminders();
    console.log(
      `[reminders wa ${stamp}] revisados=${r.checked} enviados=${r.sent} omitidos=${r.skipped}`
    );
  } catch (err) {
    console.error(`[reminders wa ${stamp}] ERROR:`, (err as Error).message);
    process.exitCode = 1;
  }
  try {
    // Correo + push: mismo control "una vez al día" que el envío automático
    const r = await runDailyReminders("cli");
    if (!r.ejecutado) console.log(`[reminders ${stamp}] correo/push ya enviados hoy (${r.ultimaEjecucion})`);
  } catch (err) {
    console.error(`[reminders ${stamp}] ERROR:`, (err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
