# STORY-AEX.10 — Truthful Fresh-Init First-Value Path

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)
**Status:** Ready for Review — 2026-09-07 independent QA and corrected full suite passed
**Executor:** `@dev`
**Quality Gate:** `@architect`
**Quality Gate Tools:** Jest, ESLint, TypeScript, package build, packed-artifact smoke test

## Story

As a first-time AEXOS user installing the published npm package, I want the
documented install command, init summary, command help and doctor result to
describe the same fresh project, so that the first successful install is not
immediately contradicted by false failures or missing components.

## Reproduced Baseline

The published `@aexos/core@5.3.0` artifact (`gitHead`
`e8755df0d990c42f30a234de1a1f7a42e6cbc139`) was probed on 2026-08-28 with:

```powershell
npx -y @aexos/core@5.3.0 init probe --ci --yes
Set-Location probe
npx -y @aexos/core@5.3.0 doctor --json
npx -y @aexos/core@5.3.0 init --help
```

Observed facts:

- init exits 0 and writes the framework, 10 core agent directories, 214 task
  files, 15 workflow files and 8 template files;
- the init summary nevertheless prints `Agents/Tasks/Workflows/Templates: ⨉`;
- doctor reports 4 failures: `rules-files`, `claude-md`, `npm-packages` and
  `hooks-claude-count`, even though the missing items are optional Claude IDE
  projections or expected for a greenfield project without `package.json`;
- `settings-json` warns that zero deny rules is below a fixed threshold even
  though contributor/project boundary configuration can legitimately generate
  zero rules;
- published init help still uses the GitHub install form and omits `--ci` and
  `--yes`;
- `origin/main` already contains partial npm/README corrections made after the
  published artifact, but init flag forwarding, summary truth and doctor
  semantics remain unresolved.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | `README.md` Start Here uses `npx @aexos/core init <name>` for a new directory and `npx @aexos/core install` for an existing directory; it does not direct first-time users to `github:CyryxLabs/AEXOS` and does not describe bare npx as a current executable-resolution failure. |
| AC2 | Running doctor against a fixture produced by the default fresh-init path has zero `FAIL` results, unless a file the default init contract actually promises is removed or corrupted. Expected-absent project `node_modules` and optional Claude-only rules, CLAUDE.md and hooks are not integrity failures. |
| AC3 | Doctor still fails for real framework integrity misses; the change does not globally downgrade malformed or missing required AEXOS artifacts. |
| AC4 | The init component summary is derived from what was written to the target and reports truthful non-zero counts/presence for agents, tasks, workflows and templates. It cannot print `⨉` when those component types exist on disk. |
| AC5 | `npx @aexos/core init --help` documents every init flag that the CLI honors, including `--ci` and `--yes`/`-y`, and init forwards those flags to the wizard consistently with install. |
| AC6 | Automated tests cover doctor on a fresh-init fixture, init summary versus on-disk agents/components, and init help/flag forwarding. |
| AC7 | A packed-artifact re-probe demonstrates: fresh init exits 0, init summary is truthful, doctor exits 0, and init help contains the supported flags and npm registry command. |
| AC8 | The diff does not change `aexosCommercial.installMode`, add a license wizard/gate, change commercial hero copy, add agent/team scale claims, add pricing, or modify the `package.json` repository URL. |
| AC9 | The PR body records the broken 5.3.0 probe, the root cause, the corrected re-probe commands and the resulting exit codes. |
| AC10 | Absolute fresh-project destinations resolve correctly, including Windows paths; regression coverage preserves existing nonempty-directory protection. |
| AC11 | Per the 2026-09-07 user request, remove the README website hero image block (logo may remain) and use npm-backed Doctor/help commands in the first-value path without requiring a global install. This explicitly supersedes the older prohibition on hero edits only for removal of that image block. No pricing or license gate changes. |
| AC12 | Persist actual installer IDE selections, including an empty selection, over copied author configuration. Missing Claude artifacts are optional only for explicit unselected Claude; selected/unknown/malformed configuration must not hide required failures. Malformed dependency manifests fail visibly. |

## Tasks / Subtasks

- [x] Establish one fresh-init contract and fixture (AC: 2, 3, 6, 7)
  - [x] Reproduce the published 5.3.0 output and preserve exact failure names
  - [x] Identify which files default init guarantees versus IDE-conditional and project-owned files
  - [x] Add a fresh-init integration fixture that runs doctor without manually adding optional files
- [x] Make doctor evaluate the installed project profile truthfully (AC: 2, 3)
  - [x] Treat absent project dependencies as neutral when no project package declares them
  - [x] Scope Claude-only checks to a selected/materialized Claude integration
  - [x] Keep invalid present files and missing required framework artifacts as real failures
  - [x] Derive settings boundary expectations from configuration rather than a universal count
- [x] Make init output and help match execution (AC: 4, 5, 6)
  - [x] Count installed component destinations rather than source-folder labels
  - [x] Parse and forward `--ci` and `--yes`/`-y`
  - [x] Update init help and add CLI regressions
- [x] Reconcile first-value documentation without commercial expansion (AC: 1, 8)
- [x] Run focused, full and packed-artifact gates; update evidence and File List (AC: 6–9)

## Dev Notes

### Root-cause constraints

- The CLI is the product authority; UI and marketing cannot substitute for a
  working command path. [Source: `README.md#The-Interface-Hierarchy`]
- The current doctor registry runs all checks unconditionally. Several checks
  encode framework-clone or Claude projection assumptions directly rather than
  reading the installed project profile. [Source: `.aexos-core/core/doctor/checks/index.js`]
- Default greenfield validation already considers the absence of a project
  `package.json`/dependencies valid, so doctor must not contradict that result.
  [Source: `packages/installer/src/wizard/index.js`]
- The wizard summary currently tests whether source folder names appear in
  `installedFolders`; the copied framework uses actual destination paths under
  `.aexos-core/development/`. [Source: `packages/installer/src/wizard/index.js`]
- Init currently forwards only template, skip-install and force to `runWizard`.
  Install already defines the intended `--ci`/`--yes` behavior. [Source: `bin/aexos.js`]

### Implementation constraints

- Use Node.js 18+ compatible ES2022 CommonJS, two-space indentation, single
  quotes and semicolons. [Source: `docs/framework/coding-standards.md`]
- Keep the patch in the existing CLI, installer, doctor and Jest test
  locations; do not add a dependency or introduce a second doctor path.
  [Source: `docs/framework/source-tree.md`]
- The required repository gates are lint, typecheck and Jest; build and packed
  artifact probing provide distribution evidence. [Source: `AGENTS.md`]

## Testing Requirements

```powershell
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
npm pack --dry-run
```

The release-like smoke must use a package tarball generated from the branch in
an empty temporary parent directory; it must not accidentally resolve the
working tree through `npm link` or a global installation.

## Scope Guard

Explicitly forbidden in this story:

- paid-license enforcement or entitlement UX;
- changes to `aexosCommercial.installMode`;
- pricing, tier, hero or scale-claim edits;
- repository URL changes;
- unrelated agent/squad expansion;
- publishing a new npm version or merging the PR.

## 🤖 CodeRabbit Integration

### Story Type Analysis

- **Primary Type:** CLI integration defect
- **Secondary Type:** Distribution/readiness truth
- **Complexity:** Medium — one user journey spans CLI, installer, doctor and docs

### Specialized Agent Assignment

- **Primary:** `@dev`
- **Quality:** `@architect`, `@qa`
- **Distribution:** `@devops`

### Quality Gate Tasks

- [x] Pre-Commit (`@dev`): focused regressions plus lint/typecheck/full Jest/build
- [x] Pre-PR (`@devops`): packed-artifact fresh-init and doctor re-probe

### Self-Healing Configuration

- **Mode:** light
- **Max iterations:** 2
- **Timeout:** 15 minutes
- **CRITICAL:** auto-fix; **HIGH:** document and resolve before PR

### Focus Areas

- No false-green installer validation followed by false-red doctor output
- Required versus optional artifact semantics
- Package-tarball behavior rather than checkout-only behavior
- Strict preservation of the commercial and repository metadata scope guard

## Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-08-28 | 0.1.0 | Story drafted from published 5.3.0 clean-machine probe | @sm |
| 2026-08-28 | 0.1.1 | Validated GO (9.7/10) — Status: Draft → Ready | @po |
| 2026-08-28 | 0.2.0 | Development started (yolo mode) — Status: Ready → InProgress | @dev |
| 2026-08-28 | 0.3.0 | First-value path implemented and verified — Status: InProgress → InReview | @dev |
| 2026-08-28 | 0.3.1 | QA Gate PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

GPT-5.6-sol (Codex)

### Debug Log References

- Published baseline: `C:\tmp\aexos-fvp-repro-20260828080933\probe`
- Packed branch artifact: `C:\tmp\aexos-fvp-packed-20260828084149\aexos-core-5.3.0.tgz`
- Packed smoke project: `C:\tmp\aexos-fvp-packed-20260828084149\probe`
- Focused regressions: 6 suites, 120 tests passed
- Full Jest: 397 suites passed, 9,882 tests passed, 12 suites/172 tests skipped
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run validate:manifest`: exit 0
- `npm pack --dry-run --json`: exit 0, 3,453 package entries
- CodeRabbit CLI: unavailable because the configured WSL environment has no `bash`; manual diff review and repository gates used as fallback

### Completion Notes

- Doctor now distinguishes project-owned dependency state, optional Claude IDE
  projections and required AEXOS framework integrity.
- The init summary and `aexos info` use direct definition files under the
  installed target, eliminating source-label and memory-directory inflation.
- Init help and execution share explicit `--ci`, `--yes` and `-y` semantics.
- Packed-artifact smoke: init exit 0; summary Agents 12, Tasks 214, Workflows
  15, Templates 8; doctor exit 0 with 16 PASS, 2 environmental WARN, 0 FAIL;
  init help exit 0 and contains registry usage plus both required flags.
- Scope guard verified: no package metadata, licensing, pricing, hero, scale
  claim or repository URL change.

### File List

- `.aexos-core/core/doctor/checks/claude-md.js`
- `.aexos-core/core/doctor/checks/hooks-claude-count.js`
- `.aexos-core/core/doctor/checks/npm-packages.js`
- `.aexos-core/core/doctor/checks/rules-files.js`
- `.aexos-core/core/doctor/checks/settings-json.js`
- `.aexos-core/data/entity-registry.yaml`
- `.aexos-core/install-manifest.yaml`
- `README.md`
- `bin/aexos.js`
- `packages/installer/src/wizard/index.js`
- `packages/installer/tests/unit/doctor/doctor-checks.test.js`
- `plan/self-critique-AEX.10.json`
- `tests/cli/init-first-value-contract.test.js`
- `tests/core/doctor/doctor-checks.test.js`
- `tests/core/doctor/fresh-init-contract.test.js`
- `tests/installer/wizard-component-summary.test.js`
- `tests/integration/onboarding-smoke.test.js`
- `docs/framework/epics/aexos-evolution/STORY-AEX.10-FIRST-VALUE-PATH.md`

## QA Results

### Final independent review — 2026-09-07

**Decision: APPROVED for the isolated first-value implementation; Ready for Review.** This decision supersedes the older revision's QA assessment below. PR publication/body evidence (AC9) remains DevOps-owned; this is not npm publication or acceptance of the separate root-checkout office/runtime work.

Argus independently reviewed the minimal changes against `origin/main` and existing PR revision `69815c6`. The three reproduced false-green issues were corrected: selected/unknown/malformed Claude profiles cannot hide absent required artifacts, default no-IDE installation persists `ide.selected: []` instead of copied author selections, and malformed dependency manifests fail. Independent temporary-project probes confirmed empty/Codex-only selections produce three INFO results; selected Claude, null/string/invalid selections produce three FAIL results; invalid JSON, null and array project/framework manifests produce FAIL. Independent focused validation passed 36 tests across three suites. README npm diagnostics, requested hero-image removal, absolute-path resolution and nonempty-directory protection remain within the authorized scope.

Final receipts independently read under `C:/AEXOS-LOCAL-TESTS/first-value-20260907/`:

- `devops-full-tests.json` and `.exit.txt`: success true, exit 0, **9,892 tests passed, zero failed, 172 skipped; 397 suites passed, zero failed, 12 skipped**. The earlier corrected aggregate had one unchanged recovery-handler 10-second timeout; its isolated rerun passed 28 tests. The complete subsequent aggregate above passed; the earlier failure was not treated as green.
- Lint, typecheck and build receipts pass; package safety gate reports 3,454 entries. No failing quality gate remains for this reviewed slice.
- `devops-final-receipt.json`: final post-manifest tarball SHA256 `4c24f81249b508da78bbe4b6de6001f4ebd13280b1f604f397cecec2a37b7c95`; absolute destination with spaces init, Doctor and init-help all exit 0. Init counts are 12 agents, 214 tasks, 15 workflow-directory files and 8 templates. Doctor reports **13 PASS, 2 WARN, 0 FAIL, 3 INFO**. Earlier corrected installed configuration was independently read and had explicit empty selection with all IDE flags false; the final receipt is consistent with that result.

The remaining Doctor warnings are Git-hook setup and the existing Windows npx caveat. Existing transitive dependency audit concerns reported by DevOps are not resolved by this patch. Validation occurred on Windows with isolated project/cache paths, not an OS-clean VM. No production source or tests were changed by this independent reviewer in the isolated checkout; only this QA Results entry was added. DevOps may update the top-level lifecycle status and finish AC9 after committing this reviewed result.

### Review Date: 2026-08-28

### Reviewed By: Argus (Test Architect)

### Reviewed Revision: working-tree-sha256:9f4027a4d80ffb204ba622e87fed59d6f9c0ddc82ec90e4dbbd045b611c747af

### Code Quality Assessment

The patch corrects the first-value contract at its actual authority points:
doctor checks, installed destination counts, CLI parsing/help and npm-facing
documentation. Required framework dependency failures and malformed present IDE
surfaces remain observable. No commercial or package metadata scope escaped.

### Refactoring Performed

None. QA reviewed the implementation without changing production or test code.

### Compliance Check

- Coding Standards: ✓ lint, typecheck and CommonJS conventions pass
- Project Structure: ✓ changes remain in existing CLI, installer, doctor and test locations
- Testing Strategy: ✓ focused, full-suite and packed-artifact evidence present
- All ACs Met: ✓ AC1–AC9 traced with no gaps

### Improvements Checklist

- [x] Fresh-init doctor contract covers expected-absent optional/project-owned files
- [x] Real framework dependency and present-but-empty Claude failures remain covered
- [x] Init help, flag forwarding, banner counts and `aexos info` counts are covered
- [x] Packed-artifact smoke validates the distribution path instead of the checkout only

### Security Review

No secrets, dependencies, authentication, entitlement or license behavior changed.
Malformed required framework dependency state still fails closed.

### Performance Considerations

The new work is bounded to small local directory and configuration reads. The
release-like init completed successfully with no material performance concern.

### Files Modified During Review

- `docs/qa/gates/aex.10-truthful-fresh-init-first-value-path.yml` — gate artifact
- `docs/framework/epics/aexos-evolution/STORY-AEX.10-FIRST-VALUE-PATH.md` — QA results and lifecycle transition

### Gate Status

Gate: PASS → docs/qa/gates/aex.10-truthful-fresh-init-first-value-path.yml

### Lifecycle Transition

PASS: InReview → Done

## 2026-09-07 isolated first-value re-probe

Environment: Windows x64, Node24.15.0, PATH-native npm/npx. Empty project plus isolated npm cache at C:/AEXOS-LOCAL-TESTS/first-value-20260907/npm-cache; this is not an OS-clean VM. No global package or npm link used.

Before edits, published exact command:

```powershell
npx -y @aexos/core@5.3.0 init C:/AEXOS-LOCAL-TESTS/first-value-20260907/published-project
```

Exit1 ENOENT: cwd was prepended to an absolute destination. Separate relative fallback init published-relative exited0 but showed component cross marks despite12 actual core agent definition files. From that project, npx -y @aexos/core@5.3.0 doctor --json exited1 with11PASS3WARN4FAIL: rules-files, claude-md, npm-packages, hooks-claude-count. Pinned init --help exited0 but still showed GitHub examples.

Existing PR69815c6 packed before editing: relative init0 with truthful12agents/214tasks/15workflows/8templates; Doctor0 with16PASS2WARN0FAIL. Absolute init still failed1. This confirmed the existing Doctor correction could be retained without importing unrelated audit changes.

Incremental IDS decisions: ADAPT existing bin target resolution with path.resolve, ADAPT CLI tests for absolute paths and existing-file preservation, ADAPT README to remove requested website image and use npm diagnostics/help, ADAPT this story for explicit AC10/11. No commercial configuration, package metadata, dependency, pricing or license gate changed.

After patch, packed-artifact commands (from the external after directory; npm_config_cache set to the isolated cache above):

```powershell
npx --yes --package=C:/AEXOS-LOCAL-TESTS/first-value-20260907/after/aexos-core-5.3.0.tgz aexos init 'C:/AEXOS-LOCAL-TESTS/first-value-20260907/after/project with spaces'
Set-Location 'C:/AEXOS-LOCAL-TESTS/first-value-20260907/after/project with spaces'
npx --yes --package=C:/AEXOS-LOCAL-TESTS/first-value-20260907/after/aexos-core-5.3.0.tgz aexos doctor --json
npx --yes --package=C:/AEXOS-LOCAL-TESTS/first-value-20260907/after/aexos-core-5.3.0.tgz aexos init --help
```

All three exit0. Init reports12/214/15/8, Doctor16PASS2WARN0FAIL; remaining warnings are git-hooks and windows-npx-install. Help contains npm usage, ci and yes flags. Evidence outside repository: pr-after-init.log, pr-after-doctor.json, pr-after-help.log and matching exit files under C:/AEXOS-LOCAL-TESTS/first-value-20260907. Published baseline and roster also preserved there.

Focused5 suites118 tests passed; lint/typecheck/build exit0; full Jest launched with --runInBand --silent --json, output in pr-full-tests.json/log outside the worktree (parent owns final acceptance). Initial pack before npm ci failed because development dependencies were absent and Windows could not run husky || true; npm ci --ignore-scripts supplied development tooling, and normal pack then passed. No source workaround added for this checkout prerequisite. Independent review of this follow-up remains pending; older Done/PASS evidence above applies to the prior revision.

### 2026-09-07 independent QA correction

QA rejected inherited unconditional optional-Claude PASS behavior: copied author ide.selected included Claude even in default no-IDE installations. The actual installation profile now replaces only the merged ide block and preserves an explicit empty selection; generated configs match the selection. Missing Claude artifacts return INFO only for an explicit valid exclusion; selected, missing or malformed profile evidence yields FAIL. Malformed project/framework package manifest JSON or nonobject roots now fail rather than silently pass.

IDS: CREATE small shared claude-optional helper for three absent-artifact checks; ADAPT existing environment config merge/template and dependency check; ADAPT existing Doctor and environment integration tests. Added regression for selected/malformed profiles, corrupt dependency manifests and exact empty/single IDE selection with unrelated fields preserved. Focused143 tests/6 suites pass; lint/typecheck/build pass. Independent QA separately ran36 tests/3 suites successfully.

Fresh corrected tarball: C:/AEXOS-LOCAL-TESTS/first-value-20260907/qa-fixed/aexos-core-5.3.0.tgz. The same after-patch npx --package commands above were rerun with qa-fixed replacing after. Absolute init with spaces exits0; installed selected[] and all IDE configuration flagsfalse. Doctor exits0:13PASS2WARN0FAIL3INFO, warnings only git-hooks/windows-npx-install. Receipt qa-fixed-receipt.json and qa-fixed-init/doctor logs+exit files are outside the worktree. Full corrected aggregate running with results in qa-fixed-full-tests.json/log/exit.txt; prior full aggregate397 suites9883 tests passed before these QA corrections.

Additional File List: `.aexos-core/core/doctor/claude-optional.js`, `packages/installer/src/config/configure-environment.js`, `packages/installer/src/config/templates/core-config-template.js`, `packages/installer/tests/integration/environment-configuration.test.js`. Existing Doctor check/test entries above also modified. Independent final acceptance remains with QA.
