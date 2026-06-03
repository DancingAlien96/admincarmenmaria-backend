#!/bin/sh
set -e

# Aplica migraciones pendientes (idempotente) y siembra el admin inicial.
echo "[entrypoint] Aplicando migraciones de Prisma..."
npx prisma migrate deploy

echo "[entrypoint] Sembrando admin inicial (si no existe)..."
node_modules/.bin/tsx prisma/seed.ts || echo "[entrypoint] seed omitido o ya existe"

echo "[entrypoint] Iniciando API..."
exec "$@"
