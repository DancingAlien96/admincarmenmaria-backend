import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? "admin@enfermeriacarmenmaria.edu.gt";
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Administrador";

  if (!password || password.length < 8) {
    console.error("✖ ADMIN_PASSWORD no definida o muy corta. No se crea el administrador.");
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✔ El administrador ya existe: ${email}`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { name, email, passwordHash, role: "ADMIN", active: true },
  });
  console.log(`✔ Administrador creado: ${email}`);
}

const DIRECTORA = "Licda. Ana Patricia Corado Arroyo";
const SECRETARIO = "Lic. Héctor Manuel Sarmiento Reyes";

const CALIF_BODY = `El infrascrito Secretario de la Escuela Privada de auxiliares de Enfermería "CARMEN MARÍA" CERTIFICA: Haber tenido a la vista el Libro de Registro de Calificaciones autorizado por el Departamento de Formación y Educación en Salud del Ministerio de Salud Pública y Asistencia Social de fecha veinte de enero del año dos mil diecisiete (20/01/2017) en el que a folios números {{folios}} se encuentra el Acta número {{numero}}, que transcrita literalmente dice: --------------------------------------------------

Acta {{numero}}. En la ciudad de {{ciudad}} del Departamento de {{departamento}} siendo las {{hora_letras}} en punto del día {{fecha_letras}}, estando reunidos en oficinas administrativas de la Escuela Privada de Auxiliares de Enfermería Carmen María de Chiquimula, {{directora}}, Directora Técnica y quien suscribe la presente, {{secretario}}, Secretario, dejando constancia de lo siguiente. PRIMERO. {{directora}}, Directora Técnica da palabras de bienvenida a los estudiantes y procede a indicar que el día de hoy se realizará la evaluación final de la {{fase}}. SEGUNDO: La Dirección da detalles e instrucciones a los estudiantes para elaborar dicha evaluación, indicando que tienen una hora para realizarla. TERCERO: El Secretario procede a registrar las notas obtenidas durante dicha evaluación, siendo estas las siguientes:

{{tabla}}

CUARTO. No habiendo más que hacer constar se da por finalizada la presente acta, en el mismo lugar y fecha, siendo las {{hora_cierre_letras}} en punto. Damos fe los que en ella intervenimos.

Y PARA REMITIR A DONDE CORRESPONDE, SE EXTIENDE LA PRESENTE EN PAPEL BOND MEMBRETADO, EL DÍA {{FECHA_CIERRE_LETRAS}}.`;

const INAUG_BODY = `El infrascrito Secretario de la Escuela Privada de auxiliares de Enfermería "CARMEN MARÍA" CERTIFICA: Haber tenido a la vista el Libro de Actas autorizado por el Departamento de Formación y Educación en Salud del Ministerio de Salud Pública y Asistencia Social de fecha veinte de febrero del año dos mil diecisiete (20/02/2017) en el que a folios números {{folios}} se encuentra el Acta número {{numero}}, que transcrita literalmente dice: --------------------------------------------------

Acta {{numero}}. En la ciudad de {{ciudad}} del Departamento de {{departamento}} siendo las {{hora_letras}} en punto del día {{fecha_letras}}, estando reunidos en oficinas administrativas de la Escuela Privada de Auxiliares de Enfermería "Carmen María", doce avenida tercera calle, segundo nivel edificio Veredita, las siguientes personas: {{directora}}, Directora Técnica; {{docente}}, Docente; Y quien suscribe la presente acta {{secretario}}, Secretario; dejando constancia de lo siguiente: PRIMERO: Se da por iniciado el acto de inauguración correspondiente a la {{promocion}} promoción de auxiliares de enfermería del año {{cohorte_letras}}, la Dirección procede a dar las palabras de bienvenida a los presentes. SEGUNDO: El Secretario procede a presentar al personal administrativo y docente de la escuela; también hace presentación de la resolución Ministerial que avala al centro educativo y procede a informar los detalles generales del curso. TERCERO: El personal docente procede a presentarse con el grupo estudiantil e informa que formará parte del personal que impartirá el curso. CUARTO: La Dirección procede a dar lectura a la normativa interna de la escuela. QUINTO: El Secretario procede a informar y hacer entrega de la solicitud de ingreso y contrato educativo con los presentes. SEXTO: El Secretario procede a efectuar registro de {{total_letras}} alumnos para la cohorte {{cohorte_letras}}, siendo estos los siguientes:

{{lista}}

SÉPTIMO: El Secretario procede a dejar establecido el grupo oficial para la cohorte {{cohorte_letras}} y procede a recoger las solicitudes de ingreso firmadas por cada alumno. OCTAVO: No habiendo más que hacer constar se da por finalizada la presente, en el mismo lugar y fecha, siendo las {{hora_cierre_letras}} en punto. Damos fé.

Y PARA REMITIR A DONDE CORRESPONDE, SE EXTIENDE LA PRESENTE EN PAPEL BOND MEMBRETADO, EL {{FECHA_CIERRE_LETRAS}}.`;

// --- Sede Morales Izabal: distinto lugar, nombre "de Izabal", fecha de
// autorizacion del libro (11/09/2023), directora propia y tabla con
// Teoria/Practica/Nota en calificaciones.
const DIRECTORA_IZABAL = "Licda. Jazmyn Lizeth Duarte Monzón";
const AUT_CHIQ_INAUG = "veinte de febrero del año dos mil diecisiete (20/02/2017)";
const AUT_IZABAL = "once de septiembre del año dos mil veintitrés (11/09/2023)";

const CALIF_BODY_IZABAL = `El infrascrito Secretario de la Escuela Privada de auxiliares de Enfermería "CARMEN MARÍA" CERTIFICA: Haber tenido a la vista el Libro de Registro de Calificaciones autorizado por el Departamento de Formación y Educación en Salud del Ministerio de Salud Pública y Asistencia Social de fecha ${AUT_IZABAL} en el que a folios números {{folios}} se encuentra el Acta número {{numero}}, que transcrita literalmente dice: --------------------------------------------------

Acta {{numero}}. En Aldea Benque el Amatillo, Municipio de Morales, Departamento de Izabal, siendo las {{hora_letras}} en punto del día {{fecha_letras}}, estando reunidos en oficinas administrativas de la Escuela Privada de Auxiliares de Enfermería Carmen María de Izabal, las siguientes personas: {{directora}}, Directora Técnica y quien suscribe la presente, {{secretario}}, Secretario, dejando constancia de lo siguiente. PRIMERO. {{directora}}, Directora Técnica procede a realizar la entrega del consolidado de notas de teoría y práctica correspondiente a la {{fase}}. SEGUNDO: {{secretario}} procede a registrar las notas obtenidas en dicha fase, siendo estas las siguientes:

{{tabla}}

TERCERO. No habiendo más que hacer constar se da por finalizada la presente acta, en el mismo lugar y fecha, siendo las {{hora_cierre_letras}}. Damos fe los que en ella intervenimos.

Y PARA REMITIR A DONDE CORRESPONDE, SE EXTIENDE LA PRESENTE EN PAPEL BOND MEMBRETADO, EL DÍA {{FECHA_CIERRE_LETRAS}}.`;

const INAUG_BODY_IZABAL = INAUG_BODY
  .replace(AUT_CHIQ_INAUG, AUT_IZABAL)
  .replace('Enfermería "Carmen María", doce avenida tercera calle, segundo nivel edificio Veredita',
    "Enfermería Carmen María de Izabal, Aldea Benque el Amatillo, Municipio de Morales, Departamento de Izabal");

const signersChiq = [
  { name: SECRETARIO, role: "Secretario" },
  { name: DIRECTORA, role: "Directora Técnica" },
];
const signersIzabal = [
  { name: SECRETARIO, role: "Secretario" },
  { name: DIRECTORA_IZABAL, role: "Directora Técnica" },
];

const TEMPLATES = [
  {
    name: "Calificaciones (Chiquimula)",
    title: "Acta de Calificaciones",
    body: CALIF_BODY,
    block: "tabla",
    columns: ["NO.", "NOMBRE DEL ALUMNO", "Nota Obtenida"],
    signers: signersChiq,
    vars: { directora: DIRECTORA, secretario: SECRETARIO, fase: "Fase I" },
  },
  {
    name: "Inauguración (Chiquimula)",
    title: "Acta de Inauguración",
    body: INAUG_BODY,
    block: "lista",
    columns: ["NO.", "NOMBRE DEL ALUMNO"],
    signers: signersChiq,
    vars: { directora: DIRECTORA, docente: "", secretario: SECRETARIO, promocion: "", cohorte_letras: "" },
  },
  {
    name: "Calificaciones (Morales Izabal)",
    title: "Acta de Calificaciones",
    body: CALIF_BODY_IZABAL,
    block: "tabla",
    columns: ["NO.", "NOMBRE DEL ALUMNO", "Teoría", "Práctica", "Nota Obtenida"],
    signers: signersIzabal,
    vars: { directora: DIRECTORA_IZABAL, secretario: SECRETARIO, fase: 'Fase II "Atención integral de enfermería a las personas en situación médico quirúrgico en las diferentes etapas de la vida"' },
  },
  {
    name: "Inauguración (Morales Izabal)",
    title: "Acta de Inauguración",
    body: INAUG_BODY_IZABAL,
    block: "lista",
    columns: ["NO.", "NOMBRE DEL ALUMNO"],
    signers: signersIzabal,
    vars: { directora: DIRECTORA_IZABAL, docente: "", secretario: SECRETARIO, promocion: "", cohorte_letras: "" },
  },
];

async function seedTemplates() {
  for (const t of TEMPLATES) {
    const exists = await prisma.actaTemplate.findFirst({ where: { name: t.name } });
    if (exists) {
      console.log(`✔ Plantilla ya existe: ${t.name}`);
      continue;
    }
    await prisma.actaTemplate.create({
      data: {
        name: t.name,
        title: t.title,
        body: t.body,
        block: t.block,
        columns: t.columns,
        signers: t.signers,
        vars: t.vars,
      },
    });
    console.log(`✔ Plantilla creada: ${t.name}`);
  }
}

async function main() {
  await seedAdmin();
  await seedTemplates();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
