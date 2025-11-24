#!/bin/bash
# Story 2.2: Initialize primary database for streaming replication

set -e

# Configure PostgreSQL for replication
cat >> "${PGDATA}/postgresql.conf" <<EOF

# Story 2.2: Streaming Replication Configuration
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
hot_standby = on
EOF

# Allow replication connections
echo "host replication postgres 0.0.0.0/0 trust" >> "${PGDATA}/pg_hba.conf"

echo "✓ Primary database configured for streaming replication"
