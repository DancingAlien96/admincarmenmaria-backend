// CLI de recordatorios de pago (WhatsApp + correo + push).
// Lo ejecuta el cron diario: docker exec carmenmaria-backend node dist/cli/send-reminders.js
import { runPaymentReminders } from "../modules/whatsapp/notifications.service.js";
import { runEmailPaymentReminders } from "../lib/email-notify.js";
import { runPushPaymentReminders } from "../modules/avisos/avisos.service.js";
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
    const e = await runEmailPaymentReminders();
    console.log(
      `[reminders mail ${stamp}] revisados=${e.checked} enviados=${e.sent} omitidos=${e.skipped}`
    );
  } catch (err) {
    console.error(`[reminders mail ${stamp}] ERROR:`, (err as Error).message);
    process.exitCode = 1;
  }
  try {
    const p = await runPushPaymentReminders();
    console.log(`[reminders push ${stamp}] revisados=${p.checked} enviados=${p.sent}`);
  } catch (err) {
    console.error(`[reminders push ${stamp}] ERROR:`, (err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
