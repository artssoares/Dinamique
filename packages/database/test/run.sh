#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres and runs the behaviour tests.
#
# Requires a running Postgres. Point it at one with:
#   PGHOST=... PGPORT=... PGUSER=... ./test/run.sh
# Defaults match `supabase start`.
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
DB="${DINAMIQUE_TEST_DB:-dinamique_test}"
export PGHOST PGPORT PGUSER PGPASSWORD="${PGPASSWORD:-postgres}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

psql -q -c "drop database if exists ${DB};" -c "create database ${DB};"

# The shim provides the auth schema locally; a real Supabase project has it.
if [ "${DINAMIQUE_USE_SHIM:-1}" = "1" ]; then
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$here/supabase_shim.sql"
fi

for migration in "$here/../migrations/"*.sql; do
  echo "  applying $(basename "$migration")"
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$migration"
done

psql -d "$DB" -v ON_ERROR_STOP=1 -f "$here/rls_test.sql" 2>&1 \
  | sed 's/^psql[^ ]* NOTICE:  //' \
  | grep -E 'PASS|FAIL|ALL DATABASE'
