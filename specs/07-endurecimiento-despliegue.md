# SPEC 07 — Endurecimiento y despliegue

> **Status:** Draft
> **Depends on:** SPEC 06 (comentarios, bandeja y detalle)
> **Date:** 2026-09-29
> **Objective:** backups automáticos de Postgres, despliegue on-premise con Docker Compose y Nginx, y un checklist manual de permisos, dejando el sistema corriendo en el servidor real.

## Por qué existe este spec

Es la etapa 6 y última del PRD §10, con resultado verificable "sistema en el servidor real". Depende de que exista un dominio completo (SPEC 02 a 06) porque el checklist de permisos recorre la matriz PRD §4.2 sobre tickets reales, no sobre el esqueleto.

## Alcance

**Dentro:**

- Script de backup automático de Postgres y prueba de restauración documentada.
- Dockerfiles de producción para `api` y `web` (diferidos desde SPEC 01).
- `docker-compose.prod.yml` (o equivalente) con Nginx sirviendo `web` y proxy hacia `api`.
- Procedimiento de deploy manual documentado.
- Checklist manual que recorre la matriz PRD §4.2 antes de salir a producción.

**Fuera de alcance:**

- HTTPS, dominio propio, certificados: no entran en esta etapa (Q37).
- CI que despliegue automáticamente: el CI sigue limitado a `lint`/`typecheck`/`test`/`build` (Q37).
- Cualquier funcionalidad de negocio nueva (todo lo de Fase 2).

## Modelo de datos

Este spec no agrega modelos ni migraciones. Toca solo infraestructura: scripts de backup, Dockerfiles y compose de producción.

```yaml
# docker-compose.prod.yml (fragmento ilustrativo)
services:
  postgres:
    # mismo servicio que docker-compose.yml, con el volumen de datos
    # + un volumen adicional para las copias de backup
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
  nginx:
    image: nginx:stable
    ports:
      - "80:80"
    depends_on: [web, api]
```

```bash
# env de producción (fragmento de .env en el servidor)
NODE_ENV=production
WEB_ORIGIN=http://<ip-del-servidor>
DATABASE_URL=postgresql://...
```

## Contrato

**Feature 7.1: Backups de Postgres**

- **MUST:**
  - Backup automático todos los días a las 02:00, hora del servidor (PRD §10, etapa 6, Q36).
  - Se conservan 30 copias, dentro del mismo servidor, en un volumen separado del volumen de datos de Postgres (Q36).
  - Antes de salir a producción, se restaura una copia en una base vacía y se comprueba que un usuario puede entrar y ver tickets. Se repite esta prueba si cambia el procedimiento de backup (Q36).
- **EDGE CASES:** si el backup diario falla (por ejemplo, disco lleno), el proceso debe dejar un log claro; no está en alcance una alerta automática (Q36 no lo pide).
- **MUST NOT:** depender de un backup manual; guardar las copias en otro disco u otro equipo — eso queda para una etapa futura (Q36, explícitamente fuera de esta etapa).

**Feature 7.2: Despliegue on-premise**

- **MUST:**
  - Servidor Linux con Docker Compose; Nginx sirve el build estático de `web` y hace de proxy hacia `api` (PRD §7, §9).
  - Se entra por HTTP con la IP del servidor; no hay dominio ni HTTPS en esta etapa. `WEB_ORIGIN` es esa URL (`http://<ip>`) (Q37).
  - Dockerfiles de producción para `api` (usa el bundle de `tsdown`, ver `apps/api/CLAUDE.md`) y `web` (build estático de Vite).
  - Deploy manual en el servidor: `git pull` de los cambios ya probados en local, build de las imágenes, y `docker compose -f docker-compose.prod.yml up -d` (Q37). El CI no dispara el despliegue.
  - Variables de entorno validadas con Zod al arrancar cada servicio, igual que en desarrollo (SPEC 01).
  - Las migraciones de Prisma se aplican con `prisma migrate deploy` antes de levantar `api` *(propuesta técnica)*.
- **EDGE CASES:**
  - Si una migración falla durante el deploy, `api` no arranca y el deploy queda a medio camino — el procedimiento documentado debe decir cómo revertir (`git checkout` a la versión anterior + rebuild) *(propuesta técnica)*.
- **MUST NOT:** un orquestador distinto de Docker Compose; HTTPS o dominio en esta etapa (Q37); que el CI dispare el deploy.

**Feature 7.3: CI y checklist de permisos**

- **MUST:**
  - `pnpm turbo lint typecheck test build` en verde antes de cada deploy, vía `.github/workflows/ci.yml` con `turbo --filter` (SPEC 01, PRD §7).
  - Tests Vitest de services con el repository mockeado, acumulados de SPEC 02 a 06.
  - Checklist manual que recorre cada celda de la matriz PRD §4.2 (agente en su departamento, agente en otro, admin) contra el sistema desplegado, antes de la primera salida a producción (PRD §7, P3).
- **MUST NOT:** Playwright ni ninguna automatización de e2e (P3, decisión ya cerrada del PRD).

## Plan de implementación

1. Script de backup (`pg_dump` programado, por ejemplo con `cron` dentro de un contenedor auxiliar o en el host) que rota 30 copias. Verificar: correrlo dos veces seguidas deja como máximo 30 archivos, borrando el más viejo.
2. `apps/api/Dockerfile` de producción (build del bundle `tsdown`, imagen final solo con `dist/` y `node_modules` de producción). Verificar: `docker build` produce una imagen que arranca con `node dist/main.mjs`.
3. `apps/web/Dockerfile` de producción (build de Vite, servido como estático). Verificar: `docker build` produce una imagen que sirve `index.html`.
4. `docker-compose.prod.yml` con Nginx como entrada única. Verificar: `docker compose -f docker-compose.prod.yml up` deja la web accesible por HTTP en el puerto 80.
5. Documentar el procedimiento de deploy manual (`git pull`, build, up, rollback) en `docs/architecture.md` o un `docs/despliegue.md` nuevo. Verificar: seguir el documento paso a paso en un entorno de prueba funciona sin pasos implícitos.
6. Probar la restauración de un backup en una base vacía. Verificar: un usuario de prueba entra y ve tickets tras la restauración.
7. Checklist de permisos: documento (`docs/checklist-permisos.md` o similar) con una fila por celda de la matriz PRD §4.2, para tildar a mano contra el sistema desplegado. Verificar: se completa una vez contra el ambiente de producción antes de dar por cerrada la etapa.

## Criterios de aceptación

- [ ] El backup corre solo, todos los días a las 02:00, sin intervención manual.
- [ ] Nunca hay más de 30 copias guardadas.
- [ ] Restaurar una copia en una base vacía deja el sistema operable (login + ver tickets).
- [ ] `docker compose -f docker-compose.prod.yml up -d` desde cero, en el servidor, deja `postgres`, `api`, `web` y `nginx` corriendo.
- [ ] La web responde por `http://<ip-del-servidor>/`.
- [ ] `pnpm turbo lint typecheck test build` termina con código 0 antes del primer deploy.
- [ ] El checklist de la matriz PRD §4.2 está completo y tildado contra el ambiente desplegado.

## Decisiones

- **Sí:** backups locales, 30 copias diarias, sin otro disco ni otro equipo por ahora (Q36). Queda documentado como riesgo, no como pendiente silencioso.
- **Sí:** HTTP sin dominio ni HTTPS en esta etapa (Q37). Es una decisión explícita del usuario, no un olvido.
- **Sí:** deploy manual, sin CI/CD automático (Q37), coherente con "servidor Linux on-premise" del PRD §3 y con P3 (pruebas manuales).
- **No:** Playwright para el checklist de permisos — sigue P3, se hace a mano.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los backups viven en el mismo servidor que la base: un fallo de disco pierde datos y copias a la vez. | Documentado como limitación explícita de esta etapa (Q36); mover a otro destino queda para una decisión futura, no silenciosa. |
| Sin HTTPS, las credenciales viajan sin cifrar en la red interna. | Aceptado para esta etapa por decisión del usuario (Q37); revisar si el servidor queda expuesto más allá de la red interna. |
| El deploy manual depende de que la persona que lo hace siga el procedimiento exacto. | El documento del paso 5 debe ser ejecutable sin conocimiento implícito; probarlo una vez de punta a punta antes de la primera salida real. |

## Qué **no** está en este spec

- HTTPS, dominio, certificados (Q37, explícitamente fuera).
- CI/CD automático de despliegue (Q37).
- Cualquier funcionalidad de negocio nueva (Fase 2: adjuntos, CSV, campos personalizados, asignación individual, otros módulos).
