# 📋 Architectural Decision Records (ADRs)

> **Module A: Scalability & Performance Architecture**

## Overview

Thư mục này chứa các Architectural Decision Records (ADRs) cho Module A - Scalability của dự án UIT-Go. Mỗi ADR ghi lại một quyết định kiến trúc quan trọng, bao gồm context, alternatives considered, và trade-offs.

## ADR List

| ADR | Tên | Status | Tóm tắt |
|-----|-----|--------|---------|
| ADR-001 | Event-Driven Async Communication | ✅ Accepted | SNS/SQS via LocalStack để decouple services |
| ADR-002 | Database Read Scaling | ✅ Accepted | PostgreSQL Read Replicas với streaming replication |
| ADR-003 | Distributed Caching | ✅ Accepted | Redis Cluster (6 nodes) với cache-aside pattern |
| ADR-004 | Auto-Scaling Infrastructure | ✅ Accepted | Docker Compose replicas + Python auto-scaler |

## ADR Template

Mỗi ADR tuân theo format sau:

```markdown
# ADR-XXX: [Tên Quyết Định]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[Mô tả bối cảnh và vấn đề cần giải quyết]

## Decision
[Quyết định được đưa ra]

## Alternatives Considered
[Các phương án đã cân nhắc và lý do không chọn]

## Consequences
### Positive
[Lợi ích của quyết định]

### Negative
[Hạn chế và trade-offs]

## References
[Links và tài liệu liên quan]
```

## Trade-off Summary

| ADR | Trade-off Chính | Chấp nhận vì |
|-----|-----------------|--------------|
| ADR-001 | Eventual consistency vs Strong consistency | Performance 100x, Cost $0 |
| ADR-002 | Replication lag (<1s) vs Immediate consistency | 10x read throughput |
| ADR-003 | Memory cost vs DB load | 87% cost savings at scale |
| ADR-004 | Cold start delay vs Always-on capacity | 73% cost reduction |

## Related Documentation

- **Full ADRs:** [../../docs/adrs/](../../docs/adrs/)
- **Architecture:** [../../docs/architecture/](../../docs/architecture/)
- **Load Test Results:** [../../docs/MODULE-A-SCALABILITY-REPORT.md](../../docs/MODULE-A-SCALABILITY-REPORT.md)
