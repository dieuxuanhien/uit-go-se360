#!/bin/bash
# Pre-warm services to min_replicas BEFORE running load test
# This ensures we have capacity ready when load hits

set -e

cd "$(dirname "$0")/.."

echo "🔥 Pre-warming services for load test..."
echo ""

# Pre-warm configuration (matches auto-scaler min_replicas)
echo "📦 Target configuration:"
echo "   • trip-service: 4 replicas"
echo "   • driver-service: 3 replicas"  
echo "   • user-service: 2 replicas"
echo ""

# Function to scale a service using the same method as auto-scaler.py
scale_service() {
    local service=$1
    local target=$2
    local base_container="uitgo-${service}"
    
    # Get current replica count
    current=$(docker ps --filter "name=${base_container}" --format "{{.Names}}" | wc -l)
    
    if [ "$current" -ge "$target" ]; then
        echo "✓ ${service}: Already at ${current} replicas (target: ${target})"
        return
    fi
    
    echo "⬆️ ${service}: Scaling from ${current} to ${target} replicas..."
    
    # Get image from existing container
    image=$(docker inspect --format '{{.Config.Image}}' "${base_container}" 2>/dev/null)
    
    if [ -z "$image" ]; then
        echo "  ⚠️ Cannot find base container ${base_container}"
        return
    fi
    
    # Get environment variables and save to temp file
    envfile=$(mktemp)
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${base_container}" | grep -v '^$' > "$envfile"
    
    # Get entrypoint and cmd
    entrypoint=$(docker inspect --format '{{range .Config.Entrypoint}}{{.}} {{end}}' "${base_container}" | xargs)
    cmd=$(docker inspect --format '{{range .Config.Cmd}}{{.}} {{end}}' "${base_container}" | xargs)
    
    for i in $(seq $((current + 1)) $target); do
        container_name="${base_container}-${i}"
        
        # Remove if exists
        docker rm -f "$container_name" 2>/dev/null || true
        
        # Run new container with same config as base
        if [ -n "$entrypoint" ]; then
            docker run -d \
                --name "$container_name" \
                --network uitgo-network \
                --network-alias "$service" \
                --restart unless-stopped \
                --env-file "$envfile" \
                --entrypoint "$entrypoint" \
                "$image" \
                $cmd \
                > /dev/null 2>&1 && echo "  ✓ Started ${container_name}" || echo "  ⚠️ Failed to start ${container_name}"
        else
            docker run -d \
                --name "$container_name" \
                --network uitgo-network \
                --network-alias "$service" \
                --restart unless-stopped \
                --env-file "$envfile" \
                "$image" \
                $cmd \
                > /dev/null 2>&1 && echo "  ✓ Started ${container_name}" || echo "  ⚠️ Failed to start ${container_name}"
        fi
    done
    
    rm -f "$envfile"
}

# Scale services
scale_service "trip-service" 4
scale_service "driver-service" 3
scale_service "user-service" 2

echo ""
echo "✅ Pre-warming complete!"
echo ""
echo "📊 Current replica counts:"
for svc in trip-service driver-service user-service; do
    count=$(docker ps --filter "name=uitgo-${svc}" --format "{{.Names}}" | wc -l)
    echo "   • ${svc}: ${count} replicas"
done

echo ""
echo "🚀 Ready to run load test!"
echo "   Start auto-scaler:  python ./scripts/auto-scaler.py"
echo "   Run load test:      k6 run ./tests/load/module-a-capacity-test.js"
