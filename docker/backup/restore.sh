#!/bin/sh
# Restauración de la base (SPEC 07, Feature 7.3):
#   docker compose -f docker-compose.prod.yml stop api
#   docker compose -f docker-compose.prod.yml run --rm backup restore.sh --confirmar syc-20261008-020000.dump
#   docker compose -f docker-compose.prod.yml up -d api
#
# REEMPLAZA la base POSTGRES_DB: la borra, la recrea y restaura la copia con pg_restore. Por eso:
#   - sin `--confirmar` solo dice qué haría y no toca nada;
#   - si hay otras conexiones abiertas a la base se niega y pide detener `api`;
#   - revisa que la copia se pueda leer ANTES de borrar nada.
set -u

DIR="${BACKUP_DIR:-/backups}"
LOG="${BACKUP_LOG:-/proc/1/fd/1}"

export PGHOST="${PGHOST:-postgres}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${POSTGRES_USER:-postgres}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
DB="${POSTGRES_DB:-syc}"

log() {
  line="$(date '+%Y-%m-%d %H:%M:%S') restore $*"
  echo "$line"
  echo "$line" >>"$LOG" 2>/dev/null || true
}

usage() {
  echo "Uso: restore.sh --confirmar <archivo>" >&2
  echo "  <archivo>: una copia de $DIR (por ejemplo syc-20261008-020000.dump) o una ruta completa." >&2
}

confirm=0
file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --confirmar) confirm=1 ;;
    -*)
      echo "Opción desconocida: $1" >&2
      usage
      exit 2
      ;;
    *)
      if [ -n "$file" ]; then
        echo "Sobra un argumento: $1" >&2
        usage
        exit 2
      fi
      file="$1"
      ;;
  esac
  shift
done

if [ -z "$file" ]; then
  usage
  exit 2
fi

# Un nombre suelto se busca en BACKUP_DIR.
case "$file" in
  */*) path="$file" ;;
  *) path="$DIR/$file" ;;
esac

if [ "$confirm" -ne 1 ]; then
  echo "Sin --confirmar no hago nada. Con --confirmar haría esto:" >&2
  echo "  1. borrar la base '$DB' en $PGHOST," >&2
  echo "  2. crearla de nuevo vacía," >&2
  echo "  3. restaurar en ella la copia $path." >&2
  echo "Se pierde todo lo que la base tenga hoy y la copia no. Detené 'api' antes." >&2
  exit 1
fi

if [ ! -f "$path" ]; then
  log "ERROR: no existe la copia $path (no se tocó la base)"
  exit 1
fi

# Si la copia está rota, mejor enterarse antes de borrar la base.
if ! err="$(pg_restore --list "$path" 2>&1 >/dev/null)"; then
  err="$(printf '%s' "$err" | tr '\n' ' ' | sed 's/ *$//')"
  log "ERROR: la copia $path no se puede leer: $err (no se tocó la base)"
  exit 1
fi

# Nuestra propia conexión es a la base `postgres`, así que no cuenta.
open="$(psql -d postgres -Atc "SELECT count(*) FROM pg_stat_activity WHERE datname = '$DB'" 2>&1)" || {
  log "ERROR: no se pudo consultar las conexiones: $open (no se tocó la base)"
  exit 1
}
if [ "$open" != "0" ]; then
  log "ERROR: hay $open conexiones abiertas a '$DB'. Detené la API: docker compose -f docker-compose.prod.yml stop api (no se tocó la base)"
  exit 1
fi

log "restaurando $path en '$DB'"
if ! err="$(psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$DB\"" -c "CREATE DATABASE \"$DB\"" 2>&1)"; then
  err="$(printf '%s' "$err" | tr '\n' ' ' | sed 's/ *$//')"
  log "ERROR: no se pudo recrear la base: $err"
  exit 1
fi

if ! err="$(pg_restore --exit-on-error --no-owner --no-privileges -d "$DB" "$path" 2>&1)"; then
  err="$(printf '%s' "$err" | tr '\n' ' ' | sed 's/ *$//')"
  log "ERROR: la base '$DB' quedó recreada pero la restauración falló: $err. Repetí el restore con la misma copia u otra."
  exit 1
fi

log "OK base '$DB' restaurada desde $path"
