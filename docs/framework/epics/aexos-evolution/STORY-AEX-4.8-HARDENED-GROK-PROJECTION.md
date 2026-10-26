# Story AEX-4.8: Hardened Grok installation and managed projections

## Status

In Review — implementation and independent preservation review complete; final aggregate evidence recorded below.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [projection-isolation-tests, installer-tests, jest, lint, typecheck, build]

## Story

**As an** AEXOS operator using Grok, **I want** installation and updates to create complete governed host projections while preserving my customizations, **so that** Grok receives the same canonical AEXOS capabilities without silent drift or unsafe cleanup.

## Context and ownership

The lead's current upstream semantic comparison identifies gaps in managed manifest tracking, rules merging, stale-file cleanup, harness config/hooks/aliases and selected-host installer integration; current `scripts/validate-grok-projection.js` compares generated files only. These findings require mapping against the current checkout before editing, not blind copying. Existing AEXOS names, canonical sources and user files remain authoritative.

Read [accumulated-context.md](./accumulated-context.md#2026-09-07-runtime-boundaries-and-local-observation). Lead owns upstream comparison and Grok scripts/installer changes after Doctor finishes shared files. Coordinate `packages/installer/src/wizard/index.js` and generator edits with AEX-4.2/4.3 owners. AEX-4.6 owns Gemini hook enforcement changes; reuse its corrected canonical hooks rather than diverging them. No application implementation is performed by the story author.

## Acceptance Criteria

- [x] AC1: Record source-referenced current upstream-to-local semantic mappings for Grok generation, rules, manifest ownership, harness config/hooks/aliases and installer selection. Identify reusable AEXOS canonical sources and unsupported provider semantics; do not copy foreign branding or private implementation blindly.
- [x] AC2: Generate a versioned managed projection manifest with file identities and content evidence sufficient to distinguish generated files from user-owned or modified content. Repeated generation is deterministic and idempotent; malformed/missing ownership evidence cannot authorize deletion.
- [x] AC3: Merge managed rules/configuration without replacing unrelated user rules or settings. Remove stale files only when the previous managed manifest and unchanged content prove ownership, canonical target containment is verified and the file is not a link escape. Preserve modified/untracked files and report conflicts clearly.
- [x] AC4: Generate the selected Grok harness configuration, supported hooks and aliases from existing AEXOS canonical definitions and documented host contracts. Do not introduce unconditional permission bypass or claim unsupported hooks active. Keep executable logic in canonical framework/squad sources rather than generated projections.
- [x] AC5: Integrate Grok skill/projection generation into actual selected-host installation and update flows, including `generateGrokSkills` or the existing equivalent after code verification. Unselected hosts are not written. Completion reports actual generated outcomes; generation failure cannot appear as successful host integration.
- [x] AC6: Extend projection validation beyond positive generated-file comparison to manifest ownership, expected configuration/hooks/aliases, stale managed paths and preservation of user edits. Validator execution is read-only and reports drift without repairing or deleting files implicitly.
- [x] AC7: Add isolated tests for fresh install, selected/unselected Grok, repeat update, managed stale cleanup, missing/corrupt manifest, modified/untracked user files, rules merge conflicts, path/link escape and hook-generation failure. Assert unrelated content remains byte-identical.
- [x] AC8: Run lint, typecheck, full tests, build and relevant projection/installer gates. Capture actual isolated selected-host install/update evidence and file list. Label generated/configured host support separately from native Grok execution, which remains unproven unless actually exercised.

## Tasks / Subtasks

- [x] Complete semantic mapping and resolve current generator/installer entry points (AC1).
- [x] Add managed manifest, safe merge and evidence-based cleanup (AC2-3).
- [x] Generate verified harness config/hooks/aliases from canonical sources (AC4).
- [x] Connect selected-host install/update and truthful completion (AC5).
- [x] Extend read-only validation and isolated regression coverage (AC6-7).
- [x] Run gates and real isolated install/update evidence; document gaps (AC8).

## Dev Notes

Start with `scripts/validate-grok-projection.js`, existing `syncGrok` implementation, `packages/installer/src/wizard/{index,ide-config-generator}.js` and `.grok/` generation contracts. Resolve exact generator path through symbol discovery before modification. Use existing filesystem/path utilities and dependencies. No new dependency, provider credential or remote deployment is required.

[Source: .aexos-core/constitution.md, Article XI] makes projections derived and executable squad logic canonical. [Source: STORY-AEX-4.1-UPSTREAM-EVIDENCE-ABSORPTION.md, AC5 and validation] establishes isolated read-only Grok drift checks without native-runtime claims. [Source: lead current upstream semantic comparison supplied in this mission] motivates manifest/rules/harness/install gaps; attach exact comparison paths in AC1 before implementation.

## Testing

Use temporary roots containing intentional custom rules, user files and previously managed artifacts. Check preserved content hashes and refusal behavior, not only generated snapshots. Exercise the real selected-host wizard path and then run the validator without mutation. Unsupported link creation or native host testing is recorded untested, never counted as passing proof.

## CodeRabbit Integration

Story Type Analysis: Integration / Security, high complexity. Specialized Agents: @dev primary, @architect canonical-source review, @qa independent preservation tests. Quality Gate Tasks: pre-commit @dev required; pre-PR @devops when requested; pre-deployment N/A. Self-Healing: @dev light, 2 iterations / 15 minutes, CRITICAL auto-fix, HIGH documented; @qa full, 3 iterations / 30 minutes, CRITICAL/HIGH correction. Focus Areas: destructive cleanup ownership, config preservation, hook authority, path escapes and installation truth. Record unavailable CodeRabbit explicitly.

## Story Draft Checklist

READY, clarity 9/10. Goal/context PASS; technical guidance PASS; references PASS; self-containment PASS; testing PASS; CodeRabbit PASS. All applicable `.aexos-core/product/checklists/story-draft-checklist.md` items reviewed. Provider credentials and deployment N/A. AC1 binds exact upstream source evidence before edits; no undocumented host behavior is assumed.

## Change Log

2026-09-07 — v1 — Chronos: bounded Grok projection and installation hardening.

## Dev Agent Record

Implemented with independent preservation review. Exact upstream mapping: [UPSTREAM-SEMANTIC-REVIEW-20260907.md](./UPSTREAM-SEMANTIC-REVIEW-20260907.md).

IDS: reused canonical agent/profile/skill generation and existing host observation command; added managed ownership adapter because the previous writer overwrote targets unconditionally. The selected-host wizard now invokes that adapter from the actual installed canonical source. The validator reuses the same manifest/section contracts while remaining read-only.

Independent QA reproduced and retested two Grok defects: concurrent user edits during generation and Windows case-only paths in stale cleanup. Both corrected. Canonical path, link, hardlink, malformed manifest, unknown files and managed-section conflicts fail explicitly. No hostile-process/OS sandbox guarantee is claimed.

Actual packed install and repeated update completed at `C:/AEXOS-LOCAL-TESTS/continuation-grok-project-20260907`: 12 agents, 213 tasks, 14 workflows; Grok manifest 78 artifacts. A custom rules prefix and an untracked custom file remained byte-identical across update; `.claude`, `.codex` and `.gemini` remained absent. Bundled Doctor: 9 PASS / 2 WARN / 0 FAIL / 8 INFO. Warnings are absent Git hooks in the fixture and the Windows npm advisory. Native Grok execution was not exercised.

Receipts: `continuation-grok-install.log`, `continuation-final-grok-update.log`, `continuation-grok-doctor.json`, `grok-final-preservation.log`, `continuation-final-pack.json` in `artifacts/audit-20260906/`. Hook-generation failure regression proves target projection remains absent when canonical hook generation fails. CodeRabbit unavailable; independent QA has no unresolved reproduced Grok blocker.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.8-HARDENED-GROK-PROJECTION.md`
- `docs/framework/epics/aexos-evolution/UPSTREAM-SEMANTIC-REVIEW-20260907.md`
- `.aexos-core/infrastructure/scripts/grok-skills-sync/index.js`
- `.aexos-core/infrastructure/scripts/grok-skills-sync/managed-projection.js`
- `.aexos-core/core/virtual-office/host-hooks.js`
- `.aexos-core/core/doctor/checks/selected-hosts.js`
- `packages/installer/src/config/ide-configs.js`
- `packages/installer/src/wizard/ide-config-generator.js`
- `packages/installer/src/wizard/index.js`
- `scripts/validate-grok-projection.js`
- `tests/unit/grok-managed-projection.test.js`
- `tests/unit/config/ide-configs.test.js`
- `tests/unit/wizard/ide-selector.test.js`
- `tests/integration/wizard-ide-flow.test.js`
- `.grok/.aexos-managed.json` and 78 derived projection artifacts

## QA Results

Pending independent implementation review.
