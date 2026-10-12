// Prueba de certificación de un recibo (RECI) contra Digifact SIN tocar los
// pagos de la base de datos. Útil para validar credenciales y el formato del
// documento en el ambiente de pruebas antes de activar la emisión.
//
//   DIGIFACT_API_URL=https://testnucgt.digifact.com/api \
//   DIGIFACT_USERNAME=GT.0000XXXXXXXX.USUARIO DIGIFACT_PASSWORD=... \
//   npx tsx src/cli/fel-prueba.ts --nit 25531395 --receiver CF --amount 400 [--void]
//
// --nit: NIT del emisor (debe ser el del usuario de Digifact). Si se omite, se
//        usa el de la configuración FEL (tabla DteIssuer).
// --void: tras certificar, anula el documento de prueba.

import crypto from "node:crypto";
import { certifyNuc, voidDte, digifactEnvironment } from "../lib/digifact.js";
import { activePhrases, establishmentForSede, getFelConfig } from "../modules/fel/fel.config.js";
import { buildReciPayload } from "../modules/fel/fel.payload.js";
import { parseTaxId } from "../lib/nit.js";
import type { Dte } from "@prisma/client";
import { Prisma } from "@prisma/client";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

async function main() {
  // Emisor, establecimiento y frases salen de la configuración guardada (solo lectura).
  const cfg = await getFelConfig();
  const nit = arg("nit", cfg.issuer.nit)!;
  const receiver = parseTaxId(arg("receiver", "CF"));
  if (!receiver) throw new Error("Receptor inválido");
  const amount = Number(arg("amount", "400"));
  const est = establishmentForSede(cfg, null);
  const now = new Date();

  const doc: Dte = {
    id: "prueba",
    paymentId: "prueba",
    establishmentId: est.id ?? null,
    internalUuid: crypto.randomUUID(),
    documentType: "RECI",
    status: "PENDING",
    issuerNit: nit,
    issuerName: cfg.issuer.name,
    issuerCommercialName: est.commercialName,
    issuerTaxAffiliation: cfg.issuer.taxAffiliation,
    issuerEstablishmentCode: est.code,
    issuerAddress: est.address,
    issuerPostalCode: est.postalCode,
    issuerMunicipality: est.municipality,
    issuerDepartment: est.department,
    issuerEmail: cfg.issuer.email || null,
    receiverTaxId: receiver.id,
    receiverTaxIdType: receiver.tipo,
    receiverName: arg("name", receiver.tipo === "CF" ? "CONSUMIDOR FINAL" : "RECEPTOR DE PRUEBA")!,
    receiverEmail: null,
    receiverAddress: null,
    items: [
      { position: 1, itemType: "S", description: arg("concept", "Examen de admisión")!, quantity: 1, unitOfMeasure: "UNI", unitPrice: amount, discount: 0, total: amount },
    ] as unknown as Prisma.JsonValue,
    phrases: activePhrases(cfg) as unknown as Prisma.JsonValue,
    currency: "GTQ",
    grandTotal: new Prisma.Decimal(amount),
    authorizationNumber: null,
    series: null,
    number: null,
    emittedAt: null,
    certifiedAt: null,
    xmlKey: null,
    pdfKey: null,
    payload: null,
    response: null,
    error: null,
    voidedAt: null,
    voidReason: null,
    voidedById: null,
    createdById: null,
    createdAt: now,
    updatedAt: now,
  };

  const payload = buildReciPayload(doc, now);
  console.log(`Ambiente: ${digifactEnvironment()} · emisor ${nit} · receptor ${receiver.id} (${receiver.tipo}) · Q${amount}`);
  console.log("Payload:\n" + JSON.stringify(payload, null, 2));

  const r = await certifyNuc(payload, nit);
  console.log("\n✅ Certificado");
  console.log(`  Autorización: ${r.authorizationNumber}`);
  console.log(`  Serie: ${r.series}  Número: ${r.number}`);
  console.log(`  Emisión: ${r.emittedAt?.toISOString()}  Certificación: ${r.certifiedAt?.toISOString()}`);
  console.log(`  XML: ${r.xmlBase64 ? r.xmlBase64.length + " chars base64" : "no"}  PDF: ${r.pdfBase64 ? r.pdfBase64.length + " chars base64" : "no"}`);
  console.log("  Respuesta:", JSON.stringify(r.response, null, 2));
  if (r.xmlBase64) {
    console.log("\nXML certificado:\n" + Buffer.from(r.xmlBase64, "base64").toString("utf8").slice(0, 3000));
  }

  if (process.argv.includes("--void")) {
    const a = await voidDte({
      issuerNit: nit,
      authorizationNumber: r.authorizationNumber,
      receiverTaxId: receiver.id,
      emittedAt: r.emittedAt ?? now,
      reason: "Documento de prueba",
      username: process.env.DIGIFACT_USERNAME ?? "prueba",
    });
    console.log("\n🗑️  Anulado:", JSON.stringify(a, null, 2));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌", err.message);
    if (err.detail) console.error(JSON.stringify(err.detail, null, 2));
    process.exit(1);
  });
