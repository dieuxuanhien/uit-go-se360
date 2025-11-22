#!/usr/bin/env node
// tests/load/scripts/analyze-results.js
// Analyze k6 test results and generate report
// Usage: node analyze-results.js <results-directory>

const fs = require('fs');
const path = require('path');

function analyzeResults(resultsDir) {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  k6 Results Analysis                                   ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  const summaryPath = path.join(resultsDir, 'summary.json');
  
  if (!fs.existsSync(summaryPath)) {
    console.error(`❌ Error: summary.json not found in ${resultsDir}`);
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const metrics = summary.metrics;

  // Extract key metrics
  const totalRequests = metrics.http_reqs?.values?.count || 0;
  const requestRate = metrics.http_reqs?.values?.rate || 0;
  const failedRate = (metrics.http_req_failed?.values?.rate || 0) * 100;
  
  const p50 = metrics.http_req_duration?.values?.['p(50)'] || 0;
  const p95 = metrics.http_req_duration?.values?.['p(95)'] || 0;
  const p99 = metrics.http_req_duration?.values?.['p(99)'] || 0;
  const avg = metrics.http_req_duration?.values?.avg || 0;
  const max = metrics.http_req_duration?.values?.max || 0;

  // Custom metrics
  const tripCreationP95 = metrics.trip_creation_duration?.values?.['p(95)'] || 0;
  const locationUpdateP95 = metrics.location_update_duration?.values?.['p(95)'] || 0;
  const tripHistoryP95 = metrics.trip_history_duration?.values?.['p(95)'] || 0;
  
  const totalTrips = metrics.total_trips_created?.values?.count || 0;
  const totalLocationUpdates = metrics.total_location_updates?.values?.count || 0;

  console.log('📊 Overall Performance:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Total Requests:     ${totalRequests.toLocaleString()}`);
  console.log(`   Request Rate:       ${requestRate.toFixed(2)} req/s`);
  console.log(`   Failed Requests:    ${failedRate.toFixed(2)}%`);
  console.log('');

  console.log('⏱️  Response Time Latency:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Average (p50):      ${p50.toFixed(2)} ms`);
  console.log(`   p95:                ${p95.toFixed(2)} ms`);
  console.log(`   p99:                ${p99.toFixed(2)} ms`);
  console.log(`   Max:                ${max.toFixed(2)} ms`);
  console.log('');

  console.log('🎯 Endpoint-Specific Metrics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Trip Creation (p95):        ${tripCreationP95.toFixed(2)} ms`);
  console.log(`   Location Update (p95):      ${locationUpdateP95.toFixed(2)} ms`);
  console.log(`   Trip History (p95):         ${tripHistoryP95.toFixed(2)} ms`);
  console.log('');

  console.log('📈 Business Metrics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Trips Created:              ${totalTrips.toLocaleString()}`);
  console.log(`   Location Updates:           ${totalLocationUpdates.toLocaleString()}`);
  console.log('');

  // Performance assessment
  console.log('✅ Performance Assessment:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const assessments = [];
  
  if (failedRate < 1) {
    assessments.push('   ✅ Error rate acceptable (<1%)');
  } else if (failedRate < 5) {
    assessments.push('   ⚠️  Error rate moderate (1-5%)');
  } else {
    assessments.push('   ❌ Error rate high (>5%)');
  }

  if (p95 < 500) {
    assessments.push('   ✅ p95 latency excellent (<500ms)');
  } else if (p95 < 1000) {
    assessments.push('   ⚠️  p95 latency acceptable (500-1000ms)');
  } else if (p95 < 2000) {
    assessments.push('   ⚠️  p95 latency degraded (1-2s)');
  } else {
    assessments.push('   ❌ p95 latency poor (>2s)');
  }

  if (requestRate > 1000) {
    assessments.push('   ✅ Throughput excellent (>1000 req/s)');
  } else if (requestRate > 500) {
    assessments.push('   ✅ Throughput good (500-1000 req/s)');
  } else if (requestRate > 100) {
    assessments.push('   ⚠️  Throughput moderate (100-500 req/s)');
  } else {
    assessments.push('   ❌ Throughput low (<100 req/s)');
  }

  assessments.forEach(a => console.log(a));
  console.log('');

  // Generate markdown report snippet
  const reportSnippet = `
## Test Results Summary

**Test Execution:** ${new Date().toISOString()}

### Overall Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Total Requests | ${totalRequests.toLocaleString()} | - |
| Request Rate | ${requestRate.toFixed(2)} req/s | ${requestRate > 100 ? '✅' : '❌'} |
| Error Rate | ${failedRate.toFixed(2)}% | ${failedRate < 1 ? '✅' : failedRate < 5 ? '⚠️' : '❌'} |

### Latency Metrics

| Percentile | Latency | Target | Status |
|------------|---------|--------|--------|
| p50 (Median) | ${p50.toFixed(2)} ms | - | - |
| p95 | ${p95.toFixed(2)} ms | <500ms | ${p95 < 500 ? '✅' : p95 < 1000 ? '⚠️' : '❌'} |
| p99 | ${p99.toFixed(2)} ms | <1000ms | ${p99 < 1000 ? '✅' : p99 < 2000 ? '⚠️' : '❌'} |
| Max | ${max.toFixed(2)} ms | - | - |

### Endpoint Performance

| Endpoint | p95 Latency | Target | Status |
|----------|-------------|--------|--------|
| Trip Creation | ${tripCreationP95.toFixed(2)} ms | <2000ms | ${tripCreationP95 < 2000 ? '✅' : '❌'} |
| Location Update | ${locationUpdateP95.toFixed(2)} ms | <200ms | ${locationUpdateP95 < 200 ? '✅' : locationUpdateP95 < 500 ? '⚠️' : '❌'} |
| Trip History | ${tripHistoryP95.toFixed(2)} ms | <500ms | ${tripHistoryP95 < 500 ? '✅' : tripHistoryP95 < 1000 ? '⚠️' : '❌'} |

### Business Metrics

- **Trips Created:** ${totalTrips.toLocaleString()}
- **Location Updates:** ${totalLocationUpdates.toLocaleString()}
`;

  const reportPath = path.join(resultsDir, 'report-snippet.md');
  fs.writeFileSync(reportPath, reportSnippet);

  console.log('📄 Report snippet generated:');
  console.log(`   ${reportPath}`);
  console.log('');
  console.log('   Copy this content into docs/testing/baseline-results.md');
  console.log('');
}

// Main
const resultsDir = process.argv[2];

if (!resultsDir) {
  console.error('Usage: node analyze-results.js <results-directory>');
  console.error('Example: node analyze-results.js ./results/baseline-20251122-140530');
  process.exit(1);
}

if (!fs.existsSync(resultsDir)) {
  console.error(`❌ Error: Directory not found: ${resultsDir}`);
  process.exit(1);
}

analyzeResults(resultsDir);
