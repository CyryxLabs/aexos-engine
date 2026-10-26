# AEXOS 6.0 — Three-Sprint Execution Program

**Status:** Approved — implementation in progress  
**Decision date:** 2026-09-04  
**Release candidate:** `6.0.0-alpha.1`  
**Stable release:** `6.0.0` only after all exit gates pass  
**Canonical epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Architecture:** [Wave 1](./ARCHITECTURE-WAVE-1.md) · [Wave 2](./ARCHITECTURE-WAVE-2.md) · [Wave 3](./ARCHITECTURE-WAVE-3.md)

## Decision

AEXOS remains the same CLI-first, story-driven, task-first orchestration
framework. Version 6 extends the existing deterministic layer with a real
execution boundary, governed capabilities and authenticated squad delivery.
It does not replace the constitution, agent authority model, task corpus,
squad source-of-truth rules or IDE projections.

The current published package is `@aexos/core@5.3.0`. Versions `1.0` and `1.3`
would move the public package backwards and are therefore invalid. The first
testable build of this program is named `6.0.0-alpha.1`; the stable `6.0.0`
version is reserved until the release gate in Sprint 3.

The three sprints below are dependency-ordered implementation waves, not a
calendar promise. A sprint closes only when its objective evidence is green.

## Product boundary

### Core Free

The freely installable core contains:

- the deterministic orchestration engine;
- the 12 software-delivery agents already defined in
  `.aexos-core/development/agents/`;
- the Security & Cybersecurity Assessment squad;
- task contracts, governance, proof and local CLI diagnostics needed to run
  those agents honestly.

### Paid Squad Library

All non-Core domain squads are delivered as signed artifacts after server-side
entitlement validation. A client-side feature flag is never represented as a
security boundary. Existing copies of `5.3.0` cannot be retroactively revoked;
the enforceable boundary applies to artifacts delivered by the 6.x service.

The Stripe account may serve more than AEXOS. AEXOS uses product-scoped price,
entitlement and webhook metadata and must never infer access from a
customer-wide payment alone.

## Sprint 1 — Truthful Agentic Execution

**Outcome:** AEXOS can dispatch work through one required runtime boundary and
cannot report a successful task when no executor ran.

| Story | Deliverable | Exit evidence |
|---|---|---|
| AEX-1.1 | Machine-checkable task contract and migration report | Schema tests; deterministic coverage report; undeclared outputs rejected in strict mode |
| AEX-1.2 | Required `AgentRuntime` plus provider adapter | Missing runtime fails; provider result is normalized; no `pending_dispatch` success path |
| AEX-1.3 | DAG waves connected to runtime with bounded concurrency | Measured concurrency bound; independent tasks overlap; output conflicts block |
| AEX-1.4 | Governance on every runtime dispatch | Story, budget and intent checks execute before provider call; approvals and rejections are recorded |

Sprint 1 starts in contract `warn` mode so legacy tasks remain readable while
coverage is migrated. Stable 6.0 requires strict mode and 100% of executable
Core tasks contracted. An uncontracted task is scheduled serially and never
assumed conflict-free.

## Sprint 2 — Hands, Security, Workflow and Cerberus

**Outcome:** agents receive explicit, revocable capabilities; Security and
Workflow Engineering become first-class squads; Cerberus is integrated through
a bounded gateway rather than copied into the orchestration core.

| Story | Deliverable | Exit evidence |
|---|---|---|
| AEX-2.6 | Capability and secrets broker | Least-privilege leases, expiry, revocation and audit tests |
| AEX-2.7 | Core Security squad | Six canonical agents, assessment workflow and PASS / CONCERNS / FAIL gate |
| AEX-2.8 | Workflow Engineering squad | Process discovery → workflow map → task contracts → automation candidates → QA |
| AEX-2.9 | Cerberus gateway | Authenticated ingestion and knowledge-query contracts with timeout, retry, provenance and fail-closed behavior |
| AEX-2.10 | Durable missions and checkpoints | Restart/resume test without duplicate side effects or lost evidence |

Cerberus is considered **implemented** only when an AEXOS CLI mission can ingest
a fixture through the gateway, receive a provenance-bound result and resume a
failed run. Documentation or copied agents alone do not satisfy this gate.

## Sprint 3 — Paid Distribution and Release Certification

**Outcome:** the free Core and paid Squad Library are technically separated,
licensed, recoverable and operationally supportable.

| Story | Deliverable | Exit evidence |
|---|---|---|
| AEX-3.7 | Core Free package manifest | Clean-machine pack/install proves paid squad source is absent |
| AEX-3.8 | Signed paid squad artifact service | Expired, revoked, wrong-product and tampered artifacts are rejected |
| AEX-3.9 | AEXOS-scoped Stripe entitlement reconciliation | Checkout, Portal, `invoice.paid`, refund, dispute, chargeback, pause, duplicate and recovery tests |
| AEX-3.10 | Offline cache and machine lifecycle | Grace, clock rollback, machine transfer and revocation behavior certified |
| AEX-3.11 | Shadow → restricted beta → enforce | 20 complete sandbox cycles and rollback evidence before `legacy` changes |
| AEX-3.12 | `6.0.0` release certification | Clean install, CLI smoke, full quality gates, package inspection and release notes |

## Cross-sprint invariants

1. CLI is the primary control surface; UI remains observational.
2. Every implementation dispatch binds to an active story and declared budget.
3. Every tool capability is explicit, scoped, revocable and auditable.
4. A task cannot close from the executor's claim alone; verification evidence is
   evaluated independently.
5. Canonical agents and squads remain in their existing source-of-truth paths;
   IDE files stay generated projections.
6. No secret, Stripe signing key or private squad payload is committed.
7. No version tag, npm publish, push, PR or Production promotion occurs before
   the matching `@devops` gate and explicit authority.

## Program completion gate

The program is complete only when:

- all Sprint 1–3 stories are `Done` with QA evidence;
- `npm run lint`, `npm run typecheck`, `npm test` and the package build pass on
  a clean checkout;
- a clean machine can install Core Free and execute a governed fixture mission;
- an entitled account can acquire a signed paid squad and a non-entitled
  account cannot acquire it;
- Cerberus passes its ingestion, provenance, failure and resume probes;
- the commercial lifecycle completes 20 sandbox cycles and survives the
  specified failure matrix;
- `6.0.0` manifests agree across every version authority listed in the release
  procedure.

## Explicit non-claims

- This plan does not claim that every business domain is already automated.
- A squad definition is not equivalent to a working external integration.
- Local tests are not Stripe Preview certification or Production approval.
- `6.0.0-alpha.1` is a candidate name until its version change is performed by
  `@devops`; it is not a published release.

