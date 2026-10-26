# Story AEX-4.13: Brand policy command integration and semantic validation

| Field | Value |
| --- | --- |
| Story ID | AEX-4.13 |
| Epic | AEXOS Evolution |
| Status | Done |
| Executor | `@dev` |
| Quality gate | `@architect`, independent `@qa` |
| Quality gate tools | Existing squad-validation CLI; negative semantic fixtures; isolated projection verification |
| Depends on | Existing Brand squad and preserved runtime-policy file; architecture semantic review of 2026-09-08 |

## Story

As an AEXOS Brand user, I want the preserved Brand policies available when I execute Brand commands and their concrete task/roster rules checked by the existing squad validator, so that usable policy guidance and verified content consistency replace an unconnected configuration file without inventing a new runtime dispatcher.

## Verified context

The [semantic absorption review](../../../../artifacts/commercial-readiness-20260908/brand-semantic-absorption.md) establishes that all seven allegedly missing policy blocks already exist in `squads/brand/config/brand-runtime.yaml` and are parsed-YAML deep-equal to pinned `SynkraAI/aiox-squads` commit `66118db856ef655b8cf5ba44eda963ad4d0b1d78`, `squads/brand/config.yaml`. They were preserved in local commit `0c8411c`. The defect is command-time reachability and missing semantic checks, not missing policy content.

The seven blocks are `pattern_library`, `task_standards`, `executor_types`, `executor_selection`, `workflow_config`, `tier_system` and `settings`. Keep them in the existing policy file. Canonical discovery/routing remains in `squad.yaml`; the legacy `pack` metadata is reference/provenance. Current policy SHA-256 is recorded as `dc0bfb69500462f898d4b814ca54580b5f468f11a19de29ff953bd975d1a8fda`; upstream config SHA-256 is `5c8342cceac0b91a8dd89e24b5c20a2da6047679b961b81a20ef52bd7a67185b`. Revalidate before implementation rather than assuming unchanged bytes.

Chief activation explicitly forbids external loading; commands use existing `command_loader`/dependencies. `scripts/validate-squads.js` currently checks configuration YAML syntax and agent dependency paths but not these policy semantics. Of ten Brand task blocks, `coherence-check.md` alone lacks required `task.task_name`; it contains useful legacy `task.name` instead. BR-TP-001 and BR-EP identifiers are symbolic specification names, not implemented validator programs/provider adapters. All seven tier members and current task executor references resolve according to the reviewed source.

[AUTO-DECISION] AEX-4.13 is available. Implement only the architecture-recommended command guidance and concrete semantic checks. Do not duplicate the seven blocks into the manifest, invent `config.runtime` auto-loading, populate an empty pattern library, change commercial rights or equate this correction with automatic company-wide execution. The owner's larger runtime/orchestration objective remains separate and open.

## Acceptance criteria

- [x] AC1: Preserve all seven policy blocks and their existing values in `squads/brand/config/brand-runtime.yaml`; record pinned upstream commit/path/hash and Cyryx metadata adaptation without introducing a second policy source in `squad.yaml`. Preserve manifest discovery/roster authority and existing canonical ownership/license metadata. Documentation clearly identifies symbolic BR-TP/BR-EP IDs as specification identifiers rather than executable validators or provider integrations.
- [x] AC2: Make the existing policy a resolvable dependency and required command-time guidance for actual Brand work through Brand chief and direct specialist entry paths. Use existing loader/dependency instructions, preserving activation/help/exit behavior without unnecessary external reads. Applicable user/host instructions and core agent authority remain superior. Explain executor categories as planning guidance, including human approval ownership; command guidance must not grant autonomous dispatch, external messaging or provider execution.
- [x] AC3: Make affected task/workflow command instructions explicitly reference the common policy while preserving existing checkpoints, veto conditions, phase routing and success criteria. Retain the distinction between instructed checkpoint behavior and machine-enforced runtime blocking. Add canonical `task.task_name` to `tasks/coherence-check.md` with the existing `task.name` text, retaining the legacy field for compatibility. Do not relax required task anatomy or change valid case-insensitive `Agent` executor interpretation to excuse malformed data.
- [x] AC4: Integrate narrow Brand semantic validation into the existing `scripts/validate-squads.js` path, reusing its squad validation machinery. Check required task-field presence, normalized declared executor categories, executor file references, executor-selection category references, tier/manifest/agent coherence and policy dependency reachability for chief/direct specialist work. Missing/malformed policy or required references fail with actionable file/field diagnostics. Do not treat symbolic pattern IDs as filesystem paths, add a generic policy-loading runtime or infer automatic enforcement from YAML settings.
- [x] AC5: Exercise the real existing squad-validation CLI against isolated valid and invalid Brand fixtures. Negative cases remove a required task field, supply an unknown execution category/executor, corrupt a tier reference or manifest tier, remove a required policy dependency and provide missing/malformed policy; each must fail nonzero with useful diagnostics. Positive fixtures preserve the legacy `name` plus canonical `task_name`, accepted executor-case normalization and symbolic IDs. Recheck deep equality of preserved policy blocks with the pinned source and verify source dependency reachability. Fixture validation is not proof that a host actually loaded the guidance during a native command.
- [x] AC6: Verify canonical manifest normalization and generated agent/skill synchronization deterministically on an isolated copy using existing generators; preserve custom files and avoid hand-editing derived surfaces. Run ordinary squad schema/reference/YAML checks, focused semantic regressions and repository lint/typecheck/tests/build plus Core package-boundary validation. If any actually reviewed private artifact includes Brand, verify exact inclusion/hashes; do not add Brand to the free Core or extend the existing three-squad review package merely to satisfy this story. Record separate source parity, command-guidance reachability, local semantic validation and native/runtime evidence. Native host behavior, automatic checkpoint enforcement, dispatch/provider integration and broader company orchestration remain unverified unless separately demonstrated; independent architecture/QA review is required.

## Tasks and ownership

- [x] Read the current semantic review and relevant source; verify available ID and prepare clear Ready criteria.
- [x] Preserve policy values and document provenance/symbolic identifiers (AC1).
- [x] Add command-time dependencies/guidance for chief, direct specialists and relevant workflows/tasks, without activation-time loading (AC2-AC3).
- [x] Add compatible `task.task_name` and narrow semantics to the existing squad validator (AC3-AC4).
- [x] Run actual CLI positive/negative fixtures, policy comparisons and isolated generator checks (AC5-AC6).
- [x] Run gates and independent review; record exact source/evidence paths and remaining runtime work (AC6).

Exact ownership for implementation:

- `squads/brand/agents/brand-chief.md`, `alexandra-watkins.md`, `april-dunford.md`, `emily-heyward.md`, `marty-neumeier.md`, `michael-johnson.md`, `sagi-haviv.md`: bounded command loader/dependency guidance.
- `squads/brand/tasks/coherence-check.md`: canonical field plus guidance. Other `squads/brand/tasks/*.md`: only necessary explicit command-time policy references, preserving task content.
- `squads/brand/workflows/wf-brand-audit.yaml` and `wf-brand-from-zero.yaml`: bounded shared-policy references, preserving existing routing/checkpoints.
- `squads/brand/config/brand-runtime.yaml`: comments/provenance only if needed, with seven policy blocks semantically unchanged; `squads/brand/README.md`: truthful guidance/evidence boundaries.
- `scripts/validate-squads.js`: narrow semantic integration; a small existing-squad-validation helper only if needed for testability. Focused new tests such as `tests/ids/brand-policy-contract.test.js` and fixture directories under existing conventions; finalize exact test paths in the file list.

Do not modify `squad.yaml` policy/roster, the generic runtime loader, adapters, model routing, providers or an old story. If existing generators necessarily refresh specific derived files, coordinate exact ownership and record generated output; do not run a global sync over unrelated dirty work. Story author owns this document only and does not implement or commit.

## Guidance, risks and follow-on boundary

The existing task policy lists eight required fields: `task_name`, `status`, `responsible_executor`, `execution_type`, `input`, `output`, `action_items`, `acceptance_criteria`. Validate the intended fenced task block, not the outer metadata frontmatter; the current `coherence-check` outer `task: coherence-check` is a different structure. Normalize executor category case explicitly without silently rewriting content. Keep agent file IDs and canonical tier numbers authoritative.

Primary risks are duplicating preserved policy, treating descriptive IDs as executable paths, loading extra context during forbidden activation, and claiming execution enforcement from a validator. Mitigate with deep comparisons, direct-entry reachability checks, real CLI negative fixtures and evidence labels. Rollback only this story's exact source/tests/guidance edits and generated outputs; preserve unrelated state and all reviewed artifacts.

Follow-on remains open: automatic Brand checkpoint enforcement requires a separate governed execution-contract story with actual accepted/rejected transitions, human approval authority and durable evidence. Dispatch, native provider execution and the user's broader orchestration objective are not closed by policy guidance or static validation. This story must report that boundary in its completion record.

References:

- [Semantic review](../../../../artifacts/commercial-readiness-20260908/brand-semantic-absorption.md): precise mappings, current consumers, provenance and recommended boundaries.
- [Diagnostic ledger](../../../../artifacts/commercial-readiness-20260908/diagnostic-status.md): original hypothesis and current reconciliation context.
- [Accumulated context](accumulated-context.md): preserve concurrent work and evidence levels.
- [Constitution](../../../../.aexos-core/constitution.md): existing CLI/Master authority and squad portability.

## CodeRabbit Integration

**Type:** Squad content/validation integration. **Complexity:** Medium. **Risk:** Medium for authority misrepresentation or validator regressions. `@dev` implements; `@architect` checks boundary preservation; independent `@qa` verifies CLI failures and evidence distinctions; `@devops` alone handles later PR/push.

- [x] Pre-commit review through configured CodeRabbit or explicit unavailability plus independent review under existing graceful degradation.
- [ ] Pre-PR `@devops` verification of exact scope, generated changes and accepted gates if requested.
- Pre-deployment: N/A; no provider activation or release in scope.

Self-healing: dev light (2 iterations/15 minutes, critical), QA full (3/30, critical/high), DevOps report-only. Focus: nonduplicated policy, compatible task anatomy, direct-entry guidance, concrete semantic failures, generator preservation and honest runtime claims.

## Story validation and file list

Brownfield completeness/safety/information checks and applicable story-draft checklist categories pass. Existing policy, loader conventions and validation entry point establish sufficient context; no new runtime technology or provider assumption is needed. Ready for bounded implementation; no implementation acceptance claimed.

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.13-BRAND-POLICY-COMMAND-INTEGRATION.md`.
- Planned: exact bounded ownership above and isolated CLI/generator fixtures; implementer records final changed paths and evidence receipts.

## Dev Agent Record

Implemented by Vulcan / `@dev`. Policy and manifest bytes are unchanged; seven
agents now require command-time guidance, ten tasks and two workflows reference
the same policy, and coherence-check preserves `name` while adding matching
`task_name`. The existing squad CLI calls a Brand-only semantic helper.

Files changed:

- `scripts/validate-squads.js`; new `scripts/lib/validate-brand-policy.js`.
- New `tests/ids/brand-policy-contract.test.js` (50 actual CLI cases).
- `squads/brand/README.md`.
- All seven `squads/brand/agents/*.md` listed in the exact ownership section.
- All ten `squads/brand/tasks/*.md` listed in the canonical manifest.
- `squads/brand/workflows/wf-brand-audit.yaml` and `wf-brand-from-zero.yaml`.
- This story and evidence under `artifacts/commercial-readiness-20260908/aex-4.13/`:
  `verification.md`, `verify-content.cjs`, `content-receipt.json`, `gates/`,
  `architecture.md`, `qa.md`; `integrate-guidance.cjs` records the one-time source edit.

Verification: [exact commands and results](../../../../artifacts/commercial-readiness-20260908/aex-4.13/verification.md).
Frozen source candidate `C:/AEXOS-LOCAL-TESTS/aex413-core-q8Ggoa`, inventory SHA-256
`506532d28c19d8b64836ef545cb0491252d989acedb47bd2088da369402c1673`.
All gates passed: focused 245 tests/3 suites/zero skips, full 10,675 passed with
172 existing skips, lint/typecheck/build/Core boundary/default parity. All 4,331
compared candidate and current-source files stayed byte-identical. Normalization
and repeated generation ran in a separate isolated copy; no derived root files
were hand-edited or globally synchronized. All seven generated skills carry
the guidance, and an unrelated customer skill outside generated namespace survives.

Independent reviews exposed malformed nested-policy and missing loader/direct-entry
false greens. These were corrected and reproduced as failing CLI regressions.
Policy blocks deep-equal pinned upstream; no pattern/executor program is invented.
CodeRabbit unavailable on PATH, WSL only docker-desktop; no automated clearance
claimed. Independent review records retain findings and their resolutions.

DoD: implementation, local functionality/edge cases, coding standards, locked
dependencies, documentation and required gates satisfied. No dependency, provider
configuration, schema migration or public API was added. Review verdict is recorded
separately below. Native host loading, runtime checkpoint enforcement and company
orchestration remain separate. Existing absent Sagi nested-command dependencies
are a concrete follow-up, not certified by this story.

## QA Results

**APPROVED — bounded source-content integration and local semantic validation.** Independent QA reproduced and verified fixes for missing advertised chief-loader coverage, malformed nonstar command keys and unrostered on-disk direct agents. Actual isolated CLI baseline remains valid; all three negative probes now fail with actionable diagnostics. Independent focused execution: 50 Brand cases passed, zero skips.

Final candidate `C:/AEXOS-LOCAL-TESTS/aex413-core-q8Ggoa`, inventory SHA-256 `506532d28c19d8b64836ef545cb0491252d989acedb47bd2088da369402c1673`, completed `2026-09-08T17:51:05.451Z`: all required commands exit 0; 10,675 full tests passed, zero failed, 172 existing skips; 245 focused cases in three suites passed without skips. QA independently matched all 4,331 candidate/current-root source hashes. Final helper SHA-256: `90c637c773eb073416050e53c26bec1eeb7b29679ce51fe72322c77e77159675`.

QA verified all 19 affected content definitions preserve old semantics except intended additions, all seven policy blocks deep-equal pinned upstream, and policy/manifest bytes remain unchanged. Actual isolated normalization/repeated sync/check preserves all 40 Brand source files, 14 generated artifacts and the unrelated customer skill. Ordinary squad CLI passes all 22 squads; Core boundary passes 1,926 files with Security only. The unchanged existing private review artifact contains marketing/ops/products and no Brand, so no Brand private-distribution acceptance is claimed.

Evidence: `artifacts/commercial-readiness-20260908/aex-4.13/qa.md`, `content-receipt.json` and `gates/receipt.json`. Native host loading, automatic checkpoint enforcement, provider dispatch, commercial release and pre-existing missing Sagi nested-command dependencies remain outside this approval. QA did not edit application source or lifecycle/checklists; lead ownership is preserved.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready command-time integration and semantic validation of already preserved Brand policies. | Themis / `@po` |

| 2026-09-08 | 1.1 | Implemented command-time guidance and semantic CLI validation; independent reviews corrected false greens, full isolated gates and preservation checks accepted. | Vulcan / @dev |
