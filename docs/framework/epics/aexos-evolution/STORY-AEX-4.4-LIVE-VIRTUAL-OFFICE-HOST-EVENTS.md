# Story AEX-4.4: Live host activity and coherent Virtual Office

## Status

Ready for Review — architectural scene and local telemetry implemented; native integration matrix and high-zoom evidence remain explicit acceptance limitations.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [jest, browser-review, event-smoke, lint, typecheck, build]

## Story

**As an** AEXOS operator, **I want** agents, work and public collaboration from my execution hosts represented live in a coherent Virtual Office, **so that** I can inspect what is happening and which integrations actually work.

## Context and dependencies

The user reports static imagery, ill-fitting agents, poor design, absent actions and cross-host communication. Build upon AEX-3.6's collector/projector and AEX-4.1's distinction between structural availability and operational proof. Read [accumulated-context.md](./accumulated-context.md#2026-09-06-audit-and-experience-remediation). This story is independently implementable using existing events and local server. Company-wide orchestration strategy remains the requested later discussion.

## Acceptance Criteria

- [x] AC1: Provide a documented CLI-accessible host event bridge and inspectable host status for CLI, ChatGPT, Claude Code, Grok Bot and Gemini. Preserve host/session/run/agent/story identity where supplied, validate payloads, and explicitly report unsupported or unconfigured integrations. A host label or installed projection alone never proves a live connection.
- [x] AC2: Valid observed lifecycle events update the server snapshot and browser through the existing live stream without reload. Prove one local CLI producer-to-render flow within five seconds under normal local operation; document the measured time and freshness threshold. Disconnection, stale heartbeat, reconnect and duplicate/out-of-order events do not leave false active work.
- [x] AC3: Represent actual agent work, progress, failures and public agent-to-agent messages with sender/recipient and run context when supplied. Missing private or unavailable communication is labeled unavailable; prompts, hidden reasoning, credentials and arbitrary tool output are excluded. Fixtures/manual bridge submissions are labeled test/manual evidence, never native provider certification.
- [x] AC4: Repair the office composition and agent representations so identities/status are readable, scale and positioning are coherent, selected agents can be inspected, and no agents overlap furniture or one another at supported zoom levels. Ambient motion is visibly presentation-only and cannot imply an observed action or communication.
- [x] AC5: Provide useful observational interaction: agent/host filtering or selection, task/context inspection, live event/message timeline, and clear disconnected/empty/error states with CLI recovery guidance. Execution and approvals remain in the existing CLI/Master path; the browser is not a second orchestrator.
- [ ] AC6: Desktop and narrow/mobile layouts include a usable non-spatial list, keyboard navigation, visible focus, textual status, sufficient contrast and reduced-motion behavior. Validate actual browser rendering at 1440px and 390px widths and 100%/supported high zoom; no inaccessible offscreen essential controls or horizontal page overflow.
- [x] AC7: Maintain loopback/project boundaries, bounded event and message retention, input validation, redaction and escaped browser rendering. Unknown producers, malformed payloads and unsafe public messages cannot create trusted live host claims or executable browser content.
- [x] AC8: Add producer/normalizer/projector/server/CLI regression coverage and browser evidence for lifecycle, messages, empty/offline/stale/reconnect behavior and layout. Publish a per-host matrix distinguishing native verified, bridge tested, configured only, unavailable and not tested. Native host acceptance remains open where the actual host cannot be exercised.
- [x] AC9: Run lint, typecheck, full tests and build; record outcomes, source changes and remaining blockers. Do not claim the whole cross-provider request complete solely from local bridge tests.

- [ ] AC10 (user motion follow-up, 2026-09-07): Make the architectural office visibly responsive through subtle decorative lighting/bridge ambience that is explicitly labeled presentation-only, and bounded clickable real-agent markers placed within their squad rooms. Animate work markers only for observed running/assigned states; waiting/blocked/completed/unobserved markers stay stationary. Animate communication lines only while their observed public messages remain fresh. Provide a persisted motion on/off preference, honor OS reduced motion, cap DOM/animation work and preserve mobile/list/keyboard access.

### User design correction — 2026-09-07

The user explicitly replaces the initial card-based floor with the supplied architectural office reference and requests "essa visao porem tudo interconectado e funcional". AC4/AC5 now additionally require the supplied building composition as the primary full-viewport scene, real keyboard-accessible squad room hotspots, a functional room/agent/session drawer, compact real host controls, and communication connections sourced only from observed messages. The image is a decorative architectural reference, not evidence of the depicted people being connected; its baked navigation and invented active profile must be cropped out and replaced by real DOM controls. Search and non-spatial list remain accessible alternatives.

## Tasks / Subtasks

- [x] Trace existing producers, event schema and UI consumers; record actual host capability matrix (AC1).
- [x] Extend existing CLI/event bridge and project host freshness/identity safely (AC1-3,7).
- [x] Repair agent composition and add useful live inspection with truthful states (AC4-6); independent browser acceptance tracked separately below.
- [x] Exercise malformed events, duplicate/out-of-order lifecycle, redaction and reconnect regressions (AC2-3,7-8).
- [ ] Capture actual local producer-to-browser evidence and desktop/mobile/zoom review (AC2,4,6,8).
- [x] Run gates, update file list and record native provider gaps explicitly (AC9).

## Dev Notes

[Source: ARCHITECTURE-VIRTUAL-OFFICE.md#system-architecture] defines events -> collector -> append-only JSONL -> projector -> snapshot/SSE -> UI. Reuse `.aexos-core/core/virtual-office/{cli,server,event-normalizer,state-projector}.js`, `public/{app.js,styles.css,index.html,scene-manifest.js}`, `.aexos-core/core/events/{types,dashboard-emitter}.js`, and `bin/aexos-office.js`.

[Source: ARCHITECTURE-VIRTUAL-OFFICE.md#state-projector] requires observed identity/session/run context, stale TTL, bounded redacted timeline and only explicit `public_message` for collaboration. [Source: ARCHITECTURE-VIRTUAL-OFFICE.md#local-api-contract] specifies snapshot/SSE and ingestion contracts; extend compatibly, with project-scoped producer evidence. [Source: ARCHITECTURE-VIRTUAL-OFFICE.md#performance-and-accessibility] requires accessible list and reduced-motion support. Existing host hooks must be inspected before claiming an automatic integration; no new external service or dependency is authorized.

No existing source validates a native ChatGPT/Grok Bot adapter for this request. A CLI bridge is an interoperability mechanism, not proof those hosts can invoke it automatically. Record exact attachment requirements and validate each available real host separately. Generic host telemetry must not bypass Master/runtime execution governance. New schema fields require backward-compatible defaults and focused tests.

## Testing

Extend `tests/core/virtual-office/` and relevant emitter suites. Include one real local producer and browser observation; keep synthetic tests isolated and clean up their telemetry. Review roster/list equality, safe public messages, freshness expiry, run identity, unknown hosts, and stream recovery. Native external-provider evidence cannot be replaced by fixtures.

## CodeRabbit Integration

Story Type Analysis: Integration / Frontend / Security, high complexity. Specialized Agents: @dev primary; @architect integration boundaries; @ux-design-expert visual/accessibility review; @qa independent acceptance. Quality Gate Tasks: pre-commit @dev required; pre-PR @devops if requested; pre-deployment N/A. Self-Healing: @dev light, 2 iterations / 15 minutes, CRITICAL auto-fix and HIGH documented; @qa full, 3 iterations / 30 minutes, CRITICAL/HIGH correction. Focus Areas: trust boundaries, XSS/redaction, bounded streams, stale claims, identity collisions and visual accessibility. Record CodeRabbit unavailability rather than asserting a pass.

## Story Draft Checklist

READY, clarity 9/10. Goal/context PASS; technical guidance PASS; references PASS; self-containment PASS; testing PASS; CodeRabbit PASS. All applicable checklist items assessed against `.aexos-core/product/checklists/story-draft-checklist.md`; production deployment N/A. Implementation can begin locally. External host access may delay native acceptance; that limitation is explicitly measurable in AC8 rather than hidden by a fixture.

## Change Log

2026-09-06 — v1 — Chronos: live office remediation and host evidence story derived from the user request.

## Dev Agent Record

Implementation and validation pending.

### File List

- `.aexos-core/core/virtual-office/public/assets/cyryx-architectural-office-reference.png`

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.4-LIVE-VIRTUAL-OFFICE-HOST-EVENTS.md`


### UI implementation — Iris, 2026-09-07

[AUTO-DECISION] Component runtime → retain the existing plain DOM/CSS/SSE application and palette (reason: no React runtime, PageLayout, icon map or design-opinions file exists in this office; adding a framework conflicts with the authorized dependency-free repair). Read component-building and accessibility task resources; framework-specific React/Storybook generation is not applicable to this existing vanilla UI.

- Replaced the bitmap/roaming-sprite operational layout with responsive semantic squad rooms, stable agent initials, readable roles and textual states. Registration is explicitly distinct from observed presence. No decorative motion implies work.
- Default room overview previews six teams and four members per team, prioritizing active members; team expansion, all-team expansion, search and list view expose the complete roster. Clear filters resets host/squad/search/state.
- Added six host filters with observed/stale/disconnected labels, multiple session/run inspection, bounded public messages with sender/recipient/correlation and reported delivery, and activity/tool context. Native provider certification is never inferred from a connected local stream.
- Stream disconnect suppresses working/connected claims, exposes retry and CLI recovery; reconnect consumes a complete snapshot. TextContent-only construction prevents markup execution. Stable focus keys preserve keyboard focus across delta rerenders.
- Preserved the executive identity as a read-only CEO profile outside the agent execution roster. Mobile selected-agent inspector moves above the floor and receives heading focus. The initial browser review exposed intrinsic-width overflow in horizontal team navigation; min-width and grid constraints corrected it.
- Focused ESLint passed. UI behavioral tests: 9 passed; server/CLI/UI contract suite: 9 passed (18 combined). Covers registration versus liveness, filtering, concurrent sessions, stale disconnect, deltas/deduplication, public text safety, reconnect, malformed data, keyboard focus retention and full-roster access beyond the overview. Actual browser desktop/mobile/zoom evidence and full repository gates are recorded by the lead; screen-reader certification is not claimed.

### Architectural reference implementation — Iris, 2026-09-07

Supersedes the card-overview presentation above. Copied the exact user reference unchanged (SHA-256 FA38E9134EDA0E477F3A63F413030145D5941D10715DF7342BFED146E854E1E4); CSS crops the baked top bar and left navigation at x70/y64, excluding the fictitious active identity. A full-viewport architectural scene presents 21 measured room hotspots bound to actual squad IDs; additional installed squads remain in the real navigation. Every room opens its actual filtered roster and agent/session drawer. Compact live host controls, search, Office/Agent list, public activity, keyboard close/return focus and a locally scrollable mobile scene are functional DOM controls. Fresh observed public messages with resolvable sender/recipient squads alone create SVG inter-room connections; disconnected and expired signals create no connections. The scene's people remain explicitly illustrative.

Focused ESLint passed and 20 combined UI/server tests passed, including room-to-roster binding and observed/fresh-only communication links. Lead owns final browser acceptance and the server static-asset mapping.

### Motion implementation and bounded browser verification — Iris, 2026-09-07

Implemented AC10 motion slice: two subtle decorative lighting effects (skylight and bridge rim), representative real-agent markers at measured room workstation positions (at most two per room, global cap 42), observed running/assigned animations only, and animated fresh public-message paths. Waiting/blocked/completed/offline/unobserved markers are stationary. New Motion control persists its preference locally; OS reduced motion takes precedence and disables animation. The footer explicitly labels lighting ambience decorative. Existing path TTL timer removes expired links; unchanged links retain their DOM nodes so their animation is not restarted each second. All existing image/host/session boundaries remain intact.

Chrome browser review on local 4026 confirmed architectural composition with 30 representative markers, visible motion control, and persisted OFF after reload; motion was restored ON after checking. A manual CLI AgentStateChange event (id ae262c9f-466e-4e70-9150-b98a24a1ccb2; session motion-ui-review-20260907) updated Iris to Running in the AEXOS Core room and exposed the correctly labeled manual session when clicked. SessionEnd id 62b8fb46-91cc-4ccb-977c-8cedaf1f7cb7 returned Iris to Offline and bridge working count to zero. Temporary fixture file was deleted; the explicitly manual audit events remain in the journal. This is bridge/UI evidence, not native provider certification. The first fixture used unsupported agent_id spelling and appeared as System; the corrected fixture used the documented camelCase fields. The CLI also rejected documented --file - input, reported separately to the lead for its owner to fix.

Focused ESLint passed. Combined workspace UI + server/CLI/UI suites: 31 tests passed (22 UI behavior tests). Added persisted/reduced preference, all lifecycle marker states, disconnect suppression, and maximum-marker coverage. Final independent mobile/high-zoom motion review and repository gates remain with the lead.

## QA Results

Final local review: 1440 x 1000 desktop and 390 x 844 mobile measured without page overflow; mobile search controls no longer overlap hosts. Room-to-roster-to-session navigation, alternate list, manual observed communication line, disconnect and automatic reconnect verified in the browser. CLI producer-to-render upper bound 333 ms (`office-latency.json`); manual fixtures remain labeled. Full repository tests 10332 passed / zero failed / 163 skipped; latest office suite 72 passed. Lint/typecheck/build passed. Supplied image stays unchanged and its fake active profile is cropped out. Native Claude lifecycle is proven; cross-host delivery and separate high-zoom browser acceptance are not. See `DELIVERY-AUDIT-20260907.md` and `QA-AUDIT-20260906.md`.

Pending independent implementation, browser and host evidence review.


### Backend implementation record — 2026-09-06

[AUTO-DECISION] Existing story/audit provide authority and acceptance criteria; implement backend slice in place, retaining CLI/Master authority. No new dependency, commit or native-provider certification.

IDS searches inspected existing virtual-office modules, event emitters, registry lookup, tests and hook settings before editing. ADAPT `event-normalizer.js`, `state-projector.js`, `server.js`, `cli.js`, `registry-loader.js`, `events/dashboard-emitter.js`, `event-projector.test.js`, backend helper in `server-cli-ui.test.js`, and `docs/guides/virtual-office.md`: preserve existing transport/contract instead of creating a new service. CREATE `host-bridge.js` and `host-hooks.js`: no existing project-token submission or Claude/Gemini observation translator was found. CREATE `host-bridge.test.js` and `host-hooks.test.js` for trust, replay, concurrent sessions and actual hook schema regressions. REUSE existing UI ownership and configuration loader.

- [x] Backend: additive host/session/run identity, per-run state, observed-only public messages and stale/ended state handling.
- [x] Backend: authenticated project-bound ingestion, Host/Origin guard, persist-before-publish, bounded journals/replay/streams, incremental fallback tail.
- [x] Backend: CLI status/emit, normalized runtime emitter, native Claude/Gemini stdin adapters and safe idempotent hook installation.
- [x] Backend: focused regression coverage and lint/typecheck.
- [ ] Combined acceptance: native host exercise, browser producer-to-render latency, aggregate tests/build and independent QA remain with lead/UI owners.

Self-critique checkpoints 5.5/6.5: removed false running on heartbeat/message; isolated concurrent hosts/runs; rejected auth failures rather than queuing past the collector; corrected journal durability ordering; preserved normalized camelCase fields; exposed framework catalog provenance; kept native host certification false; bounded session/stream/journal growth. DoD remains partial pending combined browser/native/full-suite evidence. CodeRabbit has not been run; no pass claimed.

Backend source file list:

- `.aexos-core/core/virtual-office/event-normalizer.js`
- `.aexos-core/core/virtual-office/state-projector.js`
- `.aexos-core/core/virtual-office/server.js`
- `.aexos-core/core/virtual-office/registry-loader.js`
- `.aexos-core/core/virtual-office/cli.js`
- `.aexos-core/core/virtual-office/host-bridge.js`
- `.aexos-core/core/virtual-office/host-hooks.js`
- `.aexos-core/core/events/dashboard-emitter.js`
- `tests/core/virtual-office/event-projector.test.js`
- `tests/core/virtual-office/server-cli-ui.test.js` (backend auth helper/initial presence assertion only)
- `tests/core/virtual-office/host-bridge.test.js`
- `tests/core/virtual-office/host-hooks.test.js`
- `docs/guides/virtual-office.md`

### Independent QA corrections — 2026-09-07

ADAPT existing backend/projector/normalizer and bridge regression tests after independent QA reproductions. Explicit lifecycle transitions now replace saved stale work state, preventing completed work from reviving as running on a later heartbeat. Malformed supplied success values (including string `false`) are rejected. Failed fallback journal persistence retains its cursor and partial record until retry succeeds, rather than silently discarding valid observations. Added exact lifecycle and temporary-persistence-recovery regressions. Validation: 45 focused tests pass, lint has 0 errors (9 unrelated generated Gemini hook warnings), typecheck passes. Root's portable hook command change preserved. Independent QA re-probe requested.

### Portable hook command and native lifecycle evidence — 2026-09-07

IDS ADAPT `host-hooks.js`, existing native hook tests and `tests/claude/subagent-governance.test.js`: generated office commands now use the project-relative installed CLI path with `--project-root .`, matching the existing governance hook working-directory contract. No machine path or shell-specific environment substitution is embedded. Existing absolute office observer commands migrate in place; `.claude/settings.json` and `.gemini/settings.json` regenerated with exact backups while preserving other hooks. Actual subprocess test in `Project with spaces` passes. Native hooks/governance: 16 tests passed; lint 0 errors/9 pre-existing generated-hook warnings; typecheck passed.

Read-only journal inspection confirmed root's actual Claude launch produced SessionStart `68cb2ec8-46a3-4060-aced-f2fa8a73b520` (1788754034153) and SessionEnd `3a5135b0-a1e4-4558-8a7f-b3041e53597e` (1788754227144), session `9fd77ace-df83-4d99-ab8c-863a6e86e48b`, agent `aexos-master`, story `AEX-4.4-native-startup-check`, host `claude-code`, evidence `runtime`. Both fallback and durable office journal preserve the same IDs. This establishes actual Claude session lifecycle observation; no tool execution or provider message delivery is certified by this startup/exit check.

Additional file list: `.claude/settings.json`, `.gemini/settings.json`, `tests/claude/subagent-governance.test.js`.

### Session projection isolation receipt — 2026-09-07

Confirmed inspector context bleed: a newly preferred Claude session omitted task/tool fields, so Object.assign retained old legacy values. ADAPT existing projector to rebuild aggregate agent records from immutable catalog defaults plus only the preferred session; other session context remains available separately. Added regression covering legacy task/tool/progress/reason versus new native session/story. Focused projector/bridge suites: 32 tests passed.

CREATE `artifacts/audit-20260906/native-claude-lifecycle.json` after searching existing audit evidence: minimal source-derived event IDs, timestamps and explicit host/session/agent/story labels for actual Claude SessionStart/SessionEnd. No prompt, transcript, environment, credentials or output included. The artifact establishes lifecycle observation only. Source files: `state-projector.js`, `host-bridge.test.js`, this story, and the evidence JSON.
