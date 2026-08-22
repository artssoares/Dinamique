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

# These tests need a real Postgres. Without one we skip loudly rather than
# failing the whole workspace test run on a machine that has no database.
if ! pg_isready -q 2>/dev/null; then
  # CI always has a database, so a skip there would silently drop the security
  # assertions. Skipping is only ever a local-convenience behaviour.
  if [ -n "${CI:-}" ]; then
    echo "FAIL  no Postgres reachable at ${PGHOST}:${PGPORT} (required in CI)."
    exit 1
  fi
  echo "SKIP  no Postgres reachable at ${PGHOST}:${PGPORT}."
  echo "      Start one with \`supabase start\`, or set PGHOST/PGPORT."
  exit 0
fi

psql -q -c "drop database if exists ${DB};" -c "create database ${DB};"

# The shim provides the auth schema locally; a real Supabase project has it.
if [ "${DINAMIQUE_USE_SHIM:-1}" = "1" ]; then
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$here/supabase_shim.sql"
fi

for migration in "$here/../migrations/"*.sql; do
  echo "  applying $(basename "$migration")"
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$migration"
done

# `set -o pipefail` plus ON_ERROR_STOP means a failed assertion, which raises
# in plpgsql, exits non-zero rather than merely printing.
psql -d "$DB" -v ON_ERROR_STOP=1 -f "$here/rls_test.sql" 2>&1 \
  | sed 's/^psql[^ ]* NOTICE:  //' \
  | grep -E 'PASS|FAIL|ERROR|ALL DATABASE'
