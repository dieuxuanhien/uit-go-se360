#!/usr/bin/env python3
"""
Auto-Scaler for Docker Compose Services
Story 2.6: Simulates ECS Fargate auto-scaling locally

Infrastructure Context:
- SNS/SQS: 3 SNS topics + 3 SQS queues (TripRequested, DriverMatched, TripEvents)
- Read Replicas: 2 replicas per database (user-service, trip-service)
- Redis Cache: 6 nodes (3 primary + 3 replica) for driver-service caching

Monitors Docker container metrics and scales services based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 75%)
- Service-specific scaling profiles

Scales services between min/max replicas with cooldown periods.
"""

import subprocess
import json
import time
import sys
import os
from datetime import datetime
from typing import Dict, List, Tuple, Optional

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

# Polling interval in seconds (5s = faster reaction, 10s = less overhead)
POLL_INTERVAL = 5  # Reduced from 10s for faster scaling response

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
        "max_replicas": 4,
        "target_cpu": 55.0,  # Lowered from 70% for faster scaling response
        "target_memory": 65.0,
        "scale_out_cooldown": 20,  # Faster scale-out (was 30s)
        "scale_in_cooldown": 180,  # Extended: prevent scale-in during load test (was 120s)
        "priority": 2,  # Medium priority (DB has read replicas)
        "description": "Auth + Profile (2 read replicas)",
    },
    "trip-service": {
        "min_replicas": 2,  # CRITICAL: Keep at least 2 replicas for trip creation
        "max_replicas": 6,  # Highest max - handles trip creation + SQS
        "target_cpu": 50.0,  # Lowered from 60% - scale BEFORE saturation
        "target_memory": 60.0,
        "scale_out_cooldown": 15,  # Faster scale-out (was 20s)
        "scale_in_cooldown": 300,  # Extended: 5 min (SQS queue backlog + test duration)
        "priority": 1,  # Highest priority - critical for trip flow
        "description": "Trip creation + SQS consumers (2 read replicas)",
    },
    "driver-service": {
        "min_replicas": 2,  # Pre-scale to 2 (I/O bound bottleneck)
        "max_replicas": 6,  # Increased max for 500 VU load
        "target_cpu": 40.0,  # Much lower - I/O bound (network/Redis), not CPU bound
        "target_memory": 70.0,
        "scale_out_cooldown": 15,  # Faster scale-out for I/O bound services
        "scale_in_cooldown": 180,  # Extended: prevent scale-in during load test
        "priority": 1,  # ELEVATED: Critical bottleneck in 500 VU test
        "description": "Location + Search (6-node Redis cluster) - I/O BOUND",
    },
}

# Startup time - no scale-in allowed during this period
START_TIME = None  # Set when main() starts
STARTUP_GRACE_PERIOD = 180  # 3 minutes - no scale-in during startup/warm-up

# Track last scaling action timestamp
last_scale_time = {service: 0 for service in CONFIG.keys()}

# Track consecutive low-usage iterations (for scale-in stability)
# Require 3 consecutive low readings before scale-in
low_usage_count = {service: 0 for service in CONFIG.keys()}
SCALE_IN_STABILITY_COUNT = 3  # Require 3 consecutive low readings

# Scaling event log
scaling_events = []


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
            timeout=30,  # Increased from 15s to handle Docker slowness under load
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
# Scaling Logic
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


def scale_service(service: str, current_replicas: int, target_replicas: int) -> bool:
    """
    Scale a Docker Compose service to target replica count.
    Uses direct docker commands to avoid docker-compose network label issues.
    
    Args:
        service: Service name (e.g., "user-service")
        current_replicas: Current number of replicas
        target_replicas: Desired number of replicas
    
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
        }
        scaling_events.append(event)
        last_scale_time[service] = time.time()
        
        print(f"[SUCCESS] {service}: Scaled to {target_replicas} replicas")
        
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

def main():
    """Main auto-scaler loop."""
    global START_TIME
    START_TIME = time.time()  # Record startup time for grace period
    
    print("=" * 70)
    print("🚀 Docker Compose Auto-Scaler for UIT-GO")
    print("=" * 70)
    print(f"Project directory: {PROJECT_DIR}")
    print(f"Compose files: {', '.join(COMPOSE_FILES)}")
    print(f"Poll interval: {POLL_INTERVAL}s")
    print(f"Startup grace period: {STARTUP_GRACE_PERIOD}s (no scale-in)")
    print("")
    print("📦 Infrastructure:")
    print("   • SNS/SQS: 3 topics + 3 queues (TripRequested, DriverMatched, TripEvents)")
    print("   • Read Replicas: 2 per database (user-service, trip-service)")
    print("   • Redis Cluster: 6 nodes (3 primary + 3 replica) for driver-service")
    print("")
    print(f"🔧 Service Scaling Profiles ({len(CONFIG)} services):")
    # Sort by priority
    for service in sorted(CONFIG.keys(), key=lambda s: CONFIG[s].get("priority", 99)):
        config = CONFIG[service]
        priority_icon = "🔴" if config["priority"] == 1 else "🟡" if config["priority"] == 2 else "🟢"
        print(f"   {priority_icon} {service}: {config['min_replicas']}-{config['max_replicas']} replicas, "
              f"CPU target {config['target_cpu']}%")
        print(f"      └─ {config.get('description', '')}")
    print("=" * 70)
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
            
            # Get current container stats
            stats = get_container_stats()
            
            if not stats:
                print("⚠️  No container stats available (services may be starting)")
                time.sleep(POLL_INTERVAL)
                continue
            
            # Evaluate services in priority order (trip-service first)
            services_by_priority = sorted(CONFIG.keys(), key=lambda s: CONFIG[s].get("priority", 99))
            
            for service in services_by_priority:
                if service not in stats:
                    print(f"⚠️  {service}: No containers running")
                    continue
                
                avg_cpu = stats[service].get("avg_cpu", 0)
                avg_memory = stats[service].get("avg_memory", 0)
                total_cpu = stats[service].get("cpu", 0)
                current_replicas = stats[service]["count"]
                config = CONFIG[service]
                
                # Status indicators
                cpu_status = "🔴" if avg_cpu > config["target_cpu"] else "🟢"
                mem_status = "🔴" if avg_memory > config["target_memory"] else "🟢"
                
                # Cooldown status
                time_since_scale = time.time() - last_scale_time[service]
                cooldown_active = time_since_scale < config["scale_out_cooldown"]
                cooldown_str = f" ⏳{int(config['scale_out_cooldown'] - time_since_scale)}s" if cooldown_active else ""
                
                print(f"{service}: {current_replicas}/{config['max_replicas']} replicas | "
                      f"CPU: {cpu_status} {avg_cpu:.1f}% | "
                      f"Mem: {mem_status} {avg_memory:.1f}%{cooldown_str}")
                
                # Scaling decision
                if should_scale_out(service, avg_cpu, avg_memory, current_replicas):
                    # Calculate optimal replicas using HPA-like algorithm
                    desired = calculate_desired_replicas(service, avg_cpu, avg_memory, current_replicas)
                    # But limit to +2 max per scaling event for stability
                    target = min(current_replicas + 2, desired, config["max_replicas"])
                    if target > current_replicas:
                        scale_service(service, current_replicas, target)
                
                elif should_scale_in(service, avg_cpu, avg_memory, current_replicas):
                    target = max(current_replicas - 1, config["min_replicas"])
                    scale_service(service, current_replicas, target)
            
            # Summary of current replica counts
            total_replicas = sum(stats.get(s, {}).get("count", 0) for s in CONFIG.keys())
            max_possible = sum(CONFIG[s]["max_replicas"] for s in CONFIG.keys())
            print(f"\n📊 Total replicas: {total_replicas}/{max_possible} | "
                  f"Scaling events: {len(scaling_events)}")
            
            # Wait before next check
            time.sleep(POLL_INTERVAL)
    
    except KeyboardInterrupt:
        print("\n\n" + "=" * 70)
        print("🛑 Auto-scaler stopped by user")
        print("=" * 70)
        
        if scaling_events:
            print("\n📋 Scaling Events Summary:")
            print("-" * 70)
            for event in scaling_events:
                ts = event['timestamp'].split('T')[1].split('.')[0]
                print(f"  {ts} | {event['service']:15} | {event['action']:10} | "
                      f"{event['from_replicas']} → {event['to_replicas']} replicas")
            print("-" * 70)
            print(f"Total scaling events: {len(scaling_events)}")
        else:
            print("\n📋 No scaling events occurred during this session")
        
        # Final state
        print("\n📊 Final Service State:")
        stats = get_container_stats()
        for service in CONFIG.keys():
            if service in stats:
                print(f"   • {service}: {stats[service]['count']} replicas")
        
        print("=" * 70)
        sys.exit(0)


if __name__ == "__main__":
    main()
