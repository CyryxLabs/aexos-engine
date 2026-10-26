# Story AEX-4.7: Opt-in local Codex session observation

## Status

Ready for Review — implementation, aggregate checks, privacy review and live filtered-session acceptance completed.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [session-privacy-regressions, event-smoke, jest, lint, typecheck, build]

## Story

**As an** AEXOS operator, **I want** my local Codex session lifecycle reflected automatically in the Virtual Office after opting in, **so that** actual local activity is visible without manually submitting events or exposing conversation contents.

## Context and ownership

AEX-4.4 supplies the authenticated local host bridge and truthful session projection. The lead verified local Codex session logs under the user's `.codex` sessions directory. Session metadata can identify `CodexDesktop` as originator even when source is `vscode`; source alone is insufficient for host identity. Observation of these logs is local telemetry evidence, not certification of native provider execution or ChatGPT connectivity.

Read [accumulated-context.md](./accumulated-context.md#2026-09-07-runtime-boundaries-and-local-observation) and [Virtual Office architecture](./ARCHITECTURE-VIRTUAL-OFFICE.md#system-architecture). This story owns observer/CLI/bridge/projector tests; AEX-4.6 owns filesystem mediation and AgentRuntime. Avoid AgentRuntime edits unless coordinated with that owner. No second orchestrator or external provider access is introduced.

## Acceptance Criteria

- [x] AC1: Add a documented explicit opt-in CLI observer with bounded polling/watching, read-only access to the canonical Codex sessions root, and clean stop behavior. Reject root/link escapes; bound file enumeration, bytes, records and memory per cycle. Missing/unreadable roots report unavailable without scanning arbitrary directories.
- [x] AC2: Before producing any lifecycle event, validate session metadata and canonical cwd against the selected project root. Exclude unrelated, missing or malformed project metadata, even if later records contain plausible agent/task fields. Preserve session originator evidence: `CodexDesktop` is identified correctly even with `source=vscode`.
- [x] AC3: Map observed `task_started` and `task_complete` records using stable `turn_id`/session identity and deterministic event IDs. Retain producer timestamps, distinguish receipt time, and never stamp historical events as current liveness. Only actual observations renew live status.
- [x] AC4: Handle partial JSONL records, malformed lines, file truncation/rotation, restart and repeated scans without duplicate lifecycle transitions or lost complete records within supported retention. Use bounded durable checkpoints and deterministic IDs; stale and disconnected sessions remain truthful after observer restart or silence.
- [x] AC5: Emit allowlisted metadata and tool names only. Never forward, log or checkpoint prompts, tool arguments, tool outputs, reasoning, `last_agent_message` or conversation text. Checkpoints contain only bounded file/cursor/identity metadata needed for deduplication; audit diagnostics omit excluded contents.
- [x] AC6: Send through the existing authenticated host bridge and project/session validation. Authentication failure, invalid metadata or collector failure cannot become successful observation; retry is bounded and duplicate-safe. Preserve the read-only browser and existing Master execution authority.
- [x] AC7: Tests cover project exclusion before lifecycle, CodexDesktop originator with vscode source, stable turn IDs, original timestamps, stale historical replay, partial lines, malformed input, restart, rotation/truncation, deduplication, redaction and authenticated delivery failure. Use secret/text canaries to assert prohibited contents never reach emitted events, logs or checkpoints.
- [x] AC8: Capture one real local Codex session-log-to-office lifecycle observation when available, labeled local session log observed; otherwise record not tested and exact blocker. Report fixture/bridge tests separately. Do not claim native provider proof, cross-host messaging or automatic ChatGPT observation.
- [x] AC9: Run lint, typecheck, full tests and build; document opt-in/stop commands, bounds, checkpoint location, supported log records, file list and remaining gaps. No new dependency is introduced.

## Tasks / Subtasks

- [x] Inspect minimal metadata/record shapes without publishing conversation content; define read bounds and opt-in contract (AC1-2).
- [x] Implement bounded reader/checkpoints and stable session/turn mapping (AC3-4).
- [x] Integrate strict metadata allowlist and authenticated delivery (AC5-6).
- [x] Add regression and privacy-canary tests, then capture real local evidence if available (AC7-8).
- [x] Run gates and document usage, limits and evidence classification (AC9).

## Dev Notes

Reuse `.aexos-core/core/virtual-office/{cli,host-bridge,event-normalizer,state-projector,server}.js`; add observer module/tests within the same module and `tests/core/virtual-office/`. Exact checkpoint design is a local implementation choice constrained by AC4-5. The observer must not modify Codex session files or other projects. Use existing Node stdlib; no connector, database or provider API is required. CLI options must expose opt-in and selected project; no hidden auto-activation.

[Source: AUDIT-20260906-ARCHITECTURE.md, host envelope and session identity recommendations] separates project, host, session and run identity and excludes private contents. [Source: ARCHITECTURE-VIRTUAL-OFFICE.md#state-projector] requires stale TTL and bounded redacted timelines. [Source: STORY-AEX-4.4-LIVE-VIRTUAL-OFFICE-HOST-EVENTS.md, AC1-3 and AC7-8] requires authenticated truthful observation and separate native evidence. Actual metadata mapping supplied by the lead must be confirmed with focused local inspection before parser implementation.

## Testing

Use isolated JSONL fixtures with metadata plus task lifecycle, splitting bytes across cycles. Include old timestamps and unrelated project metadata before valid-looking events. Assert emitted payloads and checkpoint/log artifacts contain no canary values from excluded fields. Integration tests exercise the actual authenticated collector and verify one projected session transition, not just mocked emission.

## CodeRabbit Integration

Story Type Analysis: Integration / Privacy, high complexity. Specialized Agents: @dev primary, @architect trust review, @qa independent acceptance. Quality Gate Tasks: pre-commit @dev required; pre-PR @devops when requested; pre-deployment N/A. Self-Healing: @dev light, 2 iterations / 15 minutes, CRITICAL auto-fix, HIGH documented; @qa full, 3 iterations / 30 minutes, CRITICAL/HIGH correction. Focus Areas: project isolation, bounded reads, privacy allowlists, checkpoint reliability, stale replay and authentication. Record CodeRabbit unavailable if applicable.

## Story Draft Checklist

READY, clarity 9/10. Goal/context PASS; technical guidance PASS; references PASS; self-containment PASS; testing PASS; CodeRabbit PASS. All applicable items of `.aexos-core/product/checklists/story-draft-checklist.md` reviewed. Provider API/database/deployment items N/A. Real local-log evidence is required when accessible; fixtures do not silently substitute for it.

## Change Log

2026-09-07 — v1 — Chronos: opt-in local Codex observation from lead-confirmed metadata findings.

## Dev Agent Record

Implemented; focused and independent privacy checks passed. Final aggregate evidence is recorded below.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.7-CODEX-SESSION-OBSERVATION.md`

## QA Results

Pending independent implementation/privacy review.

### AEX-4.7 implementation receipt — 2026-09-07

[AUTO-DECISION] Reuse existing authenticated host bridge, normalizer, CLI and projector. Explicit opt-in via `office observe-codex [--once] [--agent id]` or integrated `office --observe-codex --agent id`; no hidden activation. Existing observers/hooks and other owners preserved.

IDS SEARCH inspected existing CLI, host bridge, projector and canonical session metadata shapes before implementation. CREATE `codex-observer.js` because no bounded local Codex reader/checkpoint implementation existed. ADAPT `cli.js` for opt-in lifecycle and the broken `--file -` value parser; ADAPT `event-normalizer.js` for explicit originator/local-session-log evidence fields only. CREATE `codex-observer.test.js` for privacy canaries, bounds/replay and authenticated delivery; ADAPT virtual office guide with exact bounds and limitations. CREATE evidence JSON from actual normalized journal metadata.

- [x] Inspect session metadata and define bounded explicit opt-in contract.
- [x] Implement bounded reader, backward bootstrap, forward replay, atomic metadata-only checkpoints and stable IDs.
- [x] Preserve originator, project/session/turn identity, original timestamps and tool names; exclude all content fields.
- [x] Regression coverage and actual local log evidence captured.
- [x] Aggregate full suite/build and independent privacy QA completed; see DELIVERY-AUDIT-20260907.md and continuation-latest-focused.log for post-aggregate session-filter checks.

Validation: 10 focused observer tests pass; repository lint has zero errors (one concurrent filesystem regex warning), typecheck passes. Tests include metadata/project exclusion, Codex Desktop with vscode source, partial records, restart, truncation/rotation, long private records, bounded backwards bootstrap, linked/missing roots, auth failure deterministic retry, stale historical authenticated ingestion and stdin marker parsing. Checkpoint content contains only hashes/offsets/turn identity, never private partial lines.

Real evidence: isolated authenticated collector4027 accepted local Codex records. Current thread `01a079f2-3c1e-74e2-81cc-0915d100729c` emitted actual observed tool names with original timestamps/originator; its initial task_started was outside the bootstrap context retained, so no task start was invented. Other canonical-project-matched sessions provided real task lifecycle records. `artifacts/audit-20260906/codex-session-observation.json` distinguishes those observations explicitly. This is local session-log observation, not native model/provider execution proof or automatic ChatGPT messaging. Collector4027 stopped after evidence; root can restart4026 with `--observe-codex --agent aexos-master`.

Self-critique5.5/6.5: long records never checkpoint raw text; inherited source=vscode never masks Codex originator; failed delivery does not advance past the event; old timestamps never become fresh; bootstrap does not infer missing task starts; growing files rotate fairly through the read budget. Observer's own background loop does not call Codex or print per-cycle output, preventing telemetry feedback. DoD partial until combined gates/QA. CodeRabbit not run; no pass claimed.

File list:

- `.aexos-core/core/virtual-office/codex-observer.js`
- `.aexos-core/core/virtual-office/cli.js`
- `.aexos-core/core/virtual-office/event-normalizer.js`
- `tests/core/virtual-office/codex-observer.test.js`
- `docs/guides/virtual-office.md`
- `artifacts/audit-20260906/codex-session-observation.json`
- `docs/framework/epics/aexos-evolution/STORY-AEX-4.7-CODEX-SESSION-OBSERVATION.md`

### Exact Codex session attribution correction — 2026-09-07

IDS ADAPT existing observer/CLI/test/guide after lead-observed aggregate attribution issue. Added optional exact `--session-id` filter, enforced on session metadata before any event, to isolate the selected root thread from parallel same-project sessions. Checkpoint identity now includes session filter and normalized agent mapping; deterministic event IDs include agent mapping to preserve intentional remapping through collector deduplication. Regression tests prove exclusion of another same-project session, unchanged binding dedupe, and changed filter/mapping replay. Observer suite: 12 passed; lint 0 errors (one unrelated filesystem regex warning); typecheck passed. Existing journal history remains intact. Recommended live command maps only session `01a079f2-3c1e-74e2-81cc-0915d100729c` to `aexos-master`.

### Filtered live observation regression receipt — 2026-09-07

Lead's live check exposed stale activity despite ongoing tools. Minimal source/checkpoint inspection confirmed file growth ahead of the cursor and an omitted supported record shape: actual freeform `custom_tool_call` records (tool name `exec`) had not been mapped. ADAPT observer enumeration so the exact filename suffix is checked before the 64-file cap; independent metadata/session/project validation still follows. ADAPT mapping to accept `custom_tool_call` tool names only, excluding freeform input. Added >80-newer-unrelated-file regression including spoofed matching filename, plus custom-tool privacy canary. Observer suite: 14 passed. Lint and typecheck both passed without errors.

After the lead restarted collector4026 with the exact session filter, read-only snapshot inspection verified the current session running and Codex connected. `artifacts/audit-20260906/codex-filtered-live-observation.json` captures minimal evidence: session `01a079f2-3c1e-74e2-81cc-0915d100729c`, original timestamp1788759596116, tool `send_message`, exact matching source function_call, observed at1788759606784, within the30000ms freshness threshold. Earlier same-run snapshot also showed actual custom tool `exec` running. This is current local-log tool observation, not native provider certification. No second observer was started. Guide corrected to distinguish Codex opt-in logs, configured/unverified Grok hooks, and ChatGPT explicit bridge; examples now require an exact session placeholder when mapping an agent.

Additional file list: `artifacts/audit-20260906/codex-filtered-live-observation.json`.
