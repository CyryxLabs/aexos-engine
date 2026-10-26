# AEXOS Virtual Office

The office is a project-local observation workspace. Execution and approvals remain in the Master-led CLI. Registry membership never proves an agent is connected.

## Start and inspect

```bash
node bin/aexos-office.js --no-open
node bin/aexos-office.js status
```

Installed binaries support the same `aexos office` / `aexos-office` commands. Use `--project-root <path>` and `--port <port>` to select the project and local collector. The default port is 4001. No dashboard AI API key is required.

## Navigate the office

The default Office is a layered 2.5D interpretation of the owner's continuous isometric office reference. A clean environment plate, approved transparent human sprites, foreground furniture masks and a calibrated floor map form the navigable scene. The manifest binds all 23 squad areas, workstation assignments, names and collision boundaries. Agent registration is distinct from observed activity.

- **Overview:** drag to pan and scroll or pinch to zoom. The camera keeps the reference's fixed viewing angle.
- **Walk:** use WASD or arrow keys with the canvas focused. Double-click or double-tap an open floor to walk along a traversable route. **Home** returns to reception.
- Select a person or use the team rail and roster to inspect the same agent, work and host sessions. Camera and visitor position survive live updates.
- **Motion** disables optional animation; the system reduced-motion preference also applies. Visitor movement is local navigation and does not dispatch an agent task.
- **Agent list** provides keyboard-accessible inspection. If images or Canvas rendering fail, the office falls back to this list and retains the live stream.

The Canvas compositor uses local assets and introduces no rendering dependency. The environment is 1586 × 992 pixels; zoom is bounded to 2.2 times its fitted view. Foreground masks restore portions of the same plate at their declared depth so people can pass behind furniture. This is a calibrated 2.5D scene, with no arbitrary 3D orbit. Only observed public messages can produce communication links; those links do not establish message delivery or a provider connection. Multiplayer, audio rooms and cross-provider task dispatch are outside this observation interface.

## Submit host observations

Create an event JSON file containing explicit operator-visible metadata:

```json
{
  "id": "unique-event-id",
  "type": "CommandStart",
  "agentId": "dev",
  "sessionId": "local-session-1",
  "runId": "story-run-1",
  "task": "Validate the installation",
  "storyId": "AEX-4.4"
}
```

```bash
node bin/aexos-office.js emit --file event.json --producer-host cli
node bin/aexos-office.js emit --file event.json --producer-host codex --queue
```

`--file -` reads JSON from stdin. Host values are `cli`, `codex`, `chatgpt`, `claude-code`, `grok`, and `gemini`. The bridge adds the canonical project identity and reads the local producer token. Manual submissions always carry `evidence: manual`, even when the supplied JSON claims runtime evidence. `--queue` stores a normalized event locally if delivery fails; queued is not accepted or delivered.

A reusable Node adapter is `core/virtual-office/host-bridge.js:submitEvent(projectRoot, source, options)`. Existing DashboardEmitter events use this same identity/normalization policy and retain stable event IDs. `AEXOS_HOST` selects an allowlisted runtime label; Claude session identity selects `claude-code` when available, otherwise CLI is the default. A label does not certify a provider integration.

## Lifecycle and communication

Supported observations include activation, command start/complete/error, waiting, blocked, heartbeat, offline, session start/end and explicit state changes. Heartbeats renew liveness without changing waiting or blocked work into running. Sessions and runs on different hosts remain separate. Ended sessions become offline; active work expires to stale after the snapshot's `heartbeatTtlMs` (default 30 seconds).

Public collaboration uses `AgentCollaborationMessage`, `public_message`, `sender`, `recipient`, and optional `correlationId`. Only this explicit public field enters the message timeline. `deliveryStatus: observed-only` means the collector saw it; no recipient adapter, delivery or acknowledgement is implied. Prompts, hidden reasoning, raw tool output, environment objects and arbitrary result objects are discarded. Credential-shaped text is redacted; do not place confidential text in public metadata.

## Host evidence matrix

| Host | Transport available | Native integration evidence |
| --- | --- | --- |
| CLI | Existing DashboardEmitter and authenticated CLI bridge | Local bridge regression tested; actual render timing recorded in story QA |
| Codex | Opt-in bounded local session reader and explicit bridge | Local log observations verified; provider-native execution not certified |
| Claude Code | Existing emitter can preserve Claude session identity; explicit bridge | Hooks do not establish automatic office lifecycle coverage |
| Gemini | Explicit local bridge | Automatic native lifecycle not verified |
| Grok Bot | Generated project hooks via office hooks and explicit bridge | Configured; native runtime activation unverified |
| ChatGPT | Explicit local bridge, if an authorized connector can invoke it | No native ChatGPT connector is configured or certified |

Each host remains disconnected until events are observed. `bridge-tested` in a live snapshot means ingestion has been observed, not provider-native acceptance. Read event/session evidence to distinguish manual, test and runtime observations. An observed-only message is not a cross-provider messaging service.

## Local protection and persistence

The collector accepts only loopback binding, known local Host headers, and same-origin browser reads. HTTP ingestion requires a project token stored at `.aexos/dashboard/producer-token`; never put this token in a URL or browser bundle. Other processes with the same filesystem access can read it, so this is a local project boundary, not OS process isolation.

Persistence completes before a delta is published. Both normalized office journals and the fallback journal are recovered; the fallback file is incrementally tailed. Stable IDs deduplicate replay. Journal retention is bounded to roughly two 4 MiB office segments plus a 4 MiB fallback; replay reads at most 1 MiB/2000 records per segment. Sessions are capped at 2000, timeline at configured history limit, streams at 32 clients, and slow clients are disconnected. Runtime directories reject symlinks/junctions. Snapshots expose catalog provenance separately from observed work.

The browser reconnects to a full snapshot and provides agent/host selection, room/list views, task inspection and public event/message timelines. Empty and disconnected states are expected when no host adapter is emitting observations. Start the collector again, inspect `office status`, and submit a new lifecycle event to verify recovery.

## Native Claude Code and Gemini hooks

Generate a reviewable host configuration or install it into this project's settings:

```bash
node bin/aexos-office.js hooks --producer-host claude-code
node bin/aexos-office.js hooks --producer-host claude-code --install
node bin/aexos-office.js hooks --producer-host gemini --install
```

Installation merges `.claude/settings.json` or `.gemini/settings.json`, preserves existing hooks/settings, backs up the exact previous content, and is idempotent. Restart the host to load configuration. The generated command invokes `office hook` with a bound project root. It receives stdin JSON, filters lifecycle/tool metadata, validates the working directory, and never returns a blocking decision. Delivery has a 500 ms timeout; only transport failure may queue locally. An HTTP rejection is never bypassed through the queue.

`AEXOS_AGENT_ID`, `AEXOS_RUN_ID` and `AEXOS_STORY_ID` explicitly bind work to AEXOS catalog context. Without that binding, the host/session remains observable but no agent identity is invented. Claude Stop and Gemini AfterAgent mean waiting; tool errors mean failed. Hook payloads never copy transcript paths, prompts, tool input/output or model messages. Native hooks do not manufacture heartbeats between events, so long silent operations honestly become stale.

The adapters follow [Claude's hook reference](https://code.claude.com/docs/en/hooks) and [Gemini's hook reference](https://geminicli.com/docs/hooks/reference/). Realistic payload and configuration tests establish adapter behavior; native certification still requires an actual host session executing those hooks. Codex supports the opt-in local session reader documented below. Grok supports generated canonical project hook configuration through `office hooks --producer-host grok --install`; this is configured capability, with native runtime activation unverified. ChatGPT currently uses only the explicit bridge.

Portability verification (2026-09-07): generated commands now use `.aexos-core/core/virtual-office/cli.js` relative to the host's project working directory, with `--project-root .`. Existing absolute office commands migrate in place. A subprocess regression verifies installation paths containing spaces. An actual Claude startup/exit produced matching SessionStart and SessionEnd journal records for session `9fd77ace-df83-4d99-ab8c-863a6e86e48b`; this is native session-lifecycle evidence only, not tool execution or message delivery certification.

## Opt-in Codex local session observer

```bash
node bin/aexos-office.js --observe-codex --agent aexos-master --session-id <exact-session-id> --no-open
# Or attach to an already running collector:
node bin/aexos-office.js observe-codex --agent aexos-master --session-id <exact-session-id>
node bin/aexos-office.js observe-codex --once --agent aexos-master --session-id <exact-session-id>
```

This explicit opt-in reads the canonical `$CODEX_HOME/sessions` directory (default `~/.codex/sessions`) without modifying Codex files. Ctrl+C stops observation and closes the observer cleanly. Missing/unreadable/linked roots report unavailable. The optional agent argument is an explicit catalog attribution, not inferred from conversation contents.

Every file must begin with valid `session_meta` containing a canonical cwd exactly equal to the selected project and a recognized Codex originator. `Codex Desktop` / `CodexDesktop` remain desktop-originated even when source is `vscode`. Only task_started/task_complete lifecycle records and function_call/custom_tool_call tool names are forwarded, with session/turn identity and original producer timestamps. Historical records remain historical; silence does not renew activity. Evidence is labeled `local-session-log`, not native provider proof or automatic ChatGPT observation.

The observer polls every two seconds, without overlapping scans. Per cycle it enumerates at most 128 date directories/2048 entries/64 files, reads about 1 MiB (plus bounded cursor hashes), and inspects at most 2000 records. Each file read is at most 256 KiB; individual JSON records above 64 KiB are skipped. Initial attachment searches backward in bounded windows for the most recent turn boundary, then catches up forward. Large logs can take multiple cycles to catch up; tools are never attributed before session/turn metadata is validated. File processing rotates to avoid one growing log monopolizing the byte budget.

`.aexos/dashboard/codex-observer.json` stores only bounded hashed file identity, byte cursors, metadata fingerprints and turn IDs. It never stores prompts, arguments, output, reasoning, transcript contents, partial text records or last_agent_message. Partial lines are reread from source. Deterministic event IDs make retry/replay safe; authentication or collector failure leaves the record pending. Checkpoints are atomically replaced, limited to 64 file records, and project/root bound. Renamed/truncated files are revalidated through inode, header and cursor hashes.

### Scope an agent mapping to one Codex session

When multiple Codex sessions share a project, add `--session-id <exact-session-id>` before mapping observations to a catalog agent:

```bash
node bin/aexos-office.js --port 4026 --observe-codex --agent aexos-master --session-id 01a079f2-3c1e-74e2-81cc-0915d100729c --no-open
```

The optional exact filter is checked against session metadata before emitting anything. Without it, the observer reads all supported matching-project sessions; `--agent` is then an explicit mapping applied to all of them. Checkpoint binding includes both the session filter and normalized agent mapping, so changing either triggers safe bounded replay. Event IDs include the agent mapping so an intentional mapping change can be observed rather than silently deduplicated against the previous attribution. Existing historical journal entries are retained; filtering changes future observations, not old evidence.

When an exact session is selected, its filename suffix is filtered before applying the 64-file read cap; matching filenames still require independent session-ID/project header validation. Unrelated newer logs therefore do not consume the selected-session file allowance. Directory/entry bounds remain enforced. Custom freeform tool records forward only the tool name, never their input.
