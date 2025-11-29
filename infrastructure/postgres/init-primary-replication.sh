#!/bin/bash
# Story 2.2: Initialize primary database for streaming replication
# This script runs during postgres initdb (first boot only)

set -e

echo "🔧 Configuring primary database for streaming replication..."

# Configure PostgreSQL for replication
cat >> "${PGDATA}/postgresql.conf" <<EOF

# Story 2.2: Streaming Replication Configuration
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
hot_standby = on
wal_keep_size = 1024
max_connections = 300
EOF

# Allow replication connections from any host (docker network)
echo "host replication all 0.0.0.0/0 trust" >> "${PGDATA}/pg_hba.conf"
echo "host all all 0.0.0.0/0 trust" >> "${PGDATA}/pg_hba.conf"

echo "✅ Primary database configured for streaming replication"
