# Recibos electrónicos (FEL) con Digifact

Guía de puesta en producción y descripción de lo que se agregó al sistema para
emitir recibos electrónicos (DTE tipo **RECI**) certificados ante la SAT.

---

## 1. Qué hace la funcionalidad

- Cada pago aplicado de un alumno puede tener un **recibo electrónico**
  certificado por Digifact, igual al que la escuela emite hoy desde el portal de
  SAT: exento de IVA (frase 4/8) e ISR (frase 8/2) por ser centro educativo privado.
- Se emite **automáticamente** cuando un pago queda aplicado (registro manual,
  boleta aprobada o tarjeta confirmada), o **a mano** desde el panel.
- El correo de confirmación de pago lleva los datos del DTE (autorización, serie,
  número, fechas) y el **QR de verificación** de SAT en el cuerpo del mensaje.
- Si el alumno tiene **Identificación Fiscal** en su expediente, el recibo sale a
  su NIT; si no, sale a **CF**. Al emitir a mano se puede indicar otro NIT o CUI.
- El PDF del recibo y el XML certificado se descargan desde el panel y el alumno
  descarga su recibo desde el portal.
- Un recibo se puede **anular ante SAT** (por ejemplo, NIT equivocado) y emitir
  otro para el mismo pago. Al anular un pago con recibo, primero se anula el DTE.

---

## 2. Puesta en producción, paso a paso

### Paso 1 · Credenciales de Digifact (producción)

Pedir a Digifact el usuario y la contraseña de **producción** para el NIT de la
escuela (`25531395`). El usuario tiene el formato:

```
GT.<NIT a 12 dígitos con ceros a la izquierda>.<USUARIO>
```

Ejemplo: `GT.000025531395.ADMIN`. Con el usuario sin el prefijo `GT.<NIT>.`
Digifact responde el error `Index was outside the bounds of the array`.

### Paso 2 · Variables de entorno del backend

En el servidor, agregar al `.env` del backend (o como secretos de GitHub, que el
workflow de deploy copia al `.env` automáticamente):

| Variable | Valor en producción |
|---|---|
| `DIGIFACT_API_URL` | `https://nucgt.digifact.com/gt.com.apinuc/api` |
| `DIGIFACT_USERNAME` | usuario de producción (`GT.000025531395.…`) |
| `DIGIFACT_PASSWORD` | contraseña de producción |
| `DIGIFACT_NAME` | `DIGIFACT SERVICIOS, SOCIEDAD ANONIMA` (ya es el valor por defecto) |
| `DIGIFACT_TAX_ID` | `77454820` (ya es el valor por defecto) |

Para el ambiente de pruebas la URL es `https://testnucgt.digifact.com/api`.

Secretos de GitHub que lee `.github/workflows/deploy.yml`: `DIGIFACT_API_URL`,
`DIGIFACT_USERNAME`, `DIGIFACT_PASSWORD`.

### Paso 3 · Desplegar y migrar

El despliegue normal aplica la migración `20261011150000_fel_recibos`, que crea las
tablas `Dte`, `DteEstablishment`, `DtePhrase`, `DteIssuer`, `DteSettings` y
`DigifactAuth`, siembra el emisor, el establecimiento 4 y las frases 8/2 y 4/8, y
agrega la columna `taxId` a `Student`. Verificar
que el backend arrancó con FEL habilitado:

```bash
curl -s https://<dominio>/health
```

La respuesta debe traer `"felEnabled": true`.

### Paso 4 · Configurar el emisor en el panel

Entrar como administrador a **Control de Pagos → Recibos FEL → Configuración** y
revisar:

1. **Emisor**: NIT `25531395`, afiliación IVA `GEN`, nombre
   `CARMEN ALCIRA , REYES CERÓN DE SARMIENTO` y nombre comercial
   `ESCUELA PRIVADA DE AUXILIARES DE ENFERMERÍA CARMEN MARÍA`. Vienen precargados
   del recibo oficial; corregir solo si SAT tiene otros datos.
2. **Establecimientos**: viene el establecimiento `4` de Chiquimula. Si la sede de
   Morales Izabal tiene su propio código de establecimiento en SAT, agregarlo con
   su dirección y escribir `Morales Izabal` en "Sede del sistema" para que los pagos
   de esa sede lo usen. El marcado como **Predeterminado** se usa cuando la sede
   del pago no coincide con ninguno.
3. **Frases SAT**: `8 / 2` (exenta del ISR) y `4 / 8` (exenta del IVA). No cambiar
   salvo indicación del contador. Cada frase lleva una descripción (el texto que
   se imprime en el recibo). Tanto las frases como los establecimientos se pueden
   desactivar sin borrarlos: los inactivos se conservan pero no se usan al emitir.
4. **Emisión**:
   - *Permitir emitir recibos*: activar.
   - *Emitir al aplicar un pago*: activar cuando se quiera la emisión automática.
     Se recomienda empezar desactivado, emitir unos recibos a mano y luego activarlo.
   - *Correo al emitir a mano*: activar para que el alumno reciba el correo con el
     DTE y el QR cuando el recibo se emite desde el panel.
5. Guardar. El banner de la página debe decir **Emisión activa · Ambiente: producción**.

### Paso 5 · Primer recibo de prueba en producción

1. En Control de Pagos, elegir un pago real reciente y pulsar **Emitir recibo FEL**.
2. Revisar el receptor (NIT o CF), el nombre y el correo, y confirmar.
3. Abrir el recibo: verificar serie, número y autorización, escanear el QR con el
   teléfono y comprobar que SAT muestra el documento.
4. Descargar el PDF y el XML.
5. Probar una **anulación ante SAT** con ese mismo recibo (motivo: "Prueba") y
   emitir uno nuevo para el pago. En el ambiente de pruebas de Digifact la anulación
   respondía con el código 9019; en producción debe funcionar. Si no, contactar a
   Digifact con el número de autorización.

### Paso 6 · Identificación fiscal de los alumnos

Para que los recibos salgan a nombre del alumno, cargar su **Identificación Fiscal**
en el expediente (Expedientes → Editar). Se valida el dígito verificador del NIT. Los
pagos de la tienda en línea también traen el NIT del checkout y se guardan solos si el
expediente no tiene uno.

### Paso 7 · Correo

El correo de confirmación de pago ya incluye el DTE y su QR cuando el recibo quedó
certificado. Requiere el SMTP configurado (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`),
que ya se usa para los demás correos del sistema.

---

## 3. Operación diaria

- **Control de Pagos** muestra una columna *Recibo FEL* con el estado de cada pago y
  un filtro *Recibo FEL: con recibo / sin recibo / con error*.
- **Recibos FEL** lista todos los recibos, con búsqueda por autorización, número,
  NIT o nombre, y el total certificado.
- Si una emisión falla (Digifact caído, dato inválido), el recibo queda en
  **Error** con el mensaje; se reintenta con *Reintentar FEL* en el pago. El pago no
  se ve afectado.
- Para corregir un recibo (NIT equivocado, monto): **Anular ante SAT** desde el
  detalle del recibo y emitir uno nuevo; el anulado queda en el historial del pago.
- Al **anular un pago** que tiene recibo certificado, el sistema anula primero el
  DTE ante SAT. Si Digifact no responde, el pago no se anula y se muestra el error
  para reintentar después.
- **Reenviar correo** vuelve a mandar al alumno el correo con el DTE y el QR.
- Si el servidor se reinicia mientras Digifact está certificando, el recibo queda en
  **Error** con el aviso "La emisión se interrumpió…". En ese caso, **antes de
  reintentar**, buscar el documento en el portal de Digifact: si ya quedó certificado,
  no volver a emitirlo (sería un DTE duplicado). Por eso conviene desplegar fuera del
  horario en que se registran pagos.

---

## 4. Qué se agregó (resumen técnico)

### Backend (`admincarmenmaria-backend`)

| Pieza | Archivo | Descripción |
|---|---|---|
| Modelos | `prisma/schema.prisma`, migración `20261011150000_fel_recibos` | `Dte` (copia del emisor/receptor, líneas, frases, autorización, serie, número, fechas, XML/PDF, estado `PENDING/CERTIFIED/VOIDED/ERROR`, respuesta del certificador; el JSON enviado se conserva solo mientras el recibo está en error), `DteEstablishment`, `DtePhrase`, `DteIssuer`, `DteSettings`, `DigifactAuth` (token de sesión de Digifact), `Student.taxId`. Nombres en inglés, alineados con el módulo DTE de bluestock |
| Cliente Digifact | `src/lib/digifact.ts` | Token guardado en BD y renovado al vencer o ante 401; certificación `POST /v2/transform/nuc_json` (`TAXID`, `USERNAME`, `FORMAT=XML\|PDF`); anulación `POST /CancelFelGT`; timeout 120 s; errores legibles |
| Documento NUC | `src/modules/fel/fel.payload.ts` | Arma el JSON del RECI: emisor, frases, receptor (NIT/CUI/CF), una línea de servicio, sin impuestos |
| Configuración | `src/modules/fel/fel.config.ts` | Lee y guarda emisor, establecimientos por sede, frases e interruptores en sus tablas; textos de las frases para el PDF |
| Servicio | `src/modules/fel/fel.service.ts` | Emitir, reintentar, anular, historial, listado, archivos, correo |
| API | `src/modules/fel/fel.routes.ts` (`/api/fel`) | `status`, `config`, `receipts`, `receipts/:id/{pdf,xml,void,send}`, `payments/:paymentId`, `payments/:paymentId/issue` |
| PDF | `src/lib/fel-pdf.ts` | Representación gráfica con logo, datos del DTE, frases, certificador y QR de SAT |
| Correo | `src/lib/fel-email.ts`, `src/lib/email-notify.ts` | Bloque del DTE con QR embebido en la confirmación de pago y en el reenvío |
| Flujo al aplicar pagos | `src/lib/pago-aplicado.ts` | Emite el recibo, manda el correo y avisa en el portal (pago manual, boleta aprobada, tarjeta) |
| Validación | `src/lib/nit.ts` | NIT con dígito verificador, CUI y CF |
| Pagos | `payments.service.ts`, `charges.service.ts`, `portal.service.ts` | Cada pago expone su recibo (`fel`), filtro `fel=`, anulación encadenada, descarga en el portal |
| Herramientas | `src/cli/fel-prueba.ts`, `src/cli/seed-demo.ts` | Prueba contra Digifact sin crear pagos ni recibos; datos de demostración |
| Despliegue | `.env.example`, `docker-compose.prod.yml`, `.github/workflows/deploy.yml` | Variables `DIGIFACT_*` |

### Frontend (`admincarmenmaria-frontend`)

| Pieza | Archivo | Descripción |
|---|---|---|
| Componente FEL | `components/fel-recibo.tsx` | Chip de estado, botón emitir/reintentar, modal de emisión (receptor), modal de detalle con QR, PDF, XML, reenviar y anular |
| Recibos y configuración | `app/panel/pagos/fel/page.tsx` | Listado con filtros y pestaña de configuración para el administrador |
| Control de Pagos | `app/panel/pagos/page.tsx` | Columna y filtro de recibo FEL, enlace a Recibos FEL |
| Expediente | `app/panel/estudiantes/detalle/page.tsx`, `components/student-form.tsx` | Campo *Identificación Fiscal*; acciones FEL en cada pago del estado de cuenta |
| Portal del alumno | `app/portal/pagos/page.tsx` | Botón *Recibo FEL* en las cuotas pagadas |
| Tipos | `lib/types.ts`, `lib/labels.ts` | `FelSummary`, `FelReceipt`, `FelConfig`, etiquetas de estado |

---

## 5. Comportamiento comprobado en el ambiente de pruebas (12/10/2026)

- Certificación de RECI sin impuestos y con las frases 8/2 y 4/8: **correcta**, con
  XML idéntico en estructura al del portal de SAT.
- Receptor NIT, CUI y CF: correctos. Montos con beca: se certifica el neto.
- Emisión automática al registrar un pago: correcta.
- El sandbox tarda ~55 s por certificación y a veces su proxy corta con 504; el
  recibo queda en Error y el reintento funciona.
- Anulación: el sandbox respondió siempre 9019 ("Error al transmitir anulación a
  SAT"). Pendiente de comprobar en producción.

## 6. Respaldo

Los XML y PDF certificados se guardan en la carpeta `uploads` (volumen `uploads_data` en
producción). Incluirla en los respaldos junto con la base de datos: el XML firmado es el
documento legal del recibo.

## 7. Pendientes recomendados

- Confirmar con Digifact la anulación en producción.
- Si en producción se observan 504, agregar la adenda con referencia interna
  (`VALIDAR_REFERENCIA_INTERNA`) para que Digifact rechace duplicados de un mismo
  pago.
- Código de establecimiento de la sede Morales Izabal, si existe en SAT.
