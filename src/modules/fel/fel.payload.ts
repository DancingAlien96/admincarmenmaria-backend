// Arma el documento NUC JSON que Digifact transforma en un DTE tipo RECI
// (recibo). Equivale a `build_digifact_sale_json` de bluestock, pero para
// recibos: sin impuestos (el recibo de un centro educativo está exento de IVA)
// y con las frases SAT de exención.

import type { Dte } from "@prisma/client";
import { fechaIsoGuatemala } from "../../lib/fecha-gt.js";
import type { FelPhrase } from "./fel.config.js";

// Línea del recibo tal como se guarda en Dte.items
export interface FelItem {
  position: number;
  itemType: "S" | "B"; // servicio / bien
  description: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  discount: number;
  total: number;
}

export function to6(n: number): string {
  return (Math.round(n * 1_000_000) / 1_000_000).toFixed(6);
}

function clean(v: string | null | undefined, fallback = ""): string {
  const s = (v ?? "").trim();
  return s || fallback;
}

export function itemsOf(doc: Pick<Dte, "items">): FelItem[] {
  return Array.isArray(doc.items) ? (doc.items as unknown as FelItem[]) : [];
}

export function phrasesOf(doc: Pick<Dte, "phrases">): FelPhrase[] {
  return Array.isArray(doc.phrases) ? (doc.phrases as unknown as FelPhrase[]) : [];
}

export function buildReciPayload(
  doc: Dte,
  emittedAt: Date = new Date()
): Record<string, unknown> {
  const phrases = phrasesOf(doc);
  if (phrases.length === 0) {
    throw new Error("No hay frases SAT configuradas para el recibo");
  }
  const items = itemsOf(doc);
  if (items.length === 0) {
    throw new Error("El recibo no tiene líneas");
  }

  // Cada frase ocupa dos entradas (TipoFrase + Escenario) enlazadas por "Data".
  const additionlInfo = phrases.flatMap((p, i) => [
    { Name: "TipoFrase", Data: String(i + 1), Value: String(p.phraseType) },
    { Name: "Escenario", Data: String(i + 1), Value: String(p.scenarioCode) },
  ]);

  const seller: Record<string, unknown> = {
    TaxID: clean(doc.issuerNit),
    TaxIDAdditionalInfo: [
      { Name: "AfiliacionIVA", Data: null, Value: clean(doc.issuerTaxAffiliation, "GEN") },
    ],
    Name: clean(doc.issuerName),
    AdditionlInfo: additionlInfo, // (sic) así se llama el campo en la API
    BranchInfo: {
      Code: clean(doc.issuerEstablishmentCode, "1"),
      Name: clean(doc.issuerCommercialName, doc.issuerName),
      AddressInfo: {
        Address: clean(doc.issuerAddress, "CIUDAD"),
        City: clean(doc.issuerPostalCode, "01010"),
        District: clean(doc.issuerMunicipality, "GUATEMALA"),
        State: clean(doc.issuerDepartment, "GUATEMALA"),
        Country: "GT",
      },
    },
  };
  if (clean(doc.issuerEmail)) {
    seller.Contact = { EmailList: { Email: [clean(doc.issuerEmail)] } };
  }

  const buyer: Record<string, unknown> = {
    TaxID: clean(doc.receiverTaxId, "CF"),
    Name: clean(doc.receiverName, "CONSUMIDOR FINAL"),
    AddressInfo: {
      Address: clean(doc.receiverAddress, "CIUDAD"),
      City: "01010",
      District: "GUATEMALA",
      State: "GUATEMALA",
      Country: "GT",
    },
  };
  if (doc.receiverTaxIdType === "CUI") buyer.TaxIDType = "CUI";
  if (clean(doc.receiverEmail)) {
    buyer.Contact = { EmailList: { Email: [clean(doc.receiverEmail)] } };
  }

  const itemsPayload = items.map((it) => {
    const item: Record<string, unknown> = {
      Number: String(it.position),
      Type: it.itemType === "B" ? "B" : "S",
      Description: clean(it.description, "Servicio educativo"),
      Qty: to6(it.quantity),
      UnitOfMeasure: clean(it.unitOfMeasure, "UNI"),
      Price: to6(it.unitPrice),
      Totals: { TotalItem: to6(it.total) },
    };
    if (it.discount > 0) item.Discounts = [{ Amount: to6(it.discount) }];
    return item;
  });

  return {
    Version: "1.00",
    CountryCode: "GT",
    Header: {
      DocType: "RECI",
      IssuedDateTime: fechaIsoGuatemala(emittedAt),
      Currency: clean(doc.currency, "GTQ"),
    },
    Seller: seller,
    Buyer: buyer,
    Items: itemsPayload,
    Totals: {
      GrandTotal: { InvoiceTotal: to6(Number(doc.grandTotal)) },
    },
    // Obligatorio para la API aunque no llevemos adenda
    AdditionalDocumentInfo: { AdditionalInfo: [] },
  };
}
