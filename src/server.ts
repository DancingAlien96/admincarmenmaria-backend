import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  // Verifica conexion a la base de datos antes de escuchar
  await prisma.$connect();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(
      `🚀 API Carmen Maria escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`
    );
  });

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
