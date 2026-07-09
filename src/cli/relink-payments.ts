// Re-vincula pagos huerfanos (sin estudiante) a su expediente por correo/nombre.
// Uso: docker exec carmenmaria-backend node dist/cli/relink-payments.js
import { relinkOrphanPayments } from "../modules/payments/payments.service.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  const stamp = new Date().toISOString();
  try {
    const r = await relinkOrphanPayments();
    console.log(
      `[relink ${stamp}] huerfanos=${r.total} vinculados=${r.linked} restantes=${r.remaining}`
    );
  } catch (err) {
    console.error(`[relink ${stamp}] ERROR:`, (err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
