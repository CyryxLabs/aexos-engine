# Story AEX-4.1 — Evidence-led upstream absorption

Status: InReview

## Request and scope

The user requested inspection of SynkraAI/aiox-core, SynkraAI/aiox-squads,
SynkraAI/aiox-dashboard and oalanicolas/aiox-research and implementation of
useful missing capabilities while preserving AEXOS identity and architecture.
The two supplied business-process maps are requirements evidence, not an
executable specification or permission to contact customers or move money.

This story delivers the first safe integration boundary: reproducible source
inventory, cross-squad task-contract coverage, executable outcome verification,
and Grok projection drift checking. The accompanying assessment explicitly
records remaining semantic review and integration work; this story does not
claim exhaustive feature parity, provider certification or production release.

## Acceptance criteria

- [x] AC1: Inventory every tracked path in all four fixed upstream snapshots,
  including blob identities, file classifications and normalized AEXOS matches.
  Report source identity and missing-license/submodule boundaries.
- [x] AC2: Provide a read-only CLI/API that reports core and registered squad
  task-contract coverage separately from runtime readiness; missing or invalid
  task definitions cannot be reported as contracted or operational.
- [x] AC3: Provide an outcome verifier that rejects missing declared artifacts,
  wrong file kinds, outside-root paths, symbolic-link escapes, missing required
  verification adapters and non-passing verification results. Never execute
  a command contained in an untrusted task definition automatically.
- [x] AC4: Integrate explicit required acceptance into AgentRuntime without
  silently certifying legacy execution. Required acceptance needs a contract;
  verifier failures reject acceptance, and execution cost remains settled.
- [x] AC5: Detect Grok projection drift by comparing against generation into
  an isolated temporary root. Do not overwrite installed projections.
- [x] AC6: Document source-to-decision mappings, rejected upstream behaviors,
  attachment interpretation and remaining work. No new dependencies, brand
  copying, private submodule ingestion or external writes.
- [x] AC7: Focused tests, lint, typecheck, full Jest and build are executed;
  failures are resolved when caused by this story or recorded with evidence.
- [x] AC8: An original decision rubric ranks only alternatives with complete
  source-referenced scores, applies non-compensable minimum thresholds, rejects
  malformed/duplicate identities and supports explicit weight overrides.
  Missing evidence is never converted to a score of zero or a winning claim.

## Design

REUSE task-contract loader, squad-registry and syncGrok. ADAPT verified outcome
acceptance as an original AEXOS implementation. Audit source content read-only;
do not execute upstream install scripts. CLI remains authoritative. Task
coverage is structural, never proof of operational competence. Optional
`requireAcceptance` is a migration boundary, not universal enforcement.

## File list

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.1-UPSTREAM-EVIDENCE-ABSORPTION.md`
- `docs/framework/epics/aexos-evolution/UPSTREAM-SNAPSHOTS-20260905.json`
- `docs/framework/epics/aexos-evolution/UPSTREAM-ABSORPTION-ASSESSMENT-20260905.md`
- `docs/guides/capability-evidence.md`
- `.aexos-core/core/execution/agent-runtime.js` — acceptance integration only;
  runtime foundation existed before this story
- `.aexos-core/core/execution/outcome-verifier.js`
- `.aexos-core/core/execution/capability-coverage.js`
- `.aexos-core/core/execution/decision-rubric.js`
- `scripts/audit-upstream-snapshots.js`
- `scripts/inspect-capabilities.js`
- `scripts/validate-grok-projection.js`
- `bin/aexos.js` — capabilities dispatch and help only
- `package.json` — three diagnostic scripts only
- `tests/core/execution/outcome-verifier.test.js`
- `tests/core/execution/capability-coverage.test.js`
- `tests/core/execution/decision-rubric.test.js`
- `tests/unit/grok-projection-audit.test.js`
- `tests/integration/capability-evidence-cli.test.js`

## Validation

Validation on 2026-09-05:

- `npm run lint`: PASS, zero warnings on final run.
- `npm run typecheck`: PASS.
- `npm run build`: PASS, including publish-safety and Core Free package boundary.
- `npm test -- --runInBand --silent`: PASS, 423 suites, 10,227 tests passed;
  12 suites and 163 tests skipped. This full run preceded addition of one extra
  runtime success assertion and two CLI integration tests; no production-code
  changes followed that run.
- Focused runtime/verifier/coverage/rubric/Grok tests after the extra assertion:
  PASS, five suites and 32 tests.
- Actual CLI integration tests: PASS, one suite and two tests.
- `npm run validate:grok-projection`: PASS, 61 files, no drift. Host runtime
  explicitly NOT_ASSESSED.
- Real coverage command: expected diagnostic exit 1, 580 tasks, one contracted,
  eight curator definitions incompatible with V1. Not treated as a passing
  operational-coverage gate or silently repaired by inventing contracts.
- Four-source inventory: PASS, 5,620 tracked paths, pinned commits and hashes.

AC trace: inventory → AC1; coverage unit tests → AC2; outcome unit tests → AC3–4;
Grok drift test → AC5; assessment/guide → AC6; commands above → AC7; rubric unit
tests → AC8; CLI integration tests verify the public entry point for AC3/AC8.

Technical self-review was performed in the same session, not by an independent
reviewer. Formal approval, release and live multi-provider certification remain
unclaimed. No cost advantage or market-leadership claim is inferred from source
similarity, file counts, fixtures or this story status. Remaining broad-request
work is explicitly recorded in the assessment rather than marked complete here.
