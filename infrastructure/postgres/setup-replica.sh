#!/bin/bash
# Story 2.2: Setup Postgres Streaming Replication
# This script is executed inside replica containers to enable replication

set -e

echo "🔄 Configuring Postgres replica for streaming replication..."

# Enable hot standby (read-only queries on replica)
echo "hot_standby = on" >> "$PGDATA/postgresql.conf"

# Set recovery mode (replicas are in continuous recovery)
touch "$PGDATA/standby.signal"

echo "✅ Replica configuration complete"
