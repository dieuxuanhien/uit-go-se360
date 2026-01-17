# Bottleneck Analysis - Authoritative References

This document provides authoritative sources validating the terminology and concepts used in the critical bottleneck analysis documents.

---

## Source Credibility Tiers

| Tier | Type | Credibility Criteria |
|------|------|---------------------|
| **Tier 1** | Seminal Books | Widely cited (1000+ citations), peer-reviewed, foundational texts |
| **Tier 2** | Industry Thought Leaders | Recognized experts, maintainers of major projects, conference keynote speakers |
| **Tier 3** | Official Documentation | Language/framework official docs, cloud provider best practices |
| **Tier 4** | Academic/Conference | ACM, IEEE, USENIX conferences (SREcon, OSDI, NSDI) |
| **Tier 5** | Reputable Tech Blogs | InfoQ, ByteByteGo, High Scalability, major company engineering blogs |

---

## Tier 1: Seminal Books

### Designing Data-Intensive Applications (DDIA)
- **Author:** Martin Kleppmann
- **Publisher:** O'Reilly Media, 2017
- **ISBN:** 978-1449373320
- **Relevance:** 
  - Chapter 5: Replication (read-your-writes, eventual consistency, replication lag)
  - Chapter 7: Transactions (ACID, isolation levels)
  - Chapter 9: Consistency and Consensus (CAP theorem)
- **Citation:** Kleppmann, M. (2017). *Designing Data-Intensive Applications*. O'Reilly Media.

### Release It! Design and Deploy Production-Ready Software
- **Author:** Michael T. Nygard
- **Publisher:** Pragmatic Bookshelf, 2nd Edition 2018
- **ISBN:** 978-1680502398
- **Relevance:**
  - Circuit Breaker pattern (original popularization)
  - Cascading failures
  - Stability patterns and anti-patterns
  - Bulkheads and timeouts
- **Citation:** Nygard, M. T. (2018). *Release It!* (2nd ed.). Pragmatic Bookshelf.

### Building Microservices
- **Author:** Sam Newman
- **Publisher:** O'Reilly Media, 2nd Edition 2021
- **ISBN:** 978-1492034025
- **Relevance:**
  - Service decomposition
  - Inter-service communication patterns
  - Resilience patterns
- **Citation:** Newman, S. (2021). *Building Microservices* (2nd ed.). O'Reilly Media.

---

## Tier 2: Industry Thought Leaders

### Martin Fowler
- **Affiliation:** ThoughtWorks Chief Scientist
- **Website:** [martinfowler.com](https://martinfowler.com)
- **Key Articles:**
  - [Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html) - Pattern definition and implementation
  - [Microservices](https://martinfowler.com/articles/microservices.html) - Foundational microservices article

### Matteo Collina
- **Affiliation:** Fastify creator, Node.js Technical Steering Committee
- **Key Contributions:**
  - "Thrashing the Node.js Event Loop" - USENIX talks
  - `@fastify/under-pressure` - Load shedding library for Node.js
  - Event loop delay monitoring and backpressure in Node.js
- **Talks:**
  - [Node.js Scalability Tips](https://www.usenix.org/conference/srecon) - SREcon presentations
  - [Mastering Node.js Event Loop](https://platformatic.dev) - Platformatic resources

### Jonas Bonér
- **Affiliation:** Lightbend founder, Reactive Manifesto author
- **Key Contributions:**
  - [Reactive Manifesto](https://www.reactivemanifesto.org/) - Defines backpressure, resilience, elasticity
  - Akka framework design principles

---

## Tier 3: Official Documentation

### Node.js
- **Source:** [nodejs.org/docs](https://nodejs.org/en/docs/)
- **Relevant Sections:**
  - [Don't Block the Event Loop](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)
  - [Event Loop Explained](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/)
  - [Backpressure in Streams](https://nodejs.org/en/docs/guides/backpressuring-in-streams/)

### PostgreSQL
- **Source:** [postgresql.org/docs](https://www.postgresql.org/docs/)
- **Relevant Sections:**
  - [Streaming Replication](https://www.postgresql.org/docs/current/warm-standby.html)
  - [High Availability](https://www.postgresql.org/docs/current/high-availability.html)
  - [Connection Pooling](https://www.postgresql.org/docs/current/runtime-config-connection.html)

### AWS Architecture
- **Source:** [AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/)
- **Relevant Articles:**
  - Auto Scaling best practices
  - Exponential backoff and jitter
  - Thundering herd mitigation

### Google Cloud Architecture
- **Source:** [cloud.google.com/architecture](https://cloud.google.com/architecture)
- **Relevant Patterns:**
  - [Rate Limiting Strategies](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)
  - [Designing Scalable Systems](https://cloud.google.com/architecture/scalable-and-resilient-apps)

### Redis Documentation
- **Source:** [redis.io/docs](https://redis.io/docs/)
- **Relevant Sections:**
  - [GEOSEARCH Command](https://redis.io/commands/geosearch/) (replaces deprecated GEORADIUS)
  - [Redis 7 Performance Improvements](https://redis.io/blog/introducing-redis-7/)
  - [Cluster Tutorial](https://redis.io/docs/management/scaling/)

---

## Tier 4: Academic/Conference Sources

### USENIX SREcon
- **Conference:** Site Reliability Engineering Conference
- **Relevant Presentations:**
  - Matteo Collina - Node.js event loop optimization
  - Various talks on cascading failures and resilience

### ACM Queue
- **Journal:** ACM Queue - Practitioner-focused computing magazine
- **Relevant Articles:**
  - Scaling web applications
  - Database replication strategies

---

## Tier 5: Reputable Technical Blogs

### ByteByteGo
- **Author:** Alex Xu
- **Website:** [bytebytego.com](https://bytebytego.com)
- **Topics:** System design patterns, exponential backoff with jitter

### High Scalability
- **Website:** [highscalability.com](http://highscalability.com)
- **Topics:** Real-world architecture case studies

### InfoQ
- **Website:** [infoq.com](https://www.infoq.com)
- **Topics:** Microservices, distributed systems

---

## Concept-to-Source Mapping

| Concept | Primary Source | Secondary Source |
|---------|---------------|------------------|
| **Backpressure** | Reactive Manifesto | Node.js Streams Guide |
| **Circuit Breaker** | Nygard "Release It!" | Fowler martinfowler.com |
| **Cascading Failures** | Nygard "Release It!" | AWS Architecture Blog |
| **Temporal Coupling** | Newman "Building Microservices" | Various distributed systems literature |
| **Thundering Herd** | Wikipedia (OS context) | AWS/Google Architecture Blogs |
| **Retry Storm / Amplification** | ByteByteGo | AWS Exponential Backoff docs |
| **Read-your-writes** | Kleppmann "DDIA" Ch.5 | PostgreSQL replication docs |
| **Eventually Consistent** | Kleppmann "DDIA" | CAP theorem literature |
| **CAP Theorem** | Brewer (original), Kleppmann | Academic literature |
| **Event Loop Blocking** | Matteo Collina | Node.js official docs |
| **Load Shedding** | AWS Architecture | @fastify/under-pressure |
| **Connection Pool Starvation** | PostgreSQL docs | HikariCP documentation |
| **Fan-Out Pattern** | AWS SNS/SQS docs | Enterprise Integration Patterns |
| **Cache-Aside** | Azure Architecture | AWS ElastiCache Best Practices |
| **XFetch Algorithm** | Vattani et al. (VLDB 2015) | Wikipedia Cache Stampede |
| **GEOSEARCH/GEORADIUS** | Redis official docs | Redis 7 release notes |
| **Query Routing** | PostgreSQL docs | Prisma documentation |
| **Backpressure (Active)** | Reactive Manifesto | Reactive Streams spec |
| **Buffering/Decoupling** | Kleppmann "DDIA" | Enterprise Integration Patterns |

---

## How to Cite

When referencing these sources in documentation:

**For books:**
> As described in *Designing Data-Intensive Applications* (Kleppmann, 2017), read-your-writes consistency ensures...

**For online resources:**
> According to the Reactive Manifesto, backpressure is "a mechanism whereby systems can signal their inability to process more data"

**For talks/presentations:**
> Matteo Collina's work on Node.js event loop optimization demonstrates that...

---

*Last updated: 2026-01-15*
