# Story AEX-4.6: Project-confined structured filesystem operations

## Status

In Progress — bounded structured reads implemented; safe creation and independent acceptance remain open.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [filesystem-negative-regressions, jest, lint, typecheck, build]

## Story

**As an** AEXOS operator, **I want** structured file operations constrained to an authorized project, **so that** missing targets, system paths and filesystem aliases cannot bypass operation permissions.

## Context and ownership

The architect identified an unused path guard, OperationGuard classification without target enforcement, AgentRuntime forwarding cwd without confinement, and unconditional `--dangerously-skip-permissions` in the legacy subagent dispatcher. A cwd is not a security boundary. This implements a bounded structured-operation boundary beneath the existing Master, without claiming to sandbox arbitrary shell commands or child processes.

Read [accumulated-context.md](./accumulated-context.md#2026-09-07-runtime-boundaries-and-local-observation) and [architecture audit](./AUDIT-20260906-ARCHITECTURE.md), ARC-08. AEX-4.5 fail-closed execution is the compatibility baseline. This story owns permissions/filesystem mediation, associated AgentRuntime integration and dispatcher bypass removal. AEX-4.7 owns observation backend and must coordinate any shared runtime edit with this owner. Preserve all concurrent changes.

## Acceptance Criteria

- [x] AC10: Audit remaining canonical native Claude launchers and routing templates; remove unconditional permission bypass, pass untrusted prompts through stdin with shell disabled, and retain bounded execution and meaningful regressions. Native provider permissions remain authoritative; this does not extend structured filesystem confinement to arbitrary subprocess I/O.

- [x] AC1: Reproduce and trace the missing path enforcement at the actual structured read/write dispatch boundary. Require explicit operation, authorized canonical project root and nonempty target; absent/malformed targets fail closed before file access.
- [x] AC2: Structured reads and writes reject targets outside the authorized root or in protected/system locations, including traversal and platform-specific path aliases. Validate existing ancestors and target kinds; reject symbolic links/junction escapes and hard-linked mutation targets. Protected-root projects cannot be used to authorize system access.
- [ ] AC3: Enforce mediation immediately before the actual read/write, not solely at capability issuance or cwd setup. Revalidate the target/parent against path substitution and use exclusive creation with atomic publication for supported writes. Never silently overwrite an existing target or follow a changed link; unsupported overwrite/replacement semantics fail closed until a reviewed safe implementation exists.
- [x] AC4: Destructive operations, including deletion, move and overwrite where no recovery contract exists, return unsupported/denied without mutation. Record the recovery prerequisite explicitly; no prompt-only promise substitutes for technical enforcement.
- [x] AC5: Return actionable structured denial/error results and bounded sanitized audit records containing operation, decision and safe project-relative identity where possible. Do not log contents, secrets, raw command arguments or external absolute paths in diagnostic records.
- [x] AC6: Remove unconditional permission bypass from the legacy subagent dispatcher and retain native permission enforcement by default. No fallback may silently add the bypass. Document which structured adapters are mediated and that arbitrary subprocess I/O is not sandboxed by this story.
- [ ] AC7: Negative tests cover absent targets, outside/protected roots, traversal, links/junctions, hard-link mutation, existing-target collision, parent/target substitution, unsupported destructive operations and denial without file changes. Positive tests cover permitted read and exclusive creation, including paths with spaces; verify guard invocation at runtime dispatch rather than testing the utility alone.
- [x] AC8: Run lint, typecheck, full tests and build; preserve story binding, budget/permission behavior and existing execution integrity. Record exact tested platform, unsupported platform guarantees, file list and independent review; do not claim a race-free OS sandbox from path checks alone.
- [x] AC9: Correct the canonical Gemini `before-tool.js` catch path so unexpected enforcement failure cannot return `allow`. Confirm the supported denial/error response against official provider documentation before implementation; test unexpected exceptions and valid allowed/denied operations. Coordinate this file with Doctor's in-progress catch-variable cleanup and regenerate affected projections through existing sync tooling.

## Tasks / Subtasks

- [ ] Trace and reproduce the structured operation call graph and dispatcher bypass (AC1,6).
- [ ] Implement confined target mediation with protected paths and alias checks (AC1-2).
- [ ] Implement supported read/exclusive atomic create and reject unsafe destructive paths (AC3-4).
- [ ] Integrate runtime dispatch, sanitized decisions and native permission defaults (AC5-6).
- [ ] Add positive/negative boundary tests and run repository gates (AC7-8).
- [ ] Verify Gemini hook response contract and enforce fail-closed exceptions after coordinating Doctor edits (AC9).

## Dev Notes

Verified source locations: `.aexos-core/core/permissions/{path-guard,operation-guard}.js`, `.aexos-core/core/execution/{agent-runtime,subagent-dispatcher}.js`; dispatcher bypass was at line 702 when reviewed. Existing path-guard tests are `.aexos-core/core/permissions/__tests__/path-guard.test.js`. Resolve file handles and mutation semantics using existing Node stdlib; introduce no dependency. If cross-platform primitives cannot establish a safe operation, return unsupported rather than weaken the invariant.

[Source: AUDIT-20260906-ARCHITECTURE.md, ARC-08] requires enforcement at the operation boundary and distinguishes capability leases from subprocess confinement. [Source: .aexos-core/constitution.md, Articles I-II and XII] preserves CLI/Master authority, permissions and story-bound execution. No new database, network API or required environment variable is needed.

## Testing

Use isolated project/outside/protected fixtures and verify hashes or absence after denials. Exercise actual runtime mediation plus focused helper tests. Mark unavailable symlink/junction privileges as untested and do not count skips as proven protection. Include deterministic substitution attempts; document residual platform limitations honestly.

## CodeRabbit Integration

Story Type Analysis: Security / Integration, high complexity. Specialized Agents: @dev primary, @architect boundary review, @qa independent negative acceptance. Quality Gate Tasks: pre-commit @dev required; pre-PR @devops when requested; pre-deployment N/A. Self-Healing: @dev light, 2 iterations / 15 minutes, CRITICAL auto-fix, HIGH documented; @qa full, 3 iterations / 30 minutes, CRITICAL/HIGH correction. Focus Areas: TOCTOU, aliases, exclusive writes, audit privacy, permission bypass and false sandbox claims. Record unavailable CodeRabbit explicitly.

## Story Draft Checklist

READY, clarity 9/10. Goal/context PASS; technical guidance PASS; references PASS; self-containment PASS; testing PASS; CodeRabbit PASS. All applicable items of `.aexos-core/product/checklists/story-draft-checklist.md` reviewed. Database/provider/deployment items N/A. Race-safe operation support is tested per platform; unsupported semantics are explicitly denied rather than left ambiguous.

## Change Log

2026-09-07 — v1 — Chronos: bounded architect-derived filesystem remediation.

## Dev Agent Record

Implemented the governed structured read dispatch and fail-closed unsupported mutation path. See artifacts/audit-20260906/filesystem-implementation.md for exact limits, source trace, IDS decisions and gates. AC3/AC7 remain OPEN: no positive exclusive creation is claimed on Windows or other platforms until a reviewed handle-relative publication adapter exists. Parent explicitly accepted this bounded safety decision on 2026-09-07. AC8 awaits full aggregate gates and independent review. CodeRabbit unavailable; independent QA remains pending.

### File List

- `docs/framework/epics/aexos-evolution/STORY-AEX-4.6-PROJECT-CONFINED-FILESYSTEM.md`

- `.aexos-core/core/permissions/confined-filesystem.js`

- `.aexos-core/core/permissions/path-guard.js`

- `.aexos-core/core/permissions/operation-guard.js`

- `.aexos-core/core/execution/agent-runtime.js`

- `.aexos-core/core/execution/subagent-dispatcher.js`

- `.aexos-core/hooks/gemini/before-tool.js`

- `.gemini/hooks/before-tool.js`

- `tests/core/permissions/confined-filesystem.test.js`

- `tests/core/permissions/dispatcher-native-permissions.test.js`

## QA Results

Pending independent implementation review.

### 2026-09-07 QA correction: Windows home case aliases

Replaced case-sensitive protected home equality with platform-native path.relative equality. Uppercase Windows home root now rejects before access. Confined filesystem focused suite25 tests passes; lint/typecheck pass. Evidence: artifacts/audit-20260906/filesystem-home-case-tests.log.

### 2026-09-07 AC10 native launcher remediation

IDS ADAPT: build-orchestrator, semantic-merge-engine, pr-review-ai and six existing claude routing templates; CREATE native-claude-launchers regression suite; ADAPT claude-execution-robustness tests. All assigned native launchers retain permission enforcement. Semantic merge and PR review pass literal prompts through spawnSync stdin with shell:false, bounded timeout and SIGKILL; errors preserve the Claude CLI error prefix without echoing prompt/stderr. Build launcher retains model/stdin output contracts and now bounds native-permission waiting through a watchdog. Interactive routing templates preserve their existing user argument forwarding and remain interactive. No real provider invoked; no subprocess confinement claimed. Evidence native-launcher-tests.log, native-launcher-lint.log and native-launcher-typecheck.log.

Additional files: `.aexos-core/core/execution/build-orchestrator.js`, `.aexos-core/core/execution/semantic-merge-engine.js`, `.aexos-core/infrastructure/scripts/pr-review-ai.js`, `.aexos-core/infrastructure/scripts/llm-routing/templates/claude-max.cmd`, `.aexos-core/infrastructure/scripts/llm-routing/templates/claude-max.sh`, `.aexos-core/infrastructure/scripts/llm-routing/templates/claude-free.cmd`, `.aexos-core/infrastructure/scripts/llm-routing/templates/claude-free.sh`, `.aexos-core/infrastructure/scripts/llm-routing/templates/claude-free-tracked.cmd`, `.aexos-core/infrastructure/scripts/llm-routing/templates/claude-free-tracked.sh`, `tests/core/native-claude-launchers.test.js`, `tests/core/claude-execution-robustness.test.js`.

### Final aggregate receipt

Windows full suite: 10423 passed, 0 failed, 163 skipped; lint/typecheck/build passed. Independent QA approved bounded reads and AC10 after reproducing and retesting the home-path case defect. Creation AC3/7 remain open; native subprocess I/O is not confined by this adapter. See DELIVERY-AUDIT-20260907.md.
