# SPEC 07 — Endurecimiento y despliegue

> **Status:** Approved
> **Depends on:** SPEC 01 (esqueleto del monorepo), SPEC 02 (autenticación y acceso), SPEC 06 (comentarios, bandeja y detalle)
> **Date:** 2026-10-07
> **Objective:** dejar el sistema corriendo en el servidor on-premise. Un compose de producción con Nginx como única entrada HTTP aplica las migraciones solo, un backup diario rota 30 copias y un checklist de permisos queda tildado contra el servidor.

## Por qué existe este spec

Es la etapa 6 y última del PRD §10, con este resultado verificable: "sistema en el servidor real". Depende de un dominio completo (SPEC 02 a 06): el checklist de permisos recorre la matriz PRD §4.2 sobre tickets y comentarios reales.

Esta versión (2026-10-07) reemplaza el borrador del 2026-09-29. Lo ajusta al código real:

- La web llama a la API con `VITE_API_URL` (`apps/web/src/lib/env.ts`), y la API valida `WEB_ORIGIN` y `BETTER_AUTH_URL` con Zod.
- Better Auth vive en `/api/auth/*`, con la allowlist de `auth.handler.ts`.
- La API se empaqueta con `tsdown` (`dist/main.mjs` y `dist/seed.mjs`).
- El rate limit del login no ve la IP del cliente: es un contador compartido por ruta (`CLAUDE.md`).
- `docker/Dockerfile.dev` es solo para desarrollo.

Además cierra lo que el borrador dejaba abierto o como "propuesta técnica", con decisiones del usuario del 2026-10-07:

- La API va por el mismo origen, bajo `/api`, y la web y Nginx son un solo contenedor.
- Las migraciones se aplican automáticamente, con un servicio `migrate`.
- El backup corre en un contenedor propio y guarda las copias en una carpeta del servidor.
- Cada deploy empieza con un backup manual, y lo que se despliega es un tag de git.
- `pnpm verify --spec 07` y un job de CI construyen las imágenes de producción.
- Entran la rotación de logs y las cabeceras de seguridad.
- El sistema arranca vacío, solo con el seed.

## Alcance

**Dentro:**

- `apps/api/Dockerfile` multi-stage, con dos imágenes finales:
  - target `migrate`: corre `prisma migrate deploy`;
  - target `api`: el bundle de `tsdown`, con solo las dependencias de producción.
- `apps/web/Dockerfile` multi-stage: el build de Vite y una imagen final de Nginx. Sirve la SPA y reenvía `/api` a la API.
- `apps/web/nginx.conf`.
- `docker/backup/`: `Dockerfile`, `backup.sh`, `restore.sh` y `crontab`.
- `docker-compose.prod.yml` con los servicios `postgres`, `migrate`, `api`, `web` y `backup`.
- `.dockerignore` en la raíz.
- `.env.production.example`.
- Cambios de código mínimos:
  - `apps/api/src/modules/auth/auth.config.ts`: el rate limit usa la IP que manda Nginx (`advanced.ipAddress`);
  - `apps/web/src/lib/env.ts`: `VITE_API_URL` acepta una ruta relativa (`/api`);
  - `apps/web/src/lib/auth-client.ts`: usa el origen de esa URL.
- `.github/workflows/ci.yml`: un job `docker` que construye las imágenes, sin publicarlas.
- `scripts/verify/specs/07-endurecimiento-despliegue.mjs` para `pnpm verify`.
- `docs/despliegue.md`: el procedimiento de primer deploy, deploy regular, vuelta atrás y operación de backups.
- `docs/checklist-permisos.md`: la plantilla de la matriz PRD §4.2 y el registro de corridas.
- El primer deploy en el servidor real: la prueba de restauración, el checklist tildado y commiteado, y el tag.
- Actualizar `CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `docs/architecture.md`, `docs/prd.md` §9 y `README.md`.

**Fuera de alcance (para specs futuros):**

- HTTPS, dominio propio, certificados y HSTS (Q37).
- Un CI que despliega, o un registro de imágenes: las imágenes se construyen en el servidor (Q37).
- Copias fuera del servidor, en otro disco o en otro equipo (Q36).
- Alertas automáticas cuando un backup falla. Queda el log.
- La caché larga de assets y la compresión gzip (decisión del usuario, 2026-10-07).
- Importar datos existentes: el sistema arranca vacío (decisión del usuario, 2026-10-07).
- Playwright o cualquier e2e automatizado (P3).
- Monitoreo, métricas, más de un servidor, otro orquestador.
- Entrar por más de una URL (por ejemplo, IP y nombre de host a la vez).
- Actualizar Postgres de versión mayor.

## Modelo de datos

Este spec no agrega modelos ni migraciones. Las estructuras nuevas son de infraestructura.

```yaml
# docker-compose.prod.yml (fragmento ilustrativo)
x-logging: &logging
  driver: json-file
  options: { max-size: "10m", max-file: "5" }

services:
  postgres:            # postgres:17-alpine, volumen postgres_data, healthcheck pg_isready
                       # sin `ports`: solo se alcanza desde la red del compose
  migrate:             # build apps/api/Dockerfile, target migrate
    restart: "no"      # corre `prisma migrate deploy` y termina
    depends_on: { postgres: { condition: service_healthy } }
  api:                 # build apps/api/Dockerfile, target api; sin `ports`
    depends_on: { migrate: { condition: service_completed_successfully } }
    environment:
      NODE_ENV: production
      WEB_ORIGIN: ${PUBLIC_URL:?Falta PUBLIC_URL}
      BETTER_AUTH_URL: ${PUBLIC_URL:?Falta PUBLIC_URL}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?Falta BETTER_AUTH_SECRET}
      DATABASE_URL: postgresql://...@postgres:5432/...
  web:                 # build apps/web/Dockerfile (Nginx); única entrada
    ports: ["${HTTP_PORT:-80}:80"]
    depends_on: { api: { condition: service_healthy } }
  backup:              # build docker/backup (postgres:17-alpine + cron)
    environment: { TZ: America/Argentina/Buenos_Aires, BACKUP_KEEP: "30" }
    volumes: ["${BACKUP_DIR:-/srv/syc/backups}:/backups"]
# todos con `logging: *logging`; todos salvo migrate con `restart: unless-stopped`
```

```bash
# .env.production.example → se copia como `.env` en la raíz del repo, en el servidor
PUBLIC_URL=http://10.0.0.5        # obligatoria: la URL por la que entran todos
POSTGRES_PASSWORD=                 # obligatoria
BETTER_AUTH_SECRET=                # obligatoria, ≥ 32 caracteres (openssl rand -base64 32)
POSTGRES_USER=postgres
POSTGRES_DB=syc
HTTP_PORT=80
BACKUP_DIR=/srv/syc/backups
# Solo para el seed del primer deploy; se borran del archivo después
SEED_ADMIN_USERNAME=
SEED_ADMIN_PASSWORD=
SEED_ADMIN_NAME=
```

**Rutas de Nginx** (`apps/web/nginx.conf`):

| Pedido del navegador | Destino |
|---|---|
| `/api/auth/*` | `api:3000/api/auth/*`, con la ruta intacta: es el `basePath` de Better Auth. |
| `/api/*` | `api:3000/*`, sin el prefijo. Ejemplo: `/api/tickets` → `/tickets`. |
| un archivo que existe en el build | ese archivo |
| cualquier otra ruta | `index.html` (SPA). Ejemplo: recargar `/tickets/abc`. |

Nginx manda a la API `X-Real-IP: $remote_addr` y pisa el que haya mandado el cliente. Resuelve `api` con el DNS de Docker (`resolver 127.0.0.11`) en cada request, no una sola vez al arrancar.

**URL de la API en la web.** `VITE_API_URL` es una URL absoluta, como en desarrollo (`http://localhost:3000`), o una ruta que empieza con `/`, como en producción (`/api`). La ruta se resuelve contra `window.location.origin`. El cliente de Better Auth usa el **origen** de esa URL, porque él agrega `/api/auth`. Así la imagen de la web no depende de la IP del servidor. En desarrollo no cambia nada.

**Archivo de backup:** `syc-AAAAMMDD-HHMMSS.dump` (`pg_dump -Fc`, la base completa: tablas de Better Auth, `AuditLog` y la extensión `unaccent` incluidas), con la hora local de `TZ`. Ejemplo: `syc-20261008-020000.dump`.

**Línea de log del backup** (en `docker compose logs backup`):

```text
2026-10-08 02:00:04 backup OK syc-20261008-020000.dump (12.3 MB), 30 copias
2026-10-09 02:00:01 backup ERROR: pg_dump: error: ... (no se borró ninguna copia)
```

## Contrato

**Feature 7.1: Imágenes de producción**

- **MUST:**
  - `apps/api/Dockerfile` sale de `node:22-slim` y usa pnpm 11.25.0, igual que `packageManager`. Tiene un stage de build y dos targets:
    - el stage de build corre `pnpm install --frozen-lockfile`, `prisma generate` y el build de `@syc/api` con `tsdown`;
    - target `migrate`: lleva el CLI de Prisma, `schema.prisma`, `prisma.config.ts` y `migrations/`, y corre `prisma migrate deploy`;
    - target `api`: lleva `dist/` y solo las dependencias de producción de `@syc/api`. Corre como el usuario `node` con `node dist/main.mjs`.
  - El seed corre desde la imagen `api`: `docker compose -f docker-compose.prod.yml run --rm api node dist/seed.mjs`, con las `SEED_ADMIN_*` del `.env`.
  - `apps/web/Dockerfile`:
    - construye con `pnpm --filter @syc/web build` y `ARG VITE_API_URL=/api`;
    - la imagen final es Nginx Alpine, con el `dist/` de la web y `apps/web/nginx.conf`.
  - Las imágenes base llevan un tag con versión fijada (por ejemplo, `nginx:1.28-alpine` o `postgres:17-alpine`), nunca `latest` ni `stable`.
  - `.dockerignore` excluye `node_modules`, `**/dist`, `.git`, `.turbo`, `.env` y `.env.*` (salvo los `.example`). Ninguna imagen lleva un `.env` ni un secreto. Vite lee el `.env` de la raíz (`envDir`), así que uno que se colara metería valores de desarrollo en el build.
- **MUST NOT:**
  - Usar `docker/Dockerfile.dev` en producción.
  - Correr `prisma migrate dev` o el seed al arrancar la API.

**Feature 7.2: Compose de producción y Nginx**

- **MUST:**
  - `docker-compose.prod.yml` tiene `postgres`, `migrate`, `api`, `web` y `backup`. Solo `web` publica un puerto: `${HTTP_PORT:-80}`. `postgres` y `api` no publican ninguno.
  - `PUBLIC_URL`, `POSTGRES_PASSWORD` y `BETTER_AUTH_SECRET` son obligatorias (`${VAR:?mensaje}`): sin ellas, compose no arranca y nombra la que falta. La API además las valida con Zod (SPEC 01).
  - `WEB_ORIGIN` y `BETTER_AUTH_URL` valen `PUBLIC_URL`. Se configura una sola variable.
  - `migrate` corre antes que `api` (`service_completed_successfully`). Si falla, `up -d` termina con error y `api` no se crea ni se recrea.
  - `restart: unless-stopped` en `postgres`, `api`, `web` y `backup`. Después de un reinicio del servidor, el sistema vuelve solo.
  - Healthchecks:
    - `postgres`: `pg_isready`;
    - `api`: `GET /health` con `status: "ok"`. `degraded` cuenta como no sano;
    - `web` arranca cuando `api` está sana.
  - Todos los servicios rotan sus logs (`json-file`, `max-size: 10m`, `max-file: 5`).
  - Nginx:
    - sigue la tabla de rutas del Modelo de datos;
    - pisa `X-Real-IP` con la IP real del cliente;
    - agrega `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: same-origin`;
    - oculta su versión (`server_tokens off`);
    - resuelve `api` en cada request.
  - El rate limit del login (5 por minuto) cuenta **por IP del cliente**: `auth.config.ts` lee `x-real-ip` (`advanced.ipAddress.ipAddressHeaders`). Sin el header, como en desarrollo sin proxy, sigue el contador compartido de hoy.
  - La web usa `VITE_API_URL=/api` y el cliente de auth, el origen (ver Modelo de datos).
- **EDGE CASES:**
  - Entrar por otra URL que no sea `PUBLIC_URL` (por ejemplo, un nombre de host): el login falla, porque Better Auth rechaza ese origen. `docs/despliegue.md` lo dice.
  - Un cliente que manda su propio `X-Real-IP`: Nginx lo pisa, y el intento cuenta para su IP real.
  - Recargar `/tickets/<id>`: Nginx devuelve `index.html`, no un 404.
  - `/api/auth/sign-up/email` y cualquier ruta fuera de la allowlist: 404 de la API, igual que hoy.
  - Se recrea solo `api` (un deploy que no cambia la web): `web` sigue respondiendo `/api/*` sin reiniciarse.
  - Postgres reinicia: `api` queda no sana hasta que vuelve, sin intervención.
- **MUST NOT:**
  - Publicar los puertos 5432 o 3000.
  - HTTPS o HSTS (Q37).
  - Que el CI dispare un deploy.

**Feature 7.3: Backups y restauración**

- **MUST:**
  - El contenedor `backup` corre `backup.sh` todos los días a las 02:00 (`0 2 * * *`), con `TZ=America/Argentina/Buenos_Aires`: la hora del servidor (Q36), la misma zona que `hoyArgentina()`.
  - `backup.sh`:
    - escribe primero `<nombre>.partial` y lo renombra al terminar bien;
    - si `pg_dump` falla, borra el parcial, escribe una línea `ERROR` y termina con código distinto de 0, sin rotar;
    - si termina bien, conserva las `BACKUP_KEEP` (30) copias `syc-*.dump` más recientes y borra el resto. Nunca toca otros archivos de la carpeta.
  - Las copias van a `BACKUP_DIR`, una carpeta del servidor montada en `/backups`, separada del volumen `postgres_data` (Q36).
  - El backup manual es el mismo script: `docker compose -f docker-compose.prod.yml exec backup backup.sh`. Cuenta dentro de las 30.
  - Cada corrida deja una línea en el log del contenedor (ver Modelo de datos).
  - `restore.sh --confirmar <archivo>` reemplaza la base `POSTGRES_DB`: la borra, la recrea y restaura con `pg_restore`.
  - `restore.sh` se niega:
    - sin `--confirmar`: dice qué haría;
    - si hay otras conexiones abiertas a la base: pide detener `api`.
- **EDGE CASES:**
  - Disco lleno o base caída a las 02:00: línea `ERROR`, ninguna copia nueva ni parcial, las anteriores intactas. Al día siguiente se reintenta solo.
  - `BACKUP_DIR` no existe: `docs/despliegue.md` pide crearla antes del primer `up`.
  - Menos de 30 copias: no borra nada.
- **MUST NOT:**
  - Borrar copias viejas cuando el backup del día falló.
  - Alertas automáticas, o copias en otro disco o equipo (Q36).

**Feature 7.4: Procedimiento de deploy (`docs/despliegue.md`)**

- **MUST:**
  - **Requisitos del servidor:** Linux, Docker Engine con el plugin compose, git, el puerto 80 libre y la carpeta `BACKUP_DIR` creada. Hace falta acceso a internet durante el build, para las imágenes base y `pnpm install`.
  - **Primer deploy:**
    1. clonar el repo y hacer checkout del tag;
    2. crear el `.env` desde `.env.production.example`;
    3. `docker compose -f docker-compose.prod.yml up -d --build`;
    4. correr el seed y borrar las `SEED_ADMIN_*` del `.env`;
    5. hacer la prueba de restauración;
    6. completar el checklist de permisos.
  - **Deploy regular:**
    1. backup manual (`exec backup backup.sh`);
    2. anotar el tag actual (`git describe --tags`);
    3. `git fetch --tags` y `git checkout <tag>`;
    4. `up -d --build`;
    5. comprobar `http://<ip>/api/health` y entrar con un usuario.
  - **Volver atrás:**
    - sin migraciones nuevas: checkout del tag anterior y `up -d --build`;
    - con migraciones aplicadas: detener `api`, `restore.sh --confirmar` con el backup del paso 1, checkout del tag anterior y `up -d --build`.
  - **Tags:**
    - formato `vAAAA.MM.DD`; si hay dos el mismo día, el segundo es `vAAAA.MM.DD.2`;
    - se crean sobre `main` con el CI en verde.
  - **Operación de backups:** listar las copias, correr una a mano, ver el log y restaurar.
  - Cada paso es un comando para copiar y pegar, sin conocimiento implícito.
- **MUST NOT:** pasos que dependan de la memoria de quien despliega, como "acordate de migrar".

**Feature 7.5: CI y verificación automática**

- **MUST:**
  - `.github/workflows/ci.yml` suma un job `docker` que construye, sin publicar, los targets `migrate` y `api` de `apps/api/Dockerfile` y `apps/web/Dockerfile`. Corre en cada PR y push a `main`, sin filtro de turbo.
  - `pnpm turbo lint typecheck test build` en verde antes de crear un tag (SPEC 01).
  - `scripts/verify/specs/07-endurecimiento-despliegue.mjs`, agregado a `specs/index.mjs`:
    - levanta `docker-compose.prod.yml` con un nombre de proyecto propio (`-p syc-verify-07`), `HTTP_PORT` alternativo, `BACKUP_DIR` temporal y secretos de prueba;
    - al terminar, lo baja con `down -v` y borra la carpeta temporal;
    - no toca el compose de desarrollo, ni su base, ni ningún `BACKUP_DIR` real;
    - cubre los criterios marcados *(verify)*.
- **MUST NOT:** que el CI despliegue o publique imágenes.

**Feature 7.6: Checklist de permisos (`docs/checklist-permisos.md`)**

- **MUST:**
  - **Precondiciones:**
    - el admin;
    - dos departamentos A y B;
    - el agente `a1` en A;
    - un ticket TA en A con un comentario, y un ticket TB en B.
  - **Una fila por celda de la matriz PRD §4.2**, con la acción concreta en la UI y el resultado esperado. Ejemplos:
    - "`a1` abre `/tickets/<id de TB>` → 'no existe' (404)";
    - "`a1` intenta crear en B → no puede";
    - "`a1` no ve 'Eliminar' en el comentario de TA".
  - Cada fila tiene una columna Resultado (✅ o ❌) y una de Observaciones.
  - Suma las filas de interfaz que dependen del rol: el filtro "Departamento", el menú de administración y "Cambiar departamento".
  - **Registro de corridas:** una tabla con fecha, tag, quién la hizo y el resultado. La corrida contra el servidor se commitea antes de dar la etapa por cerrada.
  - Se corre a mano, por la UI, contra `PUBLIC_URL`.
- **MUST NOT:** Playwright ni ningún e2e automatizado (P3).

## Plan de implementación

1. **Rate limit por IP.** `advanced.ipAddress.ipAddressHeaders: ["x-real-ip"]` en `auth.config.ts`. Verificar contra la API local con `curl`:
   - 5 logins fallidos con `X-Real-IP: 10.0.0.1` y el sexto da 429;
   - uno con `X-Real-IP: 10.0.0.2` da 401, no 429.
2. **URL relativa en la web.** Extraer `resolveApiUrl(valor, origen)` en `apps/web/src/lib/env.ts`: acepta una URL absoluta o una ruta que empieza con `/`. `auth-client.ts` usa el origen. Verificar con `env.test.ts`:
   - `/api` con el origen `http://10.0.0.5` da `http://10.0.0.5/api`;
   - `http://localhost:3000` queda igual;
   - `api` sin barra se rechaza.

   `pnpm --filter @syc/web dev` sigue andando.
3. **Imagen de la API.** `.dockerignore` y `apps/api/Dockerfile` con los targets `migrate` y `api`. Verificar:
   - `docker build --target api` y `docker build --target migrate` terminan bien;
   - `docker run` de `api` sin variables termina nombrando `DATABASE_URL`.
4. **Imagen de la web.** `apps/web/Dockerfile` y `apps/web/nginx.conf`. Verificar con la imagen corriendo sola:
   - `/` y `/tickets/x` devuelven `index.html`;
   - las cabeceras de seguridad están presentes;
   - ningún asset contiene `localhost:3000`.
5. **Backup.** `docker/backup/` (`Dockerfile`, `backup.sh`, `restore.sh` y `crontab`). Verificar a mano con `BACKUP_KEEP=3` y cinco corridas: quedan 3 copias, las más nuevas.
6. **Compose de producción.** `docker-compose.prod.yml` y `.env.production.example`. Verificar con un `.env` de prueba y `HTTP_PORT=8080`:
   - `up -d --build` deja `migrate` terminado con 0 y los otros cuatro servicios sanos;
   - `http://localhost:8080/api/health` responde `ok`.
7. **CI.** El job `docker` en `ci.yml`. Verificar: el job pasa en un PR.
8. **Verificación automática.** `scripts/verify/specs/07-endurecimiento-despliegue.mjs`, agregado a `specs/index.mjs`. Verificar: `pnpm verify --spec 07` pasa y no deja contenedores, volúmenes ni carpetas del proyecto `syc-verify-07`.
9. **Documentos.** `docs/despliegue.md` y `docs/checklist-permisos.md` (la plantilla, con el registro vacío). Actualizar:
   - `CLAUDE.md`: estado del repositorio, comandos de producción, la nota del rate limit resuelta y `pnpm verify` de SPEC 01 a 07;
   - `apps/api/CLAUDE.md`: el rate limit por `X-Real-IP` y las imágenes;
   - `apps/web/CLAUDE.md`: `VITE_API_URL` relativa y `nginx.conf`;
   - `docs/architecture.md`, sección de infraestructura;
   - `docs/prd.md` §9: el compose de producción;
   - `README.md`: el link a `docs/despliegue.md`.

   Verificar: otra persona puede seguir `docs/despliegue.md` en una máquina de prueba, desde un clon limpio, sin preguntar nada.
10. **Salida a producción** (en el servidor real, a mano):
    1. crear el tag;
    2. hacer el primer deploy con `docs/despliegue.md`;
    3. hacer la prueba de restauración;
    4. completar el checklist y commitear su registro.

## Criterios de aceptación

Los marcados *(verify)* los comprueba `pnpm verify --spec 07`. Los demás se tildan a mano en el servidor.

- [ ] *(verify)* Construir los targets `migrate` y `api` de `apps/api/Dockerfile`, y `apps/web/Dockerfile`, termina con código 0.
- [ ] *(verify)* Ningún asset de la imagen de la web contiene `localhost:3000`, aunque el `.env` de la raíz lo defina.
- [ ] *(verify)* `docker compose -f docker-compose.prod.yml config` sin `PUBLIC_URL`, sin `POSTGRES_PASSWORD` o sin `BETTER_AUTH_SECRET` falla nombrando la variable.
- [ ] *(verify)* `up -d --build` desde cero deja `migrate` terminado con 0, y `postgres`, `api`, `web` y `backup` corriendo, con `api` sana.
- [ ] *(verify)* Solo `web` publica un puerto. `postgres` y `api` no publican ninguno.
- [ ] *(verify)* Todos los servicios tienen `json-file` con `max-size` y `max-file` en el `config` resuelto.
- [ ] *(verify)* Por Nginx, `GET /api/health` responde `status: "ok"`. El admin entra por `/api/auth/sign-in/username`, y con esa cookie `GET /api/tickets` responde 200.
- [ ] *(verify)* `GET /tickets/cualquier-cosa` responde 200 con `index.html`, y `POST /api/auth/sign-up/email` responde 404.
- [ ] *(verify)* Las respuestas de Nginx traen `X-Frame-Options`, `X-Content-Type-Options` y `Referrer-Policy`, y el header `Server` no muestra la versión.
- [ ] *(verify)* Por Nginx, el sexto login fallido en un minuto responde 429, también mandando otro `X-Real-IP`.
- [ ] *(verify)* Contra la API directa, el sexto login fallido con `X-Real-IP: 10.0.0.1` responde 429, y uno con `X-Real-IP: 10.0.0.2` responde 401.
- [ ] *(verify)* Después de recrear solo `api` (`up -d --force-recreate api`), `GET /api/health` por Nginx sigue respondiendo `ok` sin reiniciar `web`.
- [ ] *(verify)* `backup.sh` a mano crea un `syc-AAAAMMDD-HHMMSS.dump` en `BACKUP_DIR`. Con 30 copias viejas y un archivo ajeno en la carpeta, otra corrida deja exactamente 30, borra la más vieja y no toca el ajeno.
- [ ] *(verify)* Con la contraseña de Postgres incorrecta, `backup.sh` termina con código distinto de 0, escribe `ERROR` en el log y no deja copia nueva ni `.partial`. Las copias anteriores siguen todas.
- [ ] *(verify)* El contenedor `backup` tiene la tarea `0 2 * * *`, y `date` adentro muestra la hora de Argentina (-03).
- [ ] *(verify)* Restauración:
  - se crea el ticket T1, se corre un backup y después se crea T2;
  - se detiene `api`, se corre `restore.sh --confirmar` con esa copia y se levanta `api`;
  - el admin entra, ve T1 y no ve T2.
- [ ] *(verify)* `restore.sh` sin `--confirmar`, o con `api` corriendo, se niega y no toca la base.
- [ ] El job `docker` del CI pasa en un PR.
- [ ] `pnpm verify --spec 07` y `pnpm turbo lint typecheck test build` terminan con código 0, y `pnpm verify --spec 07` no deja restos del proyecto `syc-verify-07`.
- [ ] En el servidor, siguiendo `docs/despliegue.md` desde un clon limpio, la web responde en `http://<ip-del-servidor>/` y el admin del seed entra.
- [ ] En el servidor, la prueba de restauración pasa antes de la salida a producción.
- [ ] El día siguiente al primer deploy, `docker compose -f docker-compose.prod.yml logs backup` muestra `backup OK` a las 02:00 y la copia está en `BACKUP_DIR`. Nadie la disparó a mano.
- [ ] `docs/checklist-permisos.md` tiene todas las filas en ✅ contra el servidor, y una línea en el registro con la fecha, el tag y quién la hizo, commiteada.
- [ ] La versión desplegada es un tag `vAAAA.MM.DD` creado sobre `main` con el CI en verde.

## Decisiones

- **Sí:** la API va por el mismo origen, bajo `/api`, detrás de Nginx (decisión del usuario, 2026-10-07).
  - Hay un solo puerto abierto y no hace falta CORS.
  - Nginx manda la IP real del cliente, así que el rate limit del login cuenta por persona.
  - `/api/auth/*` pasa con la ruta intacta (`basePath` de Better Auth), y el resto de `/api/*` pierde el prefijo. Así las rutas de oRPC, Bruno y `pnpm verify` no cambian.
  - Descartado: la API en un puerto aparte, como en desarrollo. Quedaban dos puertos abiertos y CORS activo.
  - Descartado: un prefijo global en Nest. Cambiaba todas las rutas, también en desarrollo.
- **Sí:** `VITE_API_URL` acepta una ruta relativa (`/api`). La imagen de la web no depende de la IP del servidor: cambiar la IP es cambiar `PUBLIC_URL` y recrear `api`, sin reconstruir la web.
- **Sí:** la web y Nginx son un solo contenedor, la imagen de `apps/web/Dockerfile` (decisión del usuario, 2026-10-07). Descartado: `web` estático con `nginx` delante, que suma dos servidores HTTP para lo que hace uno.
- **Sí:** las migraciones se aplican automáticamente con el servicio `migrate`, antes de `api` (decisión del usuario, 2026-10-07). No hay un paso que olvidar, y si fallan, la API nueva no arranca. Descartado: un paso manual del procedimiento.
- **Sí:** el backup corre en un contenedor `backup` con cron, sobre `postgres:17-alpine`, con el mismo `pg_dump` que la base (decisión del usuario, 2026-10-07). Queda versionado en el repo. Descartado: el crontab del host, que vive fuera del repo.
- **Sí:** las copias van a una carpeta del servidor (`BACKUP_DIR`, por defecto `/srv/syc/backups`) (decisión del usuario, 2026-10-07). Se ven con `ls` y se sacan con `cp` o `scp`. Descartado: un volumen de Docker con nombre.
- **Sí:** `pg_dump -Fc`, un archivo por corrida, escrito como `.partial` y renombrado al terminar. Una copia a medias nunca cuenta para las 30, y un backup fallido no rota.
- **Sí:** `TZ=America/Argentina/Buenos_Aires` explícita en el contenedor. "02:00 hora del servidor" (Q36) no depende de la zona de la imagen, y es la misma zona que `hoyArgentina()`.
- **Sí:** el deploy empieza con un backup manual, que cuenta dentro de las 30 (decisión del usuario, 2026-10-07). Es el punto al que se vuelve si una migración rompe algo.
- **Sí:** se despliega por tags `vAAAA.MM.DD` sobre `main` (decisión del usuario, 2026-10-07). Se sabe qué corre en el servidor, y volver atrás es un checkout del tag anterior. Descartado: `git pull` de `main`.
- **Sí:** las imágenes se construyen en el servidor, sin registro (Q37: deploy manual).
- **Sí:** `pnpm verify --spec 07` cubre lo automatizable, con un proyecto de compose propio (decisión del usuario, 2026-10-07). Un Dockerfile roto se descubre antes de desplegar.
- **Sí:** el CI construye las imágenes en cada PR, sin publicarlas (decisión del usuario, 2026-10-07).
- **Sí:** entran la rotación de logs de Docker y las cabeceras de seguridad en Nginx (decisión del usuario, 2026-10-07). Los logs no llenan el disco que comparten con los backups.
- **No:** la caché larga de assets ni gzip (decisión del usuario, 2026-10-07). Es uso interno en la red local.
- **Sí:** el sistema arranca vacío: migraciones y seed (decisión del usuario, 2026-10-07). Importar datos existentes sería otro spec.
- **Sí:** `docs/checklist-permisos.md` es una plantilla con registro de corridas, y la corrida se commitea (decisión del usuario, 2026-10-07). Queda la evidencia.
- **Sí:** backups locales, 30 copias diarias, sin otro disco ni otro equipo (Q36). Queda como riesgo documentado, no como un pendiente silencioso.
- **Sí:** HTTP sin dominio ni HTTPS (Q37). Es una decisión explícita del usuario, no un olvido.
- **No:** Playwright para el checklist (P3).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los backups viven en el mismo servidor que la base: una falla de disco pierde los datos y las copias a la vez. | Es una limitación explícita (Q36). `BACKUP_DIR` es una carpeta común, así que copiarla a otro lado es un `scp`, y `docs/despliegue.md` lo muestra. Moverla a otro destino es una decisión futura. |
| Sin HTTPS, las credenciales viajan sin cifrar en la red interna. | Aceptado por decisión del usuario (Q37). Revisarlo si el servidor queda expuesto fuera de la red interna. |
| Una migración se aplica y la versión nueva falla: la base queda con un esquema que la versión anterior no conoce. | Backup manual antes de cada deploy, y un procedimiento de vuelta atrás con `restore.sh`. |
| Nginx guarda la IP de `api` al arrancar, y recrear solo `api` daría 502. | `resolver 127.0.0.11` y la resolución en cada request. Un criterio de `pnpm verify` recrea solo `api`. |
| Alguien entra por otra URL (nombre de host en vez de IP) y el login falla. | Una sola `PUBLIC_URL`, documentada. Sumar otra URL es un cambio de `trustedOrigins` en otro spec. |
| El build en el servidor necesita internet (imágenes base y `pnpm install`). | Es un requisito documentado en `docs/despliegue.md`. |
| La contraseña del seed queda escrita en el `.env` del servidor. | El procedimiento borra las `SEED_ADMIN_*` después del primer deploy. El admin cambia su contraseña desde la UI. |
| Las 30 copias y los logs llenan el disco. | Logs rotados (10 MB × 5 por servicio). `docs/despliegue.md` incluye `du -sh $BACKUP_DIR` y `df -h` en la operación de backups. |
| `pnpm verify --spec 07` tarda varios minutos (build de imágenes). | Corre solo con `--spec 07` o en la corrida completa. El job `docker` del CI cubre el build en cada PR. |

## Qué **no** está en este spec

- HTTPS, dominio, certificados y HSTS (Q37).
- CI/CD que despliega, o un registro de imágenes (Q37).
- Copias en otro disco o en otro equipo, y alertas de backup fallido (Q36).
- Caché larga de assets y gzip.
- Importar datos existentes.
- Playwright o e2e automatizados (P3).
- Monitoreo, varios servidores, otro orquestador, entrar por más de una URL y actualizar Postgres de versión mayor.
- Cualquier funcionalidad de negocio nueva (Fase 2).
