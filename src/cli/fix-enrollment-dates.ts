// CLI puntual: corrige enrollmentDate de estudiantes auto-creados desde pagos.
// Pone la fecha de inscripcion = fecha del pago de inscripcion mas antiguo del
// estudiante. Solo afecta estudiantes cuyo alta fue automatica.
// Uso: docker exec carmenmaria-backend node dist/cli/fix-enrollment-dates.js
import { prisma } from "../lib/prisma.js";

async function main() {
  // Estudiantes dados de alta automaticamente (historial con ese motivo).
  const autoCreated = await prisma.student.findMany({
    where: {
      statusHistory: {
        some: { reason: "Alta automatica por pago de inscripcion" },
      },
    },
    select: { id: true, enrollmentDate: true },
  });

  let fixed = 0;
  for (const s of autoCreated) {
    // Pago de inscripcion mas antiguo de ese estudiante
    const firstInscription = await prisma.payment.findFirst({
      where: {
        studentId: s.id,
        concept: { contains: "nscrip" },
        status: "ACTIVO",
      },
      orderBy: { paidAt: "asc" },
      select: { paidAt: true },
    });
    if (!firstInscription) continue;

    // Solo actualiza si la fecha difiere (por dia)
    const a = s.enrollmentDate.toISOString().slice(0, 10);
    const b = firstInscription.paidAt.toISOString().slice(0, 10);
    if (a !== b) {
      await prisma.student.update({
        where: { id: s.id },
        data: { enrollmentDate: firstInscription.paidAt },
      });
      fixed++;
    }
  }

  console.log(
    `[fix-enrollment] revisados=${autoCreated.length} corregidos=${fixed}`
  );
  await prisma.$disconnect();
}

void main();
