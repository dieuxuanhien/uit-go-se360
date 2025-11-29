#!/bin/bash
# Story 2.2: Setup PostgreSQL read replica from primary
# This script runs as the entrypoint for replica containers

set -e

PRIMARY_HOST=$1
PRIMARY_USER=${2:-postgres}
PRIMARY_PASSWORD=${3:-postgres}

echo "=== PostgreSQL Replica Setup ==="
echo "Primary host: ${PRIMARY_HOST}"

# Wait for primary database to be ready AND accepting replication
echo "Waiting for primary database at ${PRIMARY_HOST}..."
max_attempts=60
attempt=0
until PGPASSWORD=${PRIMARY_PASSWORD} psql -h "${PRIMARY_HOST}" -U "${PRIMARY_USER}" -c "SELECT 1;" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo "ERROR: Primary database not ready after ${max_attempts} attempts"
    exit 1
  fi
  echo "  Attempt ${attempt}/${max_attempts} - waiting..."
  sleep 2
done
echo "OK Primary database is ready"

# Check if this is first-time setup (no data directory)
if [ ! -f "${PGDATA}/PG_VERSION" ]; then
  echo "Setting up replica from primary ${PRIMARY_HOST}..."
  
  # Ensure PGDATA directory exists and is empty
  mkdir -p "${PGDATA}"
  rm -rf "${PGDATA:?}"/*
  
  # Create base backup from primary
  echo "Running pg_basebackup (this may take a minute)..."
  PGPASSWORD=${PRIMARY_PASSWORD} pg_basebackup \
    -h "${PRIMARY_HOST}" \
    -U "${PRIMARY_USER}" \
    -D "${PGDATA}" \
    -Fp \
    -Xs \
    -P \
    -R \
    --checkpoint=fast

  # Configure connection to primary
  # CRITICAL: max_connections on replica must be >= primary (300)
  cat >> "${PGDATA}/postgresql.auto.conf" <<EOF
primary_conninfo = 'host=${PRIMARY_HOST} port=5432 user=${PRIMARY_USER} password=${PRIMARY_PASSWORD}'
max_connections = 300
EOF
  
  # Ensure standby.signal exists (created by -R flag, but be safe)
  touch "${PGDATA}/standby.signal"
  
  echo "OK Replica setup complete"
else
  echo "Replica data already exists, starting normally..."
fi

# Start PostgreSQL
echo "Starting PostgreSQL replica..."
exec docker-entrypoint.sh postgres
