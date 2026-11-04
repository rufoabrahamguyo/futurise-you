#!/bin/sh
# Prepares the database and storage before starting the given command.
# Only the web process (RUN_MIGRATIONS=1) migrates and seeds, so worker and
# beat containers do not race each other.
set -e

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  python manage.py wait_for_services
  python manage.py migrate --noinput
  python manage.py ensure_bucket
  if [ "${SEED_DEMO:-0}" = "1" ]; then
    python manage.py seed_demo
  fi
fi

exec "$@"
