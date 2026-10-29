import { createApp } from "./app.js";
import { env, isProd } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { iniciarRecordatoriosDiarios } from "./lib/recordatorios-diarios.js";
import { closeOrphanedPending } from "./modules/fel/fel.service.js";
import { configurarTelegram } from "./lib/telegram.js";

async function main() {
  // Verifica conexion a la base de datos antes de escuchar
  await prisma.$connect();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(
      `🚀 API Carmen Maria escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`
    );
  });

  // Recordatorios de cuotas (correo + push + Telegram) a diario a las 8:00 de Guatemala
  if (isProd) iniciarRecordatoriosDiarios();

  // Bot de Telegram: registra el webhook y los comandos (solo en producción)
  if (isProd) {
    void configurarTelegram().catch((e) =>
      console.error("[telegram] configuración:", (e as Error).message)
    );
  }

  // Emisiones FEL que quedaron a medias por un reinicio: se marcan con error y aviso.
  void closeOrphanedPending().catch((e) =>
    console.error("[fel] pendientes huérfanos:", (e as Error).message)
  );

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
