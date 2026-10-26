# Story AEX-4.3: Premium and accessible terminal installation experience

## Status

Ready for Review — illustrated AEXOS welcome and visual selectors V1–V7 independently APPROVED / PASS. Final source, real ConPTY and packed-artifact acceptance are recorded below. Completed R1–R9 and all earlier receipts remain historical evidence; no npm publication or stable-release approval is implied.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [terminal-review, jest, lint, typecheck, build]

## Story

**As a** new AEXOS operator, **I want** a polished, clear installation flow, **so that** I understand the configuration, progress, outcome and next useful action without visual clutter.

## Context and dependencies

The user requests an advanced installation layout/design and the best possible UX. Scope is the existing terminal wizard; introduce no separate UI dependency. Read [accumulated-context.md](./accumulated-context.md#2026-09-06-audit-and-experience-remediation). Coordinate completion truth with AEX-4.2, while visual helpers can be developed independently.

## Current visual revision — illustrated AEXOS terminal welcome

The owner supplied a Hermes Agent terminal screenshot as a composition reference and explicitly requests a large, bold AEXOS wordmark with a character-built illustration based on the actual AEXOS logo. This is a visual revision of the existing installer entry, with AEXOS teal/silver branding. It does not introduce a chat product, runtime dashboard, provider execution or new command surface.

[AUTO-DECISION] Visual precedence → the owner's new illustrated-brand direction supersedes the earlier R1 requirement for a restrained welcome. Preserve the accepted installer behavior and accessibility; the previous word "restrained" must not be used to reject the now-requested prominent wordmark or logo illustration.

[AUTO-DECISION] Reference use → use the supplied Hermes composition to guide hierarchy and placement, while deriving the character illustration from the canonical AEXOS logo discovered by the lead. Record the actual source asset path in implementation evidence. Do not invent a logo, copy Hermes's caduceus/yellow identity, or claim an unverified asset is canonical.

### Current visual acceptance criteria

- [x] V1 — **Recognizable AEXOS identity:** the interactive welcome presents a large, bold, clearly readable AEXOS wordmark and a recognizable character-built interpretation of the actual AEXOS logo. Use AEXOS teal and silver/neutral tones in supported color terminals, with a coherent monochrome form. The source logo is identified in the implementation record and compared with the rendered terminal illustration during independent visual review. No Hermes name, caduceus or copied yellow brand treatment is shipped.
- [x] V2 — **Illustrated composition with useful context:** at 80 and 120 columns, show a deliberate two-column composition with the logo illustration beside concise, actual package/workspace/tool/host metadata, supported by the large wordmark. Align columns and spacing so the first installer action is clear and accessible immediately after the welcome. Use existing installer information only; do not add simulated command history, chat input, agent activity, progress or new functionality to fill the layout.
- [x] V3 — **Capability-aware rendering:** at 40 and 60 columns, use a compact composition that retains AEXOS identity, important context and the next action without clipped content or broken borders. Long/Unicode workspace paths remain understandable. Validate truecolor and 256-color output using the detected terminal capabilities; `NO_COLOR`, `TERM=dumb` and non-TTY output preserve a readable plain form without styling/cursor escapes or animation. Do not require a particular font, external renderer or new environment-variable contract. Prompt and command text remains keyboard-usable and copyable.
- [x] V4 — **Metadata truth:** version and inventory values come from the package actually executing; installed-workspace/selected-host values come from the actual target state or reviewed choices. Clearly distinguish bundled package inventory, installed artifacts and configured hosts. Missing or unavailable data is labeled accurately rather than fabricated as zero or live. A tool definition or host configuration is never presented as an available runtime, connected provider or current session. Rendering the welcome makes no provider/tool execution calls and exposes no credentials.
- [x] V5 — **Bounded integration and no regressions:** apply the welcome consistently to the existing default, `install` and `init <project>` entry paths, respecting quiet/plain behavior and avoiding duplicate welcomes. Preserve the accepted review/change/cancel flow, pre-install side-effect boundary, progress/outcome truth, npm-first guidance, flags, target semantics, error handling, Doctor behavior, licensing and free-core access. Reuse the current CommonJS installer and existing dependencies. This revision introduces no dependency, provider action, new product feature, pricing change or separate PR/release requirement.
- [x] V6 — **Current terminal/package acceptance:** capture and independently inspect actual PTY output at 40/60/80/120 columns, including truecolor, 256-color and plain capability cases. Record exact commands, dimensions, capability settings, exit codes, visual observations and pass/fail. Verify the branded entry still reaches review/change/cancel and installation; run the final packed artifact in a fresh target including a path with spaces, then verify init and Doctor exit 0 with no FAIL checks and truthful inventory. Record package hash and source/installed binding. Run meaningful focused rendering/flow regressions plus `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`; obtain independent QA, record actual CodeRabbit availability/results and limitations, and update file list before marking Ready for Review. Earlier R1–R9 receipts do not substitute for these visual-revision gates.

- [x] V7 — **Clear visual options and selectors:** existing installer choices show a distinct navigation-focus indicator and an explicit selected/marked state that remains understandable when focus moves and without color. Each option has a short, understandable description of its consequence. Display applicable keyboard hints beside the selector: arrows to navigate, Space to toggle multi-selection, and Enter to confirm/continue. Preserve selected answers and the review/change/cancel step before installation. Verify readable labels, descriptions, state indicators and hints at 40/60/80/120 columns; compact layouts must not hide an option or its state. When rich interaction is unavailable but interactive input is supported, provide a clear numbered plain fallback with visible selected/default values and matching input instructions. Existing noninteractive flags must remain prompt-free. Actual PTY evidence and independent review under V6 must cover focus movement, selection changes, multi-selection and the plain numbered fallback; screenshots of the welcome alone do not satisfy this criterion.

### Current visual tasks and ownership

- [x] Record the new user direction, V1–V6 and historical evidence boundary; validate the revised story draft.
- [x] Add the owner's explicit request, "as opcoes e seletores devem ser claros e totalmente visuais para os usuarios", as V7 without changing V1–V6 or completed R1–R9.
- [x] Lead identifies the canonical AEXOS logo and records the asset/design source (V1).
- [x] Assigned @dev implements the illustrated welcome and capability adaptations within the existing installer presentation helpers (V1–V5).
- [x] Lead implements clear focus/selection states, option descriptions, adjacent keyboard hints and the plain numbered fallback in the existing selectors, coordinating shared presentation files with the welcome owner (V7).
- [x] Assigned @dev/@qa verifies metadata provenance, width/color behavior and accepted installer flow regressions (V3–V5).
- [x] Lead/@qa captures actual PTY and packed-artifact evidence, completes gates and independent visual acceptance (V6).

@sm owns only this story through handoff. The lead owns asset discovery, design direction and the selector implementation; the assigned @dev owns the existing welcome renderer and coordinated call sites in `packages/installer/src/wizard/feedback.js`, `install-experience.js`, `index.js` and `bin/aexos.js` only where necessary. Reuse existing banner/color helpers when appropriate. @qa independently reviews the source, actual terminal captures and package receipts; coordinate exact source/test-file ownership before edits. Preserve concurrent work. The final implementation record must list only files actually changed for V1–V7, separately from the completed R revision below.

### Current visual story-draft checklist

Pre-implementation draft gate: READY; clarity 9/10. Applied `.aexos-core/product/checklists/story-draft-checklist.md` using the current user direction, the completed R revision, its integration boundaries, and [accumulated-context.md](./accumulated-context.md#2026-09-06-audit-and-experience-remediation). No new epic or runtime architecture was required. Final implementation acceptance is recorded below.

| Checklist category | Result | Basis |
| --- | --- | --- |
| Goal and context | PASS | Explicit illustrated welcome request, visual precedence and installer-only scope. |
| Technical guidance | PASS | Existing renderer/call sites, capability matrix, metadata provenance and ownership are identified. |
| References | PASS | User reference role and canonical-logo discovery are explicit; prior architecture and accumulated context remain linked. |
| Self-containment | PASS | V1–V7 define brand, composition, compact/plain behavior, truth, explicit selector states and preserved flow. |
| Testing | PASS | Actual PTY includes selector movement/marking/plain fallback; package/init/Doctor, focused regressions, full gates and independent visual review are required separately. |
| CodeRabbit | PASS | Existing enabled integration and self-healing policy below apply; new execution results or unavailability must be recorded. |

Developer perspective: the lead can choose the exact character technique from the verified logo without another product question. A generic generated emblem or a good-looking terminal mockup alone cannot satisfy V1/V6. Database, API and deployment checklist items are not applicable. This readiness assessment does not mark implementation or visual acceptance complete.

### Current visual implementation record and file list

Implemented in the existing CommonJS installer without added product dependencies. The welcome uses a six-row AEXOS wordmark, a silver/teal character monolith and real executing-package inventory/workspace context. The canonical reference was `C:/Users/ppetr/OneDrive/Desktop/Cyryx Labs/03_Brandboard/Imagery/cyryx_labs_icon_versa_dark_crop.png`, compared against the official monolith in `Cyryx_Labs_Design_System_v1.md`. No raster logo dependency is required at runtime. Compact forms, reduced spacing and a reserved last terminal column keep the welcome and first selector visible together at 80 columns / 36 rows.

Scoped Inquirer presentation distinguishes focus from selection using a focus arrow/background, a single-choice marker and `[x]`/`[ ]` multi-selection, with selected counts, contextual descriptions and keyboard hints. Existing input/default/validation/cancellation behavior remains authoritative. Review/edit/install/cancel, CLI-only selection, target semantics and actual installation outcomes are preserved. Package definitions, installed artifacts and configured hosts are not described as live provider activity.

Current verification evidence is rooted at `artifacts/cli-brand-20260907/accepted/`. Exact commands and the case matrix are recorded in `artifacts/cli-brand-20260907/accepted/verification.md`; machine-readable package and terminal results are in `artifacts/cli-brand-20260907/accepted/package-acceptance.json` and `artifacts/cli-brand-20260907/accepted/terminal-acceptance.json`.

All four final gates exited 0: lint, typecheck, the repository Jest suite and build. Jest recorded **10,524 passed / 0 failed / 163 skipped; 440 passing suites**, with a natural exit after 213.27 seconds. The recorded test command invokes the same Jest binary as `npm test` with `--runInBand --silent --json`; no `--forceExit` is used. Redacted results are in `artifacts/cli-brand-20260907/accepted/cli-ux-final-test-results.json`. Skipped tests are not accepted as verified functionality.

Final tarball SHA-256: **`bef7a5d3cc7b3e70306f188cfcbeb784b2b8140c6c3b7f98164816324b5f1141`**. Package installation, default init into `Paulo's final first value workspace`, and Doctor each exited 0. Default Doctor reported **8 PASS / 2 WARN / 0 FAIL / 9 INFO**; installed inventory was **12 agents / 213 tasks / 14 workflows / 8 templates**. Fourteen source/installed implementation file pairs match by SHA-256, including preserved earlier installer work; the eleven source/test files actually changed for this visual revision are listed below.

Eight accepted real ConPTY cases cover 40/60/80/120 columns, truecolor, explicit 256-color, `NO_COLOR`, `TERM=dumb`, Ctrl+C, review cancellation and an interactive edit/install. NO_COLOR and dumb cases contain zero application ESC bytes. Cancellation exits 130 with no installed `.aexos-core` or success message. The successful case edits Advanced to Assisted before installation and persists `user_profile: bob` with `ide.selected: [claude-code, codex]`; Doctor exits 0 with **15 PASS / 3 WARN / 0 FAIL / 1 INFO**, recorded in `artifacts/cli-brand-20260907/accepted/interactive-doctor.json`.

The accepted 256-color case is `packed-visual-120-256`, using the installed color library's explicit `--color=256` support; its application output contains 256-color sequences and no truecolor sequences. On this Windows environment `FORCE_COLOR=2` alone still permits detected truecolor, so the earlier `packed-visual-120` receipt is not counted as 256-color acceptance. Actual terminal captures and key/exit receipts are stored beside the verification record; the serialized HTML represents recorded terminal output rather than a UI mock.

Independent QA is **APPROVED / PASS for V1–V7**, recorded in `artifacts/cli-brand-20260907/accepted/independent-qa.md`. QA independently ran 47 focused tests, recomputed the final tarball and all 14 source/installed file-pair hashes, read the final gate/Doctor/installed-configuration receipts, and visually inspected serialized actual packed ConPTY captures. No reproduced blocking defect remains in this scoped revision. CodeRabbit is unavailable: no `coderabbit`/`cr` executable or callable tool was found, and no CodeRabbit run is claimed.

Verification is limited to the existing Windows machine, ConPTY and Node v24.15.0; fresh directories are not a clean-OS, screen-reader, macOS/Linux, provider-runtime or release certification. The 163 skipped tests and Doctor warnings remain explicit limitations. The logo is a character interpretation, English-only installer behavior remains, and later questions naturally scroll earlier welcome content while focused controls remain visible. The node-pty/xterm tooling used for external QA was already installed with Cursor and was not added to product dependencies. No npm publication or stable release was performed.

#### Current visual file list

- `packages/installer/src/utils/aexos-banner.js`
- `packages/installer/src/wizard/install-experience.js`
- `packages/installer/src/wizard/visual-selectors.js`
- `packages/installer/src/wizard/feedback.js`
- `packages/installer/src/wizard/index.js`
- `packages/installer/src/wizard/questions.js`
- `packages/installer/src/wizard/ide-selector.js`
- `tests/wizard/install-experience.test.js`
- `tests/wizard/visual-selectors.test.js`
- `tests/wizard/integration.test.js`
- `tests/wizard/index.test.js`
- `docs/framework/epics/aexos-evolution/STORY-AEX-4.3-PREMIUM-INSTALLER-UX.md`
- `artifacts/cli-brand-20260907/accepted/` — exact verification commands, sanitized gate/terminal/package evidence and independent QA report; not npm content.

No package manifest, lockfile, provider, Virtual Office, Doctor or pricing changes were made for this visual revision. Existing unrelated changes remain preserved. @sm changed only this story's final records and checklists.

## Historical R revision — installer flow and acceptance, 2026-09-07

R1–R9 below were completed and independently approved before the illustrated-brand request. Their exact wording, checked states, package hashes and verification receipts are retained as historical evidence. V1–V6 now govern the welcome's visual acceptance; the accepted installer behavior remains a regression baseline.

The owner asks: "voce corrigiu o cli layout e design? quero que a instalacao seja perfeita com a melhor UI/UX na classe CLI possivel". This revision improves the existing terminal installation journey. Translate the quality ambition into the measurable criteria below; neither prior Doctor fixes nor Virtual Office acceptance proves this terminal experience is complete.

[AUTO-DECISION] Reopen AEX-4.3 rather than create another installer story → use the existing owner and integration points, preserving its original acceptance wording and receipts as history. The lead explicitly assigned this revision and the user authorized the work.

[AUTO-DECISION] Product scope → improve presentation, explanation and review of existing installation choices only. Keep the existing English-only wizard policy, command semantics and commercial boundaries. No new product surface, dependencies, provider actions or paid gate on free first value.

[AUTO-DECISION] Tracking → maintain this local framework story; no ClickUp creation or external message is needed. Cross-story context remains [accumulated-context.md](./accumulated-context.md#2026-09-06-audit-and-experience-remediation): AEX-4.2 owns Doctor correctness, while AEX-4.3 owns the terminal journey and truthful completion.

### Historical R acceptance criteria

- [x] R1 — **Coherent terminal design:** welcome, configuration, review, installation, validation and outcome use one restrained AEXOS/Cyryx hierarchy, concise headings, consistent spacing and status vocabulary. Present one meaningful action at a time. Avoid repeated banners, competing panels, decorative noise or promotional/price content in the free first-value path. The actual version and target are visible where they inform a choice.
- [x] R2 — **Terminal capabilities and accessibility:** exercise 40-, 60-, 80- and 120-column terminals. Long paths, labels and accented/wide characters remain understandable, with no clipped decisions, broken borders or color-only status. Plain/non-TTY, `NO_COLOR` and `TERM=dumb` output contains no styling escapes, cursor animation or unreadable control characters. Preserve usable keyboard prompts where input is interactive and existing noninteractive behavior where it is not; never wait for an unavailable terminal. Keep commands copyable rather than inserting hard breaks into command arguments.
- [x] R3 — **Explained existing choices:** explain the consequences of the existing profile, project type, host selection and applicable configuration choices at their point of use. Defaults and optional choices are clear; show how to select, continue and cancel. Do not claim that creating host files connects, authenticates or launches a provider. No new profiles, integrations, edition rules or configuration capabilities are introduced.
- [x] R4 — **Review, change and cancel:** before installation copies/configures artifacts or installs dependencies, interactive users can review the resolved target and selected applicable options, choose Install, return to change choices, or cancel. Returning to configuration preserves prior answers and the next review reflects changes. Cancellation exits clearly without installing artifacts and does not print success. If `init` has already created an empty target directory under its existing semantics, report and verify that honestly; do not promise an automatic rollback. Explicit noninteractive/default-accepting flags retain their existing semantics and do not acquire a new confirmation requirement.
- [x] R5 — **Progress tied to real work:** display meaningful current phases and completed/failed operations from actual execution. An animation is allowed only for a supported interactive terminal while work is pending; no invented percentages, duration promises, counters or provider activity. Prompts and subprocess output do not fight a live renderer. Stop/clear terminal activity on success, cancellation and failure, preserving useful diagnostic output.
- [x] R6 — **Truthful outcome and usable recovery:** completion shows verified on-disk counts, the actual target/selected hosts and remaining warnings separately. Required failures or partial installation cannot appear as successful completion. Errors identify the failed operation and an applicable retry/diagnostic step without exposing secrets. Next steps are short, executable and npm-first (`npx @aexos/core ...`), with a safely quoted directory change when needed. Never print a host-specific activation action for an unselected host or an unsupported command.
- [x] R7 — **Consistent entry points, preserved behavior:** `npx @aexos/core`, `npx @aexos/core install` and `npx @aexos/core init <project>` share the same installation design language while preserving the existing current-directory versus named-target distinction. Help, error guidance and success guidance agree on those semantics. Preserve existing flags, safe defaults, overwrite/nonempty protections, dry-run behavior, install/upgrade logic, licensing rules and free-core access. Do not change Doctor checks to accommodate presentation failures.
- [x] R8 — **Observed terminal and package acceptance:** capture actual PTY walkthroughs for selection, review/change, cancellation and successful installation, plus plain-output and recoverable-failure receipts. Record width/capability settings, exact commands, exit codes and pass/fail; width helper tests alone are insufficient. Run the packed artifact in fresh empty directories, including a path with spaces, and verify default init then Doctor exit 0 with no FAIL checks, truthful counts and copyable guidance. Bind receipts to the package hash and record machine/OS scope; a fresh directory is not a clean-OS certification.
- [x] R9 — **Independent acceptance and gates:** meaningful renderer/flow regressions cover R2-R7, including no installation before confirmation and no success after failure. Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` on the final implementation. An independent reviewer inspects real terminal evidence against R1-R8. Record actual CodeRabbit availability/results, unresolved limitations and the final file list before marking Ready for Review; do not reuse historical gates as current evidence.

### Historical R tasks and ownership plan

- [x] Reopen this story, preserve prior evidence and validate the revised draft against `story-draft-checklist.md` (R1-R9).
- [x] Capture the current CLI journey and identify concrete visual/flow defects before changes (R1-R7).
- [x] Unify terminal presentation/capability handling using existing helpers; implement review/change/cancel around the existing configuration flow (R1-R5, R7).
- [x] Align actual progress, warning/error treatment and npm-first completion guidance without changing installer results (R5-R7).
- [x] Add focused capability, review/cancel and outcome regressions; exercise actual PTY and packed installation (R2-R8).
- [x] Complete gates, independent terminal review and the current implementation evidence/file list (R9).

| Owner | Responsibility and candidate files | Coordination boundary |
| --- | --- | --- |
| @sm | This story only | Release ownership after revised AC and checklist are recorded. Never edit source. |
| @dev, assigned by lead | `packages/installer/src/wizard/install-experience.js`, `feedback.js`, `index.js`, `questions.js`; existing banner/color helpers only where inspection proves necessary | One writer owns the shared wizard flow. Preserve existing Doctor/host-selection fixes and unrelated work. |
| Lead/@dev, assigned separately | `bin/aexos.js` entry/help/preamble changes and corresponding CLI regression tests | Coordinate options and display contracts with the wizard owner before editing shared code. No command semantic changes. |
| @qa | Independent test/review responsibility in `tests/wizard/`, relevant installer/CLI test files and actual terminal receipts | Agree exact test-file ownership with @dev; do not overwrite concurrent test edits. |
| Lead/@devops | Final package/quality evidence and review handoff | Only @devops performs remote push/PR operations if required. No release is implied. |

This is an ownership plan, not an assertion that every candidate file needs changes. The assigned implementer must maintain the actual file list. Do not touch the completed Virtual Office, provider runtimes, pricing or unrelated configuration modules for this revision.

### Historical R implementation context

Reuse the existing CommonJS wizard, prompt libraries and terminal helpers. `install-experience.js` already centralizes presentation; `index.js` sequences options, installation and validation; `feedback.js` handles progress/outcomes. `bin/aexos.js` currently distinguishes `install` in the current directory from `init` in the resolved named directory, and may create that directory before invoking the wizard. Preserve those boundaries while making the journey consistent. No new schema, API, database or environment-variable contract is required.

The prior revision reported English-only output, actual artifact counts and host-selection failure handling. Reinspect those behaviors at current source/package boundaries; preserve truthful diagnostic warnings. AEX-4.2 and the separate first-value fix remain dependencies for clean-init correctness, not evidence of terminal design acceptance. See [original Dev Notes](#dev-notes) for framework architecture and testing references and [accumulated context](./accumulated-context.md#2026-09-06-audit-and-experience-remediation) for ownership.

### Historical R verification plan

| Scenario | Required observation |
| --- | --- |
| Interactive TTY at 40/60/80/120 columns | Readable actual prompts, review and outcome; long target/labels; no broken panel or hidden action. Include at least one real walkthrough at a narrow and a standard width. |
| Review → Change → Review → Install | Choices survive the return, edited choices update, no install operations run before Install. |
| First-prompt cancellation and review cancellation | Honest cancellation and exit code, no installed artifacts/success; record any already-created empty target. |
| Non-TTY, `NO_COLOR=1`, `TERM=dumb` | Stable plain log, readable state, no styling/cursor escapes, no wait for unavailable input. |
| Existing dry-run/CI/default flags | Preserve observed command semantics and exit behavior; no new paid gate or provider action. |
| Required installation failure | Failed operation/recovery visible, no false success, renderer stopped and meaningful diagnostics retained. |
| `npm pack` → fresh named target (including spaces) → default init → Doctor | Actual package hash, exact invocation and working directory, init/Doctor exit 0, no Doctor FAIL, real counts and usable next commands. |
| Final quality gates and independent review | Exact commands, pass/fail, limitations and source/package binding. |

Use existing Jest suites for behavioral regressions. Controlled failure fixtures may validate error paths without making real provider calls. Save sanitized transcripts; do not include credential values or dump environment variables. The final verification record must contain the commands actually executed, rather than reporting this plan as completed.

### Historical R story-draft checklist result

READY for implementation; clarity 9/10. This is story readiness, not implementation or visual acceptance. Validated against `.aexos-core/product/checklists/story-draft-checklist.md` after reading the existing story, epic accumulated context, task/template, configuration and source entry points.

| Checklist category | Result | Evidence / remaining implementation consideration |
| --- | --- | --- |
| Goal and context | PASS | User request, bounded installer scope and AEX-4.2 dependency are explicit. |
| Technical guidance | PASS | Existing helpers/entry points, terminal capabilities and file ownership are identified; no new dependency or data contract. |
| References | PASS | Relevant cross-story context is linked and summarized; original architecture references remain below. |
| Self-containment | PASS | R1-R9 define behavior, safeguards, width modes and failure/cancellation edge cases. |
| Testing | PASS | Behavioral, actual PTY, packed install and final gate criteria have distinct evidence requirements. |
| CodeRabbit | PASS | Enabled in core config; existing review/self-healing section applies to this revision, with actual availability and independent fallback review recorded at execution. |

Developer perspective: implementation can start without another product decision. Investigate prompt-library capability behavior and the exact pre-install side-effect boundary before selecting a design. Prior checked boxes do not resolve either question. Database/API/deployment-specific checklist items are not applicable.

### Historical R implementation record

Completed with the existing CommonJS/prompt architecture and no added dependencies. Review/edit/cancel precedes framework writes; profile and empty-host edits persist; fresh generated configuration no longer causes a false overwrite prompt; actual counts and recovery commands reflect runtime results. Core, dependency and host spinners share terminal capabilities. Existing IDE validation honors quiet mode while retaining failures.

Final gates: lint/typecheck/build exit 0; full Jest 10,501 PASS, 0 FAIL, 163 existing skips, 439 passing suites, natural exit 0 (425.201s). The initial full-run fixture mismatch inherited NO_COLOR despite mocking rich prompts; it was corrected and the entire suite rerun successfully.

Final tarball SHA-256: 5492c5b9d365f4cec388247cdd7a0ec2c6c17d1ccf53ed06d2d77d8cb0030a64. Twelve source/installed file pairs independently match. Default packed init and Doctor exit 0 (8 PASS / 2 WARN / 0 FAIL / 9 INFO for CLI-only); actual 40/60/80/120-column receipts include edit/install, cancellation, Unicode paths, plain host setup and failure recovery. Counts: 12 agents / 213 tasks / 14 workflows / 8 templates.

QA: APPROVED by independent @qa for R1–R9. Root performed browser visual inspection of actual serialized terminal captures; independent review used code and terminal semantics after its file-URL browser access was blocked. CodeRabbit is unavailable. Windows/Node24.15.0 only; no clean-OS, screen-reader, macOS/Linux, Pro enrollment, native provider or release certification.

Evidence and exact commands: artifacts/cli-ux-20260907/verification.md, package-acceptance.json, accepted-packed-*.receipt.json, cli-ux-final-test-results.json and independent-qa.md. Source changes remain in the existing dirty workspace; unrelated changes were preserved and the minimal first-value PR was not broadened.

### Historical R file list

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.3-PREMIUM-INSTALLER-UX.md` — revised acceptance and evidence.
- `bin/aexos.js` — shared entry semantics, flags, narrow help and early failure recovery.
- `.aexos-core/infrastructure/scripts/ide-sync/index.js` — suppress successful quiet reports, retain failures.
- `packages/installer/src/wizard/install-experience.js` — capabilities, panels, plan/outcome, plain prompts and quoting.
- `packages/installer/src/wizard/feedback.js` — compact welcome and terminal activity lifecycle.
- `packages/installer/src/wizard/index.js` — collect/review/edit/execute/verify/report and prompt policy.
- `packages/installer/src/wizard/questions.js` — concise explained choices and review defaults.
- `packages/installer/src/wizard/ide-selector.js` — explicit CLI-only selection.
- `packages/installer/src/wizard/i18n.js` — valid npm-first retry guidance.
- `packages/installer/src/wizard/ide-config-generator.js` — shared spinner, prompt policy and compact in-wizard summary.
- `packages/installer/src/config/configure-environment.js` — generated-config provenance, reviewed profile and cancellation.
- `packages/installer/src/installer/aexos-core-installer.js` — shared spinner adapter.
- `packages/installer/src/installer/dependency-installer.js` — shared spinner adapter.
- `tests/cli/installer-entry-ux.test.js` — entry flags, help and recovery.
- `tests/ide-sync/index-validate-filter.test.js` — quiet success/failure behavior.
- `tests/wizard/install-experience.test.js` — widths, control safety and outcomes.
- `tests/wizard/integration.test.js` — review and execution regressions.
- `tests/wizard/feedback.test.js` — terminal capabilities and spinner lifecycle.
- `tests/wizard/installer-review.test.js` — numbered keyboard and preserved defaults.
- `tests/unit/wizard/ide-selector.test.js` — empty host selection.
- `tests/installer/configure-environment-brownfield.test.js` — generated config and explicit reviewed profile.
- `tests/installer/ide-config-generator-ci-flags.test.js` — explicit rich/plain capability fixtures.
- `artifacts/cli-ux-20260907/` — sanitized local test, terminal, package and independent QA evidence (not npm content).

## Historical acceptance criteria — original revision

The original acceptance wording and checked states below are preserved exactly as previously recorded. They do not mark R1-R9 complete.

- [x] AC1: Apply a coherent AEXOS/Cyryx terminal visual system across welcome, configuration, progress, warnings, errors and completion: consistent hierarchy, spacing, emphasis and concise copy using existing branding primitives.
- [x] AC2: Show the current meaningful step and actual progress without invented percentages or claims. Present selected target/hosts and a concise installed-results summary with executable next commands appropriate to that configuration.
- [x] AC3: Narrow terminals at 60 columns and standard 80/120-column terminals remain readable without clipped status text or broken borders. Long paths and translated labels wrap safely. Non-TTY and NO_COLOR output remains clean and meaningful without ANSI animations or color-only state.
- [x] AC4: Preserve keyboard selection, cancellation, existing noninteractive flags and language selection. Prompts explain meaningful choices; failure and partial installation supply concrete recovery guidance and cannot appear as completed success.
- [x] AC5: Preserve existing install, upgrade, licensing and host-selection behavior; installed counts and validation state use real outcomes. No dependency, unsolicited paid activation or provider action is introduced by presentation changes.
- [x] AC6: Add focused rendering/flow tests for narrow widths, plain output, long values, errors, completion and supported languages. Capture representative actual terminal output for welcome through completion, including cancellation/error behavior.
- [x] AC7: Run lint, typecheck, full tests and build; update file list and evidence. Review readability and user flow independently before asserting premium UX is delivered.

## Historical tasks / subtasks

- [x] Inspect existing welcome/progress/completion helpers and define consistent hierarchy (AC1-2).
- [x] Implement width-aware and plain-output presentation in existing helpers (AC1-3).
- [x] Verify keyboard/cancel/noninteractive flows and contextual recovery guidance (AC4-5).
- [x] Add tests and capture terminal rendering examples at required widths (AC6).
- [x] Run gates and record independent review, file list and remaining limitations (AC7).

## Dev Notes

Reuse `packages/installer/src/wizard/feedback.js`, `questions.js`, `i18n.js`, `index.js`, and `packages/installer/src/utils/aexos-banner.js` / `aexos-colors.js`. Existing feedback already uses ora/cli-progress and banner/panel primitives; do not add a framework. Tests exist in `tests/wizard/` and `tests/installer/wizard-language.test.js`.

[Source: docs/framework/tech-stack.md#overview] describes cross-platform CLI development and minimal dependencies. [Source: docs/framework/coding-standards.md#testing-standards] gives test conventions. [Source: .aexos-core/constitution.md#i-cli-first-non-negotiable] keeps the CLI operational without a dashboard. No database or provider contract changes are needed. Terminal capability handling uses standard TTY/NO_COLOR inputs rather than a new required environment variable.

## Testing

Use Jest for meaningful formatting/flow behavior and actual terminal receipts for legibility. Check text independently of ANSI styling and never bless a success snapshot with missing installation outcomes. Validate supported translated content without changing its intended semantics.

## CodeRabbit Integration

Story Type Analysis: Frontend / CLI, medium complexity. Specialized Agents: @dev primary, @ux-design-expert design/accessibility review, @qa independent validation. Quality Gate Tasks: pre-commit @dev required; pre-PR @devops if requested; pre-deployment N/A. Self-Healing: @dev light, 2 iterations / 15 minutes, CRITICAL auto-fix and HIGH documented; @qa full, 3 iterations / 30 minutes, CRITICAL/HIGH correction. Focus Areas: terminal escaping, width calculations, non-TTY behavior, accessibility and flow regressions. Record unavailable CodeRabbit explicitly and use independent review.

## Historical story-draft checklist

READY, clarity 9/10. Goal/context PASS; technical guidance PASS; references PASS; self-containment PASS; testing PASS; CodeRabbit PASS. All applicable checklist items assessed against `.aexos-core/product/checklists/story-draft-checklist.md`; database/API and deployment-specific items N/A. No unresolved product choice prevents implementation.

## Change Log

2026-09-07 — v5 — Chronos: finalized V1–V7 after independent APPROVED / PASS; recorded exact accepted evidence paths, eleven revision source/test files, real ConPTY matrix, final package hash, 10,524-test gate and bounded Windows acceptance. Earlier R/AC wording and evidence remain preserved.

2026-09-07 — v4 — Chronos: added V7 from the owner's explicit visual-selector request, including focus versus selection, descriptions, keyboard hints, width/plain validation and coordinated lead ownership; preserved V1–V6 and R1–R9.

2026-09-07 — v3 — Chronos: reopened for the owner's Hermes-inspired composition using the actual AEXOS logo; added V1–V6, explicit visual precedence, capability/metadata requirements and new PTY/package acceptance. Completed R1–R9 and all evidence remain historical.

2026-09-07 — v2 — Chronos: reopened for explicit CLI UI/UX request; added R1-R9, coordinated ownership and current PTY/package acceptance; retained original wording and receipts as historical.

2026-09-06 — v1 — Chronos: user-authorized installer experience story.

## Historical Dev Agent Record

Implemented four-stage terminal experience using existing brand primitives, width-aware wrapping, plain non-TTY/NO_COLOR output, real installed-file counts and configuration-specific next commands. Selected-host configuration/sync/skills/hooks failures now prevent successful completion. Exact selected hosts persist through greenfield and brownfield configuration merges. Native Claude/Gemini observation hooks are installed only when selected.

Actual PTY walkthrough (2026-09-07): welcome, Advanced profile, Greenfield, Claude/Codex selection and technology choices completed through dry-run exit 0 at `C:/AEXOS-LOCAL-TESTS/audit-terminal-20260907`. Separate Ctrl+C at the first prompt exited 1 without installation. Removed a misleading performance warning that counted time spent answering prompts against a rendering budget. Fresh packed noninteractive installation completed with 12 agents, 213 tasks and 14 workflows; Doctor exit 0. See `artifacts/audit-20260906/packed-final-init.log` and `packed-final-doctor.json`.

Focused regression coverage includes 60/80/120-column rendering, accented/wide characters, long paths, plain output, real counts, host failure and configuration preservation. Existing wizard policy remains English-only; this work does not claim new translated flows. Aggregate gates remain pending while the user-requested architectural office revision is implemented. Independent QA corrections and limitations are recorded in `QA-AUDIT-20260906.md`.

### Historical file list

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.3-PREMIUM-INSTALLER-UX.md`
- `packages/installer/src/wizard/install-experience.js`
- `packages/installer/src/wizard/feedback.js`
- `packages/installer/src/wizard/index.js`
- `packages/installer/src/config/templates/core-config-template.js`
- `packages/installer/src/config/configure-environment.js`
- `tests/wizard/install-experience.test.js`
- `tests/wizard/integration.test.js`
- `tests/installer/core-config-template.test.js`
- `tests/installer/configure-environment-brownfield.test.js`

## Historical QA Results

Final evidence: lint exit 0 (9 warnings), typecheck exit 0, full Jest 10332 passed / 0 failed / 163 skipped and publish build PASS. Actual keyboard dry-run and cancellation were exercised, alongside width fixtures and real packed installation. See `DELIVERY-AUDIT-20260907.md` for artifact binding and `QA-AUDIT-20260906.md` for independent review. No native provider certification follows from installer success.

Pending independent implementation and terminal review.

