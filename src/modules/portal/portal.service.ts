import { prisma } from "../../lib/prisma.js";
import { notFound, forbidden, badRequest } from "../../lib/http-error.js";
import { normalizeName } from "../../lib/normalize.js";
import { hashPassword, verifyPassword } from "../../lib/auth.js";
import { studentAccount } from "../charges/charges.service.js";
import { getStudentChecklist } from "../doc-checklist/doc-checklist.service.js";
import { getStudentFases } from "../grades/grades.service.js";

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

  // Cuotas con una boleta en revisión (subida por el alumno).
  const pendientes = await prisma.payment.findMany({
    where: { studentId, status: "EN_REVISION", chargeId: { not: null } },
    select: { chargeId: true },
  });
  const enRevision = new Set(pendientes.map((p) => p.chargeId));

  const cuotas = charges
    // Orden cronológico ascendente para la línea de tiempo.
    .slice()
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((c) => {
      const revision = enRevision.has(c.id) && c.status !== "PAGADO";
      const estado = revision
        ? "en_revision"
        : c.status === "PAGADO" || c.saldo <= 0
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

// El alumno sube la boleta de una cuota (queda EN_REVISION hasta que el
// personal la apruebe).
export async function submitBoleta(
  userId: string,
  chargeId: string,
  input: { amount: number; method?: string; receiptUrl?: string; receiptKey?: string }
) {
  const studentId = await requireStudentId(userId);
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (!charge || charge.studentId !== studentId) {
    throw notFound("Cuota no encontrada");
  }
  if (charge.status === "PAGADO") throw badRequest("Esta cuota ya está pagada");
  if (!input.receiptUrl) throw badRequest("Adjunta la imagen o PDF de tu boleta");
  const existing = await prisma.payment.findFirst({
    where: { chargeId, status: "EN_REVISION" },
  });
  if (existing) {
    throw badRequest("Ya tienes una boleta en revisión para esta cuota");
  }
  const allowed = ["EFECTIVO", "TRANSFERENCIA", "DEPOSITO", "TARJETA"] as const;
  const method = (allowed as readonly string[]).includes(input.method ?? "")
    ? (input.method as (typeof allowed)[number])
    : "DEPOSITO";

  await prisma.payment.create({
    data: {
      studentId,
      chargeId,
      concept: charge.concept,
      amount: input.amount,
      method,
      source: "PORTAL",
      status: "EN_REVISION",
      receiptUrl: input.receiptUrl || null,
      receiptKey: input.receiptKey || null,
    },
  });
  return { ok: true };
}

// Checklist de documentación del alumno logueado (portal · Documentación).
export async function getDocumentosForUser(userId: string) {
  const studentId = await requireStudentId(userId);
  return getStudentChecklist(studentId);
}

// Fases y calificaciones del alumno logueado (portal · Fases).
export async function getFasesForUser(userId: string) {
  const studentId = await requireStudentId(userId);
  return getStudentFases(studentId);
}

// Días entre hoy y una fecha (solo fecha, sin hora).
function daysBetween(due: Date): number {
  const now = new Date();
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((b - a) / 86400000);
}

type Notif = {
  id: string;
  tipo: "pago" | "documento";
  titulo: string;
  detalle: string;
  fecha: Date | null;
  prioridad: "alta" | "media" | "baja";
};

const money = (n: number) =>
  `Q${n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Notificaciones del alumno (portal): cuotas por vencer/mora + documentos
// pendientes. Se calculan al vuelo (sin persistencia de leído/no leído).
export async function getNotificacionesForUser(userId: string) {
  const studentId = await requireStudentId(userId);
  const [{ charges }, checklist] = await Promise.all([
    studentAccount(studentId),
    getStudentChecklist(studentId),
  ]);

  const items: Notif[] = [];

  for (const c of charges) {
    if (c.status !== "PENDIENTE" || c.saldo <= 0) continue;
    const d = daysBetween(c.dueDate);
    if (d < 0) {
      items.push({
        id: `pago-${c.id}`,
        tipo: "pago",
        titulo: "Cuota vencida",
        detalle: `${c.concept} · saldo ${money(c.saldo)} · venció hace ${Math.abs(d)} día(s)`,
        fecha: c.dueDate,
        prioridad: "alta",
      });
    } else if (d <= 7) {
      items.push({
        id: `pago-${c.id}`,
        tipo: "pago",
        titulo: "Cuota por vencer",
        detalle: `${c.concept} · ${money(c.saldo)} · vence en ${d} día(s)`,
        fecha: c.dueDate,
        prioridad: d <= 3 ? "alta" : "media",
      });
    }
  }

  for (const it of checklist.items) {
    if (it.delivered) continue;
    items.push({
      id: `doc-${it.requirementId}`,
      tipo: "documento",
      titulo: "Documento pendiente",
      detalle: it.name + (it.notes ? ` · ${it.notes}` : ""),
      fecha: null,
      prioridad: "media",
    });
  }

  // Orden: prioridad (alta→baja), luego por fecha más próxima.
  const rank = { alta: 0, media: 1, baja: 2 } as const;
  items.sort((a, b) => {
    if (rank[a.prioridad] !== rank[b.prioridad])
      return rank[a.prioridad] - rank[b.prioridad];
    return (a.fecha?.getTime() ?? Infinity) - (b.fecha?.getTime() ?? Infinity);
  });

  return {
    items,
    total: items.length,
    altas: items.filter((i) => i.prioridad === "alta").length,
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
      photoUrl: true,
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
      photoUrl: s.photoUrl,
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
