// Script CLI de sincronizacion con WooCommerce.
// Lo ejecuta el cron del servidor: docker exec carmenmaria-backend node dist/cli/sync-woo.js
// No usa HTTP ni credenciales: llama directo al servicio.
import { syncWooCommerce } from "../modules/payments/payments.service.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  const stamp = new Date().toISOString();
  try {
    const result = await syncWooCommerce();
    console.log(
      `[sync-woo ${stamp}] importados=${result.imported} actualizados=${result.updated} omitidos=${result.skipped}`
    );
  } catch (err) {
    console.error(`[sync-woo ${stamp}] ERROR:`, (err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
