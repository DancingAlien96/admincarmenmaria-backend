# carmenmaria-backend

API del Sistema Administrativo de la Escuela de Enfermería Carmen María.

**Stack:** Express + TypeScript · Prisma · MySQL (Docker) · JWT.

## Requisitos
- Node 20+
- Docker Desktop (para MySQL)

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno y ajustarlas
cp .env.example .env

# 3. Levantar MySQL en Docker
npm run db:up

# 4. Aplicar el esquema a la base de datos
npm run prisma:migrate

# 5. Crear el usuario administrador inicial
npm run db:seed

# 6. Arrancar la API en desarrollo (recarga en caliente)
npm run dev
```

La API queda en `http://localhost:4000`. Credenciales del admin: ver `.env`
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## Scripts
| Script | Descripción |
|--------|-------------|
| `npm run dev` | API en desarrollo (tsx watch) |
| `npm run build` / `npm start` | Compilar y ejecutar producción |
| `npm run db:up` / `db:down` | Levantar / detener MySQL en Docker |
| `npm run prisma:migrate` | Aplicar migraciones |
| `npm run prisma:studio` | Explorador visual de la BD |
| `npm run db:seed` | Crear administrador inicial |

## Endpoints actuales
- `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout`
- `GET/POST /api/users` · `GET/PATCH/DELETE /api/users/:id` (solo admin)
- `GET/POST /api/students` · `GET/PATCH /api/students/:id`
- `POST /api/students/:id/status` (cambio de estado con historial)
- `POST/DELETE /api/students/:id/documents[/:docId]`

## Permisos
- **ADMIN**: acceso total + gestión de usuarios.
- **STAFF**: permisos por sección (módulo) en nivel `READER` o `EDITOR`.
  Máximo 5 usuarios STAFF activos.

## Recibos electrónicos (FEL · Digifact)

Guía completa de puesta en producción y detalle de lo implementado:
[docs/fel-recibos-electronicos.md](docs/fel-recibos-electronicos.md).

Los pagos pueden emitir un **recibo electrónico (DTE tipo RECI)** certificado ante
la SAT a través de Digifact, igual que el recibo que la escuela emite hoy desde el
portal de SAT (exento de IVA e ISR por ser centro educativo privado).

**Configuración**
- Credenciales de Digifact en `.env`: `DIGIFACT_API_URL`, `DIGIFACT_USERNAME`,
  `DIGIFACT_PASSWORD` (pruebas: `https://testnucgt.digifact.com/api`;
  producción: `https://nucgt.digifact.com/gt.com.apinuc/api`).
- Datos del emisor (`DteIssuer`), establecimientos por sede (`DteEstablishment`) y
  frases SAT (`DtePhrase`): `GET/PUT /api/fel/config` (solo admin). La migración
  siembra los datos del recibo oficial (NIT 25531395, establecimiento 4 en
  Chiquimula como predeterminado, frases 8/2 y 4/8).
- Interruptores (`DteSettings`) en la misma configuración: `enabled` (permite emitir),
  `autoIssue` (emite al aplicar un pago: registro manual, boleta aprobada o
  tarjeta confirmada) y `sendEmail` (correo al emitir a mano desde el panel).
- Identificación fiscal del alumno: campo `taxId` del expediente (también se toma
  del checkout de WooCommerce). Sin ella, el recibo se emite a **CF**.

**Flujo al aplicar un pago** (`src/lib/pago-aplicado.ts`): se emite el recibo (si la
emisión automática está activa), se envía el correo de confirmación con los datos
del DTE (autorización, serie, número, fechas) y el **QR de verificación ante SAT**
en el cuerpo del mensaje (sin adjuntos), y se avisa en el portal. Si Digifact falla, el recibo queda en `ERROR` y se puede
reintentar desde el panel; el pago no se bloquea.

**Anulación**: al anular un pago con recibo certificado, primero se anula el DTE ante
SAT; si Digifact falla, el pago no se anula. También se puede anular solo el recibo
(ej. NIT equivocado) y emitir uno nuevo para el mismo pago.

**Endpoints** (`/api/fel`, permisos de la sección PAYMENTS)
- `GET /status` · `GET|PUT /config` (admin)
- `GET /receipts` (filtros `status`, `studentId`, `search`) · `GET /receipts/:id`
- `GET /receipts/:id/pdf` (`?source=sat` devuelve el PDF del certificador) · `GET /receipts/:id/xml`
- `POST /receipts/:id/void` `{ reason }` · `POST /receipts/:id/send` (reenvía el correo)
- `GET /payments/:paymentId` (historial) · `POST /payments/:paymentId/issue`
  `{ receiverTaxId?, receiverName?, receiverEmail?, description? }`
- Portal del alumno: `GET /api/portal/pagos/:paymentId/recibo-fel`
- Los pagos (`/api/payments`) incluyen `fel` con el recibo más reciente y aceptan
  el filtro `fel=certified|error|none`.

**Ambiente de pruebas**: el usuario de Digifact lleva el formato `GT.<NIT a 12 dígitos>.<USUARIO>`
(ej. `GT.000025531395.TESTUSER`). El sandbox tarda ~1 minuto en certificar y a veces su
proxy corta con un 504; el recibo queda en `ERROR` y se reintenta desde el panel. La
anulación en el sandbox puede responder 9019 ("Error al transmitir anulación a SAT"); en ese
caso el recibo sigue `CERTIFIED` y el pago no se anula.

**Prueba sin crear pagos ni recibos** (ambiente de pruebas de Digifact; lee el emisor,
el establecimiento y las frases de la configuración guardada):
```bash
DIGIFACT_API_URL=https://testnucgt.digifact.com/api DIGIFACT_USERNAME=... DIGIFACT_PASSWORD=... \
  npx tsx src/cli/fel-prueba.ts --nit <NIT del usuario de pruebas> --receiver CF --amount 400 --void
```
