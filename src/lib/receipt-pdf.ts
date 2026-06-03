import PDFDocument from "pdfkit";
import type { Prisma } from "@prisma/client";

// Pago con sus relaciones tal como lo devuelve el servicio de pagos
type PaymentForReceipt = Prisma.PaymentGetPayload<{
  include: {
    student: { select: { id: true; fullName: true; dpi: true } };
    feeType: { select: { id: true; name: true; category: true } };
    registeredBy: { select: { name: true } };
  };
}>;

const BRAND = "#16314f";
const GRAY = "#666666";
const LIGHT = "#e5e7eb";

const METHOD_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia bancaria",
  DEPOSITO: "Depósito",
  TARJETA: "Tarjeta",
};

function gtq(amount: number): string {
  return "Q " + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-GT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

// Número de recibo legible derivado del id/fecha
function receiptNumber(p: PaymentForReceipt): string {
  const year = p.paidAt.getFullYear();
  const short = p.id.slice(-6).toUpperCase();
  return `REC-${year}-${short}`;
}

// Genera el PDF del recibo y lo devuelve como Buffer
export function generateReceiptPDF(p: PaymentForReceipt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const amount = Number(p.amount);
    const discount = Number(p.discount);
    const net = amount - discount;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // --- Encabezado institucional ---
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("Escuela de Enfermería Carmen María", left, 55);
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(10)
      .text("enfermeriacarmenmaria.edu.gt", left, 78);

    // Caja de "RECIBO" a la derecha
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(20)
      .text("RECIBO", right - 150, 55, { width: 150, align: "right" });
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(10)
      .text(receiptNumber(p), right - 150, 80, {
        width: 150,
        align: "right",
      });

    // Línea separadora
    doc
      .moveTo(left, 105)
      .lineTo(right, 105)
      .strokeColor(BRAND)
      .lineWidth(2)
      .stroke();

    // Marca de ANULADO si aplica
    if (p.status === "ANULADO") {
      doc
        .fillColor("#dc2626")
        .font("Helvetica-Bold")
        .fontSize(60)
        .opacity(0.25)
        .rotate(-20, { origin: [doc.page.width / 2, 360] })
        .text("ANULADO", 0, 330, { align: "center", width: doc.page.width })
        .rotate(20, { origin: [doc.page.width / 2, 360] })
        .opacity(1);
    }

    // --- Datos del estudiante / pagador ---
    let y = 130;
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Recibí de:", left, y);
    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(11)
      .text(p.student?.fullName ?? p.payerName ?? "—", left + 80, y);
    if (p.student?.dpi) {
      y += 18;
      doc.fillColor(GRAY).text("DPI:", left, y);
      doc.fillColor("#111111").text(p.student.dpi, left + 80, y);
    }
    y += 18;
    doc.fillColor(GRAY).text("Fecha:", left, y);
    doc.fillColor("#111111").text(fmtDate(p.paidAt), left + 80, y);

    // --- Tabla de concepto ---
    y += 40;
    const rowH = 26;
    // cabecera
    doc.rect(left, y, width, rowH).fill(BRAND);
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Concepto", left + 10, y + 8)
      .text("Monto", right - 110, y + 8, { width: 100, align: "right" });
    y += rowH;

    // fila de concepto
    doc.rect(left, y, width, rowH).strokeColor(LIGHT).lineWidth(1).stroke();
    doc
      .fillColor("#111111")
      .font("Helvetica")
      .fontSize(10)
      .text(p.concept, left + 10, y + 8, { width: width - 130 })
      .text(gtq(amount), right - 110, y + 8, { width: 100, align: "right" });
    y += rowH;

    // descuento (si hay)
    if (discount > 0) {
      doc.rect(left, y, width, rowH).strokeColor(LIGHT).lineWidth(1).stroke();
      doc
        .fillColor(GRAY)
        .text("Descuento / beca", left + 10, y + 8)
        .text("- " + gtq(discount), right - 110, y + 8, {
          width: 100,
          align: "right",
        });
      y += rowH;
    }

    // total
    doc.rect(left, y, width, rowH + 4).fill("#f3f4f6");
    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("TOTAL", left + 10, y + 9)
      .text(gtq(net), right - 130, y + 9, { width: 120, align: "right" });
    y += rowH + 4;

    // --- Detalles de pago ---
    y += 25;
    doc
      .fillColor(GRAY)
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Método de pago: ${METHOD_LABELS[p.method] ?? p.method}`,
        left,
        y
      );
    y += 16;
    doc.text(
      `Origen: ${p.source === "WOOCOMMERCE" ? "Pago en línea" : "Registro manual"}`,
      left,
      y
    );
    if (p.registeredBy?.name) {
      y += 16;
      doc.text(`Registrado por: ${p.registeredBy.name}`, left, y);
    }

    // --- Pie ---
    // Se posiciona con margen suficiente para no desbordar a una 2da pagina
    const footY = doc.page.height - 120;
    doc
      .moveTo(left, footY)
      .lineTo(right, footY)
      .strokeColor(LIGHT)
      .lineWidth(1)
      .stroke();
    doc
      .fillColor(GRAY)
      .fontSize(9)
      .text(
        "Este recibo es un comprobante de pago emitido por el sistema administrativo de la Escuela de Enfermería Carmen María.",
        left,
        footY + 12,
        { width, align: "center", lineBreak: true }
      );
    doc.text(`Emitido el ${fmtDate(new Date())}`, left, footY + 40, {
      width,
      align: "center",
      lineBreak: false,
    });

    doc.end();
  });
}

export function receiptFileName(p: PaymentForReceipt): string {
  return `${receiptNumber(p)}.pdf`;
}
