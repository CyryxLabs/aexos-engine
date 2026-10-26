# Story AEX-4.26: Correlated Read-only Observability

## Status

Done

Current original-scope acceptance (2026-10-16): Read-only correlation implementation and existing independent R2/installed CLI evidence are accepted. The real six-phase runtime now projects one accepted/live-runtime/local-declared-checks row with six exact phases and seven actual hash/byte/source-linked artifacts. Projection preserves the original receipt and a serialized copy downgrades to completed-unaccepted/unverified-import; two affected suites / 36 tests pass.

Source/installed evidence is rebound to archive `300a4f64505f1778439b99a5176758db69d8dc0221ff60689066824355146936`: all 2,035 installed payload hashes and 14,727 dependency hashes match accepted bytes; packaged product code matches the checkout. Fresh frozen-baseline lint/typecheck/build and 498 suites / 11,551 tests passed; 147 tests remain skipped. The correlation test-only addition followed the full baseline and passed its affected 36-test matrix. Independent closure review: external `ordinary-integration-20261012/current-parity-readiness/original-scope-independent-review.md` (JSON SHA-256 `c6c2bee5b9cf75cfbd53d07ca43397dfb8e3019c0b5a119bf730d011222e9f9d`).

This current decision supersedes earlier generic pending/dependency wording only for the original AC contract. Broader joined SDLC, host, provider and production claims remain separately bounded. AEX-4.21/AEX-4.23 positive replacement integration and separately requested AEX-4.28 hardening remain open. No paid API, publication or product-code change was introduced.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [correlation-contract-tests, read-model-fixtures, authorization-negative-tests, privacy-redaction-tests, lint, typecheck, jest]

## Story

**As an** AEXOS operator, **I want** a read-only correlated view from story through run, task, artifact, and gate, **so that** I can diagnose delivery state without giving a dashboard execution or approval authority.

## Context and dependencies

AEXOS already has Virtual Office, graph dashboard, event, and CLI observability primitives. Correlation is partial, and the current audit found no cohesive evidence model. The dashboard reference includes useful read models but also browser agent launch/cancel, workflow controls, process pools, demos, and weak boundaries. This story adds one canonical read model over AEXOS runtime evidence and preserves CLI/Master authority.

## Acceptance Criteria

- [x] AC1: Define a versioned read-only correlation contract linking stable story, workflow/run, phase/task, workspace/owner, artifact, verification/gate, acceptance, recovery, and provider identity fields when exposed. Each record preserves source event/artifact identity and exact status provenance; unresolved links remain explicit rather than guessed.
- [x] AC2: Project existing canonical events and artifacts into the correlated read model without creating a second execution ledger or mutating source evidence. Duplicate, reordered, delayed, missing, incompatible, or corrupt events produce deterministic partial/stale/error states and never fabricate completion.
- [x] AC3: Distinguish configured, queued, running, blocked, failed, completed-unaccepted, accepted, cancelled, recovered, simulated, fixture, legacy, missing, and stale evidence where supported. A green UI/status requires required gate and acceptance evidence for the exact run/artifact, not merely a successful command or source file presence.
- [x] AC4: Expose the correlation model through existing CLI/read-only observability surfaces with bounded filtering and deterministic export. The surface has no launch, cancel, retry, approve, merge, publish, capability grant, secret entry, workflow mutation, or process-pool controls. Attempts to invoke control operations are absent or denied by tests.
- [x] AC5: Preserve privacy and project confinement: redact secrets/tokens, avoid prompt/source payloads by default, retain only approved metadata and artifact links, and prevent cross-project correlation without explicit authorized scope. Malicious event fields render as inert data.
- [x] AC6: Fixtures cover a successful accepted journey, execution failure, gate rejection, missing artifact, interrupted/recovered run, duplicate/out-of-order events, stale evidence, fixture/simulation, legacy partial data, unknown IDs, and malicious content. The displayed/exported state matches canonical evidence and missing inputs remain visible.
- [x] AC7: Reuse Virtual Office, graph, and event boundaries; do not transplant dashboard control code, add a second scheduler, or claim cron/webhook/job-pool equivalence. Performance limits for bounded histories and large artifact sets are measured with deterministic fixtures.
- [x] AC8: Run correlation, authorization, redaction, stale/partial, determinism, and performance tests plus required repository gates. Independent `@qa` traces representative read-model rows back to exact source fixtures and confirms the observer-only boundary.

## Tasks / Subtasks

- [x] Define stable correlation identities, states, and source provenance (AC1–AC3).
- [x] Add bounded CLI/read-only projections and deny/omit control operations (AC4).
- [x] Apply privacy, confinement, and hostile-data rendering rules (AC5).
- [x] Build lifecycle, missing/stale, ordering, and scale fixtures (AC6–AC7 component; 5,000-event and 2,000-artifact bounds independently checked).
- [x] Run source-trace and observer-boundary QA (AC8).
  - [x] Independently reconcile the installed same-project import, seven artifacts, read-only graph and denied controls; retain foreign-project exclusion as a negative (2026-10-13; imported evidence remains unaccepted).

## Dev Notes

Implementation contract (2026-10-10): extend the existing Virtual Office CLI with an offline `correlate` read command and a pure bounded projection/graph adapter. Add an optional producer envelope to selected SDLC receipts with a fresh attempt UUID, canonical project digest, exact story hash, timestamps and required phase identities. A run-plan hash is not a unique run ID. Imported JSON remains an unverified declaration; only an immutable receipt actually returned by the current runtime process can retain live-runtime provenance, and even that proves declared local checks only. Legacy receipts without an envelope remain unresolved. Default exports include allowlisted metadata/digests, never prompt, source or raw runtime payloads. No new ledger, write command, server control, scheduler, provider call or artifact publication is introduced. Existing installed/native holds remain explicit.

Inspect `.aexos-core/core/virtual-office/`, `.aexos-core/core/graph-dashboard/`, `.aexos-core/core/events/`, existing CLI routes, and AEX-4.21 evidence identities before designing new types. Prefer projection adapters over source event rewrites. Coordinate any shared event schema change with story owners and preserve existing consumers.

[AUTO-DECISION] Control-plane parity → intentionally unsupported in browser/read models; existing governed CLI paths retain operator actions.

## Testing

Use immutable fixture event streams and compare exact read-model/export results. Assert that removing any required gate/artifact downgrades state; adding an unrelated successful event does not restore it. Test no write-capable route or UI action appears in the observability contract.

## CodeRabbit Integration

Integration / Security / Observability, high complexity. `@dev` implements; `@qa` independently gates; `@architect` reviews the read-only boundary. Self-healing: dev light; QA full. Focus: false-green projection, ID collision, stale/missing evidence, cross-project leakage, secret disclosure, HTML/script injection, and hidden controls.

## References and provenance limits

- Audit `REPORT.md` sections **AIOX Dashboard**, **E10**, and **Wave 4**, plus `dashboard-research.md`.
- [AEX-3.6 Virtual Office](STORY-AEX-3.6-VIRTUAL-OFFICE.md), [AEX-4.21](STORY-AEX-4.21-CRITICAL-SDLC-CONTRACTS-AND-INSTALLED-JOURNEYS.md), and [accumulated context](accumulated-context.md).

The reference dashboard has no root license and includes control surfaces; no UI/runtime code reuse or parity claim is authorized without separate provenance review.

## Story Draft Checklist

READY, clarity 9/10. All categories PASS; correlation fields, state semantics, observer-only boundary, privacy, fixtures, and evidence trace are testable. Implementation and QA acceptance remain pending.

## PO Validation Notes

**Verdict:** GO (10/10 readiness; high confidence) for preparation only. Validated on 2026-10-10 against the PO story-validation task, the CLI-first constitution, accumulated context, the audit's dashboard disposition, existing Virtual Office/graph/event seams, and AEX-4.21 evidence identities.

- Actionability and evidence: PASS. Stable correlation identities, exact provenance, partial/stale/error states, accepted versus completed-unaccepted semantics, out-of-order/duplicate/corrupt fixtures, privacy, confinement, deterministic export, and performance bounds are testable.
- Dependency hold: AEX-4.21 and its AEX-4.20 prerequisite require independent acceptance before this story can claim an accepted correlated delivery view. Evidence from AEX-4.22-4.25 is consumed only when available and accepted; missing inputs remain visible. `Ready` permits preparation only.
- CLI/read-only authority: PASS. Launch, cancel, retry, approve, merge, publish, grant, secret entry, workflow mutation, and process-pool controls are explicitly absent or denied. Governed CLI/Master paths retain all operator authority.
- Runtime reuse and provenance: PASS. The story projects existing events/artifacts through Virtual Office and graph boundaries, creates no execution ledger or scheduler, and forbids unlicensed dashboard code reuse or control-plane parity claims.
- Quality boundary: A green projection requires exact artifact, gate, and acceptance evidence. Fixture, simulation, legacy, missing, and stale states cannot be inflated; independent `@qa` observer-boundary acceptance remains pending.

## File List

- External original-scope closure evidence: existing `ordinary-integration-20261012/current-parity-readiness/` records (`source-reuse-check-20261016.json`, `original-scope-gates-20261016.json`, `accepted-correlation-check-20261016.json`, `original-scope-independent-review.{md,json}`); backups under `before-original-scope-acceptance/`.
- Updated `tests/core/execution/workflow-runner.test.js` with live accepted correlation, actual artifact hash/byte/source-pointer checks, nonmutation and imported-copy downgrade.

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.26-CORRELATED-READ-ONLY-OBSERVABILITY.md`.
- Added `.aexos-core/core/virtual-office/correlation.js`, `correlation-cli.js`, `tests/unit/virtual-office/correlation.test.js`, `docs/guides/correlated-observability.md`, and this epic's `provenance/correlation-intake.json`.
- Updated existing `.aexos-core/core/virtual-office/cli.js` and `.aexos-core/core/execution/workflow-runner.js`; added producer/origin regression coverage in `tests/core/execution/workflow-runner.test.js`.

## QA Results

Continuation coverage review approved the additional maximum-artifact fixture: 2,000 artifact/source/observation links, a 2,001-node/2,000-edge graph, deterministic output, unchanged input, explicit unaccepted imported provenance and fail-closed overflow. The independent 14-test run measured projection plus graph at 114.0493 ms against the 5,000 ms fixture bound. This is a local deterministic measurement, not a customer performance claim. Exact hashes and evidence: external `continuation-20261011/evidence/acceptance-coverage-review.md`. Final package/gates and dependent accepted delivery remain separate.

Independent component R2: **APPROVED within component scope**. Twelve previous and three new controls passed, including deterministic live/import duplicate handling, failed-check and event-conflict downgrade, credential-like identifier rejection, unknown/foreign scope and exact artifact observation pointers. Root correction tests passed 29 cases; combined brownfield/correlation independent review passed 124 tests in 11 suites, excluding one native-publication test. Exact source hashes and probes: external `aexos-implementation/evidence/correlation-4-26-review.md`. Imported, fixture and live-runtime provenance remain distinct. Required combined gates, installed acceptance and whole-story closure remain pending.

## Change Log

### 2026-10-13 installed context correction

The first candidate-rebind harness used a different project root and correctly excluded the original receipt; its zero rows did not mean artifacts were missing. The corrected external harness uses the retained original project context without changing receipt identity or any of its seven artifact hashes. Installed CLI evidence shows one row, eight graph nodes, seven edges, five operator-control denials, unchanged source/sentinel bytes, and a separate foreign-project zero-row/one-exclusion control. Imported provenance stays `unverified-import`, `completed-unaccepted`, and `declared-only`. Independent review accepted this scope in external `ordinary-integration-20261012/correlation-correction/` and `correction-independent-review/review.md` (SHA-256 `32dd2112c2cdc55c33aba277cac1a48b82ab55b24a5405ff7353369fad77b64c`). No product change was required; final candidate and dependent native delivery acceptance remain open.

### 2026-10-11 installed continuation

Actual root CLI verification on isolated archive `35c1744381ad929d71dc84dd2b956981e28d0c75777d436542c336761a2edc00` projected the retained six-phase greenfield receipt with seven correctly traceable artifacts and an eight-node/seven-edge graph. The serialized receipt remained `completed-unaccepted`, `declared-only`, and `unverified-import`; import did not restore private live-runtime authority. Launch, cancel, approve, publish and grant options were refused, and source evidence bytes were unchanged. Retained receipt: external `aexos-implementation/continuation-20261011/evidence/installed-correlation-lqj52x/receipt.json`. The first harness attempt supplied the outer journey wrapper rather than the workflow receipt and correctly received a legacy projection; the corrected harness selects `outcome.receipt`. Final candidate verification remains distinct from this earlier-archive proof and is retained alongside it. Native/provider/whole-story acceptance is not claimed.

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-10 | 0.1 | Draft correlated observer-only evidence story. | Chronos / `@sm` |
| 2026-10-10 | 0.1.1 | Validated GO (10/10) for preparation — Status: Draft → Ready; accepted upstream evidence remains gating. | @po |

