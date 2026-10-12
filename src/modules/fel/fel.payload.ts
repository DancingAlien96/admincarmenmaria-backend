// Arma el documento NUC JSON que Digifact transforma en un DTE tipo RECI
// (recibo). Equivale a `build_digifact_sale_json` de bluestock, pero para
// recibos: sin impuestos (el recibo de un centro educativo está exento de IVA)
// y con las frases SAT de exención.

import type { FelDocumento } from "@prisma/client";
import { fechaIsoGuatemala } from "../../lib/fecha-gt.js";
import type { FelFrase } from "./fel.config.js";

// Línea del recibo tal como se guarda en FelDocumento.items
export interface FelItem {
  numero: number;
  tipo: "S" | "B"; // servicio / bien
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio: number; // precio unitario
  descuento: number;
  total: number;
}

export function to6(n: number): string {
  return (Math.round(n * 1_000_000) / 1_000_000).toFixed(6);
}

function limpio(v: string | null | undefined, fallback = ""): string {
  const s = (v ?? "").trim();
  return s || fallback;
}

export function itemsDeDocumento(doc: Pick<FelDocumento, "items">): FelItem[] {
  return Array.isArray(doc.items) ? (doc.items as unknown as FelItem[]) : [];
}

export function frasesDeDocumento(doc: Pick<FelDocumento, "frases">): FelFrase[] {
  return Array.isArray(doc.frases) ? (doc.frases as unknown as FelFrase[]) : [];
}

export function buildReciPayload(
  doc: FelDocumento,
  fechaEmision: Date = new Date()
): Record<string, unknown> {
  const frases = frasesDeDocumento(doc);
  if (frases.length === 0) {
    throw new Error("No hay frases SAT configuradas para el recibo");
  }
  const items = itemsDeDocumento(doc);
  if (items.length === 0) {
    throw new Error("El recibo no tiene líneas");
  }

  // Cada frase ocupa dos entradas (TipoFrase + Escenario) enlazadas por "Data".
  const additionlInfo = frases.flatMap((f, i) => [
    { Name: "TipoFrase", Data: String(i + 1), Value: String(f.tipo) },
    { Name: "Escenario", Data: String(i + 1), Value: String(f.escenario) },
  ]);

  const seller: Record<string, unknown> = {
    TaxID: limpio(doc.emisorNit),
    TaxIDAdditionalInfo: [
      { Name: "AfiliacionIVA", Data: null, Value: limpio(doc.emisorAfiliacion, "GEN") },
    ],
    Name: limpio(doc.emisorNombre),
    AdditionlInfo: additionlInfo, // (sic) así se llama el campo en la API
    BranchInfo: {
      Code: limpio(doc.emisorEstablecimiento, "1"),
      Name: limpio(doc.emisorNombreComercial, doc.emisorNombre),
      AddressInfo: {
        Address: limpio(doc.emisorDireccion, "CIUDAD"),
        City: limpio(doc.emisorCodigoPostal, "01010"),
        District: limpio(doc.emisorMunicipio, "GUATEMALA"),
        State: limpio(doc.emisorDepartamento, "GUATEMALA"),
        Country: "GT",
      },
    },
  };
  if (limpio(doc.emisorCorreo)) {
    seller.Contact = { EmailList: { Email: [limpio(doc.emisorCorreo)] } };
  }

  const buyer: Record<string, unknown> = {
    TaxID: limpio(doc.receptorId, "CF"),
    Name: limpio(doc.receptorNombre, "CONSUMIDOR FINAL"),
    AddressInfo: {
      Address: limpio(doc.receptorDireccion, "CIUDAD"),
      City: "01010",
      District: "GUATEMALA",
      State: "GUATEMALA",
      Country: "GT",
    },
  };
  if (doc.receptorTipo === "CUI") buyer.TaxIDType = "CUI";
  if (limpio(doc.receptorCorreo)) {
    buyer.Contact = { EmailList: { Email: [limpio(doc.receptorCorreo)] } };
  }

  const itemsPayload = items.map((it) => {
    const item: Record<string, unknown> = {
      Number: String(it.numero),
      Type: it.tipo === "B" ? "B" : "S",
      Description: limpio(it.descripcion, "Servicio educativo"),
      Qty: to6(it.cantidad),
      UnitOfMeasure: limpio(it.unidad, "UNI"),
      Price: to6(it.precio),
      Totals: { TotalItem: to6(it.total) },
    };
    if (it.descuento > 0) item.Discounts = [{ Amount: to6(it.descuento) }];
    return item;
  });

  return {
    Version: "1.00",
    CountryCode: "GT",
    Header: {
      DocType: "RECI",
      IssuedDateTime: fechaIsoGuatemala(fechaEmision),
      Currency: limpio(doc.moneda, "GTQ"),
    },
    Seller: seller,
    Buyer: buyer,
    Items: itemsPayload,
    Totals: {
      GrandTotal: { InvoiceTotal: to6(Number(doc.granTotal)) },
    },
    // Obligatorio para la API aunque no llevemos adenda
    AdditionalDocumentInfo: { AdditionalInfo: [] },
  };
}
