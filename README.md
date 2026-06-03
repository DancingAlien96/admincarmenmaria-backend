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
