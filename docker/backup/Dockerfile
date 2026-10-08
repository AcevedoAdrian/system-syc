# Contenedor de backups (SPEC 07): cron + pg_dump/pg_restore sobre la misma imagen que la base,
# para que el cliente de Postgres sea siempre de la misma versión que el servidor.
#   docker build docker/backup
FROM postgres:17-alpine

# "02:00 hora del servidor" no depende de la zona de la imagen; es la misma que `hoyArgentina()`.
ENV TZ=America/Argentina/Buenos_Aires \
    BACKUP_DIR=/backups \
    BACKUP_KEEP=30

COPY --chmod=755 backup.sh restore.sh /usr/local/bin/
# En el compose se monta `BACKUP_DIR` del servidor encima; sola, la imagen igual tiene dónde escribir.
RUN mkdir -p /backups
COPY crontab /etc/crontabs/root

# La imagen de Postgres arranca el servidor en su entrypoint: acá solo corre cron, en primer plano
# (como PID 1, para que `docker compose logs backup` muestre las líneas de backup.sh).
ENTRYPOINT []
CMD ["crond", "-f", "-l", "8"]
