# Story AEX-4.25: SOP Lifecycle Contracts

## Status

Done

Current original-scope acceptance (2026-10-16): Independent R3 lifecycle/runtime review;29 installed association and21 native-review regressions;fixture authority labeled Fixture authority/conformance is labeled; production organizational enrollment and universal conformance are not claimed.

Source/installed evidence is rebound to archive `300a4f64505f1778439b99a5176758db69d8dc0221ff60689066824355146936`: all 2,035 installed payload hashes and 14,727 dependency hashes match accepted bytes; packaged product code matches the checkout. Fresh frozen-baseline lint/typecheck/build and 498 suites / 11,551 tests passed; 147 tests remain skipped. The correlation test-only addition followed the full baseline and passed its affected 36-test matrix. Independent closure review: external `ordinary-integration-20261012/current-parity-readiness/original-scope-independent-review.md` (JSON SHA-256 `c6c2bee5b9cf75cfbd53d07ca43397dfb8e3019c0b5a119bf730d011222e9f9d`).

This current decision supersedes earlier generic pending/dependency wording only for the original AC contract. Broader joined SDLC, host, provider and production claims remain separately bounded. AEX-4.21/AEX-4.23 positive replacement integration and separately requested AEX-4.28 hardening remain open. No paid API, publication or product-code change was introduced.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [sop-schema-validation, workflow-compiler-tests, conformance-fixtures, deterministic-render-check, lint, typecheck, jest]

## Story

**As an** operations owner, **I want** one versioned SOP lifecycle that joins human-readable instructions with executable machine contracts, **so that** owners, branches, exceptions, approvals, and conformance evidence remain consistent over time.

## Context and dependencies

AEXOS workflow engineering already maps process definitions into contracts and dependency waves. It does not yet own a complete human/machine SOP lifecycle. The audited `aiox-sop` material provides useful requirements but is not authority for a wholesale pack import. This story extends `.aexos-core/core/workflow-engineering/` and preserves CLI-first execution, role authority, and independent acceptance.

## Acceptance Criteria

- [x] AC1: Define a versioned SOP contract with stable ID, title/purpose, owner role, scope, inputs, outputs, preconditions, ordered steps, branch conditions, dependencies, exception paths, escalation/approval roles, evidence obligations, conformance rules, effective version, and lifecycle state. Missing owner, ambiguous branch target, cycle, unknown dependency, conflicting state, or invalid approval authority fails validation.
- [x] AC2: Maintain a canonical machine contract and deterministic human-readable Markdown projection with stable anchors linking each human step, branch, exception, and approval to its machine identity. Meaningful manual edits that diverge from the canonical contract are detected rather than silently overwritten or accepted.
- [x] AC3: Support explicit Draft → Reviewed → Approved → Effective → Deprecated/Superseded lifecycle transitions with actor, timestamp, decision, prior/new version, and evidence. Authors/owners cannot self-certify independent gates where the contract requires separation; skipped or missing approval cannot yield Effective status.
- [x] AC4: Compile approved SOPs through the existing workflow-engineering map and dependency-wave boundary. Do not create another orchestrator, job pool, or browser executor. Unsupported actions remain guidance or blocked tasks; compilation does not prove execution or conformance.
- [x] AC5: Record run-time conformance events against exact SOP/version/step IDs, including completed, skipped with approved reason, exception, failed, blocked, and not-observed. Missing/stale/fixture evidence remains explicit. One successful run cannot certify all environments or future versions.
- [x] AC6: Version changes preserve prior immutable history and require a reason, compatibility impact, affected consumers, migration/supersession link, and renewed review when semantics change. Rendering-only changes are classified separately and tested for equivalent machine meaning.
- [x] AC7: Fixtures cover a straight-through SOP, conditional branches, approved exception/escalation, missing owner, broken dependency, cycle, unauthorized approval, human/machine drift, stale version, failed conformance, and valid supersession. Negative cases cannot become Effective or conformant; positive cases compile deterministically.
- [x] AC8: Record provenance for externally derived schema/fixture ideas, run focused contract/compiler/conformance tests and required repository gates, and obtain independent `@qa` review of authority, history, and negative transitions.

## Tasks / Subtasks

- [x] Define the SOP contract, lifecycle states, validation, and authority rules (AC1, AC3; component scope, production enrollment held).
- [x] Build deterministic Markdown projection and drift detection (AC2).
- [x] Integrate structural compilation with existing workflow engineering only (AC4; no execution adapter).
- [x] Bind independent native review to host enrollment, exact report/artifact bytes and a live final-commit capability guard (AC3; component and installed regression scope only).
  - [x] Rebind29 installed runtime-association and21 native-review regressions to current archive1cbb5e8b...f8662f51; independent fixture-scope reviewb6ded3a5...08dc. Production enrollment and execution acceptance remain open.
- [x] Add versioned conformance evidence and immutable supersession history (AC5–AC6).
- [x] Implement positive/negative fixtures, provenance intake, and QA evidence (AC7–AC8).

## Dev Notes

Architecture contract: `aexos-implementation/evidence/sop-4-25-design.md` in the session evidence directory. Use host-bound capability leases and private branded actor contexts; standalone JSON declarations cannot create trusted approval. Missing identity/reviewer enrollment and runtime SOP receipt association remain explicit integration gaps. Fixture-host lifecycle checks do not certify production authority. Implement the independent library/CLI work while preserving these acceptance holds.

Start with `.aexos-core/core/workflow-engineering/workflow-map.js`, `aexos workflow map`, existing task contracts, authority definitions, and event/evidence types. A machine contract may compile steps into existing workflow phases, but execution status must come from the governed runtime, not from Markdown checkboxes.

Do not import vendor-specific ClickUp/Telegram/runner integrations, persona material, or a second process engine. Keep SOP content separate from the schema/runtime so projects can own their procedures without modifying framework code.

[AUTO-DECISION] Canonical source → machine contract is canonical with deterministic human projection because it permits validation and prevents silent semantic drift; reviewed project SOP content remains project-owned.

## Testing

Assert schema and graph validation, deterministic rendering, lifecycle authority, immutable history, exact version binding, and conformance classification. Round-trip tests must prove supported human projection preserves machine identities; unsupported human edits must fail with actionable diagnostics.

## CodeRabbit Integration

Architecture / Workflow Integration, high complexity. `@dev` implements; `@qa` independently gates; `@architect` reviews lifecycle and authority boundaries. Self-healing: dev light; QA full. Focus: ambiguous branches, approval bypass, status inflation, version-history mutation, duplicate orchestration, deterministic projection, and false conformance.

## References and provenance limits

- Audit `REPORT.md` sections **Advanced Brain**, **E7**, and **Wave 3**, plus `squads-brain.md` `aiox-sop` disposition and licensing sections.
- [AEX-4.21](STORY-AEX-4.21-CRITICAL-SDLC-CONTRACTS-AND-INSTALLED-JOURNEYS.md) and [accumulated context](accumulated-context.md).

No wholesale upstream import, external workflow service, browser control, or general scheduling capability is implied.

## Story Draft Checklist

READY, clarity 9/10. All categories PASS; owner, branches, exceptions, approval authority, versions, compilation, conformance, positive/negative fixtures, and exclusions are explicit. Implementation and QA acceptance remain pending.

## PO Validation Notes

**Verdict:** GO (9/10 readiness; high confidence) for preparation only. Validated on 2026-10-10 against the PO story-validation task, accumulated context, the audit's SOP disposition, current workflow-engineering map, task-contract boundaries, and CLI authority.

- Actionability and negative paths: PASS. Contract graph validation, deterministic projection, lifecycle transitions, independent approval authority, version/supersession history, drift detection, conformance states, cycles, broken dependencies, unauthorized approvals, and stale evidence are measurable.
- Dependency hold: AEX-4.21 and its AEX-4.20 prerequisite must achieve independent acceptance before compiled SOP execution or conformance can be accepted. `Ready` permits preparation only.
- Runtime and authority: PASS. Machine contracts remain canonical, human Markdown is a deterministic projection, and compilation reuses workflow engineering. Execution evidence must come from the governed CLI runtime; no Markdown checkbox, browser control, external service, or second orchestrator can certify execution.
- Scope and provenance: PASS. Project SOP content stays project-owned; vendor integrations, persona material, scheduling claims, and wholesale upstream imports remain excluded. External schema/fixture ideas require provenance records.
- Quality boundary: Compilation is not execution, one run is not universal conformance, and independent `@qa` acceptance remains pending.

## File List

- External original-scope closure evidence: existing `ordinary-integration-20261012/current-parity-readiness/` records (`source-reuse-check-20261016.json`, `original-scope-gates-20261016.json`, `accepted-correlation-check-20261016.json`, `original-scope-independent-review.{md,json}`); backups under `before-original-scope-acceptance/`.

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.25-SOP-LIFECYCLE-CONTRACTS.md`.
- Added `.aexos-core/core/workflow-engineering/sop/{authority,compile,conformance,contract,index,lifecycle,render,store}.js`, `.aexos-core/schemas/sop-v1.schema.json`, and `.aexos-core/cli/commands/workflow/sop.js`.
- Updated `.aexos-core/cli/commands/workflow/index.js` to register the existing workflow CLI family.
- Added `.aexos-core/core/workflow-engineering/sop/runtime-association.js`; updated `.aexos-core/core/execution/{agent-runtime,workflow-runner,workflow-control-store}.js` for constructor-owned association hooks and retained dispatch/outcome evidence.
- Added `.aexos-core/core/workflow-engineering/sop/native-review.js` and `tests/unit/workflow-engineering/sop-native-review.test.js`; updated SOP `authority.js`/`index.js`, the lifecycle guide and installer manifest.
- Added `tests/unit/workflow-engineering/sop-*.js`, `tests/cli/sop.test.js`, `tests/fixtures/sop/`, `docs/guides/sop-lifecycle.md`, and this epic's `provenance/sop-intake.json`.

## QA Results

Independent component R3: **APPROVED within component scope** after correcting S1–S8 and the follow-up canonical render-only classification defect. Principal baseline passed nine suites / 102 tests; independent deeper fixture-host tests reached lifecycle and conformance beyond the initial guards. Root final corrections reject every canonical render-only revision, preserve semantic Draft progression and return not-observed for malformed resolver bindings. Combined SOP/manifest/package focused run passed eight suites / 99 tests, independently repeated. Exact hashes and probes: external `aexos-implementation/evidence/sop-4-25-review.md`, `sop-4-25-design.md` and `sop-4-25-implementation.md`. This does not establish production owner enrollment, runtime adapters, installed/native acceptance or whole-story completion.

## Change Log

### 2026-10-11 runtime continuation

The selected-runtime implementation passed 80 focused SOP tests and 64 non-SOP runtime tests, including a real deterministic native-candidate six-phase fixture. Independent review then reproduced authority changing during awaited pending retention, post-verification artifact changes, and imported association records being reused across hosts/stores. R2 independently closed the original six defect classes but reproduced two remaining terminal-lifetime failures: artifact mutation and actual capability revocation during final retention still produced accepted success. R3 must validate the exact previously checked bytes/identity and live binding after terminal awaits, and prevent already retained failed records from being eligible for conformance while preserving immutable diagnostics. Source smoke alone is not acceptance. Current exact findings and correction evidence are retained under external `aexos-implementation/continuation-20261011/evidence/sop-runtime-association-*` and `sop-runtime-independent-r2/`. Actual reviewer confinement/admission remains a separate hold documented in `sop-host-feasibility.md` and `sop-no-tools-followup.md`; no model subprocess or production lifecycle admission was enabled. Compilation remains structural and fixture conformance cannot become production conformance.

Independent runtime R3: **APPROVED within frozen source/native-fixture scope**. Both terminal-lifetime findings are closed. The complete association suite passed 29/29, seven independently authored real-native probes passed, and focused regressions passed 37/37: 73 tests without skips. Scoped lint/typecheck pass, and all eleven source hashes match before/after. Ineligible completed records remain diagnostic and cannot mint conformance. Exact report: external `continuation-20261011/evidence/sop-runtime-independent-r3/review.md`, SHA-256 `92b7410c80e90d382ce56bfa7f6b0c27764a79c3cd4db885859dcfeee9f6df1b`. Budget settlement is a synchronous boundary, not an invented awaited API. Installed/global, production reviewer and whole-story acceptance remain separate.

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-10 | 0.1 | Draft human/machine SOP lifecycle story. | Chronos / `@sm` |
| 2026-10-10 | 0.1.1 | Validated GO (9/10) for preparation — Status: Draft → Ready; AEX-4.20/AEX-4.21 acceptance remains gating. | @po |

### 2026-10-11 protected-environment authorization

The user explicitly authorized preparing a protected environment and the administrative validation needed for Windows error 1314, and resolving SOP with independent review and no additional paid APIs. This supersedes earlier statements that administrative environment changes were not authorized. Product automatic elevation, production support enablement, release/push and arbitrary permanent policy/account changes are not inferred. The current continuation first prepares exact reviewable provisioning/validation artifacts, obtains independent security review, and records actual UAC/process/privilege effects separately from product acceptance. Evidence lives under external `continuation-20261011/host-resolution-20261011/authorized-environment-20261011/`. Prior tested and installed candidates remain preserved; neither administrative authorization nor prerequisite success closes whole-story acceptance.

The corrected external SOP deterministic canary received independent R5 approval. Driver SHA256 `40DAC160FBD34658D4D3877746FB36DE6C135F44AF9182499DFC88C157A61449`; report SHA256 `1FC18353AEFEDAEDBF83348CE284C81DEC78B00EA205DA03CCB3668BFE464916`. All 23 focused tests and 21 independent mocked observations passed; 20 manifest and 53 freeze entries matched unchanged. Closure covers fragmented raw/encoded disclosure, failure/deadline latching, bounded output/frame retention, authority revalidation after terminal cleanup, and late output retained through child close or its bounded deadline. These are external harness corrections, not new product/native acceptance. Live execution remains held: second-home setup can rotate shared sandbox-account passwords, existing backend reuse may refresh ACLs/auto-repair, and a supported final pre-provider assembled tool/instruction admission boundary has not been established. No live SOP/provider call or additional paid API was used. Evidence: external `authorized-environment-20261011/sop/independent-review/r5/review.md` and `sop/deployment-discovery/backend-reuse-decision.md`.

### 2026-10-11 native review integration and installed verification

The native review adapter now binds a constructor-enrolled reviewer to the exact Draft, nonce, bundle, observed native dispatch, hashed structured report, verification, retention and capability leases. A private synchronous commit guard revalidates those facts immediately before lifecycle persistence. Independent R2 review reproduced and closed both original defects: terminal report/contract mutation or lease revocation no longer persists Reviewed, and contradictory report/envelope decisions cannot override the report bytes. Report SHA256: 8CCCBF032C3D12CE0E3E687D791827ACD0596F4418596C91A94D2337B990B788; focused independent run: 26/26 passing tests.

Three actual native collaboration reviews were observed through trusted root stdin. The defective seed was rejected and remained Draft. The initially named corrected seed was also rejected for genuine side-effect and content-verification deficiencies; its failed result is preserved. A fresh corrected contract declares the write, aligns input names, requires per-step approval and content-fidelity verification, and blocks execution without the necessary adapters. A new reviewer accepted that exact contract using a new nonce, and the installed package persisted only Reviewed. The positive report hash is c3ae26940154d41c7f3254e69229cc875bdc18bb1a66f5fdcd7ababaadffd0a9. Framework lifecycle gates remain separate from process branches; no approval, activation or execution was performed.

The native tool exposed canonical task handles, not UUIDs or model identity. An independently approved trusted-root mapping preserves each exact handle and maps it unambiguously to the bounded dispatch identifier. The report, original handle, mapping, nonce and bundle remain retained. This establishes observed native review linkage within fixture assurance, not malicious same-owner confinement or production-store qualification.

Required final-source gates passed: lint with zero errors and 267 existing warnings, typecheck, build, manifest generation/validation, and 492 Jest suites / 11,506 tests. Eleven suites / 147 tests remain skipped. Archive 7402b29d1a8315834de2b8c466f5af7b003487fd265d069c5486db2b153e4a4f (45,183,154 bytes; 2,026 payload files) installed in an isolated consumer with exact payload verification; all 21 installed native-review component regressions passed. The first external installed-test harness attempt had a Windows path-escaping error before any assertion; only path rebasing was corrected, and the original failure is retained. Product module hashes match source and installed candidate. Subsequent story/context closure edits are documentation deltas after this archive, not a different tested product.

Evidence: external authorized-environment-20261011/next-resolution/final-evidence.json, sop-native-review-review/r2/, sop-native-review/native-live/, sop-native-review-r3/, gates-r2/ and installed-proof/. AEX-4.21/4.28, production enrollment, runtime adapters and execution conformance remain explicit whole-story dependencies.

### 2026-10-12 current installed SOP rebind

The current archive 1cbb5e8b3686829ada891ccfe33fa7c84ac778a40b26e88430c7e310f8662f51 passed29 installed runtime-association tests without skips, including a retained six-phase accepted fixture with six dispatches/outcomes and seven hash-verified artifacts. Its21 installed native-review component regressions also pass. The test harnesses use the exact installed product modules; test infrastructure comes from the repository development dependency. Native-review transport, identity, verification and retention callbacks remain injected fixtures, not an observed provider session or production enrollment.

Independent review research-sop-independent-review/review.md SHA256 b6ded3a503181654ad8c9d569ef7d942faa546bc9415c84d9daa2069933908dc accepts the bounded rebind and transformations. The joint research/SOP binding contains17 source/installed module hashes; product sources are unchanged and prior current-candidate global gates remain applicable. This is fixture conformance only. Approval/activation of a production SOP, production reviewer/store qualification, native protected replacement/recovery and whole-story acceptance remain open.

Evidence pointer: external ordinary-integration-20261012/research-sop-rebind.json; raw association output under C:/Users/ppetr/AppData/Local/Temp/aexos-research-sop-rebind-5qM70Z/evidence/installed-sop-vVMQLs/ and native-review-jest.json in its parent run root.

