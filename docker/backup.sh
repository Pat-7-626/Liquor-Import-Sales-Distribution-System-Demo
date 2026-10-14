#!/bin/sh
# Scheduled backups: the database (pg_dump, gzipped) and uploaded documents (tar), into /backups.
# Runs once at start, then every BACKUP_EVERY_HOURS; files older than BACKUP_KEEP_DAYS are removed.
set -eu
EVERY_HOURS="${BACKUP_EVERY_HOURS:-24}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p /backups
while true; do
  stamp="$(date +%Y%m%d-%H%M)"
  if pg_dump -h db -U lisd -d lisd --no-owner | gzip > "/backups/lisd-db-$stamp.sql.gz.tmp"; then
    mv "/backups/lisd-db-$stamp.sql.gz.tmp" "/backups/lisd-db-$stamp.sql.gz"
    echo "$(date -Iseconds) database backup lisd-db-$stamp.sql.gz"
  else
    rm -f "/backups/lisd-db-$stamp.sql.gz.tmp"
    echo "$(date -Iseconds) database backup FAILED" >&2
  fi
  tar -czf "/backups/lisd-uploads-$stamp.tar.gz" -C /data uploads 2>/dev/null && echo "$(date -Iseconds) uploads backup lisd-uploads-$stamp.tar.gz"
  find /backups -name 'lisd-*' -mtime +"$KEEP_DAYS" -delete
  sleep "$((EVERY_HOURS * 3600))"
done
