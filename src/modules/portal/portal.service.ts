import { prisma } from "../../lib/prisma.js";
import { notFound, forbidden, badRequest } from "../../lib/http-error.js";
import { normalizeName } from "../../lib/normalize.js";
import { hashPassword, verifyPassword } from "../../lib/auth.js";
import { studentAccount } from "../charges/charges.service.js";

// Resuelve el studentId de la cuenta (valida rol ESTUDIANTE).
async function requireStudentId(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { studentId: true, role: true },
  });
  if (!u || u.role !== "ESTUDIANTE" || !u.studentId) {
    throw forbidden("Esta cuenta no es de un estudiante");
  }
  return u.studentId;
}

// Línea de tiempo de cuotas del alumno logueado (portal · Pagos).
export async function getCuotasForUser(userId: string) {
  const studentId = await requireStudentId(userId);
  const { charges, summary } = await studentAccount(studentId);

  const cuotas = charges
    // Orden cronológico ascendente para la línea de tiempo.
    .slice()
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((c) => {
      const estado =
        c.status === "PAGADO" || c.saldo <= 0
          ? "pagado"
          : c.overdue
            ? "vencido"
            : c.paid > 0
              ? "parcial"
              : "pendiente";
      return {
        id: c.id,
        concept: c.concept,
        amount: c.amount,
        paid: c.paid,
        saldo: c.saldo,
        dueDate: c.dueDate,
        estado,
      };
    });

  const pagadas = cuotas.filter((c) => c.estado === "pagado").length;
  return {
    cuotas,
    summary,
    progress: { pagadas, total: cuotas.length },
  };
}

// El alumno cambia su contraseña (verifica la actual).
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  if (newPassword.length < 6) {
    throw badRequest("La nueva contraseña debe tener al menos 6 caracteres");
  }
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw notFound("Cuenta no encontrada");
  const ok = await verifyPassword(currentPassword, u.passwordHash);
  if (!ok) throw badRequest("La contraseña actual no es correcta");
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  return { ok: true };
}

// Resuelve el expediente vinculado a la cuenta y arma su dashboard.
export async function getDashboardForUser(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { studentId: true, role: true },
  });
  if (!u || u.role !== "ESTUDIANTE" || !u.studentId) {
    throw forbidden("Esta cuenta no es de un estudiante");
  }
  return getStudentDashboard(u.studentId);
}

const num = (v: unknown) => Number(v ?? 0);

// Datos del dashboard del alumno logueado (portal del estudiante).
export async function getStudentDashboard(studentId: string) {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      expedienteNumber: true,
      fullName: true,
      sede: true,
      status: true,
      enrollmentDate: true,
      email: true,
      phonePrimary: true,
      _count: { select: { documents: true } },
    },
  });
  if (!s) throw notFound("Expediente no encontrado");

  const payments = await prisma.payment.findMany({
    where: { studentId, status: "ACTIVO" },
    orderBy: { paidAt: "desc" },
    select: { id: true, concept: true, amount: true, discount: true, paidAt: true, method: true },
  });

  // Mensualidad del mes en curso: ¿pagada?
  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const mensualidadPagada = payments.some(
    (p) => /mensual/i.test(p.concept) && p.paidAt >= mStart && p.paidAt <= mEnd
  );
  const totalPagado = payments.reduce((a, p) => a + num(p.amount) - num(p.discount), 0);

  // Calificaciones: se buscan en las actas por nombre (las actas guardan filas
  // por nombre, no por id).
  const actas = await prisma.acta.findMany({
    orderBy: { actaDate: "desc" },
    select: { title: true, actaNumber: true, actaDate: true, rows: true, vars: true, columns: true },
  });
  const key = normalizeName(s.fullName);
  type Grade = { acta: string; fase: string; date: Date; nota: string };
  const grades: Grade[] = [];
  for (const a of actas) {
    const rows = (a.rows as { name: string; value?: string; values?: string[] }[]) ?? [];
    const mine = rows.find((r) => normalizeName(r.name) === key);
    if (!mine) continue;
    const nota =
      mine.values && mine.values.length
        ? mine.values[mine.values.length - 1]!
        : (mine.value ?? "—");
    const fase = (a.vars as Record<string, string> | null)?.fase ?? a.title ?? a.actaNumber;
    grades.push({ acta: a.title ?? a.actaNumber, fase, date: a.actaDate, nota });
  }

  return {
    student: {
      id: s.id,
      expedienteNumber: s.expedienteNumber,
      fullName: s.fullName,
      sede: s.sede,
      status: s.status,
      enrollmentDate: s.enrollmentDate,
      email: s.email,
      phonePrimary: s.phonePrimary,
    },
    pagosRealizados: payments.length,
    totalPagado,
    mensualidadPagada,
    mesActual: new Intl.DateTimeFormat("es-GT", {
      month: "long",
      year: "numeric",
      timeZone: "America/Guatemala",
    }).format(now),
    documentos: s._count.documents,
    payments: payments.map((p) => ({
      id: p.id,
      concept: p.concept,
      amount: num(p.amount) - num(p.discount),
      paidAt: p.paidAt,
      method: p.method,
    })),
    grades,
  };
}
