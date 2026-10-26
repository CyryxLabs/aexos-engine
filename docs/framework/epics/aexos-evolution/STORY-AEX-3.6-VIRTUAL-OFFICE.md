# Story AEX-3.6: AEXOS Virtual Office — Local Real-Time Observability

## Status

InReview

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools:
  - jest
  - eslint
  - typescript
  - browser-visual-inspection
  - accessibility-contract-tests
```

## Story

**As an** AEXOS operator,  
**I want** to open a premium local virtual office that represents registered
agents and their observed work in near real time,  
**so that** I can understand what the agent organization is doing without a
separate AI API or an untruthful simulated dashboard.

## Context

This story implements roadmap item AEX-3.6, the read-only SSE cockpit. The
current repository contains the registry, event emitter, orchestrator bridge,
Bob status writer and parallel monitor, but no shipped collector or unified UI.
The user approved a futuristic interpretation of an isometric top-down office
with work islands, desks, monitors and seated agents. Every avatar must wear a
jacket displaying the exact supplied Cyryx Labs logo.

The visual reference is composition evidence only. Its promotional text,
watermarks and social-video controls are not requirements.

## Acceptance Criteria

1. `aexos office` and `aexos-office` start the capability from a project root,
   expose help, support configurable host/port/browser opening and fail with an
   actionable error when the fixed port is unavailable.
2. The local snapshot loads the canonical squad registry and core agent
   definitions and represents all AEXOS agents. In the current baseline this is
   20 registered squads/156 squad agents plus 12 framework agents in one AEXOS
   Core pod (21 pods/168 agents total); agents start as `available`, not
   `running`.
3. A loopback-only HTTP collector accepts the existing AEXOS event envelope at
   `POST /events`, exposes `GET /health`, `GET /api/snapshot` and a read-only SSE
   stream at `GET /api/events`, with no external AI or cloud API dependency.
4. The state projector has explicit `available`, `assigned`, `running`,
   `waiting`, `blocked`, `completed`, `failed`, `stale` and `offline` states.
   Active states require observed events; heartbeat expiry produces `stale`
   rather than allowing ghost activity.
5. The browser UI presents a premium futuristic isometric office inspired by
   the supplied workstation layout: squad work pods, desks, monitors and
   deterministic 3D-style avatars. Every avatar jacket and the main header use
   the exact supplied Cyryx Labs logo asset.
6. Agent state is understandable without color. Agents, squad filters and
   details are keyboard accessible; narrow screens receive a usable roster;
   `prefers-reduced-motion` disables nonessential animation.
7. The UI is observability-only. It provides no agent-control endpoint, does not
   expose raw prompts/environment/tool output, rejects oversized or invalid
   payloads, and serves only files beneath its static root.
8. Unit, integration, CLI and UI-contract tests cover the critical paths; root
   lint, typecheck, Jest and build gates pass before review. Documentation
   explains startup, configuration, telemetry truth and limitations.
9. Ambient avatars use a transparent Cyryx-branded atlas, state-specific
   idle/walking/working poses and bounded corridor occupancy. The camera supports
   close zoom, mouse/touch drag and keyboard navigation without exposing any
   additional control or telemetry authority.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type:** Architecture / Integration  
**Secondary Types:** Frontend, API, Security  
**Complexity:** High — joins registry, runtime telemetry, CLI, local server and
an accessible spatial UI.

### Specialized Agent Assignment

**Primary Agents:**

- `@dev` — implementation and pre-commit review.
- `@ux-design-expert` — spatial UI, design system and accessibility.

**Supporting Agents:**

- `@architect` — event/state authority and security boundary.
- `@qa` — contract, integration, regression and visual verification.
- `@devops` — any later commit, push or pull request; not required to implement.

### Quality Gate Tasks

- [x] Pre-Commit (`@dev`): CodeRabbit invocation attempted; unavailable because
  the host has only the `docker-desktop` WSL distribution and no WSL Bash/CLI.
- [x] Pre-Review (`@qa`): focused security, accessibility and truthfulness review.
- [ ] Pre-PR (`@devops`): CodeRabbit base-main review if a PR is authorized.
- [ ] Pre-Deployment: N/A — this story does not deploy a hosted service.

### Self-Healing Configuration

- Primary agent: `@dev`, light mode.
- Maximum iterations: 2.
- Timeout: 15 minutes.
- CRITICAL: auto-fix; HIGH: document and remediate before review; MEDIUM/LOW:
  record only when relevant to acceptance criteria.

### Focus Areas

- Truthful state transitions and stale/ghost protection.
- Loopback binding, payload validation, redaction and path traversal defense.
- WCAG 2.1 AA, keyboard operation and reduced motion.
- Responsive layout and bounded cost when rendering 156 agents.
- No sample activity or hidden external API dependency.

## Tasks / Subtasks

- [x] Task 1 — Establish architecture and configuration (AC: 1–4, 7)
  - [x] Record options, decision, data flow, API and threat boundaries.
  - [x] Add YAML defaults for all mutable values.
  - [x] Define unit/integration/UI-contract test strategy.
- [x] Task 2 — Implement catalog and truthful state projection (AC: 2, 4, 7)
  - [x] Load and validate the squad registry.
  - [x] Normalize existing high-level and hook event envelopes.
  - [x] Implement state transitions, bounded history, redaction and TTL.
  - [x] Add unit tests for all critical transitions and failures.
- [x] Task 3 — Implement the local collector and CLI (AC: 1, 3, 7)
  - [x] Serve health, snapshot, SSE, telemetry ingestion and static assets.
  - [x] Replay the existing JSONL fallback without duplicating events.
  - [x] Add `aexos office`, `aexos-office`, help and shutdown behavior.
  - [x] Add integration and CLI tests.
- [x] Task 4 — Build the premium virtual office (AC: 5, 6)
  - [x] Copy the exact user-supplied logo into the packaged asset tree.
  - [x] Build design tokens and the futuristic isometric work-pod system.
  - [x] Render deterministic 3D-style seated avatars with branded jackets.
  - [x] Implement squad/status filters, timeline and agent detail inspection.
  - [x] Add semantic roster, responsive and reduced-motion behavior.
- [x] Task 5 — Documentation and verification (AC: 8)
  - [x] Document startup, config, telemetry producers and limitations.
  - [x] Run focused tests, lint, typecheck, full Jest and build.
  - [x] Perform browser visual inspection at desktop and narrow viewport.
  - [x] Update this checklist, completion notes and File List.
- [x] Task 6 — Implement the approved high-fidelity campus and observed project
  motion (AC: 5, 6)
  - [x] Replace the CSS-art office with a packaged, people-free Cyryx campus and
    a real raster avatar atlas.
  - [x] Render all 21 squad neighborhoods and 168 independently addressable
    agents with the exact Cyryx crest.
  - [x] Route active agents through deterministic waypoints and converge agents
    sharing an observed story, run or session at a project collaboration hub.
  - [x] Verify desktop, mobile, search, filtering, squad focus, agent detail,
    observed motion, reduced motion and design fidelity.
- [x] Task 7 — Remediate user-reported avatar stacking and project-presence
  behavior (AC: 5, 6)
  - [x] Replace dense squad-anchor placement with deterministic, separately
    phased ambient circulation routes for available and completed agents.
  - [x] Assign every agent a unique workstation and assign collaborators to
    distinct seats around a deterministic shared-project table.
  - [x] Return observed active agents to their workstation or project table and
    return completed agents to ambient circulation.
  - [x] Compare the reported stacked state with the corrected runtime in one
    frame and verify the complete activity/return cycle in the browser.
- [x] Task 8 — Remediate locomotion, avatar compositing and camera inspection
  (AC: 5, 6, 9)
  - [x] Replace the smoky atlas matte with a verified RGBA sprite atlas and map
    deterministic idle, walking and working poses.
  - [x] Replace dense all-agent sliding with a bounded, squad-inclusive walking
    cohort, orthogonal corridor routes and reserved destinations.
  - [x] Add 90–260% camera zoom, pointer/touch drag and keyboard pan controls.
  - [x] Verify motion, collisions, compositing, zoom/pan, reduced motion and
    responsive behavior in the live browser before returning to review.
- [x] Task 9 — Calibrate avatar-to-furniture scale and world registration
  (AC: 5, 6, 9)
  - [x] Replace viewport-relative cutout sizing with office-world-relative
    human scale and bounded foreground depth.
  - [x] Preserve the 1672:941 campus aspect ratio across the environment,
    route, avatar and interaction layers.
  - [x] Re-map ambient circulation to separated floor lanes and move
    non-project stale/failed observations to dedicated signal bays.
  - [x] Verify 100% and 160% browser views, movement, clipping and collision
    receipts against the supplied person/desk reference.
- [x] Task 10 — Preserve identity and add observed seated-work behavior
  (AC: 5, 6, 9)
  - [x] Add 24 visibly distinct adult identities with coherent left-walk,
    right-walk and seated-work poses.
  - [x] Preserve the assigned identity across pose changes and resolve visible
    floor duplicates without changing telemetry state.
  - [x] Select the seated frame only for observed active work, use distinct
    seats around project tables and return agents after completion.
  - [x] Verify true alpha, person/furniture scale, walking frames, seated work,
    identity diversity, collision freedom, camera inspection and return flow in
    the live browser.
- [x] Task 11 — Add the AEXOS Master reception and truthful posture/work context
  (AC: 5, 6, 9)
  - [x] Integrate the premium reception campus, exact Cyryx wordmark and a
    dedicated AEXOS Master arrival point without changing the read-only boundary.
  - [x] Correct the command-bar brand lockup and expose a reception camera focus.
  - [x] Alternate available agents between standing/walking and seated rest at a
    maximum two-minute cadence while keeping observed active work seated.
  - [x] Show the selected agent's current observed work, operational status and
    presentation posture without inventing telemetry.
  - [x] Verify desktop, zoom, reception focus, idle posture, active work and
    accessibility contracts in the live browser and automated gates.
- [x] Task 12 — Rebuild ground registration, certified navigation and human
  scale after user-reported high-zoom failures (AC: 5, 6, 9)
  - [x] Replace approximate floor routes with certified walkable nodes that do
    not cross desks, counters, plants or other furniture.
  - [x] Separate foot-contact anchors from sprite bounds and recalibrate human
    scale and perspective against the furniture at 100%, 180% and 260%.
  - [x] Replace reused project-table rest positions with dedicated idle and
    observed-work anchors that remain visually grounded without false occlusion.
  - [x] Add runtime contracts for certified destinations, posture anchors and
    high-zoom collision safety.
  - [x] Compare the reported failure and corrected runtime in one frame, verify
    walking, idle, seated-work and return behavior, then rerun repository gates.
- [x] Task 13 — Promote the reception brand wall and add truthful live meeting
  observability for parallel agents (AC: 5–9)
  - [x] Replace the clipped reception wordmark treatment with a large,
    unobstructed Cyryx Labs architectural panel using the exact supplied assets.
  - [x] Route agents sharing an observed story, run or session to unique seats
    in the campus meeting room while keeping all destinations floor-certified.
  - [x] Add an accessible meeting window for the complete bounded stream of
    explicitly public, redacted collaboration messages without exposing prompts,
    tool output or invented dialogue.
  - [x] Cover event normalization, projection, emitter, UI contracts and meeting
    routing with focused tests and live browser evidence.
  - [x] Compare the pre-fix reception and corrected runtime in one frame, verify
    the parallel-agent meeting flow, restore QA telemetry and rerun all gates.
- [x] Task 14 — Restore desk-based agent occupancy after the reduced-cohort
  regression (AC: 5, 6, 9)
  - [x] Show one representative from every squad in the campus overview and all
    agents from a selected squad without stacking or hiding the chosen roster.
  - [x] Assign every visible agent one unique certified workstation and ensure
    every seated posture is anchored only to a desk, reception desk or meeting
    room chair—never to a corridor or generic floor point.
  - [x] Keep a bounded set of available agents walking on certified aisles and
    return each walker to their assigned desk before rotating the walking set.
  - [x] Preserve active-work and meeting routing, distinct visible identities,
    camera controls, filters and truthful telemetry semantics.
  - [x] Add automated occupancy contracts, capture a same-frame before/after
    comparison and rerun focused, static, build and full regression gates.
- [x] Task 15 — Replace approximate scene geometry with image-registered seating
  and resilient camera framing (AC: 5, 6, 9)
  - [x] Replace contain-fit letterboxing with a cover-fit world that fills the
    viewport at reset while preserving drag, zoom and full-campus exploration.
  - [x] Replace formula-derived desk destinations with manually registered chair
    anchors that correspond to visible furniture in the packaged campus image.
  - [x] Register the reception host to the physical reception chair and keep the
    architectural Cyryx panel clear at every supported zoom level.
  - [x] Verify every seated visible avatar at 100%, 180% and 260%, including the
    largest squad, with no corridor, plant, sign or tabletop placement.
  - [x] Add camera/seat geometry contracts, same-frame visual evidence and rerun
    focused, static, build and full repository gates.
- [x] Task 16 — Replace the raster-only spatial model after the user-reported
  scale, reception and motion failures (AC: 5, 6, 8, 9)
  - [x] Reopen the prior visual gate and record that coordinate uniqueness is
    not proof of proportional furniture registration or believable seating.
  - [x] Amend the renderer architecture so the campus raster is environmental
    art only; a versioned scene manifest owns world dimensions, navigation,
    workstations, reception branding, screen surfaces and pose calibration.
  - [x] Replace chair-bearing seated cutouts with normalized furniture-free
    identity poses and calibrate standing, walking and seated human scale from
    one world-space profile.
  - [x] Render ambient, explicitly non-telemetry animation on registered office
    screens and keep operational status visually and semantically separate.
  - [x] Fit the exact Cyryx assets inside the physical reception wall instead
    of painting an opaque interface panel over the reception architecture.
  - [x] Add an installer/publish contract proving the complete Virtual Office
    scene ships with every project-local AEXOS installation.
  - [x] Verify overview, close inspection, reception, walking, seated idle,
    observed work, parallel meeting, reduced motion and narrow-screen behavior
    against the supplied reference in same-frame comparisons.
- [x] Task 17 — Remove duplicated AI activation surfaces and restore the
  approved premium Virtual Office presentation (AC: 5, 6, 8, 9)
  - [x] Prove the duplicate discovery paths and preserve `.codex/skills` as the
    one Codex activation projection while keeping every canonical squad and
    agent available through AEXOS routing.
  - [x] Clean the legacy generic AEXOS skill projection during installation and
    upgrades without deleting unrelated generic workflow skills.
  - [x] Add a clean-install regression contract that rejects duplicate skill
    names across Codex-visible project-local surfaces.
  - [x] Remove the ambient monitor animation and its unused surfaces without
    changing truthful telemetry, agent movement or meeting behavior.
  - [x] Recompose the shell and reception wall against the approved reference,
    using the exact Cyryx assets at architectural—not overlay—scale.
  - [x] Run focused installer/UI tests, same-frame Product Design QA, live
    browser inspection and the complete repository gates before returning to
    review.
- [x] Task 18 — Correct user-reported avatar, CEO and local-runtime regressions
  (AC: 3, 5, 6, 8, 9)
  - [x] Replace the damaged v5 seated cells with the complete packaged seated
    poses while preserving the v5 standing/walking identities.
  - [x] Remove the separately composited jacket crest; the canonical identity
    artwork remains the single Cyryx mark authority on each uniform.
  - [x] Remove the personal CEO name from visible and accessible UI and replace
    the large square treatment with a compact executive presence.
  - [x] Retry the initial local snapshot automatically so the UI recovers when
    the loopback collector starts after the page or returns after interruption.
  - [x] Verify the live 21-squad/168-agent snapshot, CEO view, console, focused
    contracts and complete repository gates without committing the worktree.
- [x] Task 19 — Remove raster occlusion cuts and duplicate executive photography
  (AC: 5, 6, 8, 9)
  - [x] Remove the foreground canvas and rectangular desk/reception occluders
    that redrew parts of the static campus over avatar bodies.
  - [x] Replace the photographed world/inspector CEO treatments with one compact
    role marker and a read-only, image-free executive detail.
  - [x] Keep the marker within the default viewport and suppress it while the
    executive inspector is open so the role is never duplicated on screen.
  - [x] Record the remaining architectural boundary honestly: the current
    campus is still one 1672×941 PNG and does not provide real depth layers.
  - [x] Verify the live 21-squad/168-agent view, focused UI contract, lint,
    typecheck and full repository regression without committing the worktree.
- [x] Task 20 — Adopt the approved command-hall direction and restore the CEO
  visual assets (AC: 5, 6, 8, 9)
  - [x] Derive a clean 1586×992 campus plate from the user-supplied Image 1,
    removing its baked UI, people, text and incorrect brand treatments while
    preserving the approved architecture and visual direction.
  - [x] Register the 21 squads, workstations, walkways, command hall,
    reception and CEO office against the new scene dimensions.
  - [x] Restore the supplied standing CEO asset inside the world and the
    supplied workstation asset inside the compact read-only inspector without
    exposing the personal name.
  - [x] Render the exact packaged Cyryx Labs wordmark on the central reception
    facade instead of retaining or imitating a generated logo.
  - [x] Verify the 21-squad/168-agent live browser, asset installation contract,
    focused tests, lint, typecheck and full repository regression without
    committing the worktree.
- [x] Task 21 — Rebuild the reception entrance with the supplied official
  Cyryx Labs transparent lockup (AC: 5, 6, 8, 9)
  - [x] Package the supplied true-alpha official lockup without modifying its
    pixels or introducing a generated brand substitute.
  - [x] Reproduce the reference facade hierarchy with two architectural side
    emblems and a compact central emblem/wordmark lockup sourced from the same
    official asset.
  - [x] Remove the artificial translucent panel, outline, underline and glow
    that caused the reception to diverge from the approved reference.
  - [x] Extend the static-server, UI and installer contracts for the new asset.
  - [x] Verify the reception in the live browser and rerun the applicable
    focused and repository quality gates without committing the worktree.
- [x] Task 22 — Remove the rejected reception reconstructions and render the
  official Cyryx Labs identity as one horizontal facade composition (AC: 5, 6,
  8, 9)
  - [x] Remove the four cropped instances that distorted the supplied artwork
    and produced duplicated facade emblems.
  - [x] Render exactly one official transparent symbol beside exactly one
    official transparent wordmark, each with preserved aspect ratio, centered
    on the entrance and free of decorative UI treatments.
  - [x] Update the focused UI contract and visually verify the corrected
    reception before returning it for user testing.
- [x] Task 23 — Replace the still-incorrect derived reception composition with
  the exact supplied Cyryx Labs artwork in the approved facade hierarchy (AC:
  5, 6, 8, 9)
  - [x] Remove the separately derived symbol and wordmark from the facade.
  - [x] Render two architectural emblems and one compact central emblem/type
    lockup directly from the byte-identical supplied transparent PNG, using
    measured alpha bounds without distortion or decorative effects.
  - [x] Revalidate the live Campus and Reception views before user testing.

## Dev Notes

### Architecture authority

- UI is tertiary and read-only; CLI remains the operational source of truth.
  [Source: `.aexos-core/constitution.md`, Article I]
- The intended cockpit observes waves, agents, gates and evidence via SSE.
  [Source: `ARCHITECTURE-WAVE-3.md#c-visual--the-cockpit`]
- The chosen local projection and CSS 3D renderer are specified in
  [ARCHITECTURE-VIRTUAL-OFFICE.md](./ARCHITECTURE-VIRTUAL-OFFICE.md).
- Architectural decision and alternatives are recorded in
  [ADR-AEX-009](./adr/ADR-AEX-009-VIRTUAL-OFFICE-PROJECTION.md).
- The Task 16 scene-graph correction is recorded in
  [ADR-AEX-010](./adr/ADR-AEX-010-LAYERED-SCENE-GRAPH.md). It supersedes only
  ADR-AEX-009's raster-only visual-renderer choice; the local collector,
  projector, SSE and accessibility decisions remain accepted.
- The requested Cerberus/MegaBrain boundary assessment is recorded in
  [CERBERUS-AEXOS-INTEGRATION-ASSESSMENT.md](./CERBERUS-AEXOS-INTEGRATION-ASSESSMENT.md).

### Existing integration points

- `.aexos-core/core/events/dashboard-emitter.js` posts to
  `http://localhost:4001/events` and falls back to JSONL.
- `.aexos-core/core/events/types.js` declares high-level lifecycle events.
- `.aexos-core/core/orchestration/bob-status-writer.js` persists current agent,
  pipeline and terminal state.
- `.aexos-core/data/squad-registry.yaml` is the canonical squad catalog.
- `.aexos-core/development/agents/*.md` are the canonical core agent identities
  required to resolve framework events such as `@dev`, `@qa` and `@architect`.
- `bin/aexos.js` is the primary command router; standalone feature CLIs follow
  the `bin/aexos-graph.js` pattern.

### Testing

- Jest is the repository test framework.
- New logic requires at least 80% coverage; critical state transitions and
  security boundaries require complete branch coverage.
- Tests must not depend on network, external AI providers or user-global hooks.
- Browser contract tests may inspect static HTML/CSS/JS; runtime visual QA must
  use the local server and confirm real snapshot data.

### Project structure notes

- Framework story location is `docs/framework/epics/aexos-evolution/`, overriding
  the project-runtime `docs/stories/` default per `docs/framework/story-locations.md`.
- No ClickUp connector is configured for this local framework workflow; the
  story file is the source of truth.
- The architect-first package references an ADR template that is absent. This
  ADR follows the established AEXOS Evolution ADR structure instead.

## Change Log

| Date | Version | Description | Author |
|---|---:|---|---|
| 2026-08-16 | 0.1 | Initial draft from approved AEX-3.6 scope and user visual direction | Chronos |
| 2026-08-16 | 0.2 | PO validation passed; story approved and implementation started | Themis |
| 2026-08-16 | 1.0 | Virtual Office vertical slice implemented and handed to QA | Vulcan |
| 2026-08-16 | 1.1 | AC2 clarified to include the 12 canonical AEXOS Core agents | Themis |
| 2026-08-16 | 1.2 | QA gate passed after full regression, native-emitter and responsive browser proof | Argus |
| 2026-08-16 | 1.3 | User-approved campus redesign and observed project motion implemented; returned to review | Vulcan |
| 2026-08-16 | 1.3.1 | QA Gate PASS — Status: InReview → Done | @qa |
| 2026-08-16 | 1.3.2 | User-reported avatar stacking remediated with ambient circulation and unique project seats; returned to review | Vulcan |
| 2026-08-16 | 1.3.3 | Collision-remediation QA Gate PASS — Status: InReview → Done | @qa |
| 2026-08-16 | 1.4 | RGBA avatars, raster gait cycle, safe rotating cohort and draggable close camera implemented; returned to review | Vulcan |
| 2026-08-17 | 1.5 | Avatar/desk scale, native world aspect registration, depth and safe floor lanes recalibrated; returned to review | Vulcan |
| 2026-08-17 | 1.6 | Twenty-four persistent identities, seated project work, true-alpha atlases and duplicate-free floor allocation implemented and re-gated | Vulcan / Argus |
| 2026-08-17 | 1.7 | Luxury AEXOS Master reception, corrected Cyryx lockup, two-minute idle posture rotation and observed work/status inspector implemented; returned to review | Vulcan |
| 2026-08-17 | 1.8 | Certified floor nodes, calibrated foot contact and human scale, safe cross-zone arrivals and high-zoom visual re-gate completed | Vulcan |
| 2026-08-17 | 1.9 | Prominent reception brand panel, certified parallel-agent meeting seats and privacy-bounded public transcript implemented and re-gated | Vulcan / Argus |
| 2026-08-17 | 2.0 | Desk-based campus occupancy restored with full selected-squad rosters, unique reservations and a four-walker movement budget; returned to review | Vulcan |
| 2026-08-17 | 2.1 | Campus framing, chair anchors, corridors, signal bays and reception focus registered against the packaged image; returned to review | Vulcan |
| 2026-08-17 | 2.2 | User evidence invalidated the raster-only spatial model and prior Task 15 visual pass; Task 16 reopened with a layered scene-graph architecture and Cerberus boundary assessment | Iris / Vega |
| 2026-08-17 | 2.3 | Layered scene manifest, furniture-free seated atlases, registered screen motion, desk/reception occlusion and project-local installer proof implemented | Vulcan |
| 2026-08-17 | 2.3.1 | Task 16 QA Gate PASS after same-frame visual review, runtime movement proof and full repository regression | Argus |
| 2026-08-17 | 2.4 | User evidence reopened the story for Codex skill deduplication, removal of ambient monitor effects and reference-faithful reception/shell correction | Zeus / Vega |
| 2026-08-17 | 2.5 | Canonical Codex projection cleanup, reference-faithful shell/reception correction and monitor-effect removal implemented; returned to review | Vulcan / Iris |
| 2026-08-17 | 2.5.1 | QA Gate PASS — Status: InReview → Done | Argus |
| 2026-08-23 | 2.6 | Cut seated avatars, duplicate jacket crests, oversized named CEO treatment and non-recovering initial snapshot remediated; QA Gate PASS | Vulcan / Iris / Argus |
| 2026-08-23 | 2.7 | User evidence invalidated raster-mask depth and the remaining photographed CEO treatment; occlusion masks and duplicate photography removed, with true layered depth retained as follow-up architecture | Vulcan / Iris |
| 2026-08-23 | 2.7.1 | Task 19 local QA Gate CONCERNS: safe for user testing; commit remains gated by narrow-viewport visual confirmation and layered-depth follow-up | Argus |
| 2026-08-23 | 2.8.0 | Approved command-hall campus adopted, exact reception branding retained and supplied CEO standing/workstation assets restored; returned to review | Vulcan / Iris |
| 2026-08-23 | 2.8.1 | QA Gate PASS — Status: InReview → Done; approved for local user testing, with commit still requiring explicit user authorization | @qa |
| 2026-08-23 | 2.9.0 | Supplied official transparent Cyryx lockup applied to the reception in the reference three-part facade hierarchy; returned to review | Vulcan |
| 2026-08-23 | 2.10.0 | User-rejected cropped and vertical reception treatments replaced by one undistorted horizontal official symbol/wordmark composition | Vulcan |
| 2026-08-23 | 2.11.0 | Persistent reception mismatch corrected with measured alpha crops of the byte-identical official PNG in the approved four-element facade hierarchy | Vulcan |

## Dev Agent Record

### Agent Model Used

Codex (GPT-5 series)

### Debug Log References

- `npx jest tests/core/virtual-office tests/core/events/dashboard-emitter-bob.test.js --runInBand`
  — 4 suites, 45 tests passed.
- `npm run lint` — passed with no warnings or errors.
- `npm run typecheck` — passed.
- `npm run build` — publish safety gate passed with 3,486 packaged files.
- `npm test -- --runInBand --silent` — 396 suites and 9,894 tests passed; 12 suites
  and 172 tests skipped by the repository configuration.
- Post-redesign `npm run lint`, `npm run typecheck` and `npm run build` — passed;
  publish safety gate passed with 3,488 packaged files.
- Post-redesign `npm test -- --runInBand --silent` — 396 suites and 9,894 tests
  passed; 12 suites and 172 tests skipped by repository configuration.
- Browser desktop inspection — 21 squad pods, 168 agent stations, 12 canonical
  core agents and 168 branded jacket crests rendered.
- Browser narrow inspection at 390×844 — page and office roster contained to
  375 CSS pixels after responsive overflow remediation; no horizontal body
  overflow remained.
- Native `DashboardEmitter` proof — `aexos-core/dev` changed to `running` over
  SSE and the detail panel showed story `AEX-3.6` plus command
  `emitter-integration-proof-final`, without a refresh.
- Browser console inspection — no warnings or errors.
- Observed-motion browser proof — two real catalog agents sharing story
  `AEX-MOTION-LIVE` followed independently timestamped waypoint routes and
  converged at the same project hub; one interaction beacon was rendered.
- Product Design comparison QA — approved reference and implementation were
  reviewed in one frame; `design-qa.md` records `final result: passed` with no
  remaining P0, P1 or P2 finding.
- Collision-remediation browser proof — all 168 agent presences had unique
  coordinates in the ambient state, with no persistent multi-agent stack. Two
  observed agents on one story returned from circulation to separate seats at
  one collaboration table and resumed circulation after `CommandComplete`.
- CodeRabbit CLI — unavailable: the host has only the `docker-desktop` WSL
  distribution and `/bin/sh` could not find Bash. No CodeRabbit verdict claimed.
- Locomotion-remediation focused regression — 4 suites/45 tests passed.
- Locomotion-remediation full regression — 396 suites/9,894 tests passed; 12
  suites/172 tests skipped by repository configuration.
- Locomotion-remediation static gates — lint, typecheck and build passed;
  publish safety counted 3,491 files and excluded `pro/` content.
- Live camera/motion proof — 21-agent squad-inclusive cohort rotates every 18
  seconds; 14/22 visible presences moved over a 900 ms sample (16.25 px median,
  82.52 px maximum), with zero significant overlap in six consecutive samples.
  Pointer drag changed the 160% world transform by 140×70 px.
- Avatar-scale remediation browser proof — the 1672:941 campus remained
  aspect-locked inside a 2764×747 office viewport; 22 visible presences rendered
  at 117.9–137.8 px tall at 100%, with zero significant overlaps across twenty
  consecutive 300 ms samples and zero clipping. An 850 ms sample recorded both
  32.9 px travel and a gait-frame advance; the same-frame reference comparison
  is recorded in `design-qa.md`.
- Post-scale gates — 4 focused suites/45 tests, lint, typecheck, the 3,491-file
  publish build and the full 396-suite/9,894-test regression all passed.
- Identity/seated-work browser proof — the quiet state rendered 22 unique
  identity slots for 22 visible agents. Two observed agents sharing
  `AEX-3.6-VISUAL-QA` retained distinct identities, selected the seated frame at
  separate project-table seats, then returned to idle after `CommandComplete`;
  active and beacon counts both returned to zero.
- Identity/seated-work motion proof — twenty consecutive 160 ms samples found
  zero significant collisions. Twenty-one agents entered a movement phase and
  twelve completed both measurable route travel and a gait-frame advance in
  the bounded sample window.
- Identity asset proof — four 600×2160 atlases expose 24 adult identity rows;
  each decoded as `Format32bppArgb` with corner alpha 0.
- Final identity/seated-work gates — 4 focused suites/45 tests, lint, typecheck,
  the 3,495-file publish build and the full 396-suite/9,894-test regression all
  passed. The first full run exposed an unrelated Windows greeting-test
  file-sharing flake; the config was restored, all 52 affected tests passed
  targeted, and the final full rerun passed.
- Reception/posture focused regression — 3 virtual-office suites/32 tests,
  lint and typecheck passed after the Task 11 changes.
- Reception browser proof — at 1292×910, the Reception control selected Zeus,
  focused the branded entrance at 205%, and exposed current work, operational
  status and presentation posture as separate fields. The exact Cyryx wordmark
  remained legible on the physical wall and the corrected header had zero
  horizontal overflow.
- Idle posture/rotation proof — after a complete 18-second cohort rotation, 22
  presences covered all 21 squads, seven were in unique seated-rest positions,
  eight were actively walking and no duplicate floor coordinate remained.
- Observed reception-work proof — a normalized `CommandStart` moved AEXOS Master
  to the reception work seat with `state=running`, `pose=working`, task
  `Route observed QA project to squad` and story `QA-RECEPTION-1`. Completion
  plus deactivation returned active count to zero and the host to `available`.
- Responsive proof — at 390×844, the exact mark/header, a dedicated Reception
  control, office camera and accessible roster rendered with zero horizontal
  document overflow; browser console warnings/errors remained empty.
- Task 11 final gates — full Jest passed 396 suites/9,894 tests with the existing
  12 suites/172 tests skipped; build/publish safety passed with 3,498 files and
  excluded `pro/` content.
- Task 12 same-frame proof — the supplied 844×736 failure and corrected 260%
  runtime were reviewed together in
  `artifacts/virtual-office/qa/task12-before-after-comparison.png`. The corrected
  frame shows distinct, proportionate agents on open aisles instead of bodies
  stacked over desks and the reception counter.
- Task 12 geometry proof — five visible agents held five certified floor nodes
  and five identity slots with no material bounding-box overlap. Heights were
  28.7–34.3 px at 100%, 51.3–61.7 px at 180% and 74.4–89.2 px at 260%.
- Task 12 motion proof — consecutive runtime samples measured position travel,
  paired gait-frame changes and stride transforms without vertical bobbing.
  Cross-zone rest/reception/work transitions relocate invisibly to a certified
  approach and expose only the short ground-safe arrival.
- Task 12 telemetry cleanup — the pre-test JSONL was restored before restart;
  the final snapshot reported zero active/running agents and no Task 12 QA id.
  Browser console logs were empty.
- Task 12 gates — 3 focused suites/32 tests, lint, typecheck and build passed.
  The first full Jest run had one Windows `EBUSY` fixture lock; its 10 tests
  passed in isolation and the complete rerun passed 396 suites/9,894 tests with
  the configured 12 suites/172 tests skipped.
- Task 13 same-frame reception proof — the clipped pre-fix wall and corrected
  architectural brand panel were reviewed together in
  `artifacts/virtual-office/qa/task13-reception-before-after.png`; the exact
  mark and clean Cyryx Labs wordmark are fully visible and unobstructed.
- Task 13 live meeting proof — Vulcan and Argus shared one observed story and
  occupied `meeting-seat-01` and `meeting-seat-02` with distinct seated poses,
  no overlap and a complete five-message public transcript in
  `artifacts/virtual-office/qa/task13-live-meeting-final.png`.
- Task 13 privacy/accessibility proof — only explicit
  `AgentCollaborationMessage.public_message` content enters the transcript;
  prompts and tool output are discarded. Meeting tabs, labelled live region,
  truthful empty state and collapse/expand semantics are covered by contracts
  and verified in the browser.
- Task 13 cleanup — the pre-test JSONL was restored byte-for-byte (matching
  SHA-256 `6AED5B3A74256C091BD66E92FB89F35D3DDD8180533BE5F33CDBD57F4361357D`);
  the final snapshot reports zero running/active agents and no Task 13 QA ids.
- Task 13 gates — 4 focused suites/48 tests, lint, typecheck, the 3,499-file
  publish build and the full 396-suite/9,897-test regression passed; the
  configured 12 suites/172 tests remained skipped.
- Task 14 occupancy proof — overview rendered 22 visible presences (one per
  squad, including the AEXOS Master, plus one observed stale signal), all with 22
  unique desk reservations; 17 were seated and four were the bounded ambient
  walkers.
- Task 14 selected-squad proof — AEXOS Core rendered all 12 agents and Education
  rendered all 16 agents with 16 unique workstation reservations and 16 unique
  positions. No seated presence used a corridor or generic floor node.
- Task 14 accessibility proof — pose changes now refresh the agent's accessible
  label. Seated agents announce `Seated · assigned desk`, matching the inspector
  and visible state.
- Task 14 visual proof — the empty-campus regression and corrected overview were
  reviewed together in
  `artifacts/virtual-office/qa/task14/06-before-after-comparison.png`.
- Task 14 gates — 4 focused suites/48 tests, lint, typecheck, the 3,499-file
  publish build and the full 396-suite/9,897-test regression passed; the
  configured 12 suites/172 tests remained skipped.
- Task 15 browser proof — reset filled the 869×910 runtime without letterboxing;
  the overview exposed 22 unique identity slots, 17 registered seated agents,
  four bounded walkers and one stale signal on open floor. Education exposed all
  16 agents with 16 unique reservations and 16 unique identity slots.
- Task 15 visual proof — 100%, 180% and 260% runtime frames were inspected. The
  user-reported state and corrected 260% state were reviewed together in
  `artifacts/virtual-office/qa/task15/29-before-after-260.png`; no inspected
  seated agent occupied a corridor, tabletop, planter or brand panel.
- Task 15 reception proof — the exact Cyryx panel is a keyboard-operable focus
  control. Its balanced 160% composition keeps the full panel prominent and
  shows AEXOS Master seated at the adjacent registered routing workstation.
- Task 15 gates — 4 focused suites/48 tests, lint, typecheck, the 3,499-file
  publish build and the full 396-suite/9,897-test regression passed; the
  configured 12 suites/172 tests remained skipped. CodeRabbit remained
  unavailable because the installed WSL distribution has no Bash; no automated
  review verdict is claimed.
- Task 16 same-frame proof — the previous flat-raster placement and corrected
  layered 2.5D renderer were reviewed together in
  `artifacts/virtual-office/qa/task16/14-before-after-comparison.png`. The
  corrected side uses furniture-free seated artwork, registered chair baselines
  and foreground desk occlusion instead of drawing miniature duplicate chairs.
- Task 16 runtime proof — the live 1,672×941 scene exposed 17 seated squad
  representatives, a bounded walking cohort, 14 registered ambient screen
  surfaces and a 1,672×941 foreground occlusion canvas. A measured agent changed
  both screen position and presentation class during an 1.8-second sample;
  browser console output and horizontal overflow were both empty.
- Task 16 reception proof — the exact supplied Cyryx assets remain inside the
  architectural wall while AEXOS Master occupies the physical reception desk
  behind the counter. No opaque logo card covers the entrance.
- Task 16 installation proof — the focused installer test copied the scene
  manifest and v5 identity assets into a clean project-local `.aexos-core`
  footprint. The publish safety gate included 3,508 files and excluded `pro/`.
- Task 16 gates — 4 focused suites/49 tests, lint, typecheck and build passed.
  The final full regression passed 396 suites/9,898 tests; 12 suites/172 tests
  remained skipped by repository configuration.
- Task 17 discovery proof — `.codex/skills` and the remaining generic
  `.agents/skills` expose 47 skill files with 47 unique frontmatter names and
  zero duplicate activations. The retired `.agents/skills/AEXOS` namespace
  contained 64 generated entries and was removed; 15 unrelated generic
  workflow skills remain intact.
- Task 17 focused gates —
  `npx jest tests/core/virtual-office/server-cli-ui.test.js tests/installer/aexos-core-installer.test.js packages/installer/tests/unit/artifact-copy-pipeline/artifact-copy-pipeline.test.js --runInBand`
  passed 3 suites/47 tests, including selective cleanup, idempotency and a
  duplicate-name rejection contract.
- Task 17 repository gates — typecheck, 3,508-file publish build,
  `sync:ide:check`, `validate:codex-sync` and `validate:codex-integration`
  passed. Lint reported zero errors and 11 pre-existing warnings in
  `artifacts/html-rebrand/generate-html-rebrand.js`, outside this task.
- Task 17 full regression — 396 suites/9,901 tests passed; the configured 12
  suites/172 tests remained skipped. CodeRabbit was unavailable because the
  installed `docker-desktop` WSL distribution has no Bash; no automated review
  verdict is claimed.
- Task 17 browser/Product Design proof — Campus, Reception and Signals were
  exercised at 1,586×992 with empty warning/error logs and no document overflow.
  Reception retained its active state after selecting AEXOS Master; the current
  implementation and approved reference were reviewed together in
  `artifacts/virtual-office/qa/task17/10-final-reference-comparison-current.png`.
- Task 18 source diagnosis — all four v5 atlases contain damaged third-column
  seated cells, while the packaged v4 seated cells are complete. The renderer
  now selects v5 only for standing/walking and v4 for seated work/rest.
- Task 18 runtime proof — `GET /health` returned 21 squads/168 agents; the live
  browser reported `Connected`, rendered 168 addressable presences, selected the
  complete seated atlas and exposed zero `.avatar-crest` overlays.
- Task 18 CEO/reliability proof — no `Paulo Petruff` string remained in the live
  UI, the executive detail measured 230×116 px, the browser console contained
  zero errors and failed initial snapshots now schedule an automatic retry.
- Task 18 gates — focused UI/server contract 9/9, lint, typecheck and the full
  396-suite/9,901-test repository regression passed.
- Task 19 source diagnosis — the campus is one 1672×941 static PNG and the
  `foreground-occlusion-layer` redrew 17 rectangular crops above the agent
  layer. Those crops, not the alpha atlases, caused the observed severed legs,
  chairs and floating torsos.
- Task 19 runtime proof — the live browser remained connected with 21 squads and
  168 agents, contained no foreground canvas and no CEO image, kept the compact
  97×31 px CEO marker inside the 1,292×910 viewport and hid it when the 109 px
  image-free executive detail opened. No horizontal document overflow was
  observed.
- Task 19 gates — focused UI/server contract 9/9, lint, typecheck and the full
  396-suite/9,901-test repository regression passed. Exact narrow-browser
  recapture remains a manual visual follow-up; the responsive source contract
  remains covered by the focused suite.
- Task 20 asset diagnosis — the supplied 1586×992 Image 1 contained baked
  navigation, a Kai Morgan profile, people, labels and generated logos, so it
  could not be used literally as a truthful runtime layer. A two-pass built-in
  image edit produced a people/UI/text/logo-free campus plate while preserving
  the requested command-hall composition. Packaged SHA-256:
  `436a8bcd532dec17eeb6ed9d9b2d87a4eb8ded4f54e16ce5eeff74d49a9b0ec3`.
- Task 20 CEO asset proof — the supplied standing and workstation files are
  byte-identical to the already packaged originals. A transparent-background
  generation attempt was rejected because it baked a checkerboard into opaque
  pixels; the approved original assets were restored unchanged in bounded dark
  cards instead.
- Task 20 runtime proof — the live browser loaded the new 1586×992 plate,
  remained connected with 21 squads and 168 agents, exposed all 21 squad labels,
  rendered the standing CEO card in the CEO office, used the workstation image
  in its compact inspector, retained the exact reception wordmark and had no
  horizontal document overflow.
- Task 20 gates — focused Virtual Office and installer contracts passed 2
  suites/24 tests; lint, typecheck, `git diff --check` and the full
  396-suite/9,901-test repository regression passed. The configured 12
  suites/172 tests remained skipped.
- Task 21 asset proof — both supplied files are true-alpha PNGs. The packaged
  933×1156 source is byte-identical to
  `CYRYX_Labs_Logo_Transparent.png` with SHA-256
  `2e26fa39f0f2efe9fe3ecc3a25ffa64da53eff177baf571a6e5b0b5bb2d3598d`;
  the 3732×4624 4× variant was not duplicated into the framework because the
  smaller original already exceeds the rendered facade resolution.
- Task 21 implementation proof — the reception uses four crops of the same
  official lockup to reproduce two side emblems plus a compact central
  emblem/wordmark. The prior translucent container, border, underline and
  artificial panel glow are absent; no generated logo is rendered.
- Task 21 runtime proof — the live Reception view served four instances of the
  official asset, no legacy `.reception-brand-mark` or `.reception-wordmark`
  elements, connected 21 squads/168 agents and zero document overflow.
- Task 21 gates — focused Virtual Office/installer contracts passed 2 suites/24
  tests; lint, typecheck, `git diff --check` and the full 396-suite/9,901-test
  regression passed. The configured 12 suites/172 tests remained skipped.
- Task 21 self-critique — post-code and post-test checks passed. The only
  adjustment found was reducing and raising the two side emblems so they remain
  contained by the facade; focused tests were rerun after the correction.
- Task 22 corrective proof — the user evidence invalidated Task 21's duplicated
  CSS crops and the first intact vertical-lockup attempt because neither fit the
  horizontal facade. The final composition renders one existing true-alpha
  official symbol and one existing true-alpha official wordmark, without crop,
  repetition, panel, glow or aspect-ratio distortion.
- Task 22 browser proof — the live Reception view centers the horizontal lockup
  inside the black entrance facade; the full `CYRYX` and `LABS` lettering is
  visible, the page reports zero horizontal overflow, and the runtime remains
  connected with 21 squads and 168 agents.
- Task 22 focused gates — Virtual Office/installer contracts passed 2 suites and
  24 tests after the final horizontal composition.
- Task 22 repository gates — lint, typecheck, `git diff --check` and the full
  396-suite/9,901-test regression passed; the configured 12 suites/172 tests
  remained skipped.
- Task 23 diagnosis — live inspection confirmed the server was current, but the
  derived two-file composition still differed from the approved facade. The
  first direct vertical-lockup correction also overflowed its visual bounds due
  to replaced-element sizing and could not reproduce the horizontal reference.
- Task 23 implementation proof — alpha bounds were measured from the exact
  933×1156 supplied PNG: symbol `x=211..723, y=24..883`; type artwork
  `x=26..906, y=930..1130`. The final facade renders two side emblems plus one
  compact center emblem/type group directly from that byte-identical source,
  without derived reception assets, aspect distortion, filters or UI panels.
- Task 23 browser proof — both Campus and Reception views display the complete
  four-element hierarchy inside the black facade, with four official-source
  image instances, 21 squads, 168 agents and zero document overflow.
- Task 23 gates — focused Virtual Office/installer contracts passed 2 suites/24
  tests; lint, typecheck, `git diff --check` and the full 396-suite/9,901-test
  regression passed. The configured 12 suites/172 tests remained skipped.

### Completion Notes List

- Added dependency-free loopback HTTP/SSE collector, secure static server and
  standalone/root CLI entrypoints.
- Added canonical identity projection for the current 20 squads/156 squad
  agents and 12 core agents; all agents default to `available` and active
  leases expire to `stale`.
- Added event allowlisting, truncation, deduplication, bounded history, JSONL
  replay/persistence, payload limits and explicit path/CSP controls.
- Added a packaged 1672×941 premium Cyryx campus, a 1536×1024 real raster avatar
  atlas, 21 squad neighborhoods, 168 independent agents, filters, detail panel
  and timeline.
- Added truthful presence motion: available/completed agents circulate as a
  non-semantic presentation layer; observed active telemetry returns agents to
  unique workstations, and agents sharing a story, run or session occupy
  distinct seats at one collaboration table.
- Superseded the interim avatar/walk assets with four true-alpha identity
  atlases. Twenty-four adults now retain the same face, hair and Cyryx jacket
  across paired gait frames and a dedicated seated-work frame; visible-floor
  allocation prevents simultaneous copies.
- Added reserved floor routes and an inspectable camera with 90–260% zoom,
  pointer/touch drag, wheel zoom, keyboard pan and reset.
- Calibrated avatar size against the office world rather than browser width,
  added depth-aware foot anchoring, preserved the campus native aspect ratio
  and separated ambient routes and non-project signal bays from desk anchors.
- Added the luxury AEXOS Master reception, an exact physical Cyryx wordmark,
  corrected two-line header lockup and desktop/mobile Reception camera focus.
- Promoted the reception branding to a large architectural panel with the exact
  Cyryx mark and a clean, true-alpha wordmark crop that remains fully visible.
- Added eight certified meeting-room seats and truthful parallel-work routing:
  agents sharing an observed story, run or session sit together without
  overlapping, while larger groups overflow only to certified project seats.
- Added an accessible live meeting window with selectable sessions and a
  bounded, ordered transcript sourced exclusively from explicitly public,
  credential-redacted collaboration messages; raw prompts, tool output and
  invented dialogue cannot enter the surface.
- Restored populated desk-based occupancy: the overview shows one representative
  per squad and a squad selection shows its complete roster. Every visible agent
  retains a unique desk reservation, at most four agents walk certified aisles,
  and all remaining available agents sit only at workstation or reception seats.
- Registered all 21 desk anchors, four walking routes, three signal bays and the
  AEXOS Master seat against visible campus furniture or open floor. Reset now
  uses a native-ratio cover frame with bounded edge exploration instead of
  contain-fit letterboxing, and the brand panel opens a balanced reception view.
- Replaced the raster-only spatial contract with a versioned scene manifest.
  The campus image is now environmental art; the manifest owns world scale,
  routes, workstations, reception bounds, meeting seats, 14 screen surfaces and
  17 foreground furniture occluders.
- Added four normalized true-alpha v5 identity atlases whose seated poses do not
  contain desks or office chairs. One world-space human profile now calibrates
  walking, standing and seated presentation against the same furniture scale.
- Added Canvas-based ambient screen motion and reduced-motion fallback. This
  layer is decorative and cannot change or imply agent telemetry.
- Added an installer contract proving the scene graph, renderer and assets ship
  inside each project-local AEXOS installation.
- Replaced approximate transitions with certified floor nodes, single-seat
  workstation anchors, hidden cross-zone relocation and short visible arrivals;
  calibrated the opaque-foot baseline and added a ground contact shadow.
- Added a prominent inspector summary that keeps current observed work,
  operational status and presentation posture semantically separate.
- Copied the exact supplied logo. Packaged SHA-256:
  `f58edac16908d2b2bf48e65ec4a482a2f2b26e5d207542aef10b3515f1244bbf`.
- Added semantic keyboard controls, textual states, responsive roster and
  reduced-motion behavior. Fixed a mobile overflow found during runtime QA.
- No external AI, frontend framework or runtime dependency was introduced.
- Task 17 supersedes the earlier monitor treatment: the ambient screen canvas,
  painter and scene surfaces were removed completely at the user's direction.
- Retired the duplicate generic AEXOS projection from installation and upgrade
  paths. `.codex/skills` is the canonical Codex activation surface; unrelated
  generic workflows under `.agents/skills` are preserved.
- Reframed the desktop shell against the approved reference with a slim exact
  Cyryx/AEXOS lockup, overlay squad navigator, compact work/status card and an
  architectural reception sign that does not cover the entrance.
- Task 18 supersedes the damaged v5 seated-pose claim: v5 remains the
  standing/walking source, while complete v4 seated poses prevent half-rendered
  agents. The redundant floating crest is removed because both packaged atlas
  generations already contain the Cyryx uniform mark.
- Task 18 reduced the executive treatment and made initial local-collector
  failure recoverable without manually refreshing the page; Task 19 supersedes
  its remaining portrait treatment with an image-free role marker.
- Task 19 removes the raster-derived foreground masks entirely so avatars are
  no longer truncated by approximate furniture rectangles. The static campus
  now renders behind complete avatar cutouts; correct furniture/avatar depth
  requires a registered depth map or truly layered SVG/2.5D replacement.
- The executive surface no longer renders personal photography. A single small
  `CEO` role marker opens a compact, image-free read-only detail and disappears
  while that detail is active.
- Task 20 supersedes Task 19's image-free executive treatment at the user's
  direction. The supplied standing CEO artwork is restored as a small world
  card and the supplied workstation artwork appears only in the compact
  read-only inspector; visible copy remains role-only as `CEO`.
- Replaced the rejected 1672×941 campus composition with a clean 1586×992
  command-hall plate derived from the approved Image 1. Runtime overlays—not the
  generated plate—remain authoritative for exact Cyryx branding, agents,
  labels, status and interaction.
- Task 22 supersedes Task 21's rejected four-crop facade and the unsuitable
  vertical-lockup correction. The entrance now uses exactly one official
  true-alpha symbol beside exactly one official true-alpha wordmark, preserving
  both source proportions in a clean horizontal architectural composition.
- Task 23 supersedes Task 22's derived two-file composition. The entrance now
  matches the approved reference hierarchy with two side emblems and a compact
  central emblem/type group, all rendered from the byte-identical supplied PNG
  through measured transparent bounds.

### Definition of Done Self-Assessment

- [x] Requirements and acceptance criteria — the approved visual remediation
  remains within AC5/AC6; all original ACs remain covered.
- [x] Standards, structure and security — existing dependency-free architecture,
  loopback boundary, CSP, validation and redaction controls are preserved; no
  secret, environment variable or external API was added.
- [x] Testing — the focused Virtual Office contract passes 9/9 and the complete
  repository passes 396 suites/9,901 tests, lint and typecheck after Task 23;
  the combined focused Virtual Office/installer run passes 24/24.
- [x] Functionality — Task 23 was manually verified in Campus and Reception
  views with the approved four-element official facade hierarchy, 21 squads,
  168 agents and zero horizontal overflow.
- [x] Story administration — Tasks 6–23, decisions, evidence, completion notes,
  Change Log and File List are current.
- [x] Documentation — the user guide, architecture document, ADR-AEX-010 and
  Cerberus assessment describe the layered scene graph, non-semantic ambient
  motion, truthful collaboration routing and optional companion boundary.
- [x] Developer confirmation — all applicable DoD items are addressed. No new
  runtime dependency or external AI requirement was introduced; Task 17 is
  ready for formal QA review.

### File List

- `.aexos-core/core/virtual-office/cli.js`
- `.aexos-core/core/virtual-office/config-loader.js`
- `.aexos-core/core/virtual-office/event-normalizer.js`
- `.aexos-core/core/virtual-office/index.js`
- `.aexos-core/core/virtual-office/registry-loader.js`
- `.aexos-core/core/virtual-office/server.js`
- `.aexos-core/core/virtual-office/state-projector.js`
- `.aexos-core/core/virtual-office/virtual-office.config.yaml`
- `.aexos-core/core/events/dashboard-emitter.js`
- `.aexos-core/core/events/types.js`
- `.aexos-core/core/virtual-office/public/index.html`
- `.aexos-core/core/virtual-office/public/styles.css`
- `.aexos-core/core/virtual-office/public/app.js`
- `.aexos-core/core/virtual-office/public/scene-manifest.js`
- `.aexos-core/core/virtual-office/public/assets/cyryx-campus.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-campus-reception-v2.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-campus-command-hall-v1.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-labs-mark-crop-v1.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-labs-wordmark-crop-v1.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-labs-wordmark-clean-v2.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-labs-official-lockup-v1.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-atlas.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-atlas-clean-v3.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-atlas-ui-v3.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-walk-cycle-v1.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-identity-a-v4.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-identity-b-v4.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-identity-c-v4.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-identity-d-v4.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-identity-a-v5.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-identity-b-v5.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-identity-c-v5.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-agent-identity-d-v5.png`
- `.aexos-core/core/virtual-office/public/assets/cyryx-labs-logo.png`
- `.aexos-core/core/virtual-office/public/assets/brand-asset.json`
- `.aexos-core/data/entity-registry.yaml`
- `bin/aexos-office.js`
- `bin/aexos.js`
- `package.json`
- `package-lock.json`
- `packages/installer/src/enterprise/enterprise-upgrade-manifest.yaml`
- `packages/installer/src/wizard/ide-config-generator.js`
- `packages/installer/src/wizard/index.js`
- `packages/installer/tests/unit/artifact-copy-pipeline/artifact-copy-pipeline.test.js`
- `docs/guides/virtual-office.md`
- `docs/framework/epics/aexos-evolution/ARCHITECTURE-VIRTUAL-OFFICE.md`
- `docs/framework/epics/aexos-evolution/adr/ADR-AEX-009-VIRTUAL-OFFICE-PROJECTION.md`
- `docs/framework/epics/aexos-evolution/adr/ADR-AEX-010-LAYERED-SCENE-GRAPH.md`
- `docs/framework/epics/aexos-evolution/CERBERUS-AEXOS-INTEGRATION-ASSESSMENT.md`
- `docs/framework/epics/aexos-evolution/ROADMAP.md`
- `docs/framework/epics/aexos-evolution/STORY-AEX-3.6-VIRTUAL-OFFICE.md`
- `design-qa.md`
- `artifacts/virtual-office/qa/before-reception-v1.png`
- `artifacts/virtual-office/qa/final-desktop-reception-v3.png`
- `artifacts/virtual-office/qa/reception-active-work-v1.png`
- `artifacts/virtual-office/qa/mobile-390-viewport-v2.png`
- `artifacts/virtual-office/qa/header-same-frame-comparison.png`
- `artifacts/virtual-office/qa/task12-before-after-comparison.png`
- `artifacts/virtual-office/qa/task12-overview-100-final.png`
- `artifacts/virtual-office/qa/task12-overview-180-final.png`
- `artifacts/virtual-office/qa/task12-final-center-260.png`
- `artifacts/virtual-office/qa/task12-reception-brand-final.png`
- `artifacts/virtual-office/qa/task13-before-reception.png`
- `artifacts/virtual-office/qa/task13-reception-corrected-v2.png`
- `artifacts/virtual-office/qa/task13-reception-before-after.png`
- `artifacts/virtual-office/qa/task13-live-meeting-final.png`
- `artifacts/virtual-office/qa/task13-office-events.before.jsonl`
- `artifacts/virtual-office/qa/task15/17-cover-reset-final.png`
- `artifacts/virtual-office/qa/task15/22-reception-balanced-final.png`
- `artifacts/virtual-office/qa/task15/26-seating-260-final.png`
- `artifacts/virtual-office/qa/task15/27-education-100-final.png`
- `artifacts/virtual-office/qa/task15/28-seating-180-final.png`
- `artifacts/virtual-office/qa/task15/29-before-after-260.png`
- `artifacts/virtual-office/qa/task14/01-current-regression.png`
- `artifacts/virtual-office/qa/task14/02-overview-desk-occupancy.png`
- `artifacts/virtual-office/qa/task14/03-aexos-core-all-agents.png`
- `artifacts/virtual-office/qa/task14/04-education-16-unique-desks.png`
- `artifacts/virtual-office/qa/task14/05-final-overview.png`
- `artifacts/virtual-office/qa/task14/06-before-after-comparison.png`
- `artifacts/virtual-office/qa/task16/09-layered-overview-100.png`
- `artifacts/virtual-office/qa/task16/10-layered-close-260.png`
- `artifacts/virtual-office/qa/task16/12-final-reception.png`
- `artifacts/virtual-office/qa/task16/13-desktop-1440.png`
- `artifacts/virtual-office/qa/task16/14-before-after-comparison.png`
- `artifacts/virtual-office/qa/task16/15-final-live-default.jpg`
- `artifacts/virtual-office/qa/task17/08-reception-state-corrected.png`
- `artifacts/virtual-office/qa/task17/09-final-overview-current.png`
- `artifacts/virtual-office/qa/task17/10-final-reference-comparison-current.png`
- `scripts/virtual-office/build-seated-atlases.ps1`
- `scripts/virtual-office/build-visual-comparison.ps1`
- `tests/core/virtual-office/config-registry.test.js`
- `tests/core/virtual-office/event-projector.test.js`
- `tests/core/virtual-office/server-cli-ui.test.js`
- `tests/installer/aexos-core-installer.test.js`

## QA Results

**Gate:** PASS  
**Reviewer:** Argus (`@qa`)  
**Date:** 2026-08-16

- AC1 PASS — standalone and root CLI paths, help, host/port/open options and
  fixed-port failure behavior are covered by focused tests.
- AC2 PASS — the live browser rendered the canonical 21 pods/168 agents, with
  all agents truthfully available until local telemetry was observed.
- AC3 PASS — loopback collector, health, snapshot, SSE and event endpoints work
  without an AI or cloud API.
- AC4 PASS — explicit state transitions, duplicate handling, lease expiry and
  future-timestamp clamping are covered by projector tests.
- AC5 PASS — premium spatial office, desks, monitors, seated avatars and 168
  exact-logo jacket crests were verified in the browser. The packaged asset
  matches SHA-256
  `f58edac16908d2b2bf48e65ec4a482a2f2b26e5d207542aef10b3515f1244bbf`.
- AC6 PASS — semantic controls, text state labels, reduced motion and the
  390×844 no-overflow layout were verified by contracts and browser inspection.
- AC7 PASS — loopback-only binding, allowlisted/redacted telemetry, size bounds,
  CSP headers, exact static routes and absence of control endpoints are covered.
- AC8 PASS — 4 focused suites/45 tests, 396 full suites/9,894 tests, lint,
  typecheck, registry determinism and publish build all passed.

No acceptance-criterion defects remain. CodeRabbit was unavailable in this
Windows environment, so no CodeRabbit verdict is claimed; the manual QA gate
and repository gates above provide the review evidence. This is a local,
uncommitted implementation result and does not assert push or deployment.

### Re-gate Date: 2026-08-16

### Reviewed By: Argus (Test Architect)

### Reviewed Revision

`working-tree:a85ec5d1f3df4fc1eb1454a9144231d7177a66f9525aad00a59099854f5a0209`

### Code Quality Assessment

The approved high-fidelity campus remediation preserves the dependency-free,
read-only architecture and makes each of the 168 agents independently
addressable. Motion is derived only from observed active telemetry; agents
sharing an observed story, run or session converge at a deterministic project
hub. No control path, external AI API or simulated activity was introduced.

### Requirements Traceability

- AC1–AC4 — existing CLI, collector, SSE and state-projection coverage remains
  green in the full regression suite.
- AC5 — the packaged 1672×941 campus, 1536×1024 real avatar atlas, 21 squad
  neighborhoods and exact Cyryx crests were verified in the live browser.
- AC6 — keyboard controls, text states, reduced motion and the 390×844 bounded
  roster were verified; desktop also has no horizontal overflow.
- AC7 — loopback binding, CSP, payload limits, redaction, exact static routes
  and absence of control endpoints remain enforced.
- AC8 — lint, typecheck, 396 suites/9,894 tests and build/publish safety all
  passed after the redesign.

### NFR and Design Validation

- Security: PASS — no new trust boundary, dependency, secret or remote service.
- Performance: PASS — 168 presences render and filter responsively at desktop
  and narrow viewports.
- Reliability: PASS — SSE remains connected; default state is truthfully
  available; observed movement and shared-project convergence were exercised.
- Maintainability: PASS — motion, projection, assets, tests and documentation
  remain separated and explicit.
- Product Design QA: PASS — the approved reference and implementation were
  reviewed in the same frame; `design-qa.md` has no remaining P0–P2 finding.

### Refactoring Performed

None during QA. No defect requiring implementation changes was found.

### Automation Note

CodeRabbit was attempted first as configured, but the only installed WSL
distribution is `docker-desktop` and does not contain Bash. No CodeRabbit
verdict is claimed; manual deep review and repository/browser gates provide the
decision evidence.

### Files Modified During Review

- `docs/qa/gates/AEX.3.6-aexos-virtual-office-local-real-time-observability.yml`
- `docs/framework/epics/aexos-evolution/STORY-AEX-3.6-VIRTUAL-OFFICE.md`

### Gate Status

Gate: PASS → docs/qa/gates/AEX.3.6-aexos-virtual-office-local-real-time-observability.yml

### Lifecycle Transition

PASS: InReview → Done

### Raster Occlusion and Executive Treatment Re-gate: 2026-08-23

**Reviewer:** Argus (`@qa`)  
**Gate:** CONCERNS — approved for local user testing; not yet approved for commit

- AC5 PASS for the reported defect — the foreground canvas, its redraw routine
  and all 17 rectangular raster occluders are absent. Complete avatar alpha
  cutouts now render above the static campus without desk masks severing their
  bodies or chairs.
- AC5/AC6 PASS at 1,292×910 — the live browser remained connected with 21
  squads/168 agents, the CEO marker stayed inside the viewport, and opening it
  produced one 109 px image-free detail while hiding the world marker. Document
  horizontal overflow remained zero.
- AC8 PASS — the focused Virtual Office contract passed 9/9, lint and typecheck
  passed, and the full repository regression passed 396 suites/9,901 tests; 12
  suites/172 tests remained skipped by repository configuration.
- CONCERN — the campus remains one 1672×941 static PNG. Removing approximate
  masks prevents body truncation but does not provide semantically correct
  furniture/avatar depth. A registered depth map or truly layered SVG/2.5D
  scene remains architectural follow-up.
- CONCERN — the exact narrow viewport from the user's screenshot was not
  reproducible through the current in-app browser control surface. The
  responsive contract is covered by source tests, but visual confirmation in
  that user viewport is required before commit.

This gate authorizes a reversible local test only. It does not certify a commit,
push, deployment, hosted release or completion of the layered-scene architecture.

### Approved Command-Hall and CEO Restoration Re-gate: 2026-08-23

**Reviewer:** Argus (`@qa`)  
**Gate:** PASS — approved for local user testing  
**Reviewed revision:**
`working-tree:b471761e6e35423acf5e1b734267d61ec4f47b46b482618cd618358d45a72db3`

- AC5 PASS — the runtime uses the new 1586×992 command-hall campus derived from
  the user's Image 1. The plate contains no baked navigation, profile card,
  people, text or generated logo; all operational layers remain live DOM.
- AC5/AC6 PASS — the supplied standing CEO image is restored as a bounded world
  card and the supplied workstation image is restored in the compact read-only
  inspector. Visible identity remains `CEO`; no personal name was reintroduced.
- AC5 PASS — reception renders the exact packaged Cyryx Labs wordmark on the
  central facade. Browser inspection showed 21 squad labels, 168 addressable
  agents, connected telemetry and zero horizontal document overflow.
- AC8 PASS — focused Virtual Office/installer contracts passed 2 suites/24
  tests; lint, typecheck and `git diff --check` passed; full regression passed
  396 suites/9,901 tests with 12 suites/172 tests skipped by repository config.
- Installer PASS — the new campus and both supplied CEO assets are covered by
  the project-local installation regression.

The gate certifies the local uncommitted test surface only. Visual acceptance
by the user remains required before any commit; no push, deployment or hosted
release is asserted.

Gate: PASS →
`docs/qa/gates/AEX.3.6-aexos-virtual-office-local-real-time-observability.yml`

PASS: InReview → Done

### Avatar, CEO and Runtime Recovery Re-gate: 2026-08-23

**Reviewer:** Argus (`@qa`)  
**Gate:** PASS  
**Scope:** local uncommitted working tree

- AC3 PASS — the loopback collector returned healthy and the browser established
  SSE with 21 squads and 168 registered agents. Initial snapshot failure now
  retries automatically instead of leaving a terminal error state.
- AC5 PASS — complete seated cells are selected for work/rest, standing/walking
  identity remains stable and no separately positioned crest exists. Live DOM
  inspection found 168 presences and zero `.avatar-crest` elements.
- AC5/AC6 PASS — the executive UI exposes only `CEO`, contains no personal name,
  uses a portrait world card and a compact 230×116 px inspector component.
- AC8 PASS — focused contracts passed 9/9; root lint and typecheck passed; full
  regression passed 396 suites/9,901 tests with the repository-configured 12
  suites/172 tests skipped.
- Runtime QA PASS — local telemetry showed `Connected`, counts 21/168/0 and the
  browser console returned zero errors.

No commit, push, deployment or hosted-release claim is made. The local server
on `http://127.0.0.1:4011/` is the test surface for this gate.

### Collision-Remediation Re-gate: 2026-08-16

**Reviewer:** Argus (`@qa`)  
**Gate:** PASS  
**Reviewed revision:**
`working-tree:5cfab593b5f1e82f506611c72a8164f6941c139ffb2ab5df7afe10048ba1a226`

- AC5 PASS — the reported squad-anchor crowd piles are removed. The browser
  rendered 168 independently positioned agents across the office; available
  and completed agents circulate on separately phased ambient routes.
- AC5 PASS — two active catalog agents sharing one observed story stopped
  roaming and occupied separate seats at one deterministic project table. A
  completion event returned both to ambient circulation and removed the beacon.
- AC6 PASS — responsive runtime inspection remained inside the viewport and
  reduced-motion contracts remain present. Movement receipts distinguish
  `circulating`, `observed-project` and `stationary` modes.
- AC8 PASS — 32 focused tests, 396 full suites/9,894 tests, lint, typecheck and
  the 3,488-file publish build passed after the remediation.
- Product Design QA PASS — the user-reported source and corrected runtime were
  compared in one image at
  `virtual-office-audit/08-before-after-comparison.png`; `design-qa.md` ends in
  `final result: passed` with no remaining P0–P2 finding.

The ambient walk cycle is explicitly non-semantic and never changes telemetry
state. Active work remains derived only from observed local events. No external
AI service, control endpoint or simulated project activity was introduced.

Gate: PASS →
`docs/qa/gates/AEX.3.6-aexos-virtual-office-local-real-time-observability.yml`

PASS: InReview → Done

### Identity and Seated-Work Re-gate: 2026-08-17

**Reviewer:** Argus (`@qa`)  
**Gate:** PASS  
**Reviewed revision:**
`working-tree:441dd68bd4b1bcaaaa35847971eddd727feba91298dbf51753ce1e26989c0d2a`

- AC5 PASS — four verified true-alpha atlases provide 24 adult identities. The
  quiet browser state rendered 22 unique slots for 22 visible agents; the
  observed-work state rendered 24 unique slots for 24 visible agents.
- AC5 PASS — Argus and Iris shared one observed QA story, retained distinct
  identity rows and selected their seated frames at separate table seats. A
  terminal event removed the working pose and beacon and returned both agents.
- AC5/AC6 PASS — world-relative size remained 58.9–65.7 px high at 100%, the
  integrated camera preserved that ratio at 160%, and the project label no
  longer covered seated bodies.
- AC6 PASS — twenty runtime samples found zero significant overlaps; measured
  walkers changed both screen position and gait frame. Browser overflow and
  console entries remained zero.
- AC7 PASS — the QA state used the existing normalized loopback telemetry path;
  no control endpoint, external AI service or persistent simulated activity was
  added.
- AC8 PASS — 4 focused suites/45 tests, lint, typecheck, the 3,495-file publish
  build and the final 396-suite/9,894-test regression passed. The four suites
  involved in one transient Windows config-sharing failure also passed 52/52
  before the final full green rerun.
- Product Design QA PASS — the user reference and 160% seated runtime were
  reviewed in the same frame at
  `virtual-office-behavior-remediation/40-reference-vs-seated-runtime-comparison.png`;
  `design-qa.md` ends in `final result: passed` with no remaining P0–P2 issue.

The visible identity layer is presentation-only and cannot promote an agent to
an active state. Seated work continues to require locally observed telemetry.
This gate certifies the local working tree only; no commit, push, deployment or
hosted release is asserted.

Gate: PASS →
`docs/qa/gates/AEX.3.6-aexos-virtual-office-local-real-time-observability.yml`

PASS: InReview → Done

### Layered Scene-Graph Re-gate: 2026-08-17

**Reviewer:** Argus (`@qa`)  
**Gate:** PASS  
**Reviewed revision:**
`working-tree:b7968af08b61d04aa2ac09e6c1d5bea531f4f5bda8b5bb422bb18c8805c87c93`

- AC5 PASS — the raster is no longer spatial authority. A versioned manifest
  registers human scale, 21 workstations, routes, meeting/reception anchors,
  14 ambient screens and 17 foreground furniture occluders in one world.
- AC5 PASS — v5 seated sprites are true-alpha and furniture-free. The 260%
  inspection shows agents using scene chairs with lower bodies behind desks;
  no miniature duplicate chair, tabletop placement or reception overlay remains.
- AC5/AC6 PASS — runtime sampling measured a roaming agent changing position
  and entering the moving presentation class. Seated posture remains confined
  to workstations, meeting seats or the reception desk, and visible status stays
  separate from ambient motion.
- AC6 PASS — the live DOM exposes semantic agent controls, truthful posture
  labels, reduced-motion contracts and zero document overflow. Browser console
  output was empty.
- AC7 PASS — screen animation is explicitly ambient and cannot mutate agent
  state. Public meeting dialogue remains allowlisted/redacted; no external AI,
  prompt exposure or control endpoint was introduced.
- AC8 PASS — 4 focused suites/49 tests, lint, typecheck, the 3,508-file publish
  build and the final 396-suite/9,898-test regression passed; 12 suites/172
  tests remain skipped by repository configuration.
- Installer PASS — a clean project-local AEXOS footprint received the scene
  manifest and v5 identity asset, proving the Virtual Office accompanies the
  normal framework installation.
- Product Design QA PASS — current before/after, 100%, 260%, reception and
  desktop evidence is recorded in `artifacts/virtual-office/qa/task16/`;
  `design-qa.md` ends in `final result: passed` with no open P0–P2 finding.

The inspected Cerberus/MegaBrain checkout remains a separately versioned,
optional companion. It is not merged into AEXOS core because its routing,
installation, Python/Node and provider boundaries currently conflict with core
authority; the recommended seam is a narrow opt-in event adapter.

This gate certifies the local working tree only. No commit, push, deployment or
hosted release is asserted.

Gate: PASS →
`docs/qa/gates/AEX.3.6-aexos-virtual-office-local-real-time-observability.yml`

PASS: InReview → Done

### Canonical Projection and Premium Shell Re-gate: 2026-08-17

**Reviewer:** Argus (`@qa`)  
**Gate:** PASS  
**Reviewed revision:**
`working-tree:1f9239ab45159ae7477ab16fdc2e1d876a2320f788457f3c6ee4145e423529c1`

- AC5 PASS — `.codex/skills` remains the one Codex activation projection. The
  current project exposes 47 skill files with 47 unique frontmatter names and
  preserves all 15 unrelated generic workflow skills; the retired 64-entry
  `.agents/skills/AEXOS` namespace is absent.
- AC5/AC6 PASS — the decorative monitor canvas, painter and scene surfaces are
  removed. Telemetry, seated work, meetings and the bounded walk cycle remain
  separate and functional; a live sample confirmed avatar movement.
- AC6 PASS — Campus, Reception and Signals are keyboard-addressable. Reception
  retains its active state after selecting AEXOS Master, the exact Cyryx sign is
  contained at architectural scale, document overflow is zero and browser
  warning/error logs are empty.
- AC8 PASS — 3 focused suites/47 tests, typecheck, IDE/Codex sync validation,
  the 3,508-file publish build and the final 396-suite/9,901-test regression
  passed. Lint has zero errors; its 11 warnings are pre-existing in an unrelated
  generated HTML-rebrand artifact.
- Installer PASS — cleanup is selective and idempotent, preserves generic
  workflows and has a clean-install contract rejecting duplicate skill names.
- Product Design QA PASS — the approved reference and current 1,586×992 runtime
  were reviewed in one frame at
  `artifacts/virtual-office/qa/task17/10-final-reference-comparison-current.png`;
  `design-qa.md` ends in `final result: passed` with no open P0–P2 finding.

CodeRabbit remained unavailable because the installed `docker-desktop` WSL
distribution has no Bash; no CodeRabbit verdict is claimed. This gate certifies
the local working tree only. No commit, push, deployment or hosted release is
asserted.

Gate: PASS →
`docs/qa/gates/AEX.3.6-aexos-virtual-office-local-real-time-observability.yml`

PASS: InReview → Done
