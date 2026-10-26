# STORY-AEX-2.7 — Core Security Squad

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Status:** Done  
**Executor:** `@dev`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Depends on:** AEX-2.6 (`Done`)

## Story

As an AEXOS project, I want a Core Security squad that independently assesses
what delivery agents build and issues a deterministic release verdict so that
exploitable weaknesses block release until fixed or formally accepted.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | `squads/security` is a tracked Core Free squad with a valid manifest and exactly six canonical agents: `security-chief`/Aegis, `threat-model-lead`/Stride, `appsec-lead`/Bastion, `offensive-lead`/Rook, `platform-lead`/Provenance and `ai-security-lead`/Harness. |
| AC2 | Each agent owns only the approved discipline and cites its grounding: orchestration, Shostack/STRIDE, OWASP Top 10/ASVS, PTES, SLSA/NIST SSDF/CIS, and OWASP LLM/MITRE ATLAS respectively. Every definition prohibits implementation and routes fixes to the owning delivery agent. |
| AC3 | A task-first assessment workflow sequences scope/threat model, AppSec, platform/supply-chain, AI security and offensive validation before `security-chief` arbitrates the final verdict. A checklist and report template require evidence, severity, status and disposition. |
| AC4 | A deterministic assessment engine validates findings and emits `PASS`, `CONCERNS` or `FAIL`: any open critical/high finding is `FAIL`; accepted critical/high, or any open/accepted medium finding, is `CONCERNS`; only resolved material findings or low/info residuals may `PASS`. |
| AC5 | Findings require id, title, severity, status, evidence and owner. `accepted` requires acceptance owner, rationale and expiry. Invalid or expired acceptance fails validation; an empty assessment cannot silently pass unless the caller explicitly declares all required domains assessed. |
| AC6 | `aexos security assess <findings.json>` is the CLI-first gate, supports JSON output and uses exit `0` for PASS, `2` for CONCERNS, `3` for FAIL and `4` for invalid input. It never edits source or marks a story Done. |
| AC7 | Tests cover each verdict, invalid/expired acceptance, missing domain coverage, deterministic ordering, CLI exit semantics and the exact six-agent manifest. |
| AC8 | Squad validation plus repository lint, typecheck, test, build and dependency audit pass; no penetration is run against external targets and no release authority moves from `@devops`. |

## Tasks / Subtasks

- [x] Create the Security squad manifest and six bounded agent definitions (AC: 1–3)
- [x] Add assessment task, workflow, checklist and report template (AC: 3, 5)
- [x] Implement deterministic verdict engine and CLI gate (AC: 4–6)
- [x] Add engine, CLI, manifest and agent contract tests (AC: 1–8)
- [x] Run squad and repository gates; update story and QA record (AC: 8)

## Dev Notes

- Security owns assessment and verdict only. It does not implement remediation,
  commit, push, create PRs, tag or release.
- `accepted` is not equivalent to fixed. Accepted critical/high findings retain
  a `CONCERNS` verdict and must carry named human ownership plus expiry.
- The CLI evaluates supplied evidence only. It does not claim that scanners or
  tests ran unless their evidence appears in the input.
- This story performs no external scan and no Git/remote/release operation.

## Testing Requirements

```powershell
npx jest tests/core/security/security-assessment.test.js tests/integration/security-cli.test.js tests/ids/security-squad-contract.test.js --runInBand
npm run validate:squads
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
npm audit --json
```

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted from the approved Security squad definition | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (8/8); assessment-only boundary confirmed | @po / @architect |
| 2026-09-04 | 0.3.0 | Development started in autonomous mode — Status: Ready → InProgress | @dev |
| 2026-09-04 | 1.0.0 | Squad, workflow, deterministic engine and CLI gate completed — Status: InProgress → InReview | @dev |
| 2026-09-04 | 1.0.1 | Independent QA PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Debug Log References

- Focused Security/integration/IDS gate: 8 suites, 153 tests passed.
- `npm run validate:squads`: 21 squads, zero errors and zero warnings.
- `npm run validate:squad-registry`: generated registry is current.
- `npm run validate:squad-agents`: 162 agents and 324 generated surfaces are current.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Full regression: 405 suites / 10,018 tests passed; 12 suites / 163 tests skipped; exit 0.
- `npm run build`: publish safety gate passed with 3,585 packaged files and no paid `pro/` content.
- `npm audit --json`: zero known vulnerabilities across 679 dependencies.
- CodeRabbit CLI: unavailable; deterministic security tests and repository gates used per the story fallback.

### Completion Notes

- Added the exact six-agent Core Free Security squad with assessment-only authority and explicit remediation handoff boundaries.
- Added the task-first assessment workflow, per-domain tasks, release checklist and evidence report template.
- Added a deterministic verdict engine that fails closed on incomplete coverage, invalid findings and expired or incomplete risk acceptance.
- Added `aexos security assess` with stable PASS/CONCERNS/FAIL/invalid exit semantics and sanitized JSON evidence.
- Registered the squad and regenerated its 12 Claude command/skill projections without changing AEXOS execution architecture.
- Corrected the Virtual Office registry expectation for 22 total squads and 174 total agents and kept the compact squad panel width-safe.

### File List

- `.gitignore` (modified)
- `bin/aexos.js` (modified)
- `.aexos-core/cli/index.js` (modified)
- `.aexos-core/cli/commands/security/index.js` (added)
- `.aexos-core/core/security/security-assessment.js` (added)
- `.aexos-core/data/squad-registry.yaml` (modified)
- `squads/security/squad.yaml` (added)
- `squads/security/README.md` (added)
- `squads/security/CHANGELOG.md` (added)
- `squads/security/agents/*.md` (six files added)
- `squads/security/tasks/*.md` (eight files added)
- `squads/security/workflows/wf-security-assessment.yaml` (added)
- `squads/security/checklists/security-release-gate.md` (added)
- `squads/security/templates/security-assessment-report-tmpl.md` (added)
- `.claude/commands/AEXOS/squads/security/*.md` (six generated files added)
- `.claude/skills/AEXOS/squads/security/*/SKILL.md` (six generated files added)
- `tests/core/security/security-assessment.test.js` (added)
- `tests/integration/security-cli.test.js` (added)
- `tests/ids/security-squad-contract.test.js` (added)
- `tests/core/virtual-office/config-registry.test.js` (modified)
- `docs/framework/epics/aexos-evolution/STORY-AEX-2.7-CORE-SECURITY-SQUAD.md` (added)

## QA Results

### Gate

**PASS** — AC1–AC8 are covered by deterministic engine, CLI, manifest and
repository regression evidence. See
`docs/qa/gates/AEX-2.7-core-security-squad.yml`.

### Residual risk

The squad is an evidence-driven assessment and verdict surface; it does not
run external scanners or penetration tests by itself. Active offensive testing
still requires explicit scope, authorization and tool-specific capability
leases. The Release 6.0 claim also remains blocked on the later Cerberus,
durable-mission and paid-distribution stories.
