# Story AEX-3.6.1: CEO Presence in the AEXOS Virtual Office

## Status

Done

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools:
  - jest
  - eslint
  - browser-visual-inspection
  - accessibility-contract-tests
```

## Story

**As an** AEXOS operator,  
**I want** Paulo Petruff represented as Cyryx Labs CEO in the Virtual Office,  
**so that** the campus communicates the real executive identity while preserving truthful agent telemetry.

## Context

This is a scoped extension of completed Story AEX-3.6. The user supplied and
approved two raster assets: a proportional standing CEO avatar and a seated
Cyryx workstation scene. The CEO is an executive presentation presence, not a
new operational AEXOS agent. His visual role must not add to agent metrics,
receive telemetry state, circulate as an ambient agent, or imply simulated
work.

ClickUp synchronization was unavailable in the current Codex session. This
local framework story is the source of truth for the change.

## Acceptance Criteria

1. The Virtual Office packages the approved standing and workstation CEO PNGs
   under its static asset root and serves them through the existing allowlisted
   `/assets/*` path.
2. The campus exposes an accessible, keyboard-selectable CEO presence labelled
   `Paulo Petruff`, `Founder & CEO`, and `Cyryx Labs`, using the approved standing
   avatar at a scene-manifest-owned executive anchor.
3. Selecting the CEO presence opens a read-only executive profile that uses the
   approved workstation image and explicitly distinguishes executive presence
   from observed agent work.
4. The CEO presence does not modify squad or agent counts, does not enter agent
   state projection, ambient circulation, meetings, workstations or SSE
   telemetry, and never claims current work without observed data.
5. Desktop and narrow layouts keep the CEO controls and profile usable, with
   semantic labels, keyboard activation, visible focus and reduced-motion-safe
   behavior.
6. Focused UI/static/installer tests prove both assets, manifest registration,
   accessible CEO labels, telemetry separation and normal project-local
   installation; existing Virtual Office regression tests remain green.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type:** Frontend  
**Secondary Type(s):** Integration  
**Complexity:** Medium — static assets, scene manifest, UI behavior, accessibility and installer contracts.

### Specialized Agent Assignment

**Primary Agents:**

- `@dev` — implementation and focused tests.
- `@ux-design-expert` — presentation and accessibility review.

**Supporting Agents:**

- `@qa` — regression and browser visual gate.
- `@devops` — any later commit, push or PR; not required for local implementation.

### Quality Gate Tasks

- [x] Pre-Commit (`@dev`): focused tests, lint and CodeRabbit attempt.
- [ ] Pre-Review (`@qa`): accessibility, truthfulness and visual regression.
- [ ] Pre-PR (`@devops`): only if a PR is later authorized.

### Self-Healing Configuration

- Primary agent: `@dev`, light mode.
- Maximum iterations: 2.
- Timeout: 15 minutes.
- CRITICAL findings: auto-fix; HIGH findings: document before review.

### CodeRabbit Focus Areas

- Executive presentation must remain outside agent telemetry/state authority.
- Static assets must remain under the served Virtual Office root.
- Semantic keyboard access and narrow-screen behavior must be preserved.
- Existing AEX-3.6 roster, movement, meeting and installer contracts must not regress.

## Tasks / Subtasks

- [x] Task 1 — Package and register the CEO presentation assets (AC: 1, 2)
  - [x] Copy the approved standing and workstation PNGs into the Virtual Office asset tree without altering existing atlases.
  - [x] Add a versioned executive anchor/profile contract to the scene manifest.
- [x] Task 2 — Render the CEO presence and read-only profile (AC: 2–5)
  - [x] Add an accessible campus control using the standing avatar.
  - [x] Add a read-only executive profile using the workstation image and truthful presentation copy.
  - [x] Keep the CEO outside agent maps, counts, filters, movement, meetings and telemetry transitions.
  - [x] Add responsive, focus-visible and reduced-motion-safe styling.
- [x] Task 3 — Verify installation and regressions (AC: 1–6)
  - [x] Extend UI/static contracts for assets, labels, manifest and telemetry separation.
  - [x] Extend installer coverage so both CEO assets ship to project-local installations.
  - [x] Run focused Virtual Office tests, lint, typecheck, build and full Jest regression.
  - [x] Perform browser visual inspection at desktop and narrow viewport.

## Dev Notes

### Previous Story Insights

- AEX-3.6 is complete and must not be reopened. Its UI is a read-only
  observability projection; presentation state cannot create operational
  telemetry. [Source: `STORY-AEX-3.6-VIRTUAL-OFFICE.md#acceptance-criteria`]
- The existing scene manifest is the spatial authority for registered anchors,
  furniture and pose calibration. [Source:
  `adr/ADR-AEX-010-LAYERED-SCENE-GRAPH.md#decision`]
- Existing agent identities come from four v5 raster atlases and remain stable
  across poses. The CEO assets are separate executive presentation assets, not
  new atlas rows. [Source:
  `ARCHITECTURE-VIRTUAL-OFFICE.md#frontend-renderer`]

### Component and Integration Guidance

- Register the CEO anchor/profile in
  `.aexos-core/core/virtual-office/public/scene-manifest.js`.
- Render the CEO control and profile in
  `.aexos-core/core/virtual-office/public/app.js` and
  `.aexos-core/core/virtual-office/public/index.html`.
- Add styling in `.aexos-core/core/virtual-office/public/styles.css`.
- Package images under
  `.aexos-core/core/virtual-office/public/assets/`; the existing server serves
  immutable files under `/assets/*`. [Source:
  `ARCHITECTURE-VIRTUAL-OFFICE.md#http-contract`]
- Do not add the CEO to `registry-loader.js`, `state-projector.js`, snapshot
  squads, agent maps or event normalization. Those paths are the canonical
  operational catalog and observed telemetry authority. [Source:
  `ARCHITECTURE-VIRTUAL-OFFICE.md#data-flow`]
- The project-local installer already copies the complete Virtual Office scene
  footprint; tests must explicitly assert the new files. [Source:
  `adr/ADR-AEX-010-LAYERED-SCENE-GRAPH.md#decision`]

### Approved Source Assets

- Standing:
  `C:\Users\ppetr\OneDrive\Desktop\Cyryx Labs\Brandboard\Avatares Office\Paulo_Petruff_Avatar_AEXOS_Virtual_Office_v2.png`
- Workstation:
  `C:\Users\ppetr\OneDrive\Desktop\Cyryx Labs\Brandboard\Avatares Office\Paulo_Petruff_Avatar_AEXOS_Workstation_v1.png`

### Technical Constraints

- No new dependency, endpoint, database object, environment variable or cloud
  service.
- Preserve the loopback-only, CSP-protected, observability-only boundary.
- Preserve the existing 21-pod/168-agent baseline unless the canonical registry
  itself changes independently.
- Use semantic buttons, explicit accessible labels and visible focus treatment.

## Testing

- Extend `tests/core/virtual-office/server-cli-ui.test.js` with static/UI
  contracts for both assets, labels, manifest registration and separation from
  the agent catalog.
- Extend `tests/installer/aexos-core-installer.test.js` to verify both files in a
  clean project-local footprint.
- Run focused Virtual Office suites before repository-wide gates.
- Browser-inspect desktop and narrow viewports; confirm the CEO control is
  keyboard reachable, profile copy is truthful and agent/squad metrics do not
  change.

## Change Log

| Date | Version | Description | Author |
|---|---:|---|---|
| 2026-08-18 | 0.1.0 | Initial CEO presence story drafted from the user's approved assets | @sm |
| 2026-08-18 | 0.2.0 | Validated GO (9/10) — Status: Draft → Ready | @po |
| 2026-08-18 | 0.3.0 | Development started — Status: Ready → InProgress | @dev |
| 2026-08-18 | 0.4.0 | CEO presence, executive profile, responsive behavior and installer coverage completed — Status: InProgress → InReview | @dev |
| 2026-08-18 | 0.4.1 | QA Gate PASS — Status: InReview → Done | @qa |

## Dev Agent Record

### Agent Model Used

Codex (GPT-5)

### Debug Log References

- Focused Jest: 24/24 tests passed.
- Repository gates: lint, typecheck and publish-safety build passed.
- Full Jest: 396 suites and 9,901 tests passed; 12 suites / 172 tests skipped by project configuration.
- Browser gate: desktop 1584×992 and narrow 390×844; no console errors or horizontal overflow.
- CodeRabbit: gracefully skipped because the configured Ubuntu WSL distribution is unavailable; only `docker-desktop` is installed.

### Completion Notes List

- Added Paulo Petruff as a scene-manifest-owned, keyboard-selectable Cyryx Labs Founder & CEO presence.
- Added a dedicated CEO Office view and read-only workstation profile with an explicit non-telemetry boundary.
- Preserved the canonical 21-squad / 168-agent snapshot and kept the CEO outside agents, filters, movement, meetings and SSE state.
- Corrected narrow-screen discoverability so selecting CEO Office scrolls directly to the executive profile.
- No dependency, endpoint, registry agent, environment variable or operational state was added.

### File List

- `.aexos-core/core/virtual-office/public/assets/paulo-petruff-ceo-standing-v1.png` (new)
- `.aexos-core/core/virtual-office/public/assets/paulo-petruff-ceo-workstation-v1.png` (new)
- `.aexos-core/core/virtual-office/public/scene-manifest.js`
- `.aexos-core/core/virtual-office/public/index.html`
- `.aexos-core/core/virtual-office/public/app.js`
- `.aexos-core/core/virtual-office/public/styles.css`
- `.aexos-core/core/virtual-office/server.js`
- `tests/core/virtual-office/server-cli-ui.test.js`
- `tests/installer/aexos-core-installer.test.js`
- `docs/framework/epics/aexos-evolution/STORY-AEX-3.6.1-CEO-VIRTUAL-OFFICE-PRESENCE.md` (new)

## QA Results

### Review Date: 2026-08-18

### Reviewed By: Argus (Test Architect)

### Reviewed Revision

`working-tree-sha256:66e08f1d30f4d077fcf5ea7d853025cdd2ea54ce92451d2e33a6950eec56be44`

### Code Quality Assessment

The executive presence is cleanly separated from the operational agent model.
Paulo Petruff is sourced only from the scene manifest and presentation DOM;
canonical registry counts, filters, movement, meetings and SSE projection remain
unchanged. The explicit executive boundary prevents the profile from implying
observed work.

### Requirements Traceability

- AC 1: both approved PNGs are packaged, explicitly server-allowlisted and covered by HTTP and installer tests.
- AC 2: the manifest-owned CEO anchor and semantic button expose Paulo Petruff, Founder & CEO, Cyryx Labs.
- AC 3: selection renders the workstation asset in a read-only executive profile with truthful boundary copy.
- AC 4: browser evidence preserves 21 squads / 168 agents / 0 active; source review confirms no agent-map insertion.
- AC 5: keyboard semantics, focus-visible styling, reduced-motion behavior, 390×844 navigation and zero horizontal overflow were verified.
- AC 6: 24 focused tests, lint, typecheck, publish build and the full 9,901-test regression passed.

### Compliance Check

- Coding Standards: ✓ lint and typecheck passed.
- Project Structure: ✓ assets and manifest remain under the project-local Virtual Office footprint.
- Testing Strategy: ✓ HTTP, UI contract, installer and browser evidence are present.
- All ACs Met: ✓ six of six acceptance criteria covered.

### Security Review

PASS. No new endpoint, dependency, secret, environment variable, mutation surface
or external service was introduced. Static files remain explicitly allowlisted
by the loopback-only server.

### Performance and Reliability

PASS. Executive assets load through the existing static path; state projection
and agent rendering contracts are unchanged. Desktop and mobile browser runs had
no console errors.

### Automated Review Note

CodeRabbit was gracefully unavailable because the configured Ubuntu WSL
distribution is not installed; the host exposes only `docker-desktop`. This is
non-blocking under the configured graceful-degradation policy and is recorded
as a future recommendation in the gate.

### Gate Status

Gate: PASS → docs/qa/gates/AEX.3.6.1-ceo-presence-in-the-aexos-virtual-office.yml
