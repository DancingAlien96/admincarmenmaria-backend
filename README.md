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

Los pagos pueden emitir un **recibo electrónico (DTE tipo RECI)** certificado ante
la SAT a través de Digifact, igual que el recibo que la escuela emite hoy desde el
portal de SAT (exento de IVA e ISR por ser centro educativo privado).

**Configuración**
- Credenciales de Digifact en `.env`: `DIGIFACT_API_URL`, `DIGIFACT_USERNAME`,
  `DIGIFACT_PASSWORD` (pruebas: `https://testnucgt.digifact.com/api`;
  producción: `https://nucgt.digifact.com/gt.com.apinuc/api`).
- Datos del emisor, establecimientos por sede y frases SAT: `GET/PUT /api/fel/config`
  (solo admin). Por defecto trae los datos del recibo oficial (NIT 25531395,
  establecimiento 4 en Chiquimula, frases 8/2 y 4/8).
- Interruptores en la misma configuración: `habilitado` (permite emitir),
  `emitirAutomatico` (emite al aplicar un pago: registro manual, boleta aprobada o
  tarjeta confirmada) y `enviarCorreo` (correo al emitir a mano desde el panel).
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
- `GET /estado` · `GET|PUT /config` (admin)
- `GET /recibos` (filtros `estado`, `studentId`, `search`) · `GET /recibos/:id`
- `GET /recibos/:id/pdf` (`?origen=sat` devuelve el PDF del certificador) · `GET /recibos/:id/xml`
- `POST /recibos/:id/anular` `{ motivo }` · `POST /recibos/:id/enviar` (reenvía el correo)
- `GET /pagos/:paymentId` (historial) · `POST /pagos/:paymentId/emitir`
  `{ receptorId?, receptorNombre?, receptorCorreo?, descripcion? }`
- Portal del alumno: `GET /api/portal/pagos/:paymentId/recibo-fel`
- Los pagos (`/api/payments`) incluyen `fel` con el recibo más reciente y aceptan
  el filtro `fel=certificado|error|sin`.

**Prueba sin tocar la base de datos** (ambiente de pruebas de Digifact):
```bash
DIGIFACT_API_URL=https://testnucgt.digifact.com/api DIGIFACT_USERNAME=... DIGIFACT_PASSWORD=... \
  npx tsx src/cli/fel-prueba.ts --nit <NIT del usuario de pruebas> --receptor CF --monto 400 --anular
```
