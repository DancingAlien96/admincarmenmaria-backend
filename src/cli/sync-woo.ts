// CLI de sincronizacion con WooCommerce.
// Cron diario: docker exec carmenmaria-backend node dist/cli/sync-woo.js
// Sync completa (historico): docker exec carmenmaria-backend node dist/cli/sync-woo.js --full
import { syncWooCommerce } from "../modules/payments/payments.service.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  const full = process.argv.includes("--full");
  const stamp = new Date().toISOString();
  try {
    const result = await syncWooCommerce({ full });
    console.log(
      `[sync-woo ${stamp}]${full ? " (FULL)" : ""} importados=${result.imported} actualizados=${result.updated} omitidos=${result.skipped}`
    );
  } catch (err) {
    console.error(`[sync-woo ${stamp}] ERROR:`, (err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
