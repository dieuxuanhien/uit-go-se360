#!/usr/bin/env python3
# tests/load/compare-results.py
# Automated comparison of all Module A test stages
# Enhanced with infrastructure metrics

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional

RESULTS_DIR = Path("docs/testing/results")

def load_summary(stage: str) -> Optional[Dict]:
    """Load k6 summary JSON for a stage"""
    summary_file = RESULTS_DIR / f"{stage}-summary.json"
    if not summary_file.exists():
        return None
    
    with open(summary_file, 'r') as f:
        return json.load(f)

def extract_metrics(summary: Dict) -> Optional[Dict]:
    """Extract key metrics from k6 summary"""
    if not summary:
        return None
    
    metrics = summary.get('metrics', {})
    
    # Business flow metrics
    total_reqs = metrics.get('http_reqs', {}).get('count', 0)
    passenger_reqs = metrics.get('passenger_requests', {}).get('count', 0)
    driver_reqs = metrics.get('driver_requests', {}).get('count', 0)
    
    return {
        # Overall performance
        'total_requests': total_reqs,
        'rps': metrics.get('http_reqs', {}).get('rate', 0),
        'p95_latency': metrics.get('http_req_duration', {}).get('p(95)', 0),
        'p99_latency': metrics.get('http_req_duration', {}).get('p(99)', 0),
        'avg_latency': metrics.get('http_req_duration', {}).get('avg', 0),
        'error_rate': metrics.get('http_req_failed', {}).get('rate', 0),
        
        # Business flow metrics
        'passenger_requests': passenger_reqs,
        'driver_requests': driver_reqs,
        'trip_creation_success': metrics.get('trip_creation_success', {}).get('rate', 0),
        'trip_creation_p95': metrics.get('trip_creation_duration', {}).get('p(95)', 0),
        'driver_search_p95': metrics.get('driver_search_duration', {}).get('p(95)', 0),
        'location_update_success': metrics.get('location_update_success', {}).get('rate', 0),
        'location_update_p95': metrics.get('location_update_duration', {}).get('p(95)', 0),
        
        # Infrastructure metrics
        'db_query_p95': metrics.get('db_query_duration', {}).get('p(95)', 0),
        'db_query_avg': metrics.get('db_query_duration', {}).get('avg', 0),
        'cache_hit_rate': metrics.get('cache_hit_rate', {}).get('rate', 0),
        'connection_pool_usage': metrics.get('connection_pool_usage', {}).get('value', 0),
        'replica_query_rate': metrics.get('replica_query_rate', {}).get('rate', 0),
    }

def format_improvement(current: float, baseline: float, reverse: bool = False) -> str:
    """Format improvement ratio with arrow"""
    if baseline == 0 or current == 0:
        return ""
    
    ratio = current / baseline if not reverse else baseline / current
    
    if ratio > 1.1:  # At least 10% improvement
        arrow = "↑" if not reverse else "↓"
        return f" ({arrow}{ratio:.1f}x)"
    elif ratio < 0.9:  # Degradation
        arrow = "↓" if not reverse else "↑"
        return f" ({arrow}{1/ratio:.1f}x worse)"
    else:
        return " (≈same)"

def generate_comparison_table():
    """Generate markdown comparison table"""
    stages = [
        ('stage-0-skeleton', 'Skeleton (Sync)', 'Baseline'),
        ('stage-1-async', 'Async (Story 2.1)', 'Design Validation'),
        ('stage-2-replicas', 'Replicas (Story 2.2)', 'Optimization 1'),
        ('stage-3-caching', 'Caching (Story 2.3)', 'Optimization 2'),
        ('stage-4-current', 'Current (Pre-Auto-Scale)', 'Optimization 3'),
    ]
    
    print("\n# Module A Load Testing - Multi-Stage Comparison\n")
    print("## Executive Summary\n")
    print("| Stage | Architecture | RPS | p95 Latency | Error Rate | Trip Success | Location Updates |")
    print("|-------|--------------|-----|-------------|------------|--------------|------------------|")
    
    baseline_metrics = None
    
    for stage_id, name, phase in stages:
        summary = load_summary(stage_id)
        if not summary:
            print(f"| {name} | {phase} | ❌ No data | - | - | - | - |")
            continue
        
        metrics = extract_metrics(summary)
        if not baseline_metrics and metrics:
            baseline_metrics = metrics
        
        # Calculate improvements
        rps_improvement = format_improvement(metrics['rps'], baseline_metrics['rps']) if baseline_metrics else ""
        latency_improvement = format_improvement(metrics['p95_latency'], baseline_metrics['p95_latency'], reverse=True) if baseline_metrics else ""
        
        location_status = f"{metrics['location_update_success']*100:.1f}%" if metrics['driver_requests'] > 0 else "N/A"
        
        print(f"| {name} | {phase} | "
              f"{metrics['rps']:.1f}{rps_improvement} | "
              f"{metrics['p95_latency']:.0f}ms{latency_improvement} | "
              f"{metrics['error_rate']*100:.1f}% | "
              f"{metrics['trip_creation_success']*100:.1f}% | "
              f"{location_status} |")
    
    # Detailed metrics by stage
    print("\n## Detailed Performance Metrics\n")
    
    for stage_id, name, phase in stages:
        summary = load_summary(stage_id)
        if not summary:
            continue
        
        metrics = extract_metrics(summary)
        
        print(f"### {name}")
        print(f"**Phase**: {phase}\n")
        
        print("#### Business Flow Performance")
        print(f"- **Total Requests**: {metrics['total_requests']:,}")
        print(f"  - Passenger requests: {metrics['passenger_requests']:,} ({metrics['passenger_requests']/metrics['total_requests']*100:.1f}%)")
        print(f"  - Driver requests: {metrics['driver_requests']:,} ({metrics['driver_requests']/metrics['total_requests']*100:.1f}%)")
        print(f"- **Throughput**: {metrics['rps']:.2f} req/s")
        print(f"- **Overall Latency**:")
        print(f"  - Average: {metrics['avg_latency']:.2f}ms")
        print(f"  - p95: {metrics['p95_latency']:.2f}ms")
        print(f"  - p99: {metrics['p99_latency']:.2f}ms")
        print()
        print("**Trip Creation Flow**:")
        print(f"- p95 Latency: {metrics['trip_creation_p95']:.2f}ms")
        print(f"- Success Rate: {metrics['trip_creation_success']*100:.2f}%")
        print()
        print("**Driver Search**:")
        print(f"- p95 Latency: {metrics['driver_search_p95']:.2f}ms")
        print()
        print("**Location Updates**:")
        print(f"- p95 Latency: {metrics['location_update_p95']:.2f}ms")
        print(f"- Success Rate: {metrics['location_update_success']*100:.2f}%")
        print()
        
        print("#### Infrastructure Metrics")
        if metrics['db_query_p95'] > 0:
            print(f"- **Database Query Time**:")
            print(f"  - Average: {metrics['db_query_avg']:.2f}ms")
            print(f"  - p95: {metrics['db_query_p95']:.2f}ms")
        else:
            print(f"- **Database Query Time**: Not instrumented")
        
        if metrics['cache_hit_rate'] > 0:
            print(f"- **Cache Hit Rate**: {metrics['cache_hit_rate']*100:.2f}%")
        else:
            print(f"- **Cache Hit Rate**: No caching (or not instrumented)")
        
        if metrics['connection_pool_usage'] > 0:
            print(f"- **Connection Pool Usage**: {metrics['connection_pool_usage']:.1f} active connections")
        else:
            print(f"- **Connection Pool Usage**: Not instrumented")
        
        if metrics['replica_query_rate'] > 0:
            print(f"- **Read Replica Usage**: {metrics['replica_query_rate']*100:.2f}% of queries")
        else:
            print(f"- **Read Replica Usage**: No replicas (or not instrumented)")
        
        print(f"- **Error Rate**: {metrics['error_rate']*100:.2f}%")
        print()
    
    # Overall summary
    print("\n## Overall Improvement Summary\n")
    if baseline_metrics:
        final_metrics = extract_metrics(load_summary('stage-4-current'))
        if final_metrics:
            rps_total = final_metrics['rps'] / baseline_metrics['rps'] if baseline_metrics['rps'] > 0 else 0
            latency_total = baseline_metrics['p95_latency'] / final_metrics['p95_latency'] if final_metrics['p95_latency'] > 0 else 0
            
            print(f"**Skeleton Architecture → Current Architecture**:\n")
            
            print("### Throughput Improvements")
            print(f"- **Overall RPS**: {baseline_metrics['rps']:.0f} → {final_metrics['rps']:.0f} RPS (**{rps_total:.1f}x improvement**)")
            print(f"- **Passenger flow**: {baseline_metrics['passenger_requests']:,} → {final_metrics['passenger_requests']:,} requests")
            print(f"- **Driver flow**: {baseline_metrics['driver_requests']:,} → {final_metrics['driver_requests']:,} requests")
            print()
            
            print("### Latency Improvements")
            print(f"- **Overall p95**: {baseline_metrics['p95_latency']:.0f}ms → {final_metrics['p95_latency']:.0f}ms (**{latency_total:.1f}x faster**)")
            print(f"- **Trip creation**: {baseline_metrics['trip_creation_p95']:.0f}ms → {final_metrics['trip_creation_p95']:.0f}ms")
            print(f"- **Location updates**: {baseline_metrics['location_update_p95']:.0f}ms → {final_metrics['location_update_p95']:.0f}ms")
            print()
            
            print("### Reliability Improvements")
            print(f"- **Error rate**: {baseline_metrics['error_rate']*100:.1f}% → {final_metrics['error_rate']*100:.1f}%")
            print(f"- **Trip success**: {baseline_metrics['trip_creation_success']*100:.1f}% → {final_metrics['trip_creation_success']*100:.1f}%")
            print(f"- **Location update success**: {baseline_metrics['location_update_success']*100:.1f}% → {final_metrics['location_update_success']*100:.1f}%")
            print()
            
            print("### Infrastructure Efficiency")
            if final_metrics['cache_hit_rate'] > 0:
                db_load_reduction = (1 - (1 - final_metrics['cache_hit_rate'])) * 100
                print(f"- **Cache hit rate**: {final_metrics['cache_hit_rate']*100:.1f}% (reduces DB load by {db_load_reduction:.1f}%)")
            if final_metrics['replica_query_rate'] > 0:
                print(f"- **Read replica offload**: {final_metrics['replica_query_rate']*100:.1f}% of reads")
            if final_metrics['db_query_p95'] > 0 and baseline_metrics['db_query_p95'] > 0:
                db_improvement = baseline_metrics['db_query_p95'] / final_metrics['db_query_p95']
                print(f"- **DB query performance**: {baseline_metrics['db_query_p95']:.0f}ms → {final_metrics['db_query_p95']:.0f}ms ({db_improvement:.1f}x faster)")
            print()
            
            print("### Capacity Analysis")
            # Assuming 10s user think time for capacity calculation
            baseline_capacity = int(baseline_metrics['rps'] * 10)
            current_capacity = int(final_metrics['rps'] * 10)
            print(f"- **Concurrent users** (10s think time):")
            print(f"  - Baseline: ~{baseline_capacity:,} users")
            print(f"  - Current: ~{current_capacity:,} users")
            print(f"  - **Improvement: {current_capacity/baseline_capacity:.1f}x capacity**")
            print()
            
            print("### Optimization Attribution")
            print("Based on progressive improvements across stages:")
            
            # Calculate stage-by-stage improvements
            stage_metrics = []
            for stage_id, name, phase in stages:
                summary = load_summary(stage_id)
                if summary:
                    stage_metrics.append((name, extract_metrics(summary)))
            
            for i in range(1, len(stage_metrics)):
                prev_name, prev = stage_metrics[i-1]
                curr_name, curr = stage_metrics[i]
                
                if prev and curr:
                    rps_delta = ((curr['rps'] - prev['rps']) / prev['rps'] * 100) if prev['rps'] > 0 else 0
                    latency_delta = ((prev['p95_latency'] - curr['p95_latency']) / prev['p95_latency'] * 100) if prev['p95_latency'] > 0 else 0
                    
                    print(f"- **{curr_name}**: +{rps_delta:.1f}% RPS, {latency_delta:.1f}% faster")

if __name__ == '__main__':
    try:
        generate_comparison_table()
    except Exception as e:
        print(f"Error generating comparison: {e}", file=sys.stderr)
        sys.exit(1)
