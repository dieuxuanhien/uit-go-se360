#!/bin/bash
# Story 2.2: Setup PostgreSQL read replica from primary

set -e

PRIMARY_HOST=$1
PRIMARY_USER=${2:-postgres}
PRIMARY_PASSWORD=${3:-postgres}

echo "Waiting for primary database at ${PRIMARY_HOST}..."
until PGPASSWORD=${PRIMARY_PASSWORD} psql -h "${PRIMARY_HOST}" -U "${PRIMARY_USER}" -c '\q' 2>/dev/null; do
  sleep 2
done
echo "✓ Primary database is ready"

# Check if this is first-time setup
if [ ! -f "${PGDATA}/PG_VERSION" ]; then
  echo "Setting up replica from primary ${PRIMARY_HOST}..."
  
  # Create base backup from primary
  rm -rf "${PGDATA}"/*
  PGPASSWORD=${PRIMARY_PASSWORD} pg_basebackup \
    -h "${PRIMARY_HOST}" \
    -U "${PRIMARY_USER}" \
    -D "${PGDATA}" \
    -Fp \
    -Xs \
    -P \
    -R
  
  # Configure connection to primary
  # CRITICAL: max_connections on replica must be >= primary (200)
  cat >> "${PGDATA}/postgresql.auto.conf" <<EOF
primary_conninfo = 'host=${PRIMARY_HOST} port=5432 user=${PRIMARY_USER} password=${PRIMARY_PASSWORD}'
max_connections = 200
EOF
  
  echo "✓ Replica setup complete"
fi

# Start PostgreSQL
exec docker-entrypoint.sh postgres
