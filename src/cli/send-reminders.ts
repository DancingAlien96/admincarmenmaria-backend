// CLI de recordatorios de pago por WhatsApp.
// Lo ejecuta el cron diario: docker exec carmenmaria-backend node dist/cli/send-reminders.js
import { runPaymentReminders } from "../modules/whatsapp/notifications.service.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  const stamp = new Date().toISOString();
  try {
    const r = await runPaymentReminders();
    console.log(
      `[reminders ${stamp}] revisados=${r.checked} enviados=${r.sent} omitidos=${r.skipped}`
    );
  } catch (err) {
    console.error(`[reminders ${stamp}] ERROR:`, (err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
