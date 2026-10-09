import type { Prisma, StudentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/http-error.js";
import { isPushConfigured, sendPushToUsers } from "../../lib/push.js";
import {
  resolveBulkRecipients,
  sendBulkEmail,
  daysUntil,
  reminderKind,
} from "../../lib/email-notify.js";
import { paidByCharge } from "../charges/charges.service.js";

// Avisos: mensajes que ve el usuario en su portal (con marca de leído) y que
// además llegan como notificación push a sus dispositivos suscritos.
//  - Manuales: los escribe el admin en el panel (opcionalmente también por correo).
//  - Automáticos: pago, matrícula, documento recibido, calificación.

export type AvisoTipo = "general" | "pago" | "matricula" | "documento" | "calificacion";

// Crea el aviso para esos usuarios y envía el push (sin esperar al envío).
async function crearAviso(input: {
  userIds: string[];
  tipo: AvisoTipo;
  titulo: string;
  mensaje: string;
  url?: string | null;
  destino?: string;
  canales?: string;
  createdById?: string;
}) {
  const userIds = [...new Set(input.userIds)];
  const aviso = await prisma.aviso.create({
    data: {
      tipo: input.tipo,
      titulo: input.titulo,
      mensaje: input.mensaje,
      url: input.url || null,
      destino: input.destino ?? null,
      canales: input.canales ?? null,
      createdById: input.createdById ?? null,
    },
  });
  if (userIds.length) {
    await prisma.avisoDestinatario.createMany({
      data: userIds.map((userId) => ({ avisoId: aviso.id, userId })),
      skipDuplicates: true,
    });
  }
  return { aviso, userIds };
}

async function pushAviso(avisoId: string, userIds: string[], titulo: string, mensaje: string, url?: string | null) {
  const n = await sendPushToUsers(userIds, { title: titulo, body: mensaje, url, tag: avisoId });
  if (n) await prisma.aviso.update({ where: { id: avisoId }, data: { pushEnviados: n } });
  return n;
}

// --- Automáticos --------------------------------------------------------------

// Aviso a un alumno (si tiene cuenta en el portal). Nunca lanza error: lo
// llaman los procesos de pagos/matrícula/documentos/notas y no debe romperlos.
export async function notificarAlumno(
  studentId: string | null | undefined,
  aviso: { tipo: AvisoTipo; titulo: string; mensaje: string; url?: string }
): Promise<void> {
  if (!studentId) return;
  try {
    const user = await prisma.user.findFirst({
      where: { studentId, active: true },
      select: { id: true },
    });
    if (!user) return;
    const { aviso: a } = await crearAviso({ userIds: [user.id], ...aviso });
    await pushAviso(a.id, [user.id], aviso.titulo, aviso.mensaje, aviso.url);
  } catch (err) {
    console.error("[aviso alumno]", (err as Error).message);
  }
}

function fmtQ(n: number): string {
  return `Q${n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Pago aplicado a la cuenta del alumno (registrado, boleta aprobada o tarjeta).
export async function notificarPagoAplicado(paymentId: string): Promise<void> {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { studentId: true, concept: true, amount: true, discount: true, status: true },
  });
  if (!p || p.status !== "ACTIVO") return;
  await notificarAlumno(p.studentId, {
    tipo: "pago",
    titulo: "Pago recibido",
    mensaje: `${p.concept} · ${fmtQ(Number(p.amount) - Number(p.discount))}. ¡Gracias!`,
    url: "/portal/pagos/",
  });
}

// Recordatorio push de cuotas (mismos días que el correo: 5 antes, el día,
// 3 y 7 después). Lo ejecuta el cron diario. No se guarda como aviso porque el
// portal ya muestra las cuotas pendientes en Notificaciones.
export async function runPushPaymentReminders(): Promise<{ checked: number; sent: number }> {
  if (!isPushConfigured()) return { checked: 0, sent: 0 };
  const now = new Date();
  const charges = await prisma.charge.findMany({
    where: {
      status: "PENDIENTE",
      dueDate: { gte: new Date(now.getTime() - 8 * 86400000), lte: new Date(now.getTime() + 6 * 86400000) },
      student: { archived: false, status: "ACTIVO", portalUser: { isNot: null } },
    },
    include: { student: { select: { portalUser: { select: { id: true, active: true } } } } },
  });
  const paid = await paidByCharge(charges.map((c) => c.id));
  let sent = 0;
  for (const c of charges) {
    const user = c.student?.portalUser;
    const saldo = Number(c.amount) - (paid.get(c.id) ?? 0);
    const kind = reminderKind(daysUntil(c.dueDate));
    if (!user?.active || saldo <= 0 || !kind) continue;
    const d = daysUntil(c.dueDate);
    const titulo = kind === "por_vencer" ? "Cuota por vencer" : "Cuota pendiente";
    const cuando = d === 0 ? "vence hoy" : d > 0 ? `vence en ${d} días` : `venció hace ${-d} días`;
    sent += await sendPushToUsers([user.id], {
      title: titulo,
      body: `${c.concept} · ${fmtQ(saldo)} · ${cuando}`,
      url: "/portal/pagos/",
      tag: `cuota-${c.id}`,
    });
  }
  return { checked: charges.length, sent };
}

// --- Manuales (panel) ---------------------------------------------------------

export interface EnviarAvisoInput {
  titulo: string;
  mensaje: string;
  url?: string | null;
  audience: "students" | "teachers" | "custom";
  year?: number;
  sede?: string;
  incluirAspirantes?: boolean;
  studentIds?: string[];
  teacherIds?: string[];
  push: boolean;
  email: boolean;
}

function studentFilter(input: EnviarAvisoInput): Prisma.StudentWhereInput {
  const status: StudentStatus[] = input.incluirAspirantes ? ["ACTIVO", "ASPIRANTE"] : ["ACTIVO"];
  return {
    archived: false,
    status: { in: status },
    ...(input.sede ? { sede: input.sede } : {}),
    ...(input.year
      ? {
          enrollmentDate: {
            gte: new Date(Date.UTC(input.year, 0, 1)),
            lt: new Date(Date.UTC(input.year + 1, 0, 1)),
          },
        }
      : {}),
  };
}

// Usuarios del sistema (con acceso al portal) que reciben el aviso.
async function resolveUsers(input: EnviarAvisoInput): Promise<string[]> {
  if (input.audience === "students") {
    const users = await prisma.user.findMany({
      where: { role: "ESTUDIANTE", active: true, student: studentFilter(input) },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  if (input.audience === "teachers") {
    const users = await prisma.user.findMany({
      where: { role: "DOCENTE", active: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  // Personas específicas: cuentas de los alumnos elegidos y de los catedráticos
  // (el catedrático se enlaza con su cuenta docente por el correo).
  const [alumnos, teachers] = await Promise.all([
    input.studentIds?.length
      ? prisma.user.findMany({
          where: { studentId: { in: input.studentIds }, active: true },
          select: { id: true },
        })
      : Promise.resolve([]),
    input.teacherIds?.length
      ? prisma.teacher.findMany({
          where: { id: { in: input.teacherIds }, email: { not: null } },
          select: { email: true },
        })
      : Promise.resolve([]),
  ]);
  const emails = teachers.map((t) => t.email as string);
  const docentes = emails.length
    ? await prisma.user.findMany({
        where: { role: "DOCENTE", active: true, email: { in: emails } },
        select: { id: true },
      })
    : [];
  return [...alumnos, ...docentes].map((u) => u.id);
}

async function resolveEmails(input: EnviarAvisoInput) {
  if (input.audience === "students") {
    const students = await prisma.student.findMany({
      where: { ...studentFilter(input), email: { not: null } },
      select: { email: true, fullName: true },
    });
    const seen = new Set<string>();
    return students
      .map((s) => ({ email: s.email as string, name: s.fullName }))
      .filter((r) => {
        const k = r.email.trim().toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }
  return resolveBulkRecipients({
    subject: input.titulo,
    message: input.mensaje,
    audience: input.audience,
    studentIds: input.studentIds,
    teacherIds: input.teacherIds,
  });
}

function destinoTexto(input: EnviarAvisoInput): string {
  if (input.audience === "teachers") return "Catedráticos";
  if (input.audience === "custom") {
    const n = (input.studentIds?.length ?? 0) + (input.teacherIds?.length ?? 0);
    return `${n} persona(s) específica(s)`;
  }
  const partes = [input.incluirAspirantes ? "Estudiantes y aspirantes" : "Estudiantes activos"];
  if (input.year) partes.push(`promoción ${input.year}`);
  if (input.sede) partes.push(`sede ${input.sede}`);
  return partes.join(" · ");
}

export async function enviarAviso(input: EnviarAvisoInput, createdById?: string) {
  const [userIds, emails] = await Promise.all([
    resolveUsers(input),
    input.email ? resolveEmails(input) : Promise.resolve([]),
  ]);
  if (!userIds.length && !emails.length) {
    throw badRequest("No hay destinatarios con esos filtros (necesitan cuenta en el portal o correo).");
  }
  const canales = ["portal", input.push ? "push" : null, input.email ? "correo" : null]
    .filter(Boolean)
    .join(",");
  const { aviso } = await crearAviso({
    userIds,
    tipo: "general",
    titulo: input.titulo,
    mensaje: input.mensaje,
    url: input.url,
    destino: destinoTexto(input),
    canales,
    createdById,
  });

  // Cuántos tienen notificaciones activadas (para informar al admin)
  const conPush = input.push && userIds.length
    ? (await prisma.pushSubscription.groupBy({ by: ["userId"], where: { userId: { in: userIds } } })).length
    : 0;

  // El envío (push y correo) sigue en segundo plano.
  void (async () => {
    if (input.push) await pushAviso(aviso.id, userIds, input.titulo, input.mensaje, input.url);
    if (emails.length) {
      const r = await sendBulkEmail(
        { subject: input.titulo, message: input.mensaje, audience: input.audience },
        emails,
        []
      );
      await prisma.aviso.update({ where: { id: aviso.id }, data: { correosEnviados: r.sent } });
    }
  })().catch((e) => console.error("[aviso envío]", (e as Error).message));

  return {
    id: aviso.id,
    destinatarios: userIds.length,
    conPush,
    correos: emails.length,
    pushConfigurado: isPushConfigured(),
  };
}

export async function listAvisos(limit = 50) {
  const rows = await prisma.aviso.findMany({
    where: { tipo: "general" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { destinatarios: true } },
    },
  });
  const leidos = rows.length
    ? await prisma.avisoDestinatario.groupBy({
        by: ["avisoId"],
        where: { avisoId: { in: rows.map((r) => r.id) }, readAt: { not: null } },
        _count: { _all: true },
      })
    : [];
  const leidosMap = new Map(leidos.map((l) => [l.avisoId, l._count._all]));
  return rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    mensaje: r.mensaje,
    url: r.url,
    destino: r.destino,
    canales: r.canales?.split(",") ?? [],
    destinatarios: r._count.destinatarios,
    leidos: leidosMap.get(r.id) ?? 0,
    pushEnviados: r.pushEnviados,
    correosEnviados: r.correosEnviados,
    creadoPor: r.createdBy?.name ?? null,
    createdAt: r.createdAt,
  }));
}

export async function deleteAviso(id: string) {
  const a = await prisma.aviso.findUnique({ where: { id } });
  if (!a) throw notFound("Aviso no encontrado");
  await prisma.aviso.delete({ where: { id } });
  return { ok: true };
}

// Filtros disponibles: promociones (años) y sedes de los estudiantes.
export async function avisoOpciones() {
  const rows = await prisma.student.findMany({
    where: { archived: false, status: { in: ["ACTIVO", "ASPIRANTE"] } },
    select: { sede: true, enrollmentDate: true },
  });
  const years = [...new Set(rows.map((r) => r.enrollmentDate?.getUTCFullYear()).filter((y): y is number => !!y))].sort((a, b) => b - a);
  const sedes = [...new Set(rows.map((r) => r.sede?.trim()).filter((s): s is string => !!s))].sort();
  return { years, sedes, pushConfigurado: isPushConfigured() };
}

// --- Bandeja del usuario (portal del alumno / docente) --------------------------

export async function misAvisos(userId: string, limit = 50) {
  const rows = await prisma.avisoDestinatario.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { aviso: true },
  });
  const noLeidos = await prisma.avisoDestinatario.count({ where: { userId, readAt: null } });
  return {
    noLeidos,
    items: rows.map((r) => ({
      id: r.aviso.id,
      tipo: r.aviso.tipo,
      titulo: r.aviso.titulo,
      mensaje: r.aviso.mensaje,
      url: r.aviso.url,
      fecha: r.aviso.createdAt,
      leido: !!r.readAt,
    })),
  };
}

export function contarNoLeidos(userId: string) {
  return prisma.avisoDestinatario.count({ where: { userId, readAt: null } });
}

export async function marcarLeido(userId: string, avisoId?: string) {
  await prisma.avisoDestinatario.updateMany({
    where: { userId, readAt: null, ...(avisoId ? { avisoId } : {}) },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
