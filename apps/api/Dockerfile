# Imágenes de producción de la API (SPEC 07). El contexto es la raíz del repo:
#   docker build -f apps/api/Dockerfile --target migrate .
#   docker build -f apps/api/Dockerfile --target api .
# `docker/Dockerfile.dev` es solo para desarrollo.

FROM node:22-slim AS base
# Misma versión que `packageManager` del package.json raíz.
ARG PNPM_VERSION=11.25.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

FROM base AS build
# Primero solo los manifiestos: la capa de `pnpm install` se reutiliza mientras no cambien.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter "@syc/api..."
COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @syc/db generate \
  && pnpm --filter @syc/api build
# Dos salidas autocontenidas, cada una con sus propias dependencias:
#   /out/api: `@syc/api` con solo las dependencias de producción (el bundle ya lleva `@syc/db` y `@syc/contracts`).
#   /out/db: `@syc/db` con `prisma` (devDependency), `schema.prisma`, `prisma.config.ts` y `migrations/`.
# `--legacy`: sin él pnpm 11 exige `inject-workspace-packages=true`, que cambiaría el workspace de desarrollo.
RUN pnpm --filter @syc/api deploy --legacy --prod /out/api \
  && pnpm --filter @syc/db deploy --legacy /out/db

# Aplica `prisma migrate deploy` y termina. Necesita `DATABASE_URL`.
FROM base AS migrate
ENV NODE_ENV=production
# Solo lo que `prisma migrate deploy` necesita: `deploy` copia todo el directorio del paquete.
COPY --from=build --chown=node:node /out/db/node_modules /app/node_modules
COPY --from=build --chown=node:node /out/db/package.json /out/db/schema.prisma /out/db/prisma.config.ts /app/
COPY --from=build --chown=node:node /out/db/migrations /app/migrations
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# La API: solo Node y el bundle, sin pnpm. El seed corre desde esta imagen: `node dist/seed.mjs`.
FROM node:22-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api/node_modules /app/node_modules
COPY --from=build --chown=node:node /out/api/package.json /app/
COPY --from=build --chown=node:node /app/apps/api/dist /app/dist
USER node
CMD ["node", "dist/main.mjs"]
