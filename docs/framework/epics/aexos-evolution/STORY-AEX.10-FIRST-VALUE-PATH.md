# STORY-AEX.10 — Truthful Fresh-Init First-Value Path

**Epic:** [EPIC-AEXOS-EVOLUTION](./EPIC-AEXOS-EVOLUTION.md)
**Status:** Done
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
