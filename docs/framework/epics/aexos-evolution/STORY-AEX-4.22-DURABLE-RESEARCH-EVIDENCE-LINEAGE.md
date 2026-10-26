# Story AEX-4.22: Durable Research Evidence Lineage

## Status

Done

Current original-scope acceptance (2026-10-16): Independent R3 component and three installed process-death cases;159 mapped pins independently rebound; fixture-local collector remains unverified provider Fixture-local research remains unverified provider evidence; external research quality is not certified.

Source/installed evidence is rebound to archive `300a4f64505f1778439b99a5176758db69d8dc0221ff60689066824355146936`: all 2,035 installed payload hashes and 14,727 dependency hashes match accepted bytes; packaged product code matches the checkout. Fresh frozen-baseline lint/typecheck/build and 498 suites / 11,551 tests passed; 147 tests remain skipped. The correlation test-only addition followed the full baseline and passed its affected 36-test matrix. Independent closure review: external `ordinary-integration-20261012/current-parity-readiness/original-scope-independent-review.md` (JSON SHA-256 `c6c2bee5b9cf75cfbd53d07ca43397dfb8e3019c0b5a119bf730d011222e9f9d`).

This current decision supersedes earlier generic pending/dependency wording only for the original AC contract. Broader joined SDLC, host, provider and production claims remain separately bounded. AEX-4.21/AEX-4.23 positive replacement integration and separately requested AEX-4.28 hardening remain open. No paid API, publication or product-code change was introduced.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [schema-validation, citation-lineage-tests, durable-recovery-tests, deterministic-export-check, lint, typecheck, jest]

## Story

**As an** AEXOS decision-maker, **I want** bounded research runs with durable source and claim lineage, **so that** recommendations remain reproducible, resumable, and honest about missing or unverified evidence.

## Context and dependencies

AEXOS has deep-research methods, `tech-search`, the deterministic decision rubric, Cerberus transport boundaries, and durable-mission primitives. It lacks one supported research run/artifact contract joining collection, stable citations, claims, decisions, limits, and recovery. The audited AIOX Research reference suggests useful artifact patterns but uses mock/default providers and an active workbench control model that cannot establish production quality or fit AEXOS authority.

## Acceptance Criteria

- [x] AC1: Define a versioned canonical research run and artifact schema containing query, profile, status, public/private source policy, provider/engine identity when exposed, sources, claims, claim-to-source links, decisions, uncertainty, metrics, execution events, open questions, configured limits, and recovery metadata. Invalid state transitions or missing required fields fail validation.
- [x] AC2: Implement a bounded collector interface that normalizes and deduplicates sources into stable citation IDs while preserving original locator, retrieval time, content hash, access classification, and collector identity. Duplicate content does not create conflicting identities; changed content remains a distinct version with lineage.
- [x] AC3: Every material claim and confident decision references one or more valid source IDs or is explicitly marked unsupported/open. Missing, malformed, unknown, inaccessible, or content-mismatched citations fail the citation gate and cannot produce a verified recommendation. Positive tests prove multi-source claims and explicit uncertainty remain valid.
- [x] AC4: Reuse the existing decision rubric for evidence-backed comparisons; do not create a second recommendation engine. Deterministic export of the same canonical artifact produces byte-stable JSON and stable ordered Markdown apart from explicitly excluded timestamps or volatile fields.
- [x] AC5: Runs persist bounded checkpoints and resume after controlled interruption without duplicating committed collection effects, source versions, claims, or terminal events. Corrupt/incompatible checkpoints fail closed. Cancellation, elapsed-time limit, source-count limit, retry limit, and configured budget exhaustion are observable terminal or blocked states, never accepted completion.
- [x] AC6: Mock, fixture, unavailable, or identity-unexposed providers remain labeled and cannot become verified provider evidence. Malicious source text remains data and cannot alter authority, tool permissions, run limits, or acceptance criteria. Secrets and private source content are excluded or redacted according to the declared policy.
- [x] AC7: Add representative positive, invalid-citation, duplicate-source, changed-source, unavailable-provider, malicious-input, cancellation, timeout/budget, interruption/resume, and corrupt-checkpoint fixtures. Run focused tests plus required repository gates on the exact candidate; independent `@qa` reviews lineage and recovery behavior.

## Tasks / Subtasks

- [x] Define and validate the research run/artifact schema and state machine (AC1).
- [x] Build bounded collection, stable identity, deduplication, and source version lineage (AC2).
- [x] Enforce claim citations, uncertainty, and deterministic decision exports (AC3–AC4).
- [x] Integrate checkpoint/resume and observable run bounds using existing durable primitives (AC5).
- [x] Harden provider/source labeling and adversarial input handling (AC6).
- [x] Run the positive/negative/recovery matrix and independent QA review (AC7).
    - [x] Correct the external installed recovery harness with bounded post-kill exit observation and failure-finally cleanup, invocation-matched receipts and complete explicit dependency manifest; independently accept one fresh current-candidate three-case run. Future execution requires new admission, and whole-story governed acceptance remains separate (AC5, AC7).
    - [x] Independently review the bounded lifecycle, complete helper closure, failure accounting and listener correction on historical-target revision2; current-target revision3 separately receives one fresh-run admission. Historical receipts are not relabeled.
    - [x] Independently review current installed-dependency provenance, explicit six-package/84-file manifest, child closure receipts and actual Windows reparse-attribute rejection in external revision5. The admitted one-shot run then failed before harness creation; no current recovery case is accepted.
    - [x] Correct explicit working-directory selection for the outer caller, nested fork and fixed metadata helper; external revision7 independently accepts the owned harmless launch chain, invocation-matched receipts, PID-aware failures, final controls and effective 15-file lint. Its one admitted installed attempt stops at a separate manifest omission before fixtures.
    - [x] Complete and independently review the exact static dependency manifest:159 file pins across ten distinct package instances, including shared framework files and embedded dependencies; retain exact-path/hash/reparse/cache checks and qualify current installed recovery once.
  - [x] Independently accept the three exact-installed Windows process-death cases: retained reservation debit, committed-operation deduplication and live-writer rejection despite forged PID.
  - [x] Rebind installed CLI start/export, live-writer rejection, reservation-death budget preservation and committed/terminal idempotence to current archive1cbb5e8b...f8662f51; independent fixture-scope reviewb6ded3a5...08dc. Governed integration remains open.

## Dev Notes

Start with `squads/deep-research/`, `.aexos-core/development/skills/tech-search/`, `.aexos-core/core/execution/decision-rubric.js`, `.aexos-core/core/execution/durable-mission.js`, and `.aexos-core/core/cerberus/`. Extend existing contracts; do not introduce a browser control plane, a second scheduler, or a second orchestration runtime.

The AIOX Research reference is ELv2 and its mock provider is not acceptance evidence. Record exact source commit/license and selected behavior before reuse; independently implement requirements where reuse rights or product fit are unclear.

[AUTO-DECISION] Provider execution → use deterministic local fixtures for this story because no paid or external provider run is required; retain provider identity/effects as unverified.

## Testing

Assert canonical artifact bytes, citation referential integrity, state transitions, event ordering, checkpoint idempotency, and terminal statuses. Recovery tests must terminate at controlled checkpoints and compare pre/post-resume effects. Fixture success is not research-quality or provider certification.

## CodeRabbit Integration

Integration / data-contract / security, high complexity. `@dev` implements; `@qa` independently validates. `@architect` reviews schema/state boundaries. Self-healing: dev light (two iterations/15 minutes, CRITICAL); QA full (three/30, CRITICAL/HIGH). Focus: citation integrity, prompt-injection resistance, idempotent recovery, deterministic exports, redaction, and false verification. Pre-PR remains pending; deployment is outside scope.

## References and provenance limits

- Audit `REPORT.md` sections **AIOX Research**, **E6**, and **Wave 2 — reliable research and recovery**, plus `dashboard-research.md`, under `C:/Users/ppetr/.codex/visualizations/2026/10/10/01a12817-25bc-7500-87cc-a8367f1de09f/aexos-audit/`.
- [AEX-4.21](STORY-AEX-4.21-CRITICAL-SDLC-CONTRACTS-AND-INSTALLED-JOURNEYS.md) — governed runtime/evidence boundary.
- [Accumulated context](accumulated-context.md) — cross-story coherence.

No claim of production search quality, private-source access, universal durable scheduling, or provider certification is authorized.

## Story Draft Checklist

READY, clarity 9/10. All six checklist categories PASS. Schema fields, failure behavior, recovery, provenance limits, positive/negative tests, and exact ownership are explicit. Implementation and QA acceptance are pending.

## PO Validation Notes

**Verdict:** GO (9/10 readiness; high confidence) for preparation only. Validated on 2026-10-10 against the PO story-validation task, accumulated context, the audit's research findings, current durable/runtime primitives, and AEX-4.21's governed evidence boundary.

- Actionability and evidence: PASS. The schema, citation gate, deterministic exports, bounded recovery, redaction, malicious-input handling, and positive/negative fixtures have observable outcomes. Fixture success cannot become provider or research-quality certification.
- Dependency hold: AEX-4.20 and AEX-4.21 must reach their required exact-candidate and independent-acceptance gates before this story can claim an accepted runtime integration. `Ready` permits preparation only.
- Runtime and authority: PASS. The story reuses the decision rubric, durable mission, Cerberus, and governed runtime; it adds no browser command plane, scheduler, paid provider, or external authority.
- Provenance: PASS. ELv2/reference behavior is bounded to reviewed patterns or independently implemented requirements; mock and identity-unexposed providers remain labeled and unverified.
- Non-blocking source-path drift: the written `.aexos-core/development/skills/tech-search/` path is absent. Current projections are `.agents/skills/tech-search/SKILL.md` and `.claude/skills/tech-search/SKILL.md`; implementation must resolve the canonical/source projection before editing and must not treat a host projection as portable SOT.
- Quality boundary: Implementation evidence and independent `@qa` acceptance remain pending and are not claimed.

## File List

- External original-scope closure evidence: existing `ordinary-integration-20261012/current-parity-readiness/` records (`source-reuse-check-20261016.json`, `original-scope-gates-20261016.json`, `accepted-correlation-check-20261016.json`, `original-scope-independent-review.{md,json}`); backups under `before-original-scope-acceptance/`.

- External current-candidate harness qualification: `ordinary-integration-20261012/research-recovery-harness-correction/` under the authorized environment record, including immutable failed attempts, revision5 provenance admission, cwd diagnostic and its independent source-only correction contract. No product source or installed candidate changes are implied.
- External validation: `C:/Users/ppetr/.codex/visualizations/2026/10/10/01a12817-25bc-7500-87cc-a8367f1de09f/aexos-implementation/continuation-20261011/host-resolution-20261011/authorized-environment-20261011/next-resolution/installed-research-recovery/` and `C:/Users/ppetr/.codex/visualizations/2026/10/10/01a12817-25bc-7500-87cc-a8367f1de09f/aexos-implementation/continuation-20261011/host-resolution-20261011/authorized-environment-20261011/next-resolution/installed-research-recovery-review/` (fixed installed child, raw run, retained checkpoint references and independent reconciliation).
- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.22-DURABLE-RESEARCH-EVIDENCE-LINEAGE.md`.
- Added: `.aexos-core/core/execution/durable-evidence.js`; updated `durable-mission.js` to reuse the unchanged codec while preserving public APIs and checkpoint bytes.
- Added: `.aexos-core/core/research/{contract,collector,store,service,export,index}.js`, `.aexos-core/schemas/research-v1.schema.json`, `.aexos-core/cli/commands/research/index.js`, research tests under `tests/unit/research/`, `tests/cli/research.test.js`, `tests/fixtures/research/`, and `docs/guides/durable-research.md`.
- Updated command registration in `.aexos-core/cli/index.js` and `bin/aexos.js`.
- Added correction coverage: `tests/unit/research/research-review-regressions.test.js`; exact reviewed file hashes are recorded in the external component review.
- Added Windows writer lifetime and recovery: `.aexos-core/core/research/writer-lease.js`, `tests/unit/research/research-process-death-recovery.test.js` and `tests/fixtures/research/recovery-child.js`; updated store/service/CLI and the guide while preserving conservative normal v1 execution on other platforms.

## QA Results

Independent component review R3: **APPROVED within component scope**. Original and follow-up secret handling, lifecycle/accounting, cancellation/deadline, deduplication, resume and raw-byte defects were corrected. Reviewer repeated 16 prior and eight new probes; root focused research run passed 33 tests across four suites. Exact hashes and executable evidence remain in external `aexos-implementation/evidence/research-4-22-review.md`. Task checkboxes above record implemented component work; AC7, accepted installed/runtime integration and full-story acceptance remain open pending combined-candidate gates and AEX-4.21.

Continuation independent recovery R2 (2026-10-11): **APPROVED within Windows recovery component scope**. The reviewer reproduced and closed R1-01: an authentic run-A lease no longer permits a run-B commit, for both v1 and v2, even with an independently owned live B writer. Seventeen independent scenarios, 49 unit/CLI tests and scoped lint pass. Proven-dead writer recovery preserves attempt debits and committed work; live, corrupt, legacy, aliased and forged state fails closed. Store SHA-256 `ddb1c00284767d011dded16ee1ea0481fbdecf000a6b03ef49190ccf7e0266f9`. Evidence: external `continuation-20261011/evidence/research-recovery-review.md`. Installed delivery, ACL owner admission, provider certification and whole-story acceptance are separate holds.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-10 | 0.1 | Draft durable research evidence and recovery contract. | Chronos / `@sm` |
| 2026-10-10 | 0.1.1 | Validated GO (9/10) for preparation — Status: Draft → Ready; AEX-4.20/AEX-4.21 acceptance remains gating. | @po |

### 2026-10-12 exact-installed research recovery acceptance

The same archive 70836160e36c486d1bc332664dcd385cf9fb1990bc605fcf437b1e934e0862ee passed three selected Windows recovery cases through the installed research module, with six source/installed module hashes unchanged and no source product fallback. Reservation death retained the first debit and resumed at two attempts / one commit. Death after commit resumed without a new collection call. A live writer rejected recover, resume and cancel with RESEARCH_BUSY despite a forged serialized PID; ownership recovery succeeded after the owned child exited.

Independent installed-research-recovery-review/review.md, SHA256 3A18AEE00701FA0631E8B84C732A2ABF585BC19C266BE16ACEC970310E4CBAA3, reconciles all 17 checkpoint chains, raw run/receipt equality, fixed installed child resolution and owned-child termination controls. The three process exits are historical executing-harness observations; the reviewer did not witness handles, query stale PIDs or replay fixtures. The local collector remains fixture-local/unverified, with no external research/provider call. Live-writer ownership recovery does not imply completed research.

The report and retained artifacts are under external installed-research-recovery/. This narrow approval does not authorize unattended reuse of the external harness, which lacks a separate post-kill exit timeout and general failure-finally cleanup. Existing exact-candidate global gates passed, but accepted governed runtime integration still depends on AEX-4.21. Other recovery races, whole-story, provider quality, parity and release remain outside this acceptance.

### 2026-10-12 current installed research rebind

The current archive 1cbb5e8b3686829ada891ccfe33fa7c84ac778a40b26e88430c7e310f8662f51 was exercised again through the installed root CLI and installed research module. Root CLI start/export are byte-identical; a live writer rejects recovery without changing its retained state; reservation process death preserves the consumed attempt and resumed budget denial; death after collection commit resumes with one attempt/one commit; repeated terminal resume preserves the artifact and checkpoint bytes. The execution harness reports observed owned-child termination; this is not independent historical OS-handle observation.

Independent review research-sop-independent-review/review.md SHA256 b6ded3a503181654ad8c9d569ef7d942faa546bc9415c84d9daa2069933908dc accepts this bounded installed evidence. The research/SOP rebind records17 matching current source/installed module bindings. Existing required gates for the same unchanged product candidate remain495 suites/11522 tests passing,11 suites/147 tests skipped. No external source/provider call, protected mutation or paid API was used. Fixture source labeling and the AEX-4.21 integration hold remain unchanged; no whole-story, production or provider acceptance is inferred.

Evidence pointer: external ordinary-integration-20261012/research-sop-rebind.json; raw outputs and checkpoints under C:/Users/ppetr/AppData/Local/Temp/aexos-research-sop-rebind-5qM70Z/evidence/installed-research-n7sjck/. Source code was not modified by this rebind.

### 2026-10-14 current-candidate harness qualification hold

Current archive `9e1fbee0f348ba75a3471f996d13b3f05bb97381f22b7f65e77e23c597f3c9ad` remains immutable. The first fresh attempt failed closed after installed require and before fixtures/children because legitimate isolated sibling dependencies were rejected. Independently reviewed external revision5 corrects that boundary with the explicit dependency manifest, retained child provenance and actual owned-junction rejection; its thirteen local controls do not establish installed recovery.

The next one-shot attempt returned spawn-layer `ENOENT` before creating the harness, with a plain 318-character working directory, null observed argv, empty streams and unchanged inventory. Independent review accepts only `LAUNCH_FAILED_BEFORE_HARNESS_START`; the sealed report's unsupported evidence-present boilerplate is rejected and preserved. Separate harmless controls with the same canonical Node fail at that exact plain cwd and succeed with a short cwd or the extended representation. This supports a host/runtime cwd-sensitive cause, not a universal path threshold.

Diagnostic addendum seal `d53e78f2223e96857bc93998aec9407313a12836a071180b5412a6a2f229f12f` admits source-only revision6: one fresh owned short ordinary cwd explicitly shared by caller, nested fork and fixed metadata helper; absolute artifact bindings and provenance guards remain unchanged. The complete harmless launch chain, truthful conditional reporting and fresh independent review are required before a new installed attempt. Existing failed runs and seals remain untouched; current three-case recovery, governed integration and whole-story acceptance remain open.

Evidence: external `ordinary-integration-20261012/research-recovery-harness-correction/`, specifically `current-candidate-run-20261014-02/`, `launch-cwd-diagnostic-r1/` and `independent-review/current-candidate-run-20261014-02-diagnostic-addendum-r1/`.

Revision7 subsequently closes the four source-admission findings: receipt invocation identity, post-start error classification, stale final control evidence and ignored lint inputs. Independent admission `216f72717777283ce1e64d4619ad0dfe95bc50cfd697213d5987a1625d037ed7` permits one fresh run and is consumed by run03. That process starts and loads installed code, then rejects an unmanifested `durable-evidence.js` before creating any fixture or owned research child. Outcome seal `34762ed6fcafa27a7aaa5cdfe8ebd49c50bf011c93c0fa4863e49f28b0bc1613` preserves its exact argv, attempt identity, raw failure and unchanged selected inventories.

Independent static analysis resolves 149 reachable code/data files and 408 literal dependency edges without importing product modules. The original manifest omits three shared framework files and 68 embedded dependency files; ten package metadata records bring the complete correction target to 159 explicit pins. Same-name outer and embedded packages require distinct canonical instance identities. Source-only contract seal `1452b34793882817ad7ab5a00281aea4432e0ce335827ca88815de287edb742b` requires complete graph coverage and unchanged exact-file guards before any new run. No current recovery case or whole-story acceptance follows from this load-phase failure.

The complete manifest revision8 then receives independent one-fresh-run admission `ad81ca22d6bf39758be980976b8c4d7dbc85e6f8f0669e795b3c68c7bc4f01df`. Run04 executes all three cases once on archive9e1f: reservation death preserves the debit and completes at two attempts/one commit; committed-operation recovery completes at one attempt/one commit without another adapter call; a live writer rejects recover/resume/cancel despite a forged serialized PID and ownership recovery succeeds after recorded child death. Three owned SIGKILL exits and exit barriers are recorded with `syntheticFaultInjection=false`.

Independent run04 review `f3f83be62818446259e4e920d0371741d27ceb347d5f1dac6d0cdcd7b1d0df8d`, seal `0af04837b3dea04f5039c2ba47dbd26ca3fd8bd008dbe63bf06aff2593179c42`, reconciles raw/typed receipts, exact argv/attempt/review bindings,159 manifest pins, eight149-file loaded snapshots,28 retained fixture files and checkpoint chains of8/6/3 revisions. This accepts only the selected fixture-local current-candidate recovery behavior. The consumed admission does not authorize replay, provider certification, global cleanup, native1314, full parity, production or whole-story governed integration. Root preflight/artifact-assembly errors are preserved and did not repeat the actual caller invocation.

