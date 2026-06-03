import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@enfermeriacarmenmaria.edu.gt";
  const password = process.env.ADMIN_PASSWORD ?? "Admin1234!";
  const name = process.env.ADMIN_NAME ?? "Administrador";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✔ El administrador ya existe: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { name, email, passwordHash, role: "ADMIN", active: true },
  });

  console.log("✔ Administrador creado:");
  console.log(`   Email: ${email}`);
  console.log(`   Contrasena: ${password}`);
  console.log("   (Cambiala despues del primer inicio de sesion)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
