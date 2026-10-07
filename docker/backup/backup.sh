#!/bin/sh
# Backup de la base (SPEC 07, Feature 7.3). Lo corre cron todos los días a las 02:00 y se puede
# correr a mano: `docker compose -f docker-compose.prod.yml exec backup backup.sh`.
#
# Escribe `syc-AAAAMMDD-HHMMSS.dump` (pg_dump -Fc, la base completa) primero como `.partial` y lo
# renombra al terminar bien. Si pg_dump falla, borra el parcial, deja una línea ERROR y termina con
# código 1 SIN rotar: un backup fallido nunca borra copias. Si sale bien, conserva las BACKUP_KEEP
# copias `syc-*.dump` más recientes y borra el resto; no toca ningún otro archivo de la carpeta.
set -u

DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP:-30}"
# La línea de log va también al stdout del contenedor (PID 1), para que salga en
# `docker compose logs backup` aunque el script corra desde cron o desde `exec`.
LOG="${BACKUP_LOG:-/proc/1/fd/1}"

export PGHOST="${PGHOST:-postgres}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${POSTGRES_USER:-postgres}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
export PGDATABASE="${POSTGRES_DB:-syc}"

log() {
  line="$(date '+%Y-%m-%d %H:%M:%S') backup $*"
  echo "$line"
  echo "$line" >>"$LOG" 2>/dev/null || true
}

case "$KEEP" in
  '' | *[!0-9]* | 0)
    log "ERROR: BACKUP_KEEP debe ser un entero mayor que 0 (vale '$KEEP') (no se borró ninguna copia)"
    exit 1
    ;;
esac

name="syc-$(date +%Y%m%d-%H%M%S).dump"
partial="$DIR/$name.partial"

if ! err="$(pg_dump -Fc -f "$partial" 2>&1)"; then
  rm -f "$partial"
  err="$(printf '%s' "$err" | tr '\n' ' ' | sed 's/ *$//')"
  log "ERROR: $err (no se borró ninguna copia)"
  exit 1
fi

if ! err="$(mv "$partial" "$DIR/$name" 2>&1)"; then
  rm -f "$partial"
  log "ERROR: no se pudo renombrar el backup: $err (no se borró ninguna copia)"
  exit 1
fi

# Los nombres llevan la fecha, así que el orden alfabético es el cronológico.
ls -1 "$DIR" | grep '^syc-.*\.dump$' | sort -r | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f -- "$DIR/$old"
done

copies="$(ls -1 "$DIR" | grep -c '^syc-.*\.dump$')"
size="$(wc -c <"$DIR/$name" | awk '{ printf "%.1f MB", $1 / 1048576 }')"
if [ "$copies" -eq 1 ]; then label="copia"; else label="copias"; fi
log "OK $name ($size), $copies $label"
