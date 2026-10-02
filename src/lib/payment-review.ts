import type { Prisma } from "@prisma/client";

// Nota que se agrega al concepto cuando Tilopay dice "aprobado" pero la firma
// del retorno no verifica (el personal debe confirmarlo en Tilopay).
export const TILOPAY_VERIFY_NOTE = "verificar en Tilopay";

// Pagos EN_REVISION que el personal realmente debe revisar: boletas subidas
// por el alumno y pagos con tarjeta cuya firma no verificó. Se excluyen los
// intentos de tarjeta en curso (se crean antes de ir a la pasarela y quedan
// así si el alumno cierra el checkout sin pagar).
export const REVIEWABLE_PAYMENT: Prisma.PaymentWhereInput = {
  status: "EN_REVISION",
  NOT: {
    method: "TARJETA",
    orderRef: { not: null },
    NOT: { concept: { contains: TILOPAY_VERIFY_NOTE } },
  },
};
