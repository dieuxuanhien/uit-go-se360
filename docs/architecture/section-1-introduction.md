# Section 1: Introduction

Let me first check for any existing starter templates or project context, then draft the introduction section.

Read [](file:///home/xuanhien/Documents/repo/uit-go-se360)

Searched for files matching `**/{README.md,package.json,*.config.*}`, 2 matches

Read [](file:///home/xuanhien/Documents/repo/uit-go-se360/docs/project%20brief.md)

Now I have full context. Let me draft the introduction section:

---

## **SECTION 1: INTRODUCTION**

### **1.1 Starter Template or Existing Project**

Based on my review of the repository and documentation:

**N/A - Greenfield project**

This is a greenfield academic project for the SE360 course. The UIT-Go platform will be built from scratch without reliance on existing starter templates. The team has flexibility to choose technology stacks within the constraints defined in the PRD (microservices architecture, containerization, AWS deployment, and Infrastructure as Code using Terraform).

### **1.2 Document Introduction**

This document outlines the complete fullstack architecture for **UIT-Go**, a cloud-native ride-hailing platform designed as the SE360 course capstone project. It serves as the single source of truth for AI-driven development, encompassing backend microservices, infrastructure deployment, and their integration patterns.

This architecture document addresses the unique requirements of building a distributed system that simulates real-world system engineering challenges. Unlike traditional monolithic applications, UIT-Go requires careful orchestration of multiple independent services (UserService, TripService, DriverService) with isolated databases, deployed on AWS infrastructure defined through Terraform.

The document is structured to guide development through Phase 1 (skeleton microservices foundation) and provide extensibility hooks for Phase 2 (specialized modules in Scalability, Reliability, Security, Observability, or FinOps/Automation).

### **1.3 Change Log**

| Date       | Version | Description                            | Author              |
| ---------- | ------- | -------------------------------------- | ------------------- |
| 2025-10-20 | 0.1     | Initial architecture document creation | Winston (Architect) |

---

## **Detailed Rationale:**

**Greenfield Decision:**

- The PRD and project brief clearly indicate this is an academic project built from scratch
- No existing codebase or starter template references found in documentation
- This provides maximum learning opportunity for students to make fundamental architecture decisions
- Allows flexibility in technology selection within AWS/microservices constraints

**Document Structure:**

- Focused on backend/infrastructure as the PRD explicitly states "backend system for UIT-Go"
- No frontend/mobile client implementation is required (only backend APIs)
- Architecture must support both local development (Docker Compose) and AWS deployment
- Emphasis on microservices isolation and cloud-native patterns

**Key Architectural Challenges Highlighted:**

1. **Service Isolation** - Each microservice needs independent database and deployment
2. **Real-time Location Tracking** - Driver location updates require careful technology choice (Redis vs DynamoDB)
3. **Infrastructure as Code** - Terraform is mandatory, not optional
4. **Cost vs Performance Trade-offs** - Academic budget constraints require thoughtful AWS service selection
5. **Phase 2 Extensibility** - Architecture must accommodate future specialization modules

**Assumptions Made:**

- Teams will work in monorepo structure (mentioned in PRD as recommended)
- RESTful APIs preferred for simplicity (gRPC as alternative for advanced teams)
- Three-tier architecture: API Gateway → Microservices → Databases
- AWS as the only cloud platform (not multi-cloud)

---

**Select 1-9 or just type your question/feedback:**

1. **Proceed to next section** (High Level Architecture)
2. **Expand or Contract for Audience** - Adjust detail level or target specific readers
3. **Explain Reasoning (CoT Step-by-Step)** - Walk through my thinking process in more depth
4. **Critique and Refine** - Review for flaws or improvements
5. **Analyze Logical Flow and Dependencies** - Examine structure and coherence
6. **Assess Alignment with Overall Goals** - Verify alignment with PRD objectives
7. **Identify Potential Risks and Unforeseen Issues** - Brainstorm risks in this approach
8. **Challenge from Critical Perspective** - Play devil's advocate on these decisions
9. **Tree of Thoughts Deep Dive** - Explore alternative reasoning paths

dieuxuanhien: 1

GitHub Copilot: Perfect! Proceeding to the next section.

Read [](file:///home/xuanhien/Documents/repo/uit-go-se360/.bmad-core/data/technical-preferences.md)

---
