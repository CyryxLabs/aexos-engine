# STORY-AEX-2.9 — Governed Cerberus Gateway

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Related epic:** [Cerberus Knowledge Plane](../cerberus-knowledge-plane/EPIC-CERBERUS-KNOWLEDGE-PLANE.md)  
**Status:** Done  
**Executor:** `@dev`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Depends on:** AEX-1.4 and AEX-2.6 (`Done`)

## Story

As an AEXOS operator, I want ingestion and knowledge queries to cross one
authenticated, bounded Cerberus gateway so that Cerberus contributes knowledge
without becoming a second orchestrator, provider router, identity authority or
release surface.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | A versioned `aexos.cerberus/v1` contract admits only `ingest` and `query`; unknown versions, operations, malformed payloads and mismatched response correlation fail closed with stable errors. |
| AC2 | Every call requires a verified `cerberus.knowledge` capability lease bound to exact agent, task, action, worker resource and project scope before the transport starts. Tokens and raw content never appear in receipts or errors. |
| AC3 | The gateway uses one injected transport boundary, preserves request/idempotency identity across retry, applies bounded output and timeout limits, supports cancellation and retries only configured transient failures. |
| AC4 | Successful responses require worker version, source/corpus SHA-256 and processing time; the returned receipt is provenance-bound and sanitized. A worker claim without valid provenance is rejected. |
| AC5 | A subprocess adapter resolves explicit worker files cross-platform, never uses a shell, bounds stdout/stderr, kills the child on timeout/cancel and maps spawn, exit, protocol and overflow failures to stable codes. |
| AC6 | `aexos cerberus ingest|query <request.json> --worker <path>` works fully through CLI, creates a short process-local lease for that explicit invocation and never installs or silently discovers Cerberus. |
| AC7 | Tests prove success, capability denial/mismatch, unsupported input, timeout, cancel, retry, response spoofing, invalid provenance, bounded output and real fake-worker ingest/query without network or credentials. |
| AC8 | Core remains functional when Cerberus is absent; no Cerberus CLI, agents, squads, hooks, registries, providers or installer are copied into AEXOS, and all repository gates pass. |

## Tasks / Subtasks

- [x] Implement the versioned request/response contract (AC: 1, 4)
- [x] Implement the capability-gated transport-neutral gateway (AC: 2–4)
- [x] Implement bounded cross-platform subprocess lifecycle (AC: 3, 5)
- [x] Add CLI ingest/query through the canonical gateway (AC: 6, 8)
- [x] Add contract, gateway, subprocess and CLI tests (AC: 1–8)
- [x] Run focused and repository gates; update story and QA record (AC: 8)

## Dev Notes

- This story adapts the CKP.1/CKP.2 boundary into the Release 6.0 sequence. It
  does not copy the upstream Cerberus checkout and does not yet implement the
  native four-format local storage plane described by CKP.3.
- The worker is replaceable and subordinate. AEXOS retains identity, story,
  budget, provider, event and release authority.
- CLI lease issuance is allowed only for the explicit foreground invocation,
  exact worker path and exact project scope; it is not durable authorization.
- No Git, PR, tag, publish, external scan or Production operation is authorized.

## Testing Requirements

```powershell
npx jest tests/core/cerberus/cerberus-contract.test.js tests/core/cerberus/cerberus-gateway.test.js tests/integration/cerberus-subprocess.test.js tests/integration/cerberus-cli.test.js --runInBand
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
npm audit --json
```

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story consolidated from the approved AEX-2.9 outcome and CKP.1/CKP.2 boundaries | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (8/8); single-gateway and subordinate-worker boundaries accepted | @po / @architect |
| 2026-09-04 | 0.3.0 | Development started — Status: Ready → InProgress | @dev |
| 2026-09-04 | 1.0.0 | Contract, gateway, subprocess transport and CLI completed — Status: InProgress → InReview | @dev |
| 2026-09-04 | 1.0.1 | Independent QA PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Debug Log References

- Focused Cerberus gate: 4 suites, 27 tests passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Full regression: 412 suites / 10,101 tests passed; 12 suites / 163 tests skipped; exit 0.
- `npm run build`: publish safety gate passed with 3,626 packaged files and no paid `pro/` content.
- `npm audit --json`: zero known vulnerabilities across 679 dependencies.
- CLI help probes passed for `cerberus` and `cerberus ingest`.
- `git diff --check`: passed.

### Completion Notes

- Added a strict `aexos.cerberus/v1` ingest/query contract with correlated responses, bounded payloads and mandatory provenance.
- Added a transport-neutral gateway that verifies an exact `cerberus.knowledge` capability lease before any worker call and emits only sanitized receipts.
- Added bounded retry, timeout, cancellation and output handling while preserving request and idempotency identity.
- Added a shell-free explicit subprocess adapter with a minimal environment; cancellation and overflow wait for worker/stdio closure before returning.
- Added `aexos cerberus ingest|query` without installing, discovering or elevating an external Cerberus worker.
- Proved the boundary end to end with a local fake worker and no network or credentials.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-2.9-CERBERUS-GATEWAY.md` (added)
- `.aexos-core/schemas/cerberus-gateway-v1.schema.json` (added)
- `.aexos-core/core/cerberus/cerberus-contract.js` (added)
- `.aexos-core/core/cerberus/cerberus-gateway.js` (added)
- `.aexos-core/core/cerberus/subprocess-transport.js` (added)
- `.aexos-core/core/cerberus/index.js` (added)
- `.aexos-core/cli/commands/cerberus/index.js` (added)
- `.aexos-core/cli/index.js` (modified)
- `bin/aexos.js` (modified)
- `tests/core/cerberus/cerberus-contract.test.js` (added)
- `tests/core/cerberus/cerberus-gateway.test.js` (added)
- `tests/integration/cerberus-subprocess.test.js` (added)
- `tests/integration/cerberus-cli.test.js` (added)
- `tests/fixtures/cerberus-worker.js` (added)

## QA Results

### Gate

**PASS** — AC1–AC8 are covered by contract, gateway, subprocess, CLI and full
repository regression evidence. See
`docs/qa/gates/AEX-2.9-cerberus-gateway.yml`.

### Residual risk

This story proves the governed AEXOS boundary against a deterministic local fake
worker. It does not ship or certify a production Cerberus worker, native
PDF/DOCX/video extraction or the CKP.3 local storage plane. AEX-2.10 restart and
resume is still required before the release program can call Cerberus recovery
complete; the AEXOS 6.0 release remains pre-stable.
