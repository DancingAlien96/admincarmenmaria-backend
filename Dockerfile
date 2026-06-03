# --- Etapa de build: compila TypeScript y genera Prisma Client ---
FROM node:22-bookworm-slim AS build
WORKDIR /app

# openssl es requerido por Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Etapa de runtime: imagen ligera solo con lo necesario ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# Prisma Client generado + esquema/migraciones (para migrate deploy)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
# Codigo compilado
COPY --from=build /app/dist ./dist
# tsx para ejecutar el seed (escrito en TS)
COPY --from=build /app/node_modules/tsx ./node_modules/tsx

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
