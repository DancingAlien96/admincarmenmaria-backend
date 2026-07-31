// Asigna número de expediente (AE-AAAA-NNNN) a los estudiantes que no tienen.
// Uso: docker exec carmenmaria-backend node dist/cli/assign-expedientes.js
import { prisma } from "../lib/prisma.js";
import { nextExpediente } from "../lib/expediente.js";

async function main() {
  const students = await prisma.student.findMany({
    where: { expedienteNumber: null },
    orderBy: [{ enrollmentDate: "asc" }, { createdAt: "asc" }],
    select: { id: true, enrollmentDate: true },
  });
  let assigned = 0;
  for (const s of students) {
    const num = await nextExpediente(s.enrollmentDate.getFullYear());
    await prisma.student.update({
      where: { id: s.id },
      data: { expedienteNumber: num },
    });
    assigned++;
  }
  console.log(`[expedientes] asignados=${assigned}`);
  await prisma.$disconnect();
}

void main();
