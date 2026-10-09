import { prisma } from "../../lib/prisma.js";
import { notFound, forbidden, badRequest, HttpError } from "../../lib/http-error.js";
import { normalizeName } from "../../lib/normalize.js";
import { hashPassword, verifyPassword } from "../../lib/auth.js";
import { studentAccount, paidByCharge, recomputeChargeStatus } from "../charges/charges.service.js";
import { getStudentChecklist } from "../doc-checklist/doc-checklist.service.js";
import { getStudentFases } from "../grades/grades.service.js";
import { getPaymentForReceipt } from "../payments/payments.service.js";
import {
  retoStatusByFase,
  getRetoForStudent,
  submitReto,
  getEncuesta,
  rateEncuesta,
} from "../fase-extras/fase-extras.service.js";
import {
  getMatricula,
  submitMatricula,
} from "../matricula/matricula.service.js";
import { env } from "../../config/env.js";
import { REVIEWABLE_PAYMENT, TILOPAY_VERIFY_NOTE } from "../../lib/payment-review.js";
import {
  isRecurrenteConfigured,
  createCheckout as createRecurrenteCheckout,
  getCheckout as getRecurrenteCheckout,
} from "../../lib/recurrente.js";
import {
  createCheckout,
  isTilopayConfigured,
  isApproved,
  type ReturnParams,
} from "../../lib/tilopay.js";

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
    where: { ...REVIEWABLE_PAYMENT, studentId, chargeId: { not: null } },
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
    cardEnabled: isRecurrenteConfigured() || isTilopayConfigured(),
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
    where: { ...REVIEWABLE_PAYMENT, chargeId },
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

// El alumno inicia un pago con tarjeta (checkout hospedado). Se usa Recurrente
// si está configurada; si no, Tilopay. Devuelve la URL de la pasarela.
export async function startCardPayment(userId: string, chargeId: string) {
  const studentId = await requireStudentId(userId);
  const usarRecurrente = isRecurrenteConfigured();
  if (!usarRecurrente && !isTilopayConfigured()) {
    throw badRequest("El pago con tarjeta no está disponible por el momento.");
  }
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (!student || !charge || charge.studentId !== studentId) {
    throw notFound("Cuota no encontrada");
  }
  if (charge.status === "PAGADO") throw badRequest("Esta cuota ya está pagada");
  // Tilopay exige el correo; Recurrente lo pide en su propio formulario
  if (!usarRecurrente && !student.email) {
    throw badRequest("Necesitas un correo en tu expediente para pagar con tarjeta.");
  }

  const paid = (await paidByCharge([chargeId])).get(chargeId) ?? 0;
  const amount = Math.max(0, Number(charge.amount) - paid);
  if (amount <= 0) throw badRequest("Esta cuota no tiene saldo pendiente");

  // Limpia intentos de tarjeta anteriores no aprobados (permite reintentar).
  await prisma.payment.deleteMany({
    where: { chargeId, status: "EN_REVISION", source: "PORTAL", method: "TARJETA" },
  });

  const orderNumber = `${chargeId}-${Date.now().toString(36)}`;
  const intento = await prisma.payment.create({
    data: {
      studentId,
      chargeId,
      concept: charge.concept,
      amount,
      method: "TARJETA",
      source: "PORTAL",
      status: "EN_REVISION",
      orderRef: orderNumber,
      payerEmail: student.email,
      payerName: student.fullName,
    },
  });

  if (usarRecurrente) {
    try {
      const co = await createRecurrenteCheckout({
        name: `${charge.concept} · ${student.fullName}`,
        amount,
        // Al volver, la pantalla de retorno consulta el estado del pago
        successUrl: `${env.FRONTEND_URL}/portal/pagos/retorno?proveedor=recurrente&ref=${intento.id}`,
        cancelUrl: `${env.FRONTEND_URL}/portal/pagos?cancelado=1`,
        metadata: { paymentId: intento.id, chargeId, studentId },
      });
      // El id del checkout (ch_...) identifica el pago en el webhook
      await prisma.payment.update({ where: { id: intento.id }, data: { orderRef: co.id } });
      return { url: co.url };
    } catch (err) {
      await prisma.payment.delete({ where: { id: intento.id } }).catch(() => undefined);
      console.error(
        `[recurrente] no se pudo iniciar el pago de la cuota ${chargeId}:`,
        (err as Error).message
      );
      throw new HttpError(
        502,
        "El pago con tarjeta no está disponible en este momento. Puedes pagar por transferencia subiendo tu boleta, o intentarlo más tarde."
      );
    }
  }

  const [firstName, ...rest] = student.fullName.trim().split(/\s+/);
  try {
    const url = await createCheckout({
      amount,
      orderNumber,
      redirect: `${env.FRONTEND_URL}/portal/pagos/retorno`,
      firstName: firstName ?? "Estudiante",
      lastName: rest.join(" ") || "-",
      email: student.email ?? "",
      phone: student.phonePrimary ?? undefined,
      address: student.address ?? undefined,
      city: student.municipality ?? undefined,
      state: student.department ?? undefined,
      country: "GT",
    });
    return { url };
  } catch (err) {
    // No se pudo abrir la pasarela: se borra el intento y se avisa claro.
    await prisma.payment.deleteMany({ where: { orderRef: orderNumber } });
    console.error(
      `[tilopay] no se pudo iniciar el pago de la cuota ${chargeId}:`,
      (err as Error).message
    );
    throw new HttpError(
      502,
      "El pago con tarjeta no está disponible en este momento. Puedes pagar por transferencia subiendo tu boleta, o intentarlo más tarde."
    );
  }
}

// --- Recurrente: aprobación por webhook y por consulta al volver -----------

// Marca un intento de pago con tarjeta como aprobado (idempotente) y avisa.
async function aprobarPagoTarjeta(paymentId: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.status === "ACTIVO") return;
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "ACTIVO", paidAt: new Date() },
  });
  if (p.chargeId) await recomputeChargeStatus(p.chargeId);
  void import("../../lib/email-notify.js")
    .then((m) => m.sendPaymentReceiptEmail(paymentId))
    .catch((e) => console.error("[email pago tarjeta]", (e as Error).message));
}

// Aplica un pago confirmado por Recurrente. Si el monto no coincide con el
// de la cuota, NO se aprueba solo: queda en revisión para el personal.
export async function aplicarPagoRecurrente(input: {
  checkoutId?: string | null;
  paymentId?: string | null;
  amountInCents?: number | null;
  intentId?: string | null;
}) {
  let p = input.checkoutId
    ? await prisma.payment.findFirst({ where: { orderRef: input.checkoutId, method: "TARJETA" } })
    : null;
  if (!p && input.paymentId) {
    p = await prisma.payment.findUnique({ where: { id: input.paymentId } });
  }
  if (!p) {
    console.error("[recurrente] pago confirmado sin intento registrado:", JSON.stringify(input));
    return { status: "no_encontrado" as const };
  }
  if (p.status === "ACTIVO") return { status: "aprobado" as const };
  const esperado = Math.round(Number(p.amount) * 100);
  if (input.amountInCents != null && input.amountInCents !== esperado) {
    await prisma.payment.update({
      where: { id: p.id },
      data: {
        concept: `${p.concept} (tarjeta · verificar en Recurrente · cobrado Q${(input.amountInCents / 100).toFixed(2)} · ${input.intentId ?? ""})`,
      },
    });
    console.error(`[recurrente] monto distinto en ${p.id}: esperado ${esperado}, cobrado ${input.amountInCents}`);
    return { status: "revision" as const };
  }
  await aprobarPagoTarjeta(p.id);
  return { status: "aprobado" as const };
}

// Al volver de Recurrente: se consulta el estado real del checkout (no se
// confía en la URL). El webhook también lo confirma por su lado.
export async function confirmRecurrentePayment(userId: string, ref: string) {
  const studentId = await requireStudentId(userId);
  const p = await prisma.payment.findUnique({ where: { id: ref } });
  if (!p || p.studentId !== studentId || p.method !== "TARJETA") {
    return { status: "no_encontrado" as const };
  }
  if (p.status === "ACTIVO") return { status: "aprobado" as const };
  if (!p.orderRef?.startsWith("ch_")) return { status: "no_encontrado" as const };
  try {
    const co = await getRecurrenteCheckout(p.orderRef);
    if (co.status === "paid") {
      return aplicarPagoRecurrente({
        checkoutId: co.id,
        amountInCents: co.total_in_cents ?? null,
      });
    }
    if (co.status === "expired") return { status: "rechazado" as const };
    // unpaid / payment_in_progress: el webhook lo confirmará
    return { status: "revision" as const };
  } catch {
    return { status: "error" as const };
  }
}

// Confirma el retorno del checkout de Tilopay y marca la cuota si fue aprobado.
export async function confirmCardPayment(
  userId: string,
  params: { order: string; tpt: string; code: string; auth: string; orderHash: string }
) {
  const studentId = await requireStudentId(userId);

  // ¿Ya se procesó este pago? (idempotente)
  const already = await prisma.payment.findFirst({
    where: { orderRef: params.order, status: "ACTIVO" },
  });
  if (already) return { status: "aprobado" as const };

  const pending = await prisma.payment.findFirst({
    where: { orderRef: params.order, status: "EN_REVISION", method: "TARJETA" },
  });
  if (!pending || pending.studentId !== studentId) {
    return { status: "no_encontrado" as const };
  }

  const rp: ReturnParams = {
    order: params.order,
    tpt: params.tpt,
    code: params.code,
    auth: params.auth,
    orderHash: params.orderHash,
    amount: Number(pending.amount),
    email: pending.payerEmail ?? "",
  };

  if (params.code !== "1") {
    // Rechazado / cancelado: se elimina el intento.
    await prisma.payment.delete({ where: { id: pending.id } });
    return { status: "rechazado" as const };
  }

  if (isApproved(rp)) {
    await prisma.payment.update({
      where: { id: pending.id },
      data: { status: "ACTIVO", paidAt: new Date() },
    });
    if (pending.chargeId) await recomputeChargeStatus(pending.chargeId);
    void import("../../lib/email-notify.js")
      .then((m) => m.sendPaymentReceiptEmail(pending.id))
      .catch((e) => console.error("[email pago tarjeta]", (e as Error).message));
    return { status: "aprobado" as const };
  }

  // code=1 pero la firma no verifica: no se marca automáticamente; queda en
  // revisión con nota para que el personal lo confirme contra Tilopay.
  await prisma.payment.update({
    where: { id: pending.id },
    data: {
      concept: `${pending.concept} (tarjeta · ${TILOPAY_VERIFY_NOTE} · auth ${params.auth})`,
    },
  });
  return { status: "revision" as const };
}

// Checklist de documentación del alumno logueado (portal · Documentación).
export async function getDocumentosForUser(userId: string) {
  const studentId = await requireStudentId(userId);
  return getStudentChecklist(studentId);
}

// Fases y calificaciones del alumno logueado (portal · Fases).
export async function getFasesForUser(userId: string) {
  const studentId = await requireStudentId(userId);
  const [data, reto] = await Promise.all([
    getStudentFases(studentId),
    retoStatusByFase(studentId),
  ]);
  // Cada fase lleva el estado de su Reto de Comprensión
  return {
    ...data,
    fases: data.fases.map((f) => ({ ...f, reto: reto[f.fase] })),
  };
}

// Reto de Comprensión y Encuesta del alumno logueado
export async function getRetoForUser(userId: string, fase: number) {
  return getRetoForStudent(await requireStudentId(userId), fase);
}
export async function submitRetoForUser(
  userId: string,
  fase: number,
  answers: Record<string, number>
) {
  return submitReto(await requireStudentId(userId), fase, answers);
}
export async function getEncuestaForUser(userId: string, fase: number) {
  return getEncuesta(await requireStudentId(userId), fase);
}
export async function rateEncuestaForUser(
  userId: string,
  fase: number,
  clave: string,
  rating: number
) {
  return rateEncuesta(await requireStudentId(userId), fase, clave, rating);
}

// Matrícula del alumno logueado (descarga del formulario y subida del PDF)
export async function getMatriculaForUser(userId: string) {
  return getMatricula(await requireStudentId(userId));
}
export async function submitMatriculaForUser(
  userId: string,
  input: { fileKey: string; fileName?: string }
) {
  return submitMatricula(await requireStudentId(userId), input);
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
  const [{ charges }, checklist, matricula, student] = await Promise.all([
    studentAccount(studentId),
    getStudentChecklist(studentId),
    getMatricula(studentId),
    prisma.student.findUnique({ where: { id: studentId }, select: { status: true } }),
  ]);

  const items: Notif[] = [];

  // Matrícula del año: falta subirla o fue rechazada (solo alumnos admitidos)
  if (student?.status === "ACTIVO") {
    const m = matricula.actual;
    if (!m) {
      items.push({
        id: `matricula-${matricula.year}`,
        tipo: "documento",
        titulo: "Matrícula pendiente",
        detalle: `Descarga el formulario de matrícula ${matricula.year}, fírmalo y súbelo en PDF.`,
        fecha: null,
        prioridad: "media",
      });
    } else if (m.status === "RECHAZADA") {
      items.push({
        id: `matricula-${matricula.year}`,
        tipo: "documento",
        titulo: "Matrícula rechazada",
        detalle: m.note ? `Motivo: ${m.note}. Vuelve a subirla.` : "Vuelve a subirla.",
        fecha: m.reviewedAt,
        prioridad: "alta",
      });
    }
  }

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

// --- Marco del portal (diseño Readdy) ---------------------------------------

// Datos del alumno para el menú lateral y el encabezado del portal.
export async function getMeForUser(userId: string) {
  const studentId = await requireStudentId(userId);
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      fullName: true,
      expedienteNumber: true,
      sede: true,
      status: true,
      photoUrl: true,
    },
  });
  if (!s) throw notFound("Expediente no encontrado");
  const [{ fases }, notifs] = await Promise.all([
    getStudentFases(studentId),
    getNotificacionesForUser(userId),
  ]);
  // Fase en curso: la primera que no está completada
  const idx = fases.findIndex((f) => f.estado !== "completado");
  const actual = idx === -1 ? fases[fases.length - 1] : fases[idx];
  const completadas = fases.filter((f) => f.estado === "completado").length;
  return {
    student: s,
    fase: {
      numero: actual.fase,
      nombre: actual.nombre,
      subtitulo: actual.subtitulo,
      total: fases.length,
      completadas,
    },
    notifCount: notifs.total,
  };
}

// Actividad reciente del alumno: pagos, documentos recibidos y cambios de
// estado del expediente (más recientes primero).
export async function getActividadForUser(userId: string, limit = 8) {
  const studentId = await requireStudentId(userId);
  const [pays, docs, history] = await Promise.all([
    prisma.payment.findMany({
      where: {
        studentId,
        OR: [{ status: "ACTIVO" }, REVIEWABLE_PAYMENT],
      },
      orderBy: { paidAt: "desc" },
      take: limit,
      select: { id: true, concept: true, status: true, paidAt: true },
    }),
    prisma.studentDocStatus.findMany({
      where: { studentId, delivered: true },
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: {
        id: true,
        receivedAt: true,
        updatedAt: true,
        requirement: { select: { name: true } },
      },
    }),
    prisma.studentStatusHistory.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, fromStatus: true, toStatus: true, createdAt: true },
    }),
  ]);

  type Evento = {
    id: string;
    tipo: "pago" | "documento" | "estado";
    estado: "ok" | "revision" | "info";
    titulo: string;
    fecha: Date;
  };
  const eventos: Evento[] = [
    ...pays.map((p) => ({
      id: `p-${p.id}`,
      tipo: "pago" as const,
      estado: p.status === "ACTIVO" ? ("ok" as const) : ("revision" as const),
      titulo:
        p.status === "ACTIVO"
          ? `Pago ${p.concept} aprobado`
          : `Pago ${p.concept} registrado - En revisión`,
      fecha: p.paidAt,
    })),
    ...docs.map((d) => ({
      id: `d-${d.id}`,
      tipo: "documento" as const,
      estado: "ok" as const,
      titulo: `Documento ${d.requirement.name} recibido`,
      fecha: d.receivedAt ?? d.updatedAt,
    })),
    ...history
      .filter((h) => h.fromStatus) // el alta inicial no es actividad
      .map((h) => ({
        id: `h-${h.id}`,
        tipo: "estado" as const,
        estado: "info" as const,
        titulo:
          h.fromStatus === "ASPIRANTE" && h.toStatus === "ACTIVO"
            ? "Solicitud de ingreso aceptada"
            : `Estado del expediente: ${h.toStatus.toLowerCase().replace("_", " ")}`,
        fecha: h.createdAt,
      })),
  ];
  return eventos
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
    .slice(0, limit);
}

// Comprobante (recibo PDF) del último pago aprobado de una cuota del alumno.
export async function getComprobanteForUser(userId: string, chargeId: string) {
  const studentId = await requireStudentId(userId);
  const pay = await prisma.payment.findFirst({
    where: { chargeId, studentId, status: "ACTIVO" },
    orderBy: { paidAt: "desc" },
    select: { id: true },
  });
  if (!pay) throw notFound("Esta cuota aún no tiene un pago aprobado");
  return getPaymentForReceipt(pay.id);
}
