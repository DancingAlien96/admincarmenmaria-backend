import { createApp } from "./app.js";
import { env, isProd } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { iniciarRecordatoriosDiarios } from "./lib/recordatorios-diarios.js";

async function main() {
  // Verifica conexion a la base de datos antes de escuchar
  await prisma.$connect();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(
      `🚀 API Carmen Maria escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`
    );
  });

  // Recordatorios de cuotas (correo + push) a diario a las 8:00 de Guatemala
  if (isProd) iniciarRecordatoriosDiarios();

  const shutdown = async () => {
    console.log("\nApagando servidor...");
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (err) => {
  console.error("No se pudo iniciar el servidor:", err);
  await prisma.$disconnect();
  process.exit(1);
});
