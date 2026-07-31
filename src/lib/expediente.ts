import { prisma } from "./prisma.js";

// Genera el siguiente correlativo de expediente para un año: AE-2025-0147.
export async function nextExpediente(year: number): Promise<string> {
  const prefix = `AE-${year}-`;
  const last = await prisma.student.findFirst({
    where: { expedienteNumber: { startsWith: prefix } },
    orderBy: { expedienteNumber: "desc" },
    select: { expedienteNumber: true },
  });
  let seq = 1;
  if (last?.expedienteNumber) {
    const n = parseInt(last.expedienteNumber.slice(prefix.length), 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// Asigna expediente a un estudiante si aún no tiene (usa su año de inscripción).
export async function assignExpedienteIfMissing(
  studentId: string
): Promise<string | null> {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: { expedienteNumber: true, enrollmentDate: true },
  });
  if (!s) return null;
  if (s.expedienteNumber) return s.expedienteNumber;
  const num = await nextExpediente(s.enrollmentDate.getFullYear());
  await prisma.student.update({
    where: { id: studentId },
    data: { expedienteNumber: num },
  });
  return num;
}
