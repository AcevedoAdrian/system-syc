# Imagen de producción de la web (SPEC 07): el build de Vite servido por Nginx, que además reenvía
# `/api` a la API. El contexto es la raíz del repo:
#   docker build -f apps/web/Dockerfile .

FROM node:22-slim AS build
# Misma versión que `packageManager` del package.json raíz.
ARG PNPM_VERSION=11.25.0
# La API va por el mismo origen, bajo `/api`: la imagen no depende de la IP del servidor.
ARG VITE_API_URL=/api
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app
# Primero solo los manifiestos: la capa de `pnpm install` se reutiliza mientras no cambien.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter "@syc/web..."
COPY apps/web apps/web
COPY packages/config packages/config
COPY packages/contracts packages/contracts
# `VITE_API_URL` llega como variable de entorno del build, que Vite prefiere a cualquier `.env`.
RUN pnpm --filter @syc/web build

FROM nginx:1.28-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
