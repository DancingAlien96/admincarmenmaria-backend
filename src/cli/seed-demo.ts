// Datos de demostración para el entorno local: tipos de cuota, plan de
// cuotas, dos expedientes (uno con identificación fiscal y otro CF) con
// cuotas y pagos aplicados, acceso al portal del primero y la configuración
// FEL habilitada. Idempotente: se puede correr varias veces.
//
//   npx tsx src/cli/seed-demo.ts

import { prisma } from "../lib/prisma.js";
import { createPortalAccount } from "../modules/students/students.service.js";
import { assignExpedienteIfMissing } from "../lib/expediente.js";
import { getFelConfig, setFelConfig } from "../modules/fel/fel.config.js";
import { parseTaxId } from "../lib/nit.js";

const FEES = [
  { name: "Examen de admisión", category: "OTROS", amount: 400 },
  { name: "Inscripción", category: "INSCRIPCION", amount: 500 },
  { name: "Mensualidad", category: "MENSUALIDAD", amount: 350 },
] as const;

const PLAN = [
  { concept: "Examen de admisión", amount: 400, monthOffset: 0, order: 0, admission: true },
  { concept: "Inscripción", amount: 500, monthOffset: 0, order: 1, admission: false },
  { concept: "Mensualidad 1", amount: 350, monthOffset: 1, order: 2, admission: false },
  { concept: "Mensualidad 2", amount: 350, monthOffset: 2, order: 3, admission: false },
  { concept: "Mensualidad 3", amount: 350, monthOffset: 3, order: 4, admission: false },
];

interface DemoStudent {
  fullName: string;
  email: string;
  dpi: string;
  taxId: string | null;
  sede: string;
  department: string;
  municipality: string;
  address: string;
  phonePrimary: string;
}

const STUDENTS: DemoStudent[] = [
  {
    fullName: "María José López García",
    email: "maria.lopez.demo@example.com",
    dpi: "2998765430101",
    taxId: "12345679", // NIT con dígito verificador válido (prueba)
    sede: "Chiquimula",
    department: "Chiquimula",
    municipality: "Chiquimula",
    address: "3a. calle 4-25 zona 2",
    phonePrimary: "5555-1001",
  },
  {
    fullName: "Carlos Enrique Pérez Morales",
    email: "carlos.perez.demo@example.com",
    dpi: "3012345670101",
    taxId: null, // sin identificación fiscal: el recibo sale a CF
    sede: "Morales Izabal",
    department: "Izabal",
    municipality: "Morales",
    address: "Barrio El Centro",
    phonePrimary: "5555-1002",
  },
];

function fecha(diasDesdeHoy: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + diasDesdeHoy);
  return d;
}

async function seedFees() {
  const byName = new Map<string, string>();
  for (const f of FEES) {
    const existing = await prisma.feeType.findFirst({ where: { name: f.name } });
    const row =
      existing ??
      (await prisma.feeType.create({
        data: { name: f.name, category: f.category, amount: f.amount },
      }));
    byName.set(f.name, row.id);
  }
  console.log(`✔ Tipos de cuota: ${FEES.map((f) => f.name).join(", ")}`);
  return byName;
}

async function seedPlan() {
  if ((await prisma.cuotaPlanItem.count()) > 0) {
    console.log("✔ Plan de cuotas ya existe");
    return;
  }
  await prisma.cuotaPlanItem.createMany({ data: PLAN });
  console.log(`✔ Plan de cuotas: ${PLAN.length} items`);
}

async function seedStudent(s: DemoStudent, admin: { id: string }, fees: Map<string, string>) {
  if (s.taxId && parseTaxId(s.taxId)?.tipo !== "NIT") {
    throw new Error(`NIT de prueba inválido: ${s.taxId}`);
  }
  let student = await prisma.student.findFirst({
    where: { email: s.email },
    include: { _count: { select: { charges: true } } },
  });
  if (student && student._count.charges >= 3) {
    console.log(`✔ Expediente ya existe: ${s.fullName}`);
    return student;
  }
  // Si quedó a medias (menos de 3 cuotas), se limpia y se completa.
  if (student && student._count.charges > 0) {
    await prisma.payment.deleteMany({ where: { studentId: student.id } });
    await prisma.charge.deleteMany({ where: { studentId: student.id } });
  }
  student ??= await prisma.student.create({
    data: {
      fullName: s.fullName,
      email: s.email,
      dpi: s.dpi,
      taxId: s.taxId,
      sede: s.sede,
      department: s.department,
      municipality: s.municipality,
      address: s.address,
      phonePrimary: s.phonePrimary,
      status: "ACTIVO",
      enrollmentDate: fecha(-40),
      createdById: admin.id,
      guardians: {
        create: [{ name: "Responsable de prueba", relationship: "Madre", phone: "5555-2000" }],
      },
    },
    include: { _count: { select: { charges: true } } },
  });
  await assignExpedienteIfMissing(student.id);

  // Cuotas: inscripción (pagada), mensualidad 1 (pagada), mensualidad 2 (pendiente)
  const inscripcion = await prisma.charge.create({
    data: {
      studentId: student.id,
      feeTypeId: fees.get("Inscripción"),
      concept: "Inscripción",
      amount: 500,
      dueDate: fecha(-35),
      status: "PAGADO",
      createdById: admin.id,
    },
  });
  const mensualidad1 = await prisma.charge.create({
    data: {
      studentId: student.id,
      feeTypeId: fees.get("Mensualidad"),
      concept: "Mensualidad 1",
      amount: 350,
      dueDate: fecha(-5),
      status: "PAGADO",
      createdById: admin.id,
    },
  });
  await prisma.charge.create({
    data: {
      studentId: student.id,
      feeTypeId: fees.get("Mensualidad"),
      concept: "Mensualidad 2",
      amount: 350,
      dueDate: fecha(25),
      status: "PENDIENTE",
      createdById: admin.id,
    },
  });

  // Pagos aplicados (sin recibo FEL: se emiten desde el panel para probar)
  await prisma.payment.createMany({
    data: [
      {
        studentId: student.id,
        chargeId: inscripcion.id,
        feeTypeId: fees.get("Inscripción"),
        concept: "Inscripción",
        amount: 500,
        discount: 0,
        method: "EFECTIVO",
        source: "MANUAL",
        status: "ACTIVO",
        paidAt: fecha(-35),
        registeredById: admin.id,
      },
      {
        studentId: student.id,
        chargeId: mensualidad1.id,
        feeTypeId: fees.get("Mensualidad"),
        concept: "Mensualidad 1",
        amount: 350,
        discount: 50, // beca: el recibo se certifica por el neto (Q300)
        method: "TRANSFERENCIA",
        source: "MANUAL",
        status: "ACTIVO",
        paidAt: fecha(-6),
        registeredById: admin.id,
      },
    ],
  });
  console.log(`✔ Expediente creado: ${s.fullName} (${s.taxId ? `NIT ${s.taxId}` : "CF"}) con 3 cuotas y 2 pagos`);
  return student;
}

async function seedFelConfig() {
  const cfg = await getFelConfig();
  if (cfg.enabled && cfg.autoIssue) {
    console.log("✔ Configuración FEL ya habilitada");
    return;
  }
  await setFelConfig({ ...cfg, enabled: true, autoIssue: true, sendEmail: true });
  console.log("✔ Configuración FEL: emisión habilitada y automática al aplicar pagos");
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!admin) throw new Error("Primero corre `npm run db:seed` para crear el administrador");

  const fees = await seedFees();
  await seedPlan();
  // En secuencia: el correlativo del expediente no admite creaciones en paralelo.
  const creados = [];
  for (const s of STUDENTS) creados.push(await seedStudent(s, admin, fees));
  const [maria] = creados;
  await seedFelConfig();

  // Acceso al portal del primer expediente (para probar la descarga del recibo)
  const acceso = await createPortalAccount(maria!.id);
  console.log(
    `✔ Portal del alumno: ${acceso.email} / ${acceso.defaultPassword}${acceso.reset ? " (contraseña reiniciada)" : ""}`
  );
  console.log("\nListo. Panel: admin@enfermeriacarmenmaria.edu.gt / Admin1234!");
}

main()
  .catch((e) => {
    console.error("✖", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
