// Qué pasa cuando un pago de un alumno queda aplicado (ACTIVO): se registra
// manualmente, el personal aprueba la boleta, o la pasarela confirma la tarjeta.
//
//   1. Se emite el recibo electrónico (FEL) si la emisión automática está activa.
//   2. Se envía el correo de confirmación, que incluye los datos del DTE y su
//      QR de verificación ante SAT cuando el recibo quedó certificado.
//   3. Aviso en el portal + notificación push.
//
// Se ejecuta en segundo plano: nunca bloquea ni rompe el registro del pago.

export async function alAplicarPago(paymentId: string): Promise<void> {
  try {
    const fel = await import("../modules/fel/fel.service.js");
    await fel.autoIssueReceipt(paymentId);
  } catch (e) {
    console.error("[fel auto]", (e as Error).message);
  }
  try {
    const m = await import("./email-notify.js");
    await m.sendPaymentReceiptEmail(paymentId);
  } catch (e) {
    console.error("[email pago]", (e as Error).message);
  }
  try {
    const m = await import("../modules/avisos/avisos.service.js");
    await m.notificarPagoAplicado(paymentId);
  } catch (e) {
    console.error("[aviso pago]", (e as Error).message);
  }
}

// Versión "dispara y olvida" para usar desde los servicios.
export function alAplicarPagoEnSegundoPlano(paymentId: string): void {
  void alAplicarPago(paymentId).catch((e) =>
    console.error("[pago aplicado]", (e as Error).message)
  );
}
