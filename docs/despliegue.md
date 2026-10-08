# Despliegue en el servidor

Procedimiento para poner el sistema en el servidor on-premise y operarlo (SPEC 07, `specs/07-endurecimiento-despliegue.md`). Cada paso es un comando para copiar y pegar. Todos los comandos se corren **en el servidor**, dentro de la carpeta del repo, salvo los marcados "en tu máquina".

## Cómo está armado

`docker-compose.prod.yml` levanta cinco servicios:

| Servicio | Qué hace |
|---|---|
| `postgres` | La base. No publica puertos: solo se alcanza desde la red del compose. |
| `migrate` | Corre `prisma migrate deploy` y termina. Si falla, `api` no arranca. |
| `api` | La API NestJS. No publica puertos. |
| `web` | Nginx: sirve la web y reenvía `/api` a la API. **Es la única entrada**: publica el puerto `HTTP_PORT` (80 por defecto). |
| `backup` | Cron + `pg_dump`: una copia diaria a las 02:00 (hora de Argentina) en `BACKUP_DIR`, con rotación de 30. |

Todo entra por una sola URL, `PUBLIC_URL` (por ejemplo `http://10.0.0.5`). Sin HTTPS ni dominio: es una decisión explícita (SPEC 07, Q37).

> **Una sola URL.** Entrar por otra que no sea `PUBLIC_URL` (por ejemplo, un nombre de host en vez de la IP) hace fallar el login: Better Auth rechaza ese origen. Para cambiar la IP del servidor, mirá "Cambiar la URL de entrada".

Para no repetir el archivo en cada comando, en esta guía `docker compose -f docker-compose.prod.yml` aparece completo siempre.

## Requisitos del servidor

- Linux, con Docker Engine y el plugin `docker compose` (`docker compose version` tiene que andar).
- `git`.
- El puerto 80 libre (o el que pongas en `HTTP_PORT`).
- Acceso a internet durante el build (imágenes base y `pnpm install`).
- Docker arrancando con el servidor, para que el sistema vuelva solo después de un reinicio:

  ```bash
  sudo systemctl enable --now docker
  ```

- La carpeta de las copias, creada **antes del primer `up`**:

  ```bash
  sudo mkdir -p /srv/syc/backups
  ```

## Primer deploy

Se despliega siempre un **tag** (ver "Tags"), nunca una rama. En los ejemplos, `v2026.10.08`; usá el que te hayan pasado.

1. **Clonar el repo y hacer checkout del tag.** Reemplazá `<URL-DEL-REPO>` por la URL del repositorio.

   ```bash
   git clone <URL-DEL-REPO> syc
   cd syc
   git checkout v2026.10.08
   ```

2. **Crear el `.env`** desde el ejemplo y completarlo.

   ```bash
   cp .env.production.example .env
   chmod 600 .env
   ```

   Generá los dos secretos y pegalos en el archivo (`nano .env`):

   ```bash
   openssl rand -hex 24      # POSTGRES_PASSWORD (solo letras y números: va dentro de una URL)
   openssl rand -base64 32   # BETTER_AUTH_SECRET (mínimo 32 caracteres)
   ```

   Completá además:

   - `PUBLIC_URL`: la URL exacta con la que se entra, por ejemplo `http://10.0.0.5`. Si `HTTP_PORT` no es 80, va con el puerto: `http://10.0.0.5:8080`.
   - `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` y `SEED_ADMIN_NAME`: el administrador raíz. Se usan una sola vez, en el paso 4.
   - `BACKUP_DIR`, solo si no es `/srv/syc/backups`.

   Si falta `PUBLIC_URL`, `POSTGRES_PASSWORD` o `BETTER_AUTH_SECRET`, `docker compose` no arranca y nombra la que falta.

3. **Construir y levantar todo.** La primera vez tarda varios minutos.

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   Las migraciones se aplican solas (servicio `migrate`). Comprobá el estado:

   ```bash
   docker compose -f docker-compose.prod.yml ps -a
   ```

   Tiene que verse `migrate` en `Exited (0)` y `postgres`, `api`, `web` y `backup` en `running`, con `api` en `healthy`. Si `up` termina con error, mirá "Si algo falla".

4. **Correr el seed y borrar las variables del admin.** El seed crea el admin raíz, los 4 departamentos, los 7 estados y las 4 prioridades. Es idempotente.

   ```bash
   docker compose -f docker-compose.prod.yml run --rm api node dist/seed.mjs
   ```

   Después, borrá la contraseña del `.env` y recreá `api` para que tampoco quede en su entorno:

   ```bash
   sed -i '/^SEED_ADMIN_/d' .env
   docker compose -f docker-compose.prod.yml up -d
   ```

   Entrá a `PUBLIC_URL` con el usuario del seed y cambiá la contraseña desde la interfaz.

5. **Hacer la prueba de restauración** (sección siguiente). No se da por hecho el deploy sin esto.

6. **Completar el checklist de permisos** (`docs/checklist-permisos.md`) contra `PUBLIC_URL` y commitear el registro.

## Prueba de restauración

Comprueba que una copia sirve de verdad. Se hace en el primer deploy y cada vez que se quiera confiar de nuevo en los backups. Reemplaza la base entera: **no la hagas en un sistema con datos que no estén en una copia**.

1. En la web, entrá como admin y creá un ticket con el título `T1 antes del backup`.
2. Hacé una copia a mano y anotá el nombre que muestra (por ejemplo `syc-20261008-143015.dump`):

   ```bash
   docker compose -f docker-compose.prod.yml exec backup backup.sh
   ```

3. Creá otro ticket: `T2 después del backup`.
4. Detené la API, restaurá esa copia y levantá la API (reemplazá el nombre por el del paso 2):

   ```bash
   docker compose -f docker-compose.prod.yml stop api
   docker compose -f docker-compose.prod.yml exec backup restore.sh --confirmar syc-20261008-143015.dump
   docker compose -f docker-compose.prod.yml up -d
   ```

5. Entrá de nuevo (la restauración vuelve la base a ese momento): tiene que verse `T1 antes del backup` y **no** `T2 después del backup`.

Si `restore.sh` dice que hay conexiones abiertas, la API sigue corriendo: repetí el `stop api`.

## Deploy regular

1. **Backup manual.** Es el punto al que se vuelve si una migración rompe algo. Cuenta dentro de las 30 copias.

   ```bash
   docker compose -f docker-compose.prod.yml exec backup backup.sh
   ```

   Anotá el nombre de la copia que muestra la última línea (`backup OK syc-...dump`).

2. **Anotar el tag actual**, para poder volver:

   ```bash
   git describe --tags
   ```

3. **Traer y cambiar al tag nuevo** (reemplazá `v2026.10.15`):

   ```bash
   git fetch --tags
   git checkout v2026.10.15
   ```

4. **Reconstruir y levantar.** Aplica las migraciones nuevas solo; si fallan, la API nueva no arranca y la anterior sigue corriendo.

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

5. **Comprobar.** En el servidor (o con la IP desde otra máquina):

   ```bash
   curl http://localhost/api/health
   ```

   Tiene que responder con `"status":"ok"`. Si usás otro puerto, ponelo en la URL. Después entrá a la web con un usuario.

## Volver atrás

Elegí según si el deploy fallido aplicó migraciones nuevas. Ante la duda, usá la segunda opción.

**Sin migraciones nuevas:** volvé al tag que anotaste en el deploy.

```bash
git checkout v2026.10.08
docker compose -f docker-compose.prod.yml up -d --build
```

**Con migraciones ya aplicadas:** la base tiene un esquema que la versión anterior no conoce. Restaurá la copia del paso 1 del deploy (la de antes de migrar). **Se pierde lo que se cargó después de esa copia.**

```bash
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml exec backup restore.sh --confirmar syc-20261015-101200.dump
git checkout v2026.10.08
docker compose -f docker-compose.prod.yml up -d --build
```

Reemplazá el nombre de la copia y el tag por los tuyos.

## Tags

- Formato `vAAAA.MM.DD`, por ejemplo `v2026.10.08`. Si hay dos el mismo día, el segundo es `vAAAA.MM.DD.2`.
- Se crean sobre `main`, con el CI en verde. En tu máquina:

  ```bash
  git checkout main
  git pull
  git tag v2026.10.08
  git push origin v2026.10.08
  ```

- Antes de crear el tag, `pnpm turbo lint typecheck test build` tiene que terminar con código 0.
- El CI **no despliega** ni publica imágenes: construye las del servidor solo para comprobar que no estén rotas.

## Operación de backups

Las copias son archivos `syc-AAAAMMDD-HHMMSS.dump` en `BACKUP_DIR` (por defecto `/srv/syc/backups`): se ven con `ls` y se sacan con `cp` o `scp`. Se conservan las 30 más recientes. Un backup fallido no borra ninguna.

- **Listar las copias:**

  ```bash
  ls -lh /srv/syc/backups
  ```

- **Correr una a mano:**

  ```bash
  docker compose -f docker-compose.prod.yml exec backup backup.sh
  ```

- **Ver el log** (cada corrida deja una línea `backup OK ...` o `backup ERROR ...`):

  ```bash
  docker compose -f docker-compose.prod.yml logs --tail 50 backup
  ```

- **Restaurar** (reemplaza la base; detené la API antes y levantala después):

  ```bash
  docker compose -f docker-compose.prod.yml stop api
  docker compose -f docker-compose.prod.yml exec backup restore.sh --confirmar syc-20261008-020000.dump
  docker compose -f docker-compose.prod.yml up -d
  ```

  Sin `--confirmar`, `restore.sh` solo dice qué haría y no toca nada.

- **Revisar el espacio.** Las 30 copias y los logs comparten el disco con la base:

  ```bash
  du -sh /srv/syc/backups
  df -h
  ```

- **Sacar las copias del servidor.** Viven en el mismo disco que la base: si el disco falla, se pierde todo junto. No hay copia automática a otro equipo (SPEC 07, Q36), pero es un `scp` desde otra máquina:

  ```bash
  scp -r usuario@10.0.0.5:/srv/syc/backups ./syc-backups
  ```

## Cambiar la URL de entrada

Si cambia la IP del servidor o el puerto: editá `PUBLIC_URL` en el `.env` y recreá la API. No hace falta reconstruir la web.

```bash
nano .env
docker compose -f docker-compose.prod.yml up -d
```

## Si algo falla

- **`up -d` termina con error en `migrate`:** una migración falló y `api` no se creó ni se recreó. Mirá por qué:

  ```bash
  docker compose -f docker-compose.prod.yml logs migrate
  ```

- **`api` no queda `healthy`:**

  ```bash
  docker compose -f docker-compose.prod.yml logs --tail 100 api
  ```

  `degraded` en `/api/health` significa que la API no llega a la base. Si Postgres reinició, vuelve sola cuando la base responde.

- **El login falla en la web con la URL correcta:** comprobá que la barra del navegador diga exactamente `PUBLIC_URL`. Otra IP, un nombre de host o un puerto distinto se rechazan.

- **Muchos logins fallidos seguidos dan error (429):** el login permite 5 intentos por minuto por IP. Esperá un minuto.

- **Estado y logs de todo:**

  ```bash
  docker compose -f docker-compose.prod.yml ps -a
  docker compose -f docker-compose.prod.yml logs --tail 50
  ```

  Cada servicio rota sus logs (10 MB × 5 archivos).

## Fuera de alcance (a propósito)

HTTPS, dominio propio y HSTS (Q37); copias fuera del servidor y alertas de backup fallido (Q36); importar datos existentes (el sistema arranca vacío); monitoreo y más de un servidor. Si el servidor queda expuesto fuera de la red interna, el primer punto a revisar es HTTPS: hoy las credenciales viajan sin cifrar.
