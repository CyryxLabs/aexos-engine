# STORY-AEX-3.7 — Core Free Package Boundary

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)  
**Program:** [AEXOS 6.0 Three-Sprint Program](./RELEASE-6.0-THREE-SPRINT-PLAN.md)  
**Architecture:** [ADR-AEX-011](./adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md)  
**Status:** Done — 2026-09-08 package-hygiene regression independently approved; original delivery retained below  
**Executor:** `@dev`  
**Architecture Gate:** `@architect`  
**Final Quality Gate:** `@qa`  
**Depends on:** Sprint 2 (`Done`)

## Story

As the AEXOS publisher, I want one machine-enforced Core Free package boundary
so that the public npm artifact contains the orchestration framework, twelve
canonical software-delivery agents and Security squad, but no paid squad source
or generated agent projection.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | A versioned machine-readable manifest declares Core Free identity, the twelve canonical agent IDs, the single bundled `security` squad, required package paths and protected squad/projection roots. |
| AC2 | `package.json#files` is an explicit allowlist: it includes Core, canonical agents, Security source/projections and core workflow skills, while broad `squads/`, `.claude/commands/` and `.claude/skills/` entries are absent. |
| AC3 | The publish safety gate evaluates actual `npm pack --dry-run --json` output and blocks any non-Security squad under source or Claude projection roots, any `pro/` file, or any missing required Core artifact. |
| AC4 | The Core squad scaffolder defaults to exactly the manifest allowlist even in a full development checkout; private and previously installed local squads remain untouched. |
| AC5 | A real temporary tarball install proves the installed package has all twelve source agents, only Security squad/source projections, a working CLI and an installer that scaffolds only Security. |
| AC6 | Existing 5.x local squads are not deleted or rewritten; this story changes new 6.x artifact contents and Core scaffolding only. |
| AC7 | Tests cover manifest drift, synthetic paid-source/projection leakage, missing Core content, package allowlist and Core-only scaffold behavior. |
| AC8 | Lint, typecheck, full tests, build, package completeness, clean-install smoke and dependency audit pass; no publish, tag, push or Production change occurs. |

## Tasks / Subtasks

- [x] Add the Core Free machine-readable manifest (AC: 1)
- [x] Narrow package source and projection allowlists (AC: 2, 6)
- [x] Extend publish safety with actual tarball boundary validation (AC: 3, 7)
- [x] Restrict Core scaffolding to its declared squad allowlist (AC: 4, 6–7)
- [x] Add a real pack/install/CLI/scaffold smoke (AC: 5)
- [x] Run focused and repository gates; update story and QA record (AC: 8)

## Dev Notes

- The initial AEX-3.7 probe found 1,462 files under `squads/`, 168 Claude
  command projections and 168 Claude skill projections in the public dry-run
  tarball. `pro/` was absent, but the paid squad library was still exposed.
- Catalog metadata may remain public; executable paid squad definitions and
  generated persona instructions may not.
- No local user squad is deleted. Paid artifact acquisition is AEX-3.8.
- No Git, PR, tag, publish, external scan or Production operation is authorized.

## Testing Requirements

```powershell
npx jest tests/ids/squad-packaging.test.js tests/cli/core-package-boundary.test.js --runInBand
npm run validate:package-completeness
npm run test:e2e:core-free-install
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
npm audit --json
```

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-09-04 | 0.1.0 | Story drafted from the approved AEX-3.7 Sprint 3 outcome and live tarball evidence | @sm |
| 2026-09-04 | 0.2.0 | Validated GO (8/8); explicit allowlist and non-destructive migration boundary accepted | @po / @architect |
| 2026-09-04 | 0.3.0 | Development started — Status: Ready → InProgress | @dev |
| 2026-09-04 | 1.0.0 | Core manifest, tarball gate, scaffolder boundary and clean-install smoke completed — Status: InProgress → InReview | @dev |
| 2026-09-04 | 1.0.1 | Independent QA PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### 2026-09-08 package-hygiene correction

The fresh local tarball contained 1,924 files versus 1,917 in a clean source
snapshot: `.aexos-core/data/registry-update-log.jsonl` and six Python bytecode
caches were included. The accepted package-boundary contract is corrected to
exclude workstation runtime artifacts while preserving their local copies.

Added matching exclusions at the end of both package allowlists; placement is
significant because npm later directory inclusions can override earlier negative
patterns. The actual-pack test caught that ordering mistake on the first attempt
(10 tests passed, one actual-pack failure). After correcting placement, all 11
boundary tests pass, including four new synthetic log/cache cases and the real
tarball listing. The gate now rejects runtime cache paths independently of npm
filtering. No local runtime log or cache was deleted or read for content.

Changed paths for this regression: `package.json` (files only),
`.aexos-core/data/core-package-boundary.json`, `scripts/validate-core-package.js`,
and `tests/cli/core-package-boundary.test.js`. The package's independent private
test script belongs to ACL.12; its tar dependency belongs to ACL.13.

Final repack, installed regression checks and combined gates passed; independent QA APPROVED this correction. Core archive SHA-256: db2e658f950d2b221687a52f0bcb933acd682b9c582e7b4bada544ce56404c9f (1,918 files). Lint/typecheck/test/build exit 0; 10,589 public tests passed, 172 existing conditional/legacy skips disclosed, mandatory 133 contracts passed with zero skips. See artifacts/commercial-readiness-20260908/aex-3.7-package-hygiene-qa.md. This acceptance is local and does not certify a commercial release.

### Agent Model Used

GPT-5.6

### Debug Log References

- Initial real tarball probe: 1,462 squad source files plus 336 paid Claude projections exposed.
- Focused package boundary/scaffolder gate: 2 suites, 16 tests passed.
- `npm run validate:core-package`: 1,864 packaged files, 12 canonical agents and only Security; passed.
- `npm run validate:package-completeness`: 36/36 checks passed.
- `npm run test:e2e:core-free-install`: real tarball pack/install, CLI and Security scaffold passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Full regression: 415 suites / 10,119 tests passed; 12 suites / 163 tests skipped; exit 0.
- `npm run build`: publish safety and Core Free boundary passed with 1,864 packaged files and no paid `pro/` content.
- `npm audit --json`: zero known vulnerabilities across 679 dependencies.
- `git diff --check`: passed.

### Completion Notes

- Added one machine-readable Core Free boundary manifest that binds package files, all twelve canonical agents and the Security-only squad allowlist.
- Replaced broad squad and Claude projection package entries with explicit Core/ Security paths.
- Added a tarball-content validator and made it a mandatory publish safety sub-gate.
- Restricted the Core scaffolder to its declared Security allowlist even when invoked from a full development checkout.
- Preserved private and legacy local squads by keeping scaffolding additive and never deleting existing project content.
- Added a real temporary tarball install that verifies installed agents, source/projections, CLI startup and Security-only project scaffolding.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-3.7-CORE-FREE-PACKAGE.md` (added)
- `.aexos-core/data/core-package-boundary.json` (added)
- `package.json` (modified)
- `scripts/validate-core-package.js` (added)
- `bin/utils/validate-publish.js` (modified)
- `packages/installer/src/installer/squad-scaffolder.js` (modified)
- `tests/ids/squad-packaging.test.js` (modified)
- `tests/cli/core-package-boundary.test.js` (added)
- `scripts/e2e/core-free-install-smoke.js` (added)

## QA Results

### 2026-09-08 package-hygiene addendum

**APPROVED** for the reopened cache/log exclusion correction. Independent review
and 11 tests (including actual npm enumeration) passed. Final Core TGZ SHA-256
`db2e658f950d2b221687a52f0bcb933acd682b9c582e7b4bada544ce56404c9f` has
1,918 files, preserves required Core/Security contents and excludes local caches
and the registry update log. Its installed init/Doctor/SYNAPSE checks passed.
Final public lint/typecheck/test/build exit 0; 10,589 passed/zero failed/172
optional or conditional skips, with zero skips in mandatory contracts. QA matched
4,325 source hashes before/after and to current root. Report:
`artifacts/commercial-readiness-20260908/aex-3.7-package-hygiene-qa.md`.
This addendum does not extend the historical acceptance to remote release or
unverified platforms/providers.

### Gate

**PASS** — AC1–AC8 are covered by manifest, real tarball inspection, synthetic
leak tests, Core-only scaffolding, clean installation, CLI startup and full
repository regression evidence. See
`docs/qa/gates/AEX-3.7-core-free-package.yml`.

### Residual risk

The clean-install evidence was executed on this Windows host; CI still needs the
same smoke on Linux and macOS before stable release certification. Public
catalog metadata may name paid squads, but their executable source and generated
persona projections are absent. Authenticated acquisition, signature validation
and entitlement enforcement belong to AEX-3.8 onward; no package was published.

## Isolated integration local acceptance — 2026-09-09

Independent final QA APPROVED and PO pre-PR PASS bind exact candidate
`ece92e5d9a0f2ffe3b42ceabfa673b5b4f1390fe`, tree
`6c02375bfb3e4d6367e21693a400bfb72137eeb9`, on signed-installer base
`628ee1cd980a39a27bacf00ecbc6da7ad668b258`. The 55-file integration preserves
original criteria and prior historical delivery; it is not publication.

Nine corrected gates pass: 10,130 tests / zero failures / 168 existing skips.
Final packages contain 1,779 Core and 84 standalone files, with exact installed
binding, legacy preservation, seven final signed-installer cases and actual
empty-evidence refusal exit 4. Free init/Doctor exit 0 with 13 PASS / 2 WARN /
0 FAIL / 3 INFO. The earlier incomplete final portable invocation remains
failure evidence; unchanged script/archive rerun passes and its initial cause
is unestablished. Exact receipts and post-gate EOF/manifest deltas are recorded in
`artifacts/commercial-readiness-20260908/core-free-boundary/po-final.md`.

Local package-boundary mechanics are accepted. Actual remote PR/read-back stays
open. Publication is prohibited: Core 5.3.0 remains below unchanged Security
6.0.0 minimum, and no runtime minimum-enforcement or compatible-product claim
is made. A later version/channel approval and actual compatible acceptance are
required. Frozen candidate/public documentation remains unchanged.
