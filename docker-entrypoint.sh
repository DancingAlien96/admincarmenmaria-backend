#!/bin/sh
set -e

# Aplica migraciones pendientes (idempotente) y siembra el admin inicial.
echo "[entrypoint] Aplicando migraciones de Prisma..."
npx prisma migrate deploy

echo "[entrypoint] Sembrando admin inicial (si no existe)..."
node dist/seed.js || echo "[entrypoint] seed omitido"

echo "[entrypoint] Iniciando API..."
exec "$@"
