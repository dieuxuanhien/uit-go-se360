#!/usr/bin/env python3
"""
Auto-Scaler for Docker Compose Services
Story 2.6: Simulates ECS Fargate auto-scaling locally

Infrastructure Context:
- SNS/SQS: 1 SNS topic (trip-events) + 2 SQS queues (driver-match-queue, trip-update-queue) + 2 DLQs
- Read Replicas: 2 replicas per database (user-service, trip-service)
- Redis Cache: 6 nodes (3 primary + 3 replica) for user-service caching

Multi-Signal Scaling Strategy:
- CPU utilization (target: 50-55%)
- Memory utilization (target: 60-70%)
- RPS per replica (target: 100-150 RPS)
- Response latency P95 (target: < 500ms)
- SQS queue depth (for async services)

Scales services between min/max replicas with cooldown periods.
"""

import subprocess
import json
import time
import sys
import os
import re
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Configuration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Project directory (where docker-compose.yml lives)
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Docker Compose files to use
COMPOSE_FILES = [
    "docker-compose.yml",
    "docker-compose.localstack.yml",
    "docker-compose.replicas.yml",  # Read replicas enabled
    "docker-compose.redis-cluster.yml",  # Uncomment to use Redis Cluster (6 nodes)
]

# Container name prefix (used by docker-compose)
CONTAINER_PREFIX = "uitgo"

# Polling interval in seconds (3s = faster reaction, 5s = balanced)
POLL_INTERVAL = 3  # Reduced from 5s for even faster scaling response

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Multi-Signal Scaling Weights
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCALING_WEIGHTS = {
    "cpu": 0.30,       # 30% weight - lagging indicator
    "memory": 0.15,    # 15% weight - lagging indicator
    "rps": 0.30,       # 30% weight - leading indicator (IMPORTANT)
    "latency": 0.25,   # 25% weight - leading indicator (IMPORTANT)
}

# RPS/Latency thresholds (per service)
RPS_LATENCY_CONFIG = {
    "user-service": {
        "target_rps_per_replica": 100,     # Scale out if > 100 RPS per replica
        "max_rps_per_replica": 150,        # Critical threshold
        "target_latency_p95_ms": 200,      # Target P95 latency (lowered from 300)
        "max_latency_p95_ms": 400,         # Scale out if P95 > 400ms (lowered from 500)
    },
    "trip-service": {
        "target_rps_per_replica": 60,      # Lower threshold (was 80) - complex operations
        "max_rps_per_replica": 100,        # (was 120)
        "target_latency_p95_ms": 300,      # Target latency (lowered from 400)
        "max_latency_p95_ms": 500,         # Scale out earlier (lowered from 800)
    },
    "driver-service": {
        "target_rps_per_replica": 100,     # (was 120) - be more conservative
        "max_rps_per_replica": 150,        # (was 200)
        "target_latency_p95_ms": 150,      # Should be fast (Redis) - lowered from 200
        "max_latency_p95_ms": 300,         # Scale out earlier (lowered from 400)
    },
}

# SQS Queue monitoring (for trip-service)
SQS_CONFIG = {
    "enabled": True,
    "queues": [
        "driver-match-queue",
        "trip-update-queue",
    ],
    "scale_out_threshold": 50,    # Scale out if queue depth > 50 messages (lowered from 100)
    "scale_in_threshold": 10,     # Scale in if queue depth < 10 messages
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Burst Scaling Configuration (for high-stress scenarios)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BURST_SCALING = {
    "enabled": True,
    "score_thresholds": {
        1.0: 2,   # Score > 1.0: scale by +2 replicas (lowered from 1.5)
        1.5: 3,   # Score > 1.5: scale by +3 replicas (lowered from 2.0)
        2.0: 4,   # Score > 2.0: scale by +4 replicas (lowered from 3.0)
        3.0: 5,   # Score > 3.0: scale by +5 replicas (NEW - critical)
    },
    "latency_burst_ms": 500,       # If latency > 500ms, force burst scale (lowered from 1000)
    "queue_burst_threshold": 100,  # If queue > 100, force burst scale (lowered from 200)
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Service Scaling Profiles
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 
# Infrastructure:
# - user-service: 1 primary + 2 read replicas (handles auth, profile reads)
# - trip-service: 1 primary + 2 read replicas + SNS/SQS heavy (trip creation, matching)
# - driver-service: Redis 6-node cluster (location updates, geo-search - stateless)
#
# Scaling Strategy:
# - trip-service: Most critical, handles trip creation + SQS consumers → scale first
# - driver-service: Redis-backed, stateless → can scale aggressively
# - user-service: Auth-heavy but DB read replicas help → moderate scaling

CONFIG = {
    "user-service": {
        "min_replicas": 2,  # FIXED: Keep at least 2 replicas (was 1, caused timeouts)
        "max_replicas": 10,
        "target_cpu": 55.0,  # Lowered from 70% for faster scaling response
        "target_memory": 65.0,
        "scale_out_cooldown": 10,  # Even faster scale-out (was 20s)
        "scale_in_cooldown": 60,
        "priority": 2,  # Medium priority (DB has read replicas)
        "description": "Auth + Profile (2 read replicas)",
    },
    "trip-service": {
        "min_replicas": 4,  # PRE-SCALE: Start with 4 replicas for 500 VU load
        "max_replicas": 15,  # Highest max - handles trip creation + SQS
        "target_cpu": 45.0,  # Lower threshold - scale earlier
        "target_memory": 60.0,
        "scale_out_cooldown": 6,   # Faster cooldown for critical service
        "scale_in_cooldown": 90,
        "priority": 1,  # Highest priority - critical for trip flow
        "description": "Trip creation + SQS consumers (2 read replicas)",
    },
    "driver-service": {
        "min_replicas": 3,  # PRE-SCALE: Start with 3 replicas (location updates critical)
        "max_replicas": 15,  # Increased max for 500 VU load
        "target_cpu": 35.0,  # Lower threshold - I/O bound scales early
        "target_memory": 70.0,
        "scale_out_cooldown": 6,   # Faster cooldown for critical service
        "scale_in_cooldown": 60,
        "priority": 1,  # ELEVATED: Critical bottleneck in 500 VU test
        "description": "Location + Search (6-node Redis cluster) - I/O BOUND",
    },
}

# Startup time - no scale-in allowed during this period
START_TIME = None  # Set when main() starts
STARTUP_GRACE_PERIOD = 60  # 1 minute - reduced from 180s for faster test response

# Track last scaling action timestamp
last_scale_time = {service: 0 for service in CONFIG.keys()}

# Track consecutive low-usage iterations (for scale-in stability)
# Require 3 consecutive low readings before scale-in
low_usage_count = {service: 0 for service in CONFIG.keys()}
SCALE_IN_STABILITY_COUNT = 3  # Require 3 consecutive low readings

# Scaling event log
scaling_events = []

# Previous request counts for RPS calculation
previous_request_counts = {}
previous_timestamp = None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Docker Stats Collection
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_container_stats() -> Dict[str, Dict[str, float]]:
    """
    Get CPU and memory stats for all running containers.
    
    Returns:
        Dict mapping service name to {'cpu': float, 'memory': float, 'count': int}
    """
    try:
        # docker stats --no-stream --format json
        result = subprocess.run(
            ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
            capture_output=True,
            text=True,
            timeout=15,  # Reduced for faster response
        )
        
        if result.returncode != 0:
            print(f"[ERROR] Failed to get Docker stats: {result.stderr}")
            return {}
        
        stats = {}
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
                
            container_name = data.get("Name", "")
            
            # Only process containers with our prefix
            if not container_name.startswith(CONTAINER_PREFIX):
                continue
            
            # Extract service name (e.g., "uitgo-user-service" or "uitgo-user-service-1" -> "user-service")
            service_name = None
            for service in CONFIG.keys():
                if service in container_name:
                    service_name = service
                    break
            
            if not service_name:
                continue
            
            # Parse CPU percentage (e.g., "12.34%" -> 12.34)
            cpu_str = data.get("CPUPerc", "0%").rstrip("%")
            try:
                cpu = float(cpu_str) if cpu_str else 0.0
            except ValueError:
                cpu = 0.0
            
            # Parse memory percentage (e.g., "45.67%" -> 45.67)
            mem_str = data.get("MemPerc", "0%").rstrip("%")
            try:
                memory = float(mem_str) if mem_str else 0.0
            except ValueError:
                memory = 0.0
            
            # Aggregate stats per service
            if service_name not in stats:
                stats[service_name] = {"cpu": 0.0, "memory": 0.0, "count": 0, "containers": []}
            
            stats[service_name]["cpu"] += cpu
            stats[service_name]["memory"] += memory
            stats[service_name]["count"] += 1
            stats[service_name]["containers"].append(container_name)
        
        # Calculate averages
        for service in stats:
            if stats[service]["count"] > 0:
                stats[service]["avg_cpu"] = stats[service]["cpu"] / stats[service]["count"]
                stats[service]["avg_memory"] = stats[service]["memory"] / stats[service]["count"]
            else:
                stats[service]["avg_cpu"] = 0.0
                stats[service]["avg_memory"] = 0.0
        
        return stats
    
    except subprocess.TimeoutExpired:
        print(f"[ERROR] Docker stats timed out")
        return {}
    except Exception as e:
        print(f"[ERROR] Exception getting Docker stats: {e}")
        return {}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RPS/Latency Metrics Collection
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Nginx container name (may vary by setup)
NGINX_CONTAINER = "uitgo-nginx-lb"


def get_nginx_status() -> Optional[Dict[str, int]]:
    """
    Get nginx stub_status metrics for RPS calculation.
    
    Returns:
        Dict with 'active_connections', 'accepts', 'handled', 'requests'
        or None if unavailable
    """
    try:
        # Try to get nginx status from the nginx container
        result = subprocess.run(
            ["docker", "exec", NGINX_CONTAINER, "curl", "-s", "http://127.0.0.1:80/nginx_status"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        
        if result.returncode != 0:
            return None
        
        output = result.stdout
        
        # Parse nginx stub_status format:
        # Active connections: 291
        # server accepts handled requests
        #  16630948 16630948 31070465
        # Reading: 6 Writing: 179 Waiting: 106
        
        metrics = {}
        
        # Parse active connections
        match = re.search(r'Active connections:\s*(\d+)', output)
        if match:
            metrics['active_connections'] = int(match.group(1))
        
        # Parse accepts, handled, requests (second data line)
        lines = output.strip().split('\n')
        for line in lines:
            parts = line.strip().split()
            if len(parts) == 3 and parts[0].isdigit():
                metrics['accepts'] = int(parts[0])
                metrics['handled'] = int(parts[1])
                metrics['requests'] = int(parts[2])
                break
        
        # Parse reading, writing, waiting
        match = re.search(r'Reading:\s*(\d+)\s*Writing:\s*(\d+)\s*Waiting:\s*(\d+)', output)
        if match:
            metrics['reading'] = int(match.group(1))
            metrics['writing'] = int(match.group(2))
            metrics['waiting'] = int(match.group(3))
        
        return metrics if 'requests' in metrics else None
        
    except Exception as e:
        return None


def get_service_request_counts() -> Dict[str, int]:
    """
    Get request counts per service by parsing nginx access logs (from docker logs).
    Groups requests by service based on URL path.
    
    Returns:
        Dict mapping service name to request count
    """
    try:
        # Get recent nginx logs (logs go to stdout, not file)
        result = subprocess.run(
            ["docker", "logs", "--tail", "500", "--since", "10s", NGINX_CONTAINER],
            capture_output=True,
            text=True,
            timeout=5,
        )
        
        if result.returncode != 0:
            return {}
        
        counts = {service: 0 for service in CONFIG.keys()}
        
        # Parse both stdout and stderr (nginx may log to either)
        log_lines = result.stdout.split('\n') + result.stderr.split('\n')
        
        for line in log_lines:
            # Match patterns like: GET /users/, POST /trips, etc.
            if '/users' in line and ('GET' in line or 'POST' in line or 'PUT' in line):
                counts['user-service'] += 1
            elif ('/trips' in line or '/notifications' in line) and ('GET' in line or 'POST' in line or 'PUT' in line):
                counts['trip-service'] += 1
            elif '/drivers' in line and ('GET' in line or 'POST' in line or 'PUT' in line):
                counts['driver-service'] += 1
        
        return counts
        
    except Exception:
        return {}


def get_service_latencies() -> Dict[str, Dict[str, float]]:
    """
    Get response latency metrics per service from nginx logs.
    Parses rt: (response time) field from nginx log format.
    
    Log format example:
    172.19.0.1 - [11/Dec/2025:17:25:52 +0000] "GET /trips/xxx HTTP/1.1" 200 0 upstream: 172.19.0.21:3002 rt: 0.918
    
    Returns:
        Dict mapping service name to {'avg': float, 'p95': float, 'max': float}
    """
    try:
        # Get recent nginx logs
        result = subprocess.run(
            ["docker", "logs", "--tail", "200", "--since", "15s", NGINX_CONTAINER],
            capture_output=True,
            text=True,
            timeout=5,
        )
        
        latencies = {service: [] for service in CONFIG.keys()}
        
        # Parse nginx logs for response time (rt: field in seconds)
        # Format: ... rt: 0.918
        for line in result.stdout.split('\n') + result.stderr.split('\n'):
            # Look for rt: field (response time in seconds)
            rt_match = re.search(r'rt:\s*(\d+\.\d+)', line)
            if rt_match:
                response_time_sec = float(rt_match.group(1))
                response_time_ms = response_time_sec * 1000  # Convert to milliseconds
                
                # Determine service from URL in log
                if '/users' in line:
                    latencies['user-service'].append(response_time_ms)
                elif '/trips' in line or '/notifications' in line:
                    latencies['trip-service'].append(response_time_ms)
                elif '/drivers' in line:
                    latencies['driver-service'].append(response_time_ms)
        
        # Calculate statistics
        result_stats = {}
        for service, times in latencies.items():
            if times:
                times_sorted = sorted(times)
                p95_index = min(int(len(times) * 0.95), len(times) - 1)
                result_stats[service] = {
                    'avg': sum(times) / len(times),
                    'p95': times_sorted[p95_index],
                    'max': max(times),
                    'count': len(times),
                }
            else:
                result_stats[service] = {'avg': 0, 'p95': 0, 'max': 0, 'count': 0}
        
        return result_stats
        
    except Exception:
        return {service: {'avg': 0, 'p95': 0, 'max': 0, 'count': 0} for service in CONFIG.keys()}


def get_service_health_latencies() -> Dict[str, float]:
    """
    Get latency from parsed nginx logs (P95 latency).
    Falls back to 0 if no recent requests.
    
    Returns:
        Dict mapping service name to P95 latency in ms
    """
    # Use parsed nginx logs for latency (more accurate than health checks)
    latency_stats = get_service_latencies()
    
    latencies = {}
    for service in CONFIG.keys():
        stats = latency_stats.get(service, {})
        # Use P95 latency from nginx logs
        latencies[service] = stats.get('p95', 0)
    
    return latencies


def calculate_rps(current_counts: Dict[str, int], elapsed_seconds: float) -> Dict[str, float]:
    """
    Calculate RPS per service based on request count delta.
    
    Args:
        current_counts: Current request counts per service
        elapsed_seconds: Time since last measurement
    
    Returns:
        Dict mapping service name to RPS
    """
    global previous_request_counts
    
    rps = {}
    for service in CONFIG.keys():
        current = current_counts.get(service, 0)
        previous = previous_request_counts.get(service, 0)
        
        if elapsed_seconds > 0 and current >= previous:
            rps[service] = (current - previous) / elapsed_seconds
        else:
            rps[service] = 0.0
    
    previous_request_counts = current_counts.copy()
    return rps


def get_sqs_queue_depths() -> Dict[str, int]:
    """
    Get SQS queue depths from LocalStack for queue-based scaling.
    
    Returns:
        Dict mapping queue name to approximate message count
    """
    if not SQS_CONFIG.get("enabled"):
        return {}
    
    depths = {}
    
    try:
        for queue_name in SQS_CONFIG.get("queues", []):
            result = subprocess.run(
                [
                    "docker", "exec", "uitgo-localstack",
                    "awslocal", "sqs", "get-queue-attributes",
                    "--queue-url", f"http://localhost:4566/000000000000/{queue_name}",
                    "--attribute-names", "ApproximateNumberOfMessages",
                    "--output", "json"
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                count = int(data.get("Attributes", {}).get("ApproximateNumberOfMessages", 0))
                depths[queue_name] = count
    except Exception:
        pass
    
    return depths


def collect_all_metrics() -> Dict[str, Dict]:
    """
    Collect all metrics (CPU, memory, RPS, latency, queue depth) for scaling decisions.
    Uses parallel execution to minimize collection time.
    
    Returns:
        Dict with comprehensive metrics per service
    """
    global previous_timestamp
    
    current_time = time.time()
    elapsed = current_time - previous_timestamp if previous_timestamp else POLL_INTERVAL
    previous_timestamp = current_time
    
    # Collect metrics in PARALLEL using ThreadPoolExecutor
    # This reduces collection time from ~15s to ~3-4s
    container_stats = {}
    nginx_status = None
    request_counts = {}
    latency_stats = {}
    queue_depths = {}
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        # Submit all collection tasks in parallel
        future_container = executor.submit(get_container_stats)
        future_nginx = executor.submit(get_nginx_status)
        future_requests = executor.submit(get_service_request_counts)
        future_latency = executor.submit(get_service_latencies)
        future_queues = executor.submit(get_sqs_queue_depths)
        
        # Collect results (with short timeouts to avoid blocking)
        try:
            container_stats = future_container.result(timeout=10)
        except Exception:
            container_stats = {}
        
        try:
            nginx_status = future_nginx.result(timeout=5)
        except Exception:
            nginx_status = None
        
        try:
            request_counts = future_requests.result(timeout=5)
        except Exception:
            request_counts = {}
        
        try:
            latency_stats = future_latency.result(timeout=5)
        except Exception:
            latency_stats = {}
        
        try:
            queue_depths = future_queues.result(timeout=5)
        except Exception:
            queue_depths = {}
    
    # Calculate RPS per service
    rps_metrics = calculate_rps(request_counts, elapsed)
    
    # Extract P95 latency from latency stats
    latency_metrics = {}
    for service in CONFIG.keys():
        stats = latency_stats.get(service, {})
        latency_metrics[service] = stats.get('p95', 0)
    
    # Combine all metrics
    combined = {}
    for service in CONFIG.keys():
        stats = container_stats.get(service, {})
        replica_count = stats.get("count", 1) or 1  # Avoid division by zero
        
        combined[service] = {
            # Container metrics
            "avg_cpu": stats.get("avg_cpu", 0),
            "avg_memory": stats.get("avg_memory", 0),
            "count": stats.get("count", 0),
            "containers": stats.get("containers", []),
            
            # RPS metrics
            "total_rps": rps_metrics.get(service, 0),
            "rps_per_replica": rps_metrics.get(service, 0) / replica_count,
            
            # Latency metrics
            "latency_ms": latency_metrics.get(service, 0),
            
            # Queue metrics (for trip-service)
            "queue_depth": sum(queue_depths.values()) if service == "trip-service" else 0,
        }
    
    # Add global nginx metrics
    combined["_nginx"] = nginx_status or {}
    combined["_queues"] = queue_depths
    
    return combined


def calculate_scaling_score(service: str, metrics: Dict) -> Tuple[float, Dict[str, float]]:
    """
    Calculate a weighted scaling score using multiple signals.
    Score > 1.0 means scale out needed, Score < 0.5 means scale in possible.
    
    Args:
        service: Service name
        metrics: Metrics dict for the service
    
    Returns:
        Tuple of (weighted_score, individual_scores_dict)
    """
    config = CONFIG[service]
    rps_config = RPS_LATENCY_CONFIG.get(service, {})
    
    scores = {}
    
    # CPU Score (0.0 - 2.0 range, 1.0 = at target)
    target_cpu = config["target_cpu"]
    if target_cpu > 0:
        scores["cpu"] = metrics.get("avg_cpu", 0) / target_cpu
    else:
        scores["cpu"] = 0
    
    # Memory Score (0.0 - 2.0 range, 1.0 = at target)
    target_memory = config["target_memory"]
    if target_memory > 0:
        scores["memory"] = metrics.get("avg_memory", 0) / target_memory
    else:
        scores["memory"] = 0
    
    # RPS Score (0.0 - 2.0 range, 1.0 = at target)
    target_rps = rps_config.get("target_rps_per_replica", 100)
    if target_rps > 0:
        scores["rps"] = metrics.get("rps_per_replica", 0) / target_rps
    else:
        scores["rps"] = 0
    
    # Latency Score (0.0 - 2.0 range, 1.0 = at target)
    # Note: Higher latency = higher score (need more capacity)
    target_latency = rps_config.get("target_latency_p95_ms", 300)
    if target_latency > 0:
        scores["latency"] = metrics.get("latency_ms", 0) / target_latency
    else:
        scores["latency"] = 0
    
    # Calculate weighted score
    weighted_score = (
        scores["cpu"] * SCALING_WEIGHTS["cpu"] +
        scores["memory"] * SCALING_WEIGHTS["memory"] +
        scores["rps"] * SCALING_WEIGHTS["rps"] +
        scores["latency"] * SCALING_WEIGHTS["latency"]
    )
    
    return weighted_score, scores


def calculate_burst_replicas(service: str, metrics: Dict, weighted_score: float, current_replicas: int) -> int:
    """
    Calculate how many replicas to add during burst scaling.
    
    Burst scaling kicks in when:
    1. Weighted score exceeds burst thresholds
    2. Latency exceeds critical threshold
    3. Queue depth exceeds burst threshold
    
    Returns:
        Number of replicas to add (minimum 1 if scaling out)
    """
    if not BURST_SCALING.get("enabled", False):
        return 1  # Default: add 1 replica
    
    config = CONFIG[service]
    max_replicas = config["max_replicas"]
    replicas_to_add = 1  # Minimum
    
    # Score-based burst scaling
    thresholds = BURST_SCALING.get("score_thresholds", {})
    for score_threshold, burst_count in sorted(thresholds.items(), reverse=True):
        if weighted_score > score_threshold:
            replicas_to_add = max(replicas_to_add, burst_count)
            break
    
    # Latency-triggered burst scaling
    latency_ms = metrics.get("latency_ms", 0)
    latency_burst_threshold = BURST_SCALING.get("latency_burst_ms", 1000)
    if latency_ms > latency_burst_threshold:
        # Critical latency - burst scale by latency ratio
        burst_by_latency = min(4, int(latency_ms / latency_burst_threshold) + 1)
        replicas_to_add = max(replicas_to_add, burst_by_latency)
    
    # Queue-triggered burst scaling (trip-service only)
    if service == "trip-service":
        queue_depth = metrics.get("queue_depth", 0)
        queue_burst_threshold = BURST_SCALING.get("queue_burst_threshold", 200)
        if queue_depth > queue_burst_threshold:
            # Scale by queue depth ratio
            burst_by_queue = min(4, int(queue_depth / queue_burst_threshold) + 1)
            replicas_to_add = max(replicas_to_add, burst_by_queue)
    
    # Cap at available capacity
    available = max_replicas - current_replicas
    return min(replicas_to_add, available, 5)  # Max 5 at once to avoid resource exhaustion


def should_scale_out_multi_signal(service: str, metrics: Dict, current_replicas: int) -> Tuple[bool, str]:
    """
    Determine if service should scale out using multi-signal approach.
    
    Returns:
        Tuple of (should_scale, reason_string)
    """
    global low_usage_count
    config = CONFIG[service]
    rps_config = RPS_LATENCY_CONFIG.get(service, {})
    
    # Already at max capacity
    if current_replicas >= config["max_replicas"]:
        return False, "at_max"
    
    # Check cooldown period
    time_since_last_scale = time.time() - last_scale_time[service]
    if time_since_last_scale < config["scale_out_cooldown"]:
        return False, f"cooldown_{int(config['scale_out_cooldown'] - time_since_last_scale)}s"
    
    reasons = []
    
    # Check CPU threshold
    if metrics.get("avg_cpu", 0) > config["target_cpu"]:
        reasons.append(f"CPU:{metrics['avg_cpu']:.1f}%>{config['target_cpu']}%")
    
    # Check Memory threshold
    if metrics.get("avg_memory", 0) > config["target_memory"]:
        reasons.append(f"Mem:{metrics['avg_memory']:.1f}%>{config['target_memory']}%")
    
    # Check RPS per replica threshold
    max_rps = rps_config.get("max_rps_per_replica", 150)
    if metrics.get("rps_per_replica", 0) > max_rps:
        reasons.append(f"RPS:{metrics['rps_per_replica']:.1f}>{max_rps}")
    
    # Check Latency threshold
    max_latency = rps_config.get("max_latency_p95_ms", 500)
    if metrics.get("latency_ms", 0) > max_latency:
        reasons.append(f"Lat:{metrics['latency_ms']:.0f}ms>{max_latency}ms")
    
    # Check SQS queue depth (for trip-service)
    if service == "trip-service" and SQS_CONFIG.get("enabled"):
        queue_depth = metrics.get("queue_depth", 0)
        if queue_depth > SQS_CONFIG.get("scale_out_threshold", 100):
            reasons.append(f"Queue:{queue_depth}>{SQS_CONFIG['scale_out_threshold']}")
    
    # Also check weighted score for proactive scaling
    weighted_score, _ = calculate_scaling_score(service, metrics)
    if weighted_score > 1.2:  # 20% above target on weighted basis
        reasons.append(f"Score:{weighted_score:.2f}>1.2")
    
    if reasons:
        low_usage_count[service] = 0
        return True, ", ".join(reasons)
    
    return False, "ok"


def should_scale_in_multi_signal(service: str, metrics: Dict, current_replicas: int) -> Tuple[bool, str]:
    """
    Determine if service should scale in using multi-signal approach.
    Requires multiple consecutive low-usage readings for stability.
    
    Returns:
        Tuple of (should_scale, reason_string)
    """
    global low_usage_count, START_TIME
    config = CONFIG[service]
    rps_config = RPS_LATENCY_CONFIG.get(service, {})
    
    # Startup grace period - no scale-in during warm-up
    if START_TIME and (time.time() - START_TIME) < STARTUP_GRACE_PERIOD:
        low_usage_count[service] = 0
        return False, "grace_period"
    
    # Already at minimum capacity
    if current_replicas <= config["min_replicas"]:
        low_usage_count[service] = 0
        return False, "at_min"
    
    # Check cooldown period
    time_since_last_scale = time.time() - last_scale_time[service]
    if time_since_last_scale < config["scale_in_cooldown"]:
        low_usage_count[service] = 0
        return False, f"cooldown_{int(config['scale_in_cooldown'] - time_since_last_scale)}s"
    
    # Calculate weighted score
    weighted_score, scores = calculate_scaling_score(service, metrics)
    
    # Scale in only if ALL signals indicate low usage (weighted score < 0.4)
    is_low_usage = weighted_score < 0.4
    
    # Additional safety: Don't scale in if any critical metric is elevated
    cpu_low = metrics.get("avg_cpu", 0) < config["target_cpu"] * 0.4
    memory_low = metrics.get("avg_memory", 0) < config["target_memory"] * 0.4
    rps_low = metrics.get("rps_per_replica", 0) < rps_config.get("target_rps_per_replica", 100) * 0.3
    latency_ok = metrics.get("latency_ms", 0) < rps_config.get("target_latency_p95_ms", 300)
    
    is_safe_to_scale_in = cpu_low and memory_low and rps_low and latency_ok
    
    if is_low_usage and is_safe_to_scale_in:
        low_usage_count[service] += 1
        if low_usage_count[service] >= SCALE_IN_STABILITY_COUNT:
            low_usage_count[service] = 0
            return True, f"low_usage(score:{weighted_score:.2f})"
        return False, f"stability_{low_usage_count[service]}/{SCALE_IN_STABILITY_COUNT}"
    else:
        low_usage_count[service] = 0
        return False, "ok"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Legacy Scaling Logic (kept for compatibility)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def should_scale_out(service: str, cpu: float, memory: float, current_replicas: int) -> bool:
    """Determine if service should scale out (add replicas)."""
    global low_usage_count
    config = CONFIG[service]
    
    # Already at max capacity
    if current_replicas >= config["max_replicas"]:
        return False
    
    # Check cooldown period
    time_since_last_scale = time.time() - last_scale_time[service]
    if time_since_last_scale < config["scale_out_cooldown"]:
        return False
    
    # Scale out if CPU or memory exceeds target
    if cpu > config["target_cpu"] or memory > config["target_memory"]:
        # Reset low_usage_count when scaling out (high usage detected)
        low_usage_count[service] = 0
        return True
    return False


def should_scale_in(service: str, cpu: float, memory: float, current_replicas: int) -> bool:
    """
    Determine if service should scale in (remove replicas).
    Requires multiple consecutive low-usage readings for stability.
    """
    global low_usage_count, START_TIME
    config = CONFIG[service]
    
    # Startup grace period - no scale-in during warm-up
    if START_TIME and (time.time() - START_TIME) < STARTUP_GRACE_PERIOD:
        low_usage_count[service] = 0
        return False
    
    # Already at minimum capacity
    if current_replicas <= config["min_replicas"]:
        low_usage_count[service] = 0
        return False
    
    # Check cooldown period (longer for scale-in to avoid thrashing)
    time_since_last_scale = time.time() - last_scale_time[service]
    if time_since_last_scale < config["scale_in_cooldown"]:
        low_usage_count[service] = 0
        return False
    
    # Scale in only if both CPU and memory are well below target (40% of target)
    scale_in_cpu_threshold = config["target_cpu"] * 0.4  # ~22% CPU for 55% target
    scale_in_memory_threshold = config["target_memory"] * 0.4  # ~26% memory for 65% target
    
    is_low_usage = cpu < scale_in_cpu_threshold and memory < scale_in_memory_threshold
    
    if is_low_usage:
        low_usage_count[service] += 1
        # Only scale in after consecutive low readings (stability check)
        if low_usage_count[service] >= SCALE_IN_STABILITY_COUNT:
            low_usage_count[service] = 0  # Reset counter after scale-in
            return True
        return False
    else:
        # Reset counter if usage is not low
        low_usage_count[service] = 0
        return False


def calculate_desired_replicas(service: str, cpu: float, memory: float, current_replicas: int) -> int:
    """
    Calculate optimal replica count based on metrics.
    Uses a proportional scaling algorithm similar to Kubernetes HPA.
    
    Formula: desiredReplicas = ceil(currentReplicas * (currentMetric / targetMetric))
    """
    config = CONFIG[service]
    
    # Calculate based on CPU
    if cpu > 0 and config["target_cpu"] > 0:
        cpu_ratio = cpu / config["target_cpu"]
        cpu_desired = int(current_replicas * cpu_ratio + 0.5)  # Round
    else:
        cpu_desired = current_replicas
    
    # Calculate based on memory
    if memory > 0 and config["target_memory"] > 0:
        mem_ratio = memory / config["target_memory"]
        mem_desired = int(current_replicas * mem_ratio + 0.5)  # Round
    else:
        mem_desired = current_replicas
    
    # Take the higher of CPU/memory needs
    desired = max(cpu_desired, mem_desired)
    
    # Clamp to min/max
    desired = max(config["min_replicas"], min(config["max_replicas"], desired))
    
    return desired


def get_compose_command() -> List[str]:
    """Build docker-compose command with all compose files."""
    cmd = ["docker-compose"]
    for f in COMPOSE_FILES:
        cmd.extend(["-f", f])
    return cmd


def scale_service(service: str, current_replicas: int, target_replicas: int, reason: str = "") -> bool:
    """
    Scale a Docker Compose service to target replica count.
    Uses direct docker commands to avoid docker-compose network label issues.
    
    Args:
        service: Service name (e.g., "user-service")
        current_replicas: Current number of replicas
        target_replicas: Desired number of replicas
        reason: Reason for scaling (for logging)
    
    Returns:
        True if scaling succeeded, False otherwise
    """
    try:
        action = "SCALE OUT" if target_replicas > current_replicas else "SCALE IN"
        print(f"[{action}] {service}: {current_replicas} → {target_replicas} replicas...")
        
        base_container = f"uitgo-{service}"
        
        # For scale out: start additional containers
        if target_replicas > current_replicas:
            containers_to_add = target_replicas - current_replicas
            
            # Get the image name from existing container
            inspect_cmd = ["docker", "inspect", "--format", "{{.Config.Image}}", base_container]
            inspect_result = subprocess.run(inspect_cmd, capture_output=True, text=True, timeout=10)
            
            if inspect_result.returncode != 0:
                print(f"[ERROR] Cannot find image for {service}: {inspect_result.stderr}")
                return False
            
            image_name = inspect_result.stdout.strip()
            
            # Get environment variables from existing container
            env_cmd = ["docker", "inspect", "--format", "{{range .Config.Env}}{{.}}\\n{{end}}", base_container]
            env_result = subprocess.run(env_cmd, capture_output=True, text=True, timeout=10)
            env_vars = [e for e in env_result.stdout.strip().split("\\n") if e and "=" in e]
            
            # Get the command/entrypoint from existing container
            cmd_inspect = ["docker", "inspect", "--format", "{{json .Config.Cmd}}", base_container]
            cmd_result = subprocess.run(cmd_inspect, capture_output=True, text=True, timeout=10)
            container_cmd = None
            if cmd_result.returncode == 0 and cmd_result.stdout.strip() != "null":
                try:
                    container_cmd = json.loads(cmd_result.stdout.strip())
                except json.JSONDecodeError:
                    pass
            
            for i in range(containers_to_add):
                replica_num = current_replicas + i + 1
                container_name = f"{base_container}-{replica_num}"
                
                # Check if container already exists
                check_cmd = ["docker", "ps", "-aq", "-f", f"name={container_name}"]
                check_result = subprocess.run(check_cmd, capture_output=True, text=True, timeout=10)
                if check_result.stdout.strip():
                    # Container exists, remove it first
                    subprocess.run(["docker", "rm", "-f", container_name], capture_output=True, timeout=10)
                
                # Build docker run command
                # Use --network-alias to enable DNS-based load balancing
                # All replicas share the same alias (e.g., "trip-service")
                # nginx resolves this to get ALL container IPs
                run_cmd = [
                    "docker", "run", "-d",
                    "--name", container_name,
                    "--network", "uitgo-network",
                    "--network-alias", service,  # CRITICAL: Same alias for DNS LB
                    "--restart", "unless-stopped",
                ]
                
                # Add environment variables
                for env in env_vars:
                    run_cmd.extend(["-e", env])
                
                # Add image
                run_cmd.append(image_name)
                
                # Add command if present
                if container_cmd:
                    run_cmd.extend(container_cmd)
                
                result = subprocess.run(run_cmd, capture_output=True, text=True, timeout=120, cwd=PROJECT_DIR)
                
                if result.returncode != 0:
                    print(f"[ERROR] Failed to start {container_name}: {result.stderr}")
                    return False
                
                print(f"   ✓ Started {container_name}")
        
        # For scale in: stop and remove containers
        else:
            containers_to_remove = current_replicas - target_replicas
            for i in range(containers_to_remove):
                replica_num = current_replicas - i
                container_name = f"{base_container}-{replica_num}"
                
                # Stop and remove container
                stop_cmd = ["docker", "rm", "-f", container_name]
                result = subprocess.run(stop_cmd, capture_output=True, text=True, timeout=30, cwd=PROJECT_DIR)
                
                if result.returncode != 0:
                    print(f"   ⚠ Could not remove {container_name}: {result.stderr.strip()}")
                else:
                    print(f"   ✓ Removed {container_name}")
        
        # Record scaling event
        event = {
            "timestamp": datetime.now().isoformat(),
            "service": service,
            "from_replicas": current_replicas,
            "to_replicas": target_replicas,
            "action": action,
            "reason": reason,
        }
        scaling_events.append(event)
        last_scale_time[service] = time.time()
        
        print(f"[SUCCESS] {service}: Scaled to {target_replicas} replicas ({reason})")
        
        # Brief wait for containers to start
        time.sleep(3)
        
        return True
    
    except subprocess.TimeoutExpired:
        print(f"[ERROR] Timeout scaling {service}")
        return False
    except Exception as e:
        print(f"[ERROR] Exception scaling {service}: {e}")
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main Loop
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def print_metrics_header():
    """Print column headers for metrics display."""
    print(f"{'Service':<16} {'Repl':>5} {'CPU':>8} {'Mem':>8} {'RPS':>8} {'Lat':>8} {'Score':>7} {'Status':<20}")
    print("-" * 90)


def main():
    """Main auto-scaler loop with multi-signal scaling."""
    global START_TIME, previous_timestamp
    START_TIME = time.time()
    previous_timestamp = time.time()
    
    print("=" * 90)
    print("🚀 Docker Compose Auto-Scaler for UIT-GO (Multi-Signal Edition)")
    print("=" * 90)
    print(f"Project directory: {PROJECT_DIR}")
    print(f"Compose files: {', '.join(COMPOSE_FILES)}")
    print(f"Poll interval: {POLL_INTERVAL}s")
    print(f"Startup grace period: {STARTUP_GRACE_PERIOD}s (no scale-in)")
    print("")
    print("📊 Multi-Signal Scaling Weights:")
    for signal, weight in SCALING_WEIGHTS.items():
        print(f"   • {signal.upper()}: {weight*100:.0f}%")
    print("")
    if BURST_SCALING.get("enabled"):
        print("🚀 Burst Scaling (for rapid load spikes):")
        for threshold, count in sorted(BURST_SCALING.get("score_thresholds", {}).items()):
            print(f"   • Score > {threshold}: +{count} replicas")
        print(f"   • Latency > {BURST_SCALING.get('latency_burst_ms', 1000)}ms: burst scale")
        print(f"   • Queue > {BURST_SCALING.get('queue_burst_threshold', 200)}: burst scale")
        print("")
    print("📦 Infrastructure:")
    print("   • SNS/SQS: 3 topics + 3 queues (TripRequested, DriverMatched, TripEvents)")
    print("   • Read Replicas: 2 per database (user-service, trip-service)")
    print("   • Redis Cluster: 6 nodes (3 primary + 3 replica) for driver-service")
    print("")
    print(f"🔧 Service Scaling Profiles ({len(CONFIG)} services):")
    for service in sorted(CONFIG.keys(), key=lambda s: CONFIG[s].get("priority", 99)):
        config = CONFIG[service]
        rps_config = RPS_LATENCY_CONFIG.get(service, {})
        priority_icon = "🔴" if config["priority"] == 1 else "🟡" if config["priority"] == 2 else "🟢"
        print(f"   {priority_icon} {service}:")
        print(f"      Replicas: {config['min_replicas']}-{config['max_replicas']} | "
              f"CPU: {config['target_cpu']}% | Mem: {config['target_memory']}%")
        print(f"      RPS/replica: {rps_config.get('target_rps_per_replica', 'N/A')} | "
              f"Latency P95: {rps_config.get('target_latency_p95_ms', 'N/A')}ms")
    print("=" * 90)
    print("Press Ctrl+C to stop\n")
    
    iteration = 0
    
    try:
        while True:
            iteration += 1
            timestamp = datetime.now().strftime("%H:%M:%S")
            
            # Show grace period status
            elapsed = time.time() - START_TIME
            grace_status = f" 🛡️ Grace: {int(STARTUP_GRACE_PERIOD - elapsed)}s" if elapsed < STARTUP_GRACE_PERIOD else ""
            print(f"\n[{timestamp}] ━━━ Iteration {iteration} ━━━{grace_status}")
            
            # Collect ALL metrics (CPU, memory, RPS, latency, queue depth)
            all_metrics = collect_all_metrics()
            
            if not all_metrics or all(service.startswith("_") for service in all_metrics.keys()):
                print("⚠️  No container stats available (services may be starting)")
                time.sleep(POLL_INTERVAL)
                continue
            
            # Print nginx global stats if available
            nginx_stats = all_metrics.get("_nginx", {})
            if nginx_stats:
                active = nginx_stats.get('active_connections', 0)
                requests = nginx_stats.get('requests', 0)
                print(f"📡 Nginx: {active} active connections | {requests} total requests")
            
            # Print SQS queue depths if available
            queue_stats = all_metrics.get("_queues", {})
            if queue_stats:
                queue_str = " | ".join([f"{q}: {d}" for q, d in queue_stats.items()])
                print(f"📬 SQS Queues: {queue_str}")
            
            print("")
            print_metrics_header()
            
            # Evaluate services in priority order
            services_by_priority = sorted(CONFIG.keys(), key=lambda s: CONFIG[s].get("priority", 99))
            
            for service in services_by_priority:
                if service not in all_metrics or service.startswith("_"):
                    continue
                
                metrics = all_metrics[service]
                current_replicas = metrics.get("count", 0)
                
                if current_replicas == 0:
                    print(f"{service:<16} {'N/A':>5} {'--':>8} {'--':>8} {'--':>8} {'--':>8} {'--':>7} ⚠️ No containers")
                    continue
                
                config = CONFIG[service]
                
                # Calculate scaling score
                weighted_score, scores = calculate_scaling_score(service, metrics)
                
                # Status indicators
                cpu_val = metrics.get("avg_cpu", 0)
                mem_val = metrics.get("avg_memory", 0)
                rps_val = metrics.get("rps_per_replica", 0)
                lat_val = metrics.get("latency_ms", 0)
                
                cpu_status = "🔴" if cpu_val > config["target_cpu"] else "🟢"
                mem_status = "🔴" if mem_val > config["target_memory"] else "🟢"
                
                rps_config = RPS_LATENCY_CONFIG.get(service, {})
                rps_status = "🔴" if rps_val > rps_config.get("max_rps_per_replica", 150) else "🟢"
                lat_status = "🔴" if lat_val > rps_config.get("max_latency_p95_ms", 500) else "🟢"
                
                score_status = "🔴" if weighted_score > 1.2 else "🟡" if weighted_score > 0.8 else "🟢"
                
                # Check scaling decisions
                should_out, out_reason = should_scale_out_multi_signal(service, metrics, current_replicas)
                should_in, in_reason = should_scale_in_multi_signal(service, metrics, current_replicas)
                
                # Determine status string
                if should_out:
                    status = f"⬆️ SCALE OUT: {out_reason}"
                elif should_in:
                    status = f"⬇️ SCALE IN: {in_reason}"
                else:
                    status = f"✓ {out_reason if 'cooldown' in out_reason else in_reason}"
                
                # Truncate status for display
                status_display = status[:20] if len(status) > 20 else status
                
                print(f"{service:<16} {current_replicas:>3}/{config['max_replicas']:<2} "
                      f"{cpu_status}{cpu_val:>6.1f}% {mem_status}{mem_val:>6.1f}% "
                      f"{rps_status}{rps_val:>6.1f} {lat_status}{lat_val:>6.0f}ms "
                      f"{score_status}{weighted_score:>5.2f} {status_display}")
                
                # Execute scaling with BURST SCALING support
                if should_out:
                    # Use burst scaling calculation instead of simple +1
                    burst_count = calculate_burst_replicas(service, metrics, weighted_score, current_replicas)
                    target = min(current_replicas + burst_count, config["max_replicas"])
                    
                    if target > current_replicas:
                        burst_note = f" [BURST +{burst_count}]" if burst_count > 1 else ""
                        scale_service(service, current_replicas, target, f"{out_reason}{burst_note}")
                
                elif should_in:
                    target = max(current_replicas - 1, config["min_replicas"])
                    scale_service(service, current_replicas, target, in_reason)
            
            # Summary
            total_replicas = sum(all_metrics.get(s, {}).get("count", 0) for s in CONFIG.keys())
            max_possible = sum(CONFIG[s]["max_replicas"] for s in CONFIG.keys())
            print("-" * 90)
            print(f"📊 Total: {total_replicas}/{max_possible} replicas | "
                  f"Events: {len(scaling_events)} | "
                  f"Weights: CPU={SCALING_WEIGHTS['cpu']*100:.0f}% RPS={SCALING_WEIGHTS['rps']*100:.0f}% "
                  f"Lat={SCALING_WEIGHTS['latency']*100:.0f}% Mem={SCALING_WEIGHTS['memory']*100:.0f}%")
            
            time.sleep(POLL_INTERVAL)
    
    except KeyboardInterrupt:
        print("\n\n" + "=" * 90)
        print("🛑 Auto-scaler stopped by user")
        print("=" * 90)
        
        if scaling_events:
            print("\n📋 Scaling Events Summary:")
            print("-" * 90)
            for event in scaling_events:
                ts = event['timestamp'].split('T')[1].split('.')[0]
                reason = event.get('reason', 'N/A')
                print(f"  {ts} | {event['service']:15} | {event['action']:10} | "
                      f"{event['from_replicas']} → {event['to_replicas']} | {reason}")
            print("-" * 90)
            print(f"Total scaling events: {len(scaling_events)}")
        else:
            print("\n📋 No scaling events occurred during this session")
        
        # Final state with all metrics
        print("\n📊 Final Service State:")
        final_metrics = collect_all_metrics()
        for service in CONFIG.keys():
            if service in final_metrics:
                m = final_metrics[service]
                print(f"   • {service}: {m.get('count', 0)} replicas | "
                      f"CPU: {m.get('avg_cpu', 0):.1f}% | "
                      f"RPS: {m.get('total_rps', 0):.1f}")
        
        print("=" * 90)
        sys.exit(0)


if __name__ == "__main__":
    main()
