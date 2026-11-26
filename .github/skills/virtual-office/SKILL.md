---
name: virtual-office
description: 'Work safely in the Virtual Office workspace. Use for project setup, code changes, frontend implementation, debugging, testing, and documentation in this repository.'
argument-hint: 'Describe the Virtual Office change or task'
user-invocable: true
disable-model-invocation: false
---

# Virtual Office Workspace Workflow

## When to Use

Use this skill when working in the Virtual Office repository for implementation, debugging, UI changes, setup, testing, or documentation.

## Procedure

1. Inspect the repository structure before changing files.
2. Identify the existing package manager and frameworks from manifests and configuration files.
3. Reuse current components, conventions, styling patterns, and scripts instead of introducing new tooling.
4. Make the smallest complete implementation for the requested behavior.
5. Run the narrowest relevant validation command, such as a focused test or build.
6. Review the final diff and summarize exactly what changed and how it was verified.

## Repository Guidelines

- Preserve existing behavior unless the request explicitly changes it.
- Keep changes responsive and accessible for frontend work.
- Prefer semantic HTML and existing design-system patterns.
- Avoid unrelated cleanup or dependency changes.
- Do not add planning or tracking documents unless the user requests them.

## Architecture and OOP

- Prefer a monolithic, layered architecture when adding application structure: keep the app as one deployable unit and separate presentation, application, domain, and infrastructure responsibilities where the project’s stack supports them.
- Keep dependencies flowing toward core business rules; domain logic should not depend on UI or infrastructure details.
- Follow the architecture and conventions already present in the repository. Do not introduce layers or patterns that the project does not need.
- Use OOP features to make responsibilities clear: encapsulate state, model meaningful domain concepts, and use interfaces/abstractions and polymorphism where they reduce coupling.
- Prefer composition over deep inheritance. Apply SOLID principles pragmatically; avoid speculative abstractions, unnecessary class hierarchies, and design patterns without a concrete use case.
- Since this workspace may not yet contain application code, confirm the language, framework, and established structure before prescribing project-specific OOP patterns.

## Virtual Office Architecture Reference

This is a planning reference, not an adopted stack. Confirm product requirements and user approval before introducing these technologies or creating the architecture.

- **Frontend and space:** React or Next.js with TypeScript; Phaser or PixiJS for 2D, or Three.js / React Three Fiber for 3D; Tailwind CSS for UI styling.
- **Realtime:** WebSockets with Socket.IO or Colyseus for movement, presence, and chat. Use a managed WebRTC provider such as LiveKit, Daily, or Agora for voice/video rather than building media infrastructure.
- **Backend and data:** Node.js with NestJS/Express or Python with FastAPI; PostgreSQL for durable application data and Redis for presence, sessions, or pub/sub as needed.
- **AI:** An LLM API for coworker conversations; an agent framework only when workflows require it; pgvector or a dedicated vector database for retrieval when knowledge search is needed. Add speech services and MCP/function calling only for approved voice or external-tool integrations.
- **Infrastructure:** Docker and a hosting provider suited to the deployment; object storage/CDN for assets; GitHub Actions for CI/CD.
- **Illustrative starter option:** Next.js + Phaser + Socket.IO + FastAPI + PostgreSQL/pgvector + LiveKit + an LLM API. Treat this as a candidate, not a default mandate; start with fewer services when they meet the requirements.

## Suggested Implementation Stages

Treat these as planning gates, not a commitment to implement every capability. Validate each stage with the user and keep the system runnable before advancing.

1. **Define the MVP:** Clarify target users, core workflows, 2D versus 3D, deployment constraints, privacy, and success criteria. Choose the simplest compatible stack and explicitly defer nonessential integrations.
2. **Build the app foundation:** Set up the frontend, backend, configuration, local development workflow, and basic CI. Establish clear presentation, application, domain, and infrastructure boundaries inside a monolith.
3. **Deliver the virtual office MVP:** Implement sign-in if needed, office/room navigation, avatars and movement, basic presence, and text chat. Start with one deployable application and the minimum required persistence.
4. **Add reliable realtime behavior:** Implement authoritative room membership and movement updates, reconnect handling, validation, and tests. Introduce Redis or a separate realtime service only when deployment or measured load justifies it.
5. **Add voice/video:** Integrate a managed WebRTC service after the core collaboration experience works. Address consent, permissions, room access, and failure states.
6. **Introduce AI coworkers:** Start with a clearly scoped role and bounded tasks. Add tool calling, retrieval/memory, or voice incrementally, with authorization, human oversight, cost limits, and observability.
7. **Harden and deploy:** Review security and privacy, accessibility, performance, backups, monitoring, and recovery. Deploy through the chosen hosting setup and validate real usage before scaling or splitting services.

## Validation

- Inspect package scripts before choosing a test or build command.
- Use the project’s existing lint, test, and build tools.
- Verify both successful output and relevant edge cases.
- If validation is unavailable, clearly state what could not be checked.
