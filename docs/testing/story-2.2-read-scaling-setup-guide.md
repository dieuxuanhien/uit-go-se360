# Story 2.2: Database Read Scaling - Setup and Testing Guide

## 📋 Overview

This guide explains how to set up Postgres streaming replication with 2 read replicas per database and implement read/write query routing for 10x read capacity improvement.

**Story Objectives:**
- **10x read capacity:** 4,000 TPS → 40,000 TPS
- **8x faster read queries:** 800ms → 100ms p95 latency
- **Replication lag:** <1s average (acceptable for historical queries)
- **Connection pooling:** 1000 app connections → 60 DB connections

---

## 🏗️ Architecture

```
┌─────────────┐
│ Application │
└──────┬──────┘
       │
       ├─── WRITE queries ────────▶ Primary DB (port 5432, 5433)
       │
       └─── READ queries ─────┬───▶ Replica 1 (port 5434, 5436)
                              │
                              └───▶ Replica 2 (port 5435, 5437)

Replication Flow:
Primary ──(WAL streaming)──▶ Replica 1
Primary ──(WAL streaming)──▶ Replica 2
```

**Databases:**
- **user-service:** `postgres-user` (primary:5432) + 2 replicas (5434, 5435)
- **trip-service:** `postgres-trip` (primary:5433) + 2 replicas (5436, 5437)

---

## 🚀 Step-by-Step Setup

### Step 1: Enable Replication on Primary Databases

The `docker-compose.replicas.yml` file automatically configures primary databases with:
- `wal_level = replica` (WAL log level for replication)
- `max_wal_senders = 10` (max 10 replicas can connect)
- `hot_standby = on` (replicas can serve read queries)

No manual action needed - configuration happens at container startup.

### Step 2: Start Postgres Replicas

```bash
cd /c/Users/ASUS/Desktop/UIT-GO/uit-go-se360

# Start primaries first (if not already running)
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d postgres-user postgres-trip

# Wait 10 seconds for primaries to be healthy
sleep 10

# Start replicas
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml -f docker-compose.replicas.yml up -d

# Verify all databases are running
docker ps | grep postgres
```

**Expected Output:**
```
uitgo-postgres-user            Up (healthy)   0.0.0.0:5432->5432/tcp
uitgo-postgres-user-replica-1  Up (healthy)   0.0.0.0:5434->5432/tcp
uitgo-postgres-user-replica-2  Up (healthy)   0.0.0.0:5435->5432/tcp
uitgo-postgres-trip            Up (healthy)   0.0.0.0:5433->5432/tcp
uitgo-postgres-trip-replica-1  Up (healthy)   0.0.0.0:5436->5432/tcp
uitgo-postgres-trip-replica-2  Up (healthy)   0.0.0.0:5437->5432/tcp
```

### Step 3: Verify Streaming Replication

Check replication status on primary:

```bash
# Check user database primary
docker exec uitgo-postgres-user psql -U postgres -d uitgo_user -c "SELECT client_addr, state, sync_state FROM pg_stat_replication;"

# Expected output: 2 rows showing replicas
```

**Expected Output:**
```
 client_addr |   state   | sync_state 
-------------+-----------+------------
 172.18.0.5  | streaming | async
 172.18.0.6  | streaming | async
(2 rows)
```

Check replication lag on replica:

```bash
# Check replication lag (should be <1 second)
docker exec uitgo-postgres-user-replica-1 psql -U postgres -d uitgo_user -c \
  "SELECT CASE WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() 
   THEN 0 ELSE EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()) END AS lag_seconds;"
```

**Expected Output:**
```
 lag_seconds 
-------------
        0.12
(1 row)
```

### Step 4: Create Performance Indexes

Run database migrations to create indexes for faster queries:

```bash
# Create indexes on trip database
docker exec uitgo-postgres-trip psql -U postgres -d uitgo_trip <<EOF
-- Index for trip history queries (userId filter)
CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id);

-- Index for time-range queries (recent trips)
CREATE INDEX IF NOT EXISTS idx_trips_created_at ON trips(created_at DESC);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_trips_user_created ON trips(user_id, created_at DESC);

-- Show created indexes
\di
EOF
```

**Expected Output:**
```
                      List of relations
 Schema |           Name            | Type  |  Owner   | Table 
--------+---------------------------+-------+----------+-------
 public | idx_trips_created_at      | index | postgres | trips
 public | idx_trips_user_created    | index | postgres | trips
 public | idx_trips_user_id         | index | postgres | trips
```

### Step 5: Test Read/Write Splitting Manually

**Write Test (goes to primary):**
```bash
# Insert a test trip
docker exec uitgo-postgres-trip psql -U postgres -d uitgo_trip -c \
  "INSERT INTO trips (\"userId\", \"pickupLocation\", \"dropoffLocation\", status, \"fareAmount\", \"createdAt\", \"updatedAt\") 
   VALUES ('test-user-1', 'POINT(10.8231 106.6297)', 'POINT(10.7769 106.7009)', 'REQUESTED', 50000, NOW(), NOW()) 
   RETURNING id;"
```

**Read Test (goes to replica):**
```bash
# Query from replica (should see the inserted trip after <1s replication lag)
sleep 2
docker exec uitgo-postgres-trip-replica-1 psql -U postgres -d uitgo_trip -c \
  "SELECT id, \"userId\", status, \"fareAmount\" FROM trips WHERE \"userId\" = 'test-user-1' ORDER BY \"createdAt\" DESC LIMIT 5;"
```

---

## 📊 Validation & Testing

### Performance Benchmark

Create a simple k6 test to measure read performance improvement:

```javascript
// tests/load/story-2.2-read-scaling-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp to 50 VUs
    { duration: '2m', target: 100 },  // Peak load: 100 VUs
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% requests under 200ms
    http_req_failed: ['rate<0.01'],    // <1% errors
  },
};

export default function () {
  // Test trip history query (read-heavy)
  const userId = `loadtest${(__VU % 30) + 1}@test.com`;
  
  const res = http.get(`http://localhost:3002/trips?userId=${userId}`, {
    headers: { Authorization: `Bearer ${__ENV.AUTH_TOKEN}` },
  });

  check(res, {
    'trip history fetched': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 200,
  });

  sleep(1);
}
```

**Run test:**
```bash
# Get auth token first
AUTH_TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"loadtest1@test.com","password":"password123"}' \
  | jq -r '.access_token')

# Run k6 test
/c/Users/ASUS/Desktop/k6.exe run tests/load/story-2.2-read-scaling-test.js \
  -e AUTH_TOKEN="$AUTH_TOKEN"
```

### Monitoring Replication Health

```bash
# Monitor replication lag in real-time
watch -n 2 'docker exec uitgo-postgres-user-replica-1 psql -U postgres -d uitgo_user -c \
  "SELECT pg_last_wal_receive_lsn() - pg_last_wal_replay_lsn() AS lag_bytes, 
   EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()) AS lag_seconds;"'
```

**Healthy replication:**
- `lag_bytes`: <1000 (under 1KB)
- `lag_seconds`: <1 second

---

## 🔧 Troubleshooting

### Issue 1: Replica not receiving data

**Symptoms:**
```
ERROR: requested WAL segment has already been removed
```

**Solution:**
```bash
# Re-initialize replica from primary
docker-compose -f docker-compose.replicas.yml down
docker volume rm uitgo_postgres-user-replica-1-data
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml -f docker-compose.replicas.yml up -d postgres-user-replica-1
```

### Issue 2: High replication lag (>10 seconds)

**Possible causes:**
- Primary under heavy write load
- Network latency between containers
- Replica running on slow disk

**Solution:**
```bash
# Check primary WAL sender status
docker exec uitgo-postgres-user psql -U postgres -d uitgo_user -c \
  "SELECT pid, state, sent_lsn, write_lsn, flush_lsn, replay_lsn, sync_state FROM pg_stat_replication;"

# If lag persists, consider:
# 1. Increase wal_keep_size
# 2. Add more CPU/memory to Docker
# 3. Use synchronous replication (trades latency for consistency)
```

### Issue 3: Read queries hitting primary instead of replicas

**Symptoms:**
High connection count on primary even though replicas exist.

**Solution:**
```bash
# Verify services are using read replica connection strings
docker exec uitgo-trip-service env | grep DATABASE
# Should show both PRIMARY and REPLICA URLs
```

---

## 📈 Expected Performance Improvements

| Metric | Before (Single DB) | After (Primary + 2 Replicas) | Improvement |
|--------|-------------------|------------------------------|-------------|
| **Read TPS** | 4,000 | 40,000 | **10x** |
| **Read p95 latency** | 800ms | 100ms | **8x faster** |
| **Write latency** | 200ms | 200ms | Same (writes still on primary) |
| **Replication lag** | N/A | <1s | Acceptable for history queries |
| **Max connections** | 100 | 300 (100 primary + 200 replicas) | **3x** |

**Note on Testing:** The 100 VU test in this story validates that replication infrastructure is working correctly. Full verification of the 10x read capacity improvement (4,000 → 40,000 TPS) will be conducted in **Epic 3** using 500-1000 VUs, which represents 10,000-20,000 concurrent users (each VU ≈ 20 real users due to think time between requests).

---

## 🎯 Success Criteria Validation

After setup, verify these criteria are met:

- ✅ **2 read replicas running per database** (6 containers total: 2 primaries + 4 replicas)
- ✅ **Streaming replication working** (`pg_stat_replication` shows 2 connections)
- ✅ **Replication lag <1s** (checked via `pg_last_xact_replay_timestamp()`)
- ✅ **Indexes created** (trip history, user_id, created_at)
- ✅ **Read queries 8x faster** (100ms p95 vs 800ms baseline)
- ✅ **Write queries unchanged** (still ~200ms, no degradation)

---

## 📚 References

- **ADR-002:** Database Read Scaling (`docs/adrs/ADR-002-database-read-scaling-rds-replicas.md`)
- **Postgres Replication Docs:** https://www.postgresql.org/docs/15/warm-standby.html
- **Story 2.2 Epic:** `docs/epics.md` (lines 475-530)

---

**Last Updated:** November 24, 2025  
**Story Status:** In Progress  
**Next:** Configure TypeORM read/write routing in NestJS services
