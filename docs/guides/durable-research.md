# Durable local research

The AEXOS research component runs bounded, fixture-local collection and stores an immutable checkpoint chain in an operator-selected directory outside the consumer workspace. It preserves content-addressed citations, locator/version history, claim links, explicit uncertainty, deterministic exports, attempt reservations, and terminal event truth.

Fixture execution proves local protocol and lineage integrity only. The provider and every recommendation remain `unverified`. The component does not access a browser, network provider, private content, payment API, publication surface, scheduler, or deployment runtime. Accepted runtime and installed-package evidence remain separate gates.

## Commands

```powershell
node bin/aexos.js research start plan.json --input-root C:\fixtures --state-dir C:\operator-state --json
node bin/aexos.js research resume plan.json --input-root C:\fixtures --state-dir C:\operator-state --json
node bin/aexos.js research status my-run --state-dir C:\operator-state --json
node bin/aexos.js research export my-run --state-dir C:\operator-state --format markdown
node bin/aexos.js research cancel my-run --state-dir C:\operator-state --json
node bin/aexos.js research recover my-run --state-dir C:\operator-state --json
```

The state directory and fixture root must already exist and use ordinary directory ancestry. Symlinks, junctions, traversal, hard-linked files, secret-bearing URLs, and private fixture text fail closed. Writers with filesystem access can recompute an integrity chain; checkpoint hashes are tamper evidence for accidental or out-of-band changes, not signatures or hostile-writer confinement.

Plans use `aexos.research-plan/v1`. They select only `fixture-local`, identify an injected fixture or unavailable adapter, declare operations, claims, comparisons, source handling, and integer resource limits. Operator policy is constructed by trusted code and the plan can only narrow it. Each fixture is a strict JSON object containing an `observations` array. No locator is dereferenced.

`maxInputBytes` bounds the complete JSON plan in both file and object APIs and independently bounds each fixture file. File reads are bounded by the operator maximum; actual UTF-8 file bytes (including whitespace) must also fit the plan's narrower value. Object inputs are measured in their serialized representation before cloning and semantic traversal.

Each collector response is independently limited to 1,000 raw observations. `maxSources` is applied afterward to unique retained citation identities, so duplicate content and policy-excluded private observations do not consume distinct-source capacity. A true unique-source overflow discards the whole uncommitted batch.

The v1 secret policy is deterministic pattern protection, not arbitrary secret discovery. It recognizes bearer authorization values, assignments for API keys, access/auth tokens, passwords, client secrets, generic secrets and credentials, plus common `sk-`, GitHub-token and AWS access-key forms. `reject` refuses the plan or source before its text can be checkpointed. `redact` replaces detected values with `[REDACTED]`; secret-bearing locator values use a one-way `redacted-<sha256>` label. The policy traverses every plan string, retained public body and persisted artifact/event field. Provider error codes are mapped to a fixed local allowlist and error messages are never persisted. Operators must still avoid putting unrecognized credentials into research inputs.

Supported material claims need accessible citations whose full content hashes match. Open and unsupported claims need an explanation. Any supplied malformed, unknown, inaccessible, or mismatched citation blocks completion, including citations attached to open claims. Comparisons pass validated source references to the existing `rankAlternatives` function; the research component does not infer scores or implement another recommendation algorithm.

Cancellation, timeout, source, retry, budget, provider, citation, and checkpoint exhaustion produce cancelled, blocked, or failed artifacts with one durable terminal event. Resume retains the original plan hash, policy hash, deadline, attempt debits, and committed operations. It skips committed operations. A pending reservation from an interrupted process is charged and closed as interrupted before a new retry reservation is persisted.

Quoted and unquoted credential assignments, including JSON-style quoted keys, follow the same secret policy. Redaction preserves quote delimiters and is idempotent. This remains a documented-pattern policy, not a claim to recognize arbitrary secrets.

Artifact validation replays reservation and outcome events to reconstruct each operation, enforces retry/budget bounds, and compares the result with recovery counters. A committed operation requires a matching reserved and committed attempt; counters and lifecycle labels alone cannot establish collection. The operation set is immutable across checkpoints. This verifies internal consistency, not authenticity against an operator who controls all stored files.

Cancellation and the persisted deadline are checked before collection publication, before and after validation, and before terminal success. A validating checkpoint resumes directly at this guarded terminal boundary; it does not append another validating event or repeat committed validation effects.

On supported Windows runtimes, each v2 writer holds an exclusive local named-pipe lease in the
same process through its final checkpoint write. The pipe name is derived from the validated store
filesystem identity and run identity; serialized lock fields, PIDs, elapsed time, roles, and flags do
not grant recovery authority. `research recover` can reclaim only a strict stale v2 coordination file
after the process-held lease can be acquired. It validates the checkpoint chain, does not collect,
refund attempts, change deadlines, or alter terminal artifacts, and returns only `recovered` or
`not-needed`.

Legacy v1, corrupt, truncated, oversized, linked, foreign-root, or unknown coordination metadata is
preserved and refused. A live writer remains busy even if its event loop is delayed. Unsupported
platforms and unavailable IPC return `RESEARCH_RECOVERY_UNAVAILABLE`; there is no PID probe or
manual-delete fallback. A crash during an incomplete metadata write can intentionally remain blocked
until atomic metadata publication is separately designed and accepted. Named-pipe exclusion is local
coordination, not authentication or proof of Windows ACL ownership. The state directory remains a
previously admitted operator-owned protected-local-state precondition.

Normal start, resume, and cancellation remain available on other supported Node platforms through the
conservative synchronous v1 writer lock. Those platforms do not implicitly reclaim v1 state, and the
explicit recovery command returns `RESEARCH_RECOVERY_UNAVAILABLE` without deleting metadata.

## Implementation decisions (IDS)

Requirement provenance: `oalanicolas/aiox-research` at commit `271883ad76759d4351df1182406687fecc34710f`, specifically `RESEARCH-OBSERVATORY-CONTRACT.md`, `packages/research-core/src/cli.ts`, and its `LICENSE`, as inventoried in the session's `aexos-audit/dashboard-research.md`. The reference is ELv2. The local contract, collector, lineage, fixtures and recovery code are independently authored; no upstream implementation, UI, mock output, prompt or fixture was imported. This records selected requirements, not permission for wholesale reuse or research-quality acceptance.

- `core/research/contract.js` — **ADAPT** existing Ajv and durable evidence codec patterns; one strict Draft-07 schema and semantic checks avoid a parallel mission schema.
- `core/research/collector.js` — **CREATE** a bounded fixture adapter because the existing deep-research providers are paid/external and do not meet the local contract.
- `core/research/store.js` — **ADAPT** ordinary-directory identity and immutable receipt patterns from
  `workflow-control-store.js`; legacy v1 coercion and unverified stale-lock removal remain excluded.
- `core/research/writer-lease.js` — **CREATE** a Windows stdlib named-pipe process-lifetime lease;
  existing file locks close their descriptors and no existing primitive established writer death.
- `core/research/store.js` recovery additions — **ADAPT** the existing ancestry, ordinary-file,
  identity, bounded-read, and checkpoint-chain guards for strict v2 coordination.
- `core/research/service.js` — **ADAPT** the shared evidence codec and existing `rankAlternatives`; collection and citation gating required a typed research service.
- `core/research/export.js` — **CREATE** canonical JSON and inert Markdown rendering because no existing exporter preserves this artifact's ordering and hostile-text requirements.
- `core/research/index.js` and `cli/commands/research/index.js` — **ADAPT** existing CommonJS barrel and Commander factory patterns.
- `schemas/research-v1.schema.json` — **CREATE** the requested versioned plan/artifact/checkpoint contract.
- Research fixtures and tests — **ADAPT** existing Jest/temp-directory conventions and exercise real files, child-process CLI calls, recovery, corruption, privacy, and deterministic output.

Native publication stays disabled. Storage is operator-owned local control state and never workspace publication or an authorization receipt.
