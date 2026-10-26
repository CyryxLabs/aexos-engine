# STORY-AEX-2.8 — Workflow Engineering Squad

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Status:** Done  
**Executor:** `@dev`  
**Squad Structure:** `@squad-creator`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Depends on:** AEX-1.1 and AEX-2.6 (`Done`)

## Story

As an AEXOS operator, I want a Workflow Engineering squad that converts a
discovered business process into a validated dependency map, executable task
contracts and bounded automation candidates so that work can be decomposed
without inventing missing owners, systems, evidence or authority.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | `squads/workflow-engineering` is a valid paid-library squad with exactly six agents: chief, process discovery, workflow modeling, task-contract engineering, automation architecture and workflow QA. |
| AC2 | The task-first workflow sequences discovery → process map → task contracts → automation candidates → QA; each agent is assessment/design only and cannot execute external side effects or grant itself capabilities. |
| AC3 | A deterministic compiler accepts an explicit process definition with workflow identity, objective, trigger, outcome, actors and steps; every step requires an owner, kind, declared inputs, outputs and verification. |
| AC4 | The compiler rejects duplicate/unknown/self dependencies, unknown owners, cycles, conflicting output paths and agentic/external steps without declared capabilities using stable `WORKFLOW_*` errors. |
| AC5 | Every valid step becomes an AEXOS Task Contract V1 validated by the existing canonical contract validator; the compiler does not introduce a second task schema. |
| AC6 | The compiler emits deterministic topological waves and classifies automation as `eligible`, `governed` or `manual`; side effects, human approval, agentic or external execution can never be called autonomously eligible. |
| AC7 | `aexos workflow map <process.json>` is CLI-first, supports JSON evidence and uses exit `0` for PASS, `2` for CONCERNS and `4` for invalid input. It maps work but never runs it. |
| AC8 | Tests cover valid mapping, deterministic ordering, Task Contract V1 compatibility, every fail-closed topology/authority condition, CLI semantics, exact squad structure and repository gates. |

## Tasks / Subtasks

- [x] Create and validate the six-agent Workflow Engineering squad (AC: 1–2)
- [x] Add task-first workflow, checklist and templates (AC: 2–3)
- [x] Implement the deterministic process-to-contract compiler (AC: 3–6)
- [x] Add the CLI-first mapping surface (AC: 7)
- [x] Add unit, integration and IDS tests (AC: 1–8)
- [x] Run focused and repository gates; update story and QA record (AC: 8)

## Dev Notes

- This is a design/compiler surface. It does not execute the resulting tasks.
- Existing Task Contract V1 and wave semantics remain authoritative.
- `CONCERNS` means governed review is still required; it is not execution
  permission and cannot be auto-promoted to PASS.
- This story performs no Git commit, push, PR, tag, publish or deployment.

## Testing Requirements

```powershell
npx jest tests/core/workflow-engineering/workflow-map.test.js tests/integration/workflow-map-cli.test.js tests/ids/workflow-engineering-squad-contract.test.js --runInBand
npm run validate:squads
npm run validate:squad-registry
npm run validate:squad-agents
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
npm audit --json
```

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted from the approved Sprint 2 workflow outcome | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (8/8); canonical Task Contract and no-execution boundary accepted | @po / @architect |
| 2026-09-04 | 0.3.0 | Development started — Status: Ready → InProgress | @dev / @squad-creator |
| 2026-09-04 | 1.0.0 | Squad, compiler and CLI mapping surface completed — Status: InProgress → InReview | @dev |
| 2026-09-04 | 1.0.1 | Independent QA PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Debug Log References

- Focused Workflow Engineering/integration/IDS gate: 8 suites, 166 tests passed.
- `npm run validate:squads`: 22 squads, zero errors and zero warnings.
- `npm run validate:squad-registry`: generated registry is current.
- `npm run validate:squad-agents`: 168 squad agents and 336 generated surfaces are current.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Full regression: 408 suites / 10,074 tests passed; 12 suites / 163 tests skipped; exit 0.
- `npm run build`: publish safety gate passed with 3,619 packaged files and no paid `pro/` content.
- `npm audit --json`: zero known vulnerabilities across 679 dependencies.

### Completion Notes

- Added a paid-library six-agent Workflow Engineering squad with a task-first discovery-to-QA sequence and no execution authority.
- Added a deterministic process compiler that validates actors, systems, dependencies, cycles, output ownership and capability declarations.
- Reused the canonical AEXOS Task Contract V1 validator for every compiled step and emitted deterministic topological waves.
- Classified each step as eligible, governed or manual without executing it or granting capabilities.
- Added `aexos workflow map` with stable PASS, CONCERNS and invalid-input exit semantics.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-2.8-WORKFLOW-ENGINEERING-SQUAD.md` (added)
- `.gitignore` (modified)
- `bin/aexos.js` (modified)
- `.aexos-core/cli/index.js` (modified)
- `.aexos-core/cli/commands/workflow/index.js` (added)
- `.aexos-core/core/workflow-engineering/workflow-map.js` (added)
- `.aexos-core/data/squad-registry.yaml` (modified)
- `squads/workflow-engineering/squad.yaml` (added)
- `squads/workflow-engineering/README.md` (added)
- `squads/workflow-engineering/CHANGELOG.md` (added)
- `squads/workflow-engineering/agents/*.md` (six files added)
- `squads/workflow-engineering/tasks/*.md` (six files added)
- `squads/workflow-engineering/workflows/wf-engineer-process.yaml` (added)
- `squads/workflow-engineering/checklists/workflow-readiness-gate.md` (added)
- `squads/workflow-engineering/templates/*` (two files added)
- `.claude/commands/AEXOS/squads/workflow-engineering/*.md` (six generated files added)
- `.claude/skills/AEXOS/squads/workflow-engineering/*/SKILL.md` (six generated files added)
- `tests/core/workflow-engineering/workflow-map.test.js` (added)
- `tests/integration/workflow-map-cli.test.js` (added)
- `tests/ids/workflow-engineering-squad-contract.test.js` (added)
- `tests/core/virtual-office/config-registry.test.js` (modified)

## QA Results

### Gate

**PASS** — AC1–AC8 are covered by compiler, CLI, manifest, generated-surface
and repository regression evidence. See
`docs/qa/gates/AEX-2.8-workflow-engineering-squad.yml`.

### Residual risk

The compiler maps and validates process definitions supplied by the operator;
it does not prove that the discovery input matches real company behavior. That
requires interviews and source evidence owned by the discovery phase. Generated
automation decisions remain non-executable until the normal governance,
capability and runtime gates authorize a later mission.
