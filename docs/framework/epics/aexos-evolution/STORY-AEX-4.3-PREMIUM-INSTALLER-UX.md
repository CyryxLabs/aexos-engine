# Story AEX-4.3: Premium and accessible terminal installation experience

## Status

Ready for Review — exact corrected local source, installed terminal and V1–V7
independently approved; final committed-package seal and normal PR remain separate.

## Story

As a new AEXOS operator, I want a polished, clear installation flow, so I can
understand configuration, progress, outcome and the next useful action without
visual clutter. This is the existing AEX-4.3 terminal wizard, not a new interface.

## Integration scope and history

The isolated branch `codex/premium-installer-ux` starts at
`628ee1cd980a39a27bacf00ecbc6da7ad668b258`, preserving the reviewed first-value
and signed-installer base. The earlier combined-checkout V1–V7 acceptance dated
2026-09-07 included real ConPTY and a different packed artifact. Its 10,524-test
result and old Doctor counts remain historical; neither certifies this branch.
The prior R1–R9 revision also remains historical.

The approved direction is a bold AEXOS wordmark and character-built teal/silver
monolith based on the canonical Cyryx logo. The identified source was
`cyryx_labs_icon_versa_dark_crop.png`, compared with
`Cyryx_Labs_Design_System_v1.md`; these design references are not runtime asset
dependencies or purported newly generated files. Hermes supplied composition
inspiration only; no Hermes name, caduceus or yellow identity is introduced.

## Current visual acceptance criteria

- [x] V1 — **Recognizable AEXOS identity:** the interactive welcome presents a large, bold, clearly readable AEXOS wordmark and a recognizable character-built interpretation of the actual AEXOS logo. Use AEXOS teal and silver/neutral tones in supported color terminals, with a coherent monochrome form. The source logo is identified in the implementation record and compared with the rendered terminal illustration during independent visual review. No Hermes name, caduceus or copied yellow brand treatment is shipped.
- [x] V2 — **Illustrated composition with useful context:** at 80 and 120 columns, show a deliberate two-column composition with the logo illustration beside concise, actual package/workspace/tool/host metadata, supported by the large wordmark. Align columns and spacing so the first installer action is clear and accessible immediately after the welcome. Use existing installer information only; do not add simulated command history, chat input, agent activity, progress or new functionality to fill the layout.
- [x] V3 — **Capability-aware rendering:** at 40 and 60 columns, use a compact composition that retains AEXOS identity, important context and the next action without clipped content or broken borders. Long/Unicode workspace paths remain understandable. Validate truecolor and 256-color output using the detected terminal capabilities; `NO_COLOR`, `TERM=dumb` and non-TTY output preserve a readable plain form without styling/cursor escapes or animation. Do not require a particular font, external renderer or new environment-variable contract. Prompt and command text remains keyboard-usable and copyable.
- [x] V4 — **Metadata truth:** version and inventory values come from the package actually executing; installed-workspace/selected-host values come from the actual target state or reviewed choices. Clearly distinguish bundled package inventory, installed artifacts and configured hosts. Missing or unavailable data is labeled accurately rather than fabricated as zero or live. A tool definition or host configuration is never presented as an available runtime, connected provider or current session. Rendering the welcome makes no provider/tool execution calls and exposes no credentials.
- [x] V5 — **Bounded integration and no regressions:** apply the welcome consistently to the existing default, `install` and `init <project>` entry paths, respecting quiet/plain behavior and avoiding duplicate welcomes. Preserve the accepted review/change/cancel flow, pre-install side-effect boundary, progress/outcome truth, npm-first guidance, flags, target semantics, error handling, Doctor behavior, licensing and free-core access. Reuse the current CommonJS installer and existing dependencies. This revision introduces no dependency, provider action, new product feature, pricing change or separate PR/release requirement.
- [x] V6 — **Current terminal/package acceptance:** capture and independently inspect actual PTY output at 40/60/80/120 columns, including truecolor, 256-color and plain capability cases. Record exact commands, dimensions, capability settings, exit codes, visual observations and pass/fail. Verify the branded entry still reaches review/change/cancel and installation; run the final packed artifact in a fresh target including a path with spaces, then verify init and Doctor exit 0 with no FAIL checks and truthful inventory. Record package hash and source/installed binding. Run meaningful focused rendering/flow regressions plus `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`; obtain independent QA, record actual CodeRabbit availability/results and limitations, and update file list before marking Ready for Review. Earlier R1–R9 receipts do not substitute for these visual-revision gates.

- [x] V7 — **Clear visual options and selectors:** existing installer choices show a distinct navigation-focus indicator and an explicit selected/marked state that remains understandable when focus moves and without color. Each option has a short, understandable description of its consequence. Display applicable keyboard hints beside the selector: arrows to navigate, Space to toggle multi-selection, and Enter to confirm/continue. Preserve selected answers and the review/change/cancel step before installation. Verify readable labels, descriptions, state indicators and hints at 40/60/80/120 columns; compact layouts must not hide an option or its state. When rich interaction is unavailable but interactive input is supported, provide a clear numbered plain fallback with visible selected/default values and matching input instructions. Existing noninteractive flags must remain prompt-free. Actual PTY evidence and independent review under V6 must cover focus movement, selection changes, multi-selection and the plain numbered fallback; screenshots of the welcome alone do not satisfy this criterion.


The original V1–V7 criteria are preserved. Their checked status records the current independent local source/package/
terminal approval, separately from the dated prior review and final Git delivery.
The later explicit normal-PR request authorizes DevOps delivery; V5's prohibition
on a separate PR requirement prevents invented process gates, not requested work.

## Demonstrated integration corrections under V5

Actual default CLI-only packed init succeeds but Doctor reports three false
failures for intentionally absent host settings/skills/commands. Correct this
using the actual selected-host/profile contract; keep missing/invalid profile
state fail-closed. A genuinely selected Claude integration must still require
its settings and managed artifacts. Do not delete checks or universally downgrade
missing settings to INFO simply to obtain green output.

Actual selected-Claude installation generates settings before final framework
protection configuration is persisted, causing a real missing-deny failure.
Resolve generation order or regeneration against the final configuration; do
not weaken protection, omit selected Claude or reinterpret that real failure as
optional-host absence. Preserve target/user files, free first-value, licensing,
review/change/cancel semantics and quiet/noninteractive behavior.

The first full integration run also has seven stale test expectations. Update
only assertions/fixtures invalidated by the accepted visual and selected-host
contract while retaining meaningful regression checks. Passing historical UI
snapshots does not override actual installed failure evidence. Root completed these bounded fixes and recorded exact paths in the candidate
diff; the independent current visual verdict is APPROVED for its exact local identity. PO owns only
this document and its verification draft.

## Tasks and verification

- [x] Assemble the selected existing visual installer changes on the actual base.
- [x] Preserve V1–V7, canonical brand provenance and historical acceptance boundaries.
- [x] Record actual CLI-only Doctor, selected-Claude settings and stale-test findings.
- [x] Complete scoped root corrections and fail-closed negative regressions.
- [x] Rerun actual default/selected-host packed installation and truthful Doctor.
- [x] Bind real current PTY widths/colors/selectors/review/edit/cancel captures and independent visual approval.
- [x] Run corrected full source/package gates and obtain independent visual/functional QA.
- [ ] Seal exact source/document/package identities and deliver the authorized normal PR.

See [current verification](PREMIUM-INSTALLER-VERIFICATION-20260909.md). No npm
publication, paid/provider execution, host activation or Office acceptance is
claimed by this visual integration. CLI metadata describes actual package and
configuration, not connected agents or live providers.

## Current source file list

The current pre-document working-tree diff contains 36 exact paths,
including generated registry/manifest entries and the scoped Doctor/profile/
selected-host configuration regressions. This is not authority for unrelated
changes; final Git acceptance must reconcile these paths and both public docs.

- `.aexos-core/core/doctor/checks/commands-count.js`.
- `.aexos-core/core/doctor/checks/ide-sync.js`.
- `.aexos-core/core/doctor/checks/settings-json.js`.
- `.aexos-core/core/doctor/checks/skills-count.js`.
- `.aexos-core/data/entity-registry.yaml`.
- `.aexos-core/infrastructure/scripts/ide-sync/index.js`.
- `.aexos-core/install-manifest.yaml`.
- `bin/aexos.js`.
- `packages/installer/src/config/configure-environment.js`.
- `packages/installer/src/config/templates/core-config-template.js`.
- `packages/installer/src/installer/aexos-core-installer.js`.
- `packages/installer/src/installer/dependency-installer.js`.
- `packages/installer/src/utils/aexos-banner.js`.
- `packages/installer/src/wizard/feedback.js`.
- `packages/installer/src/wizard/i18n.js`.
- `packages/installer/src/wizard/ide-config-generator.js`.
- `packages/installer/src/wizard/ide-selector.js`.
- `packages/installer/src/wizard/index.js`.
- `packages/installer/src/wizard/questions.js`.
- `packages/installer/tests/unit/ide-sync-integration/ide-sync-integration.test.js`.
- `tests/core/doctor/doctor-checks.test.js`.
- `tests/core/doctor/fresh-init-contract.test.js`.
- `tests/ide-sync/index-validate-filter.test.js`.
- `tests/installer/configure-environment-brownfield.test.js`.
- `tests/installer/ide-config-generator-ci-flags.test.js`.
- `tests/installer/wizard-component-summary.test.js`.
- `tests/unit/wizard/ide-selector.test.js`.
- `tests/wizard/feedback.test.js`.
- `tests/wizard/index.test.js`.
- `tests/wizard/integration.test.js`.
- `packages/installer/src/wizard/install-experience.js`.
- `packages/installer/src/wizard/visual-selectors.js`.
- `tests/cli/installer-entry-ux.test.js`.
- `tests/wizard/install-experience.test.js`.
- `tests/wizard/installer-review.test.js`.
- `tests/wizard/visual-selectors.test.js`.

Public-document additions:

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.3-PREMIUM-INSTALLER-UX.md`.
- `docs/framework/epics/aexos-evolution/PREMIUM-INSTALLER-VERIFICATION-20260909.md`.

## Ownership and QA

Root/dev owns source/test corrections and terminal/package fixtures; DevOps owns
isolated Git/package/PR operations; independent QA assesses actual terminal,
source and installed evidence. PO owns these external drafts only. Do not reset
shared checkouts or copy unrelated work. Independent local integration QA is APPROVED. Preserve failed receipts and bind
final Git/package evidence to its own identity, including any whitespace delta.

## Current corrected verification — 2026-09-09

Eight final visual-correction source gates pass: 10,155 tests, zero failures and
168 existing skips. The earlier seven-failure run and CLI-only Doctor failure
remain retained history. Default packed init/Doctor now exit 0 with 9 PASS /
2 WARN / 0 FAIL / 7 INFO. Eight real 36-row ConPTY cases pass at 40/60/80/120
columns, including 256-color, plain fallbacks and cancellation. The selected
Claude/Codex edit/install persists profile bob and Doctor reports 16 PASS /
2 WARN / 0 FAIL / 0 INFO. No missing-profile or selected-host rule was waived.

A subsequent review found the previous 40-column welcome consumed 38 rows in a
36-row viewport. Only duplicate monolith middle/taper rows were removed. The
new source gates, archives and eight-case terminal receipts refer to that shorter
renderer; earlier captures do not certify it. Independent visual inspection now approves the entire 40-column first screen
within 36 rows, wide composition, focus/marked states, plain fallback and edited
installation result. These public documents are frozen for delivery; final exact
committed-package/PR evidence remains separate.

## Independent local QA acceptance — 2026-09-09

APPROVED for the exact local source and installed Windows terminal candidate.
QA independently rehashed 4,274 source files, eight gate logs, both archives and
all installed payloads, both consumer locks and six package/install/audit logs.
The actual eight-case ConPTY matrix is bound to that same Core archive. Twelve
adversarial scenarios / 33 assertions retain malformed-profile/artifact and
selected-host failure coverage; optional absence does not disable real validation.

Actual cell-coordinate visual review confirms the full compact wordmark and
split teal/silver monolith, context, first question, both options and hints fit
40 columns / 36 rows. Wide 80/120 composition, selectors and edited results are
accepted. Windows ConPTY/cell rendering does not certify macOS/Linux, arbitrary
fonts, screen readers or native provider execution. No CodeRabbit clearance is
claimed; independent source/visual/package review is the recorded gate.

Five pre-existing whitespace-only CLI lines remain in the accepted source.
DevOps normalization must be recorded as an explicit nonsemantic delta in final
source/package binding. This document supplies no future commit/archive hash or
publication approval. All actual final Git/package/PR outcomes belong in separate
receipts; frozen public prose need not contain its own future archive digest.
