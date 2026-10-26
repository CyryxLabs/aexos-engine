# ADR-AEX-009: Local Event Projection for the AEXOS Virtual Office

## Status

Accepted for AEX-3.6 on 2026-08-16.

## Context

AEXOS already emits agent, command, story, session and Bob lifecycle events, but
no shipped monitor server joins those events to the squad registry or presents
them in a truthful visual surface. Existing status files and parallel execution
maps are useful fragments, not a single authority. The dashboard must work
without an AI API and must remain subordinate to the CLI under Constitution
Article I.

The user also requires a premium, futuristic isometric office with 3D-style
agents whose jackets carry the exact Cyryx Labs logo.

## Decision

Build a dependency-free local HTTP/SSE collector and a renderer-agnostic state
projector inside `.aexos-core/core/virtual-office/`.

The projector joins complementary identity and activity truths without
conflating them:

1. The squad registry answers **which squads and squad agents exist**.
2. The canonical core agent definitions answer **which framework agents exist**.
3. Observed runtime events answer **who is working**.

The default visual renderer is semantic DOM/CSS 3D. The dashboard has no action
endpoint. It consumes `GET /api/snapshot` and `GET /api/events`; the existing
runtime emits telemetry to `POST /events`.

All mutable server and presentation thresholds live in YAML. The server binds
to loopback, redacts event data through an allowlist and never sends prompts,
environment variables or unrestricted tool output to the browser.

## Consequences

### Positive

- No AI API, cloud account, Electron runtime or frontend build is required.
- The existing port/event emitter contract becomes functional.
- All 20 registered squads and their 156 agents are rendered alongside the 12
  canonical framework agents in one AEXOS Core pod (21 pods / 168 agents).
- Accessible DOM remains available even with spatial presentation.
- A future WebGL renderer can consume the same snapshot/SSE contract.

### Negative

- CSS 3D is stylized rather than a free-camera geometric simulation.
- Host adapters that do not emit lifecycle events will show agents as available,
  never as active.
- A single-process local server is not a multi-user or remote operations center.

### Neutral

- `POST /events` mutates the observability projection but does not mutate AEXOS
  workflows; the UI remains read-only.
- The implementation does not solve model execution. It observes whichever
  runtime is already executing the agents.

## Alternatives rejected

- **React/Three.js first:** richer geometry, but unnecessary dependencies and a
  weaker accessible baseline for the first vertical slice.
- **Electron:** distribution and security cost without a required native feature.
- **Static mock dashboard:** rejected because sample activity would violate the
  user's exact-real-time requirement.
- **Polling status files only:** rejected because it loses event ordering and
  increases stale/ghost state risk.
