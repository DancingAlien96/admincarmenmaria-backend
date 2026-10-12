// Prueba de certificación de un recibo (RECI) contra Digifact SIN tocar los
// pagos de la base de datos. Útil para validar credenciales y el formato del
// documento en el ambiente de pruebas antes de activar la emisión.
//
//   DIGIFACT_API_URL=https://testnucgt.digifact.com/api \
//   DIGIFACT_USERNAME=GT.0000XXXXXXXX.USUARIO DIGIFACT_PASSWORD=... \
//   npx tsx src/cli/fel-prueba.ts --nit 25531395 --receptor CF --monto 400 [--anular]
//
// --nit: NIT del emisor (debe ser el del usuario de Digifact). Si se omite, se
//        usa el de la configuración FEL (AppSetting) o el valor por defecto.
// --anular: tras certificar, anula el documento de prueba.

import crypto from "node:crypto";
import { certificarNuc, anularDte, digifactAmbiente } from "../lib/digifact.js";
import { FEL_CONFIG_DEFAULT } from "../modules/fel/fel.config.js";
import { buildReciPayload } from "../modules/fel/fel.payload.js";
import { parseTaxId } from "../lib/nit.js";
import type { FelDocumento } from "@prisma/client";
import { Prisma } from "@prisma/client";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

async function main() {
  let cfg = FEL_CONFIG_DEFAULT;
  try {
    const { getFelConfig } = await import("../modules/fel/fel.config.js");
    cfg = await getFelConfig();
  } catch {
    /* sin BD: se usan los valores por defecto */
  }
  const nit = arg("nit", cfg.emisor.nit)!;
  const receptor = parseTaxId(arg("receptor", "CF"));
  if (!receptor) throw new Error("Receptor inválido");
  const monto = Number(arg("monto", "400"));
  const est = cfg.establecimientos[0]!;
  const ahora = new Date();

  const doc: FelDocumento = {
    id: "prueba",
    paymentId: "prueba",
    internalUuid: crypto.randomUUID(),
    tipo: "RECI",
    estado: "PENDIENTE",
    emisorNit: nit,
    emisorNombre: cfg.emisor.nombre,
    emisorNombreComercial: est.nombre,
    emisorAfiliacion: cfg.emisor.afiliacionIva,
    emisorEstablecimiento: est.codigo,
    emisorDireccion: est.direccion,
    emisorCodigoPostal: est.codigoPostal,
    emisorMunicipio: est.municipio,
    emisorDepartamento: est.departamento,
    emisorCorreo: cfg.emisor.correo || null,
    receptorId: receptor.id,
    receptorTipo: receptor.tipo,
    receptorNombre: arg("nombre", receptor.tipo === "CF" ? "CONSUMIDOR FINAL" : "RECEPTOR DE PRUEBA")!,
    receptorCorreo: null,
    receptorDireccion: null,
    items: [
      { numero: 1, tipo: "S", descripcion: arg("concepto", "Examen de admisión")!, cantidad: 1, unidad: "UNI", precio: monto, descuento: 0, total: monto },
    ] as unknown as Prisma.JsonValue,
    frases: cfg.frases as unknown as Prisma.JsonValue,
    moneda: "GTQ",
    granTotal: new Prisma.Decimal(monto),
    autorizacion: null,
    serie: null,
    numero: null,
    fechaEmision: null,
    fechaCertificacion: null,
    xmlKey: null,
    pdfKey: null,
    payload: null,
    respuesta: null,
    error: null,
    anuladoAt: null,
    anuladoMotivo: null,
    anuladoById: null,
    createdById: null,
    createdAt: ahora,
    updatedAt: ahora,
  };

  const payload = buildReciPayload(doc, ahora);
  console.log(`Ambiente: ${digifactAmbiente()} · emisor ${nit} · receptor ${receptor.id} (${receptor.tipo}) · Q${monto}`);
  console.log("Payload:\n" + JSON.stringify(payload, null, 2));

  const r = await certificarNuc(payload, nit);
  console.log("\n✅ Certificado");
  console.log(`  Autorización: ${r.autorizacion}`);
  console.log(`  Serie: ${r.serie}  Número: ${r.numero}`);
  console.log(`  Emisión: ${r.fechaEmision?.toISOString()}  Certificación: ${r.fechaCertificacion?.toISOString()}`);
  console.log(`  XML: ${r.xmlBase64 ? r.xmlBase64.length + " chars base64" : "no"}  PDF: ${r.pdfBase64 ? r.pdfBase64.length + " chars base64" : "no"}`);
  console.log("  Respuesta:", JSON.stringify(r.respuesta, null, 2));
  if (r.xmlBase64) {
    console.log("\nXML certificado:\n" + Buffer.from(r.xmlBase64, "base64").toString("utf8").slice(0, 3000));
  }

  if (process.argv.includes("--anular")) {
    const a = await anularDte({
      nitEmisor: nit,
      autorizacion: r.autorizacion,
      idReceptor: receptor.id,
      fechaEmision: r.fechaEmision ?? ahora,
      motivo: "Documento de prueba",
      usuario: process.env.DIGIFACT_USERNAME ?? "prueba",
    });
    console.log("\n🗑️  Anulado:", JSON.stringify(a, null, 2));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌", err.message);
    if (err.detalle) console.error(JSON.stringify(err.detalle, null, 2));
    process.exit(1);
  });
