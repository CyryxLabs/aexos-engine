# Story AEX-4.24: Read-only Database Reliability

## Status

Done

Current original-scope acceptance (2026-10-16): Independent R5;27 installed PostgreSQL16.15/pg8.23.1 cases;14 reconciled dispatches;unchanged semantic digest;rollback/close and zero remaining sessions;unchanged modules rebound Customer/Supabase certification and actual restore remain excluded.

Source/installed evidence is rebound to archive `300a4f64505f1778439b99a5176758db69d8dc0221ff60689066824355146936`: all 2,035 installed payload hashes and 14,727 dependency hashes match accepted bytes; packaged product code matches the checkout. Fresh frozen-baseline lint/typecheck/build and 498 suites / 11,551 tests passed; 147 tests remain skipped. The correlation test-only addition followed the full baseline and passed its affected 36-test matrix. Independent closure review: external `ordinary-integration-20261012/current-parity-readiness/original-scope-independent-review.md` (JSON SHA-256 `c6c2bee5b9cf75cfbd53d07ca43397dfb8e3019c0b5a119bf730d011222e9f9d`).

This current decision supersedes earlier generic pending/dependency wording only for the original AC contract. Broader joined SDLC, host, provider and production claims remain separately bounded. AEX-4.21/AEX-4.23 positive replacement integration and separately requested AEX-4.28 hardening remain open. No paid API, publication or product-code change was introduced.

## Executor Assignment

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [contract-validation, disposable-postgres-fixtures, sql-readonly-guard-tests, evidence-verification, lint, typecheck, jest]

## Story

**As a** data engineer reviewing PostgreSQL or Supabase systems, **I want** read-only schema, RLS, migration, query, and backup-readiness evidence, **so that** reliability defects can be identified without mutating customer data or implying live-provider certification.

## Context and dependencies

AEXOS has a data-engineer role and governance primitives but no accepted equivalent to the useful read-only portion of the audited `db-sage` pack. The upstream material includes mutating migration, RLS installation, query termination, and restore operations; those are expressly outside this story. Disposable local database fixtures supply behavior evidence. A real Supabase or customer provider is not authorized and remains unverified.

## Acceptance Criteria

- [x] AC1: Define a bounded database-audit contract for PostgreSQL/Supabase-compatible metadata with explicit connection source, read-only capability, schemas in scope, statement/time/row limits, secret-redaction policy, requested checks, and evidence output. Missing read-only enforcement, excessive scope, unsupported dialect, or unavailable connection fails before audit.
- [x] AC2: Produce source-linked evidence for schema objects and constraints, indexes, migration history/drift, RLS enablement/policy coverage, query plans for supplied safe queries, role/privilege exposure, backup configuration/readiness metadata, and open risks. Distinguish observed metadata, fixture assumptions, inferred risks, and checks that could not run.
- [x] AC3: Enforce read-only behavior at contract, capability, and statement-classification boundaries. DDL, DML, policy installation, migration apply/rollback, query cancellation/termination, backup/restore, role changes, extension changes, and multi-statement escape attempts are denied and recorded. Safe catalog/EXPLAIN operations remain functional under limits.
- [x] AC4: Disposable PostgreSQL fixtures seed and detect missing/incorrect constraints and indexes, migration order/drift defects, permissive or absent RLS, unsafe privilege grants, expensive supplied queries, and incomplete backup-readiness metadata. Positive fixtures remain clean. Supabase-specific provider behavior not reproducible locally is marked NOT_ASSESSED.
- [x] AC5: Evidence contains database/fixture identity without secrets, query/check identity, normalized result hashes, timestamps, limits, and unsupported checks. No row payload beyond the minimum approved metadata enters artifacts. Malicious identifiers, comments, plan text, or database content remain untrusted data.
- [x] AC6: Integrate with existing data-engineer guidance, capability broker, confined output, and AEX-4.21 evidence conventions. Do not create an autonomous DBA service, embed credentials, or expose mutating upstream scripts through prompts or CLI aliases.
- [x] AC7: Run statement-denial, timeout/row-bound, seeded-defect, clean-fixture, redaction, deterministic-report, unavailable-provider, and malicious-content tests plus required repository gates. Independent `@qa` verifies the fixture defects and confirms no mutation outside fixture setup/teardown.

## Tasks / Subtasks

- [x] Define the bounded database audit request, limits, and fixture evidence model (AC1–AC2 preparation; actual audit held).
- [x] Enforce statement/capability denial and safe catalog/query-plan access (AC3 component; independently reviewed live R5).
- [x] Build disposable seeded and clean PostgreSQL fixtures (AC4 component; real local PostgreSQL evidence).
- [x] Implement bounded fixture evidence and hostile-content handling (AC5 preparation; recognizable-pattern protection, no arbitrary-secret claim).
- [x] Integrate with existing data-engineer/governance boundaries and run QA matrix (AC6–AC7).
  - [x] Make all adversarial live-fixture prerequisites explicit and independently verify 27/27 cases on a fresh loopback PostgreSQL cluster (2026-10-13; bounded installed-adapter scope).

## Dev Notes

Implementation contracts: external `aexos-implementation/evidence/database-4-24-design.md` and `continuation-20261011/evidence/database-live-design.md`. The pure closed request/observation contracts now have a pinned `pg@8.23.1` transport for an explicitly registered loopback fixture, composed through a trusted in-process host and existing capability/secret broker. Fixed catalog queries and a narrow baseline-bound declarative EXPLAIN compiler run in a read-only transaction; there is no arbitrary SQL or ANALYZE entrypoint. The root CLI has no ambient connection authority. JSON fixtures remain unverified declarations and cannot establish observed database state, read-only server enforcement, RLS isolation or backup readiness. The original real-database acceptance criteria remain unchanged.

Use existing capability broker, path confinement, task contracts, and evidence patterns. Prefer maintained project test infrastructure for disposable PostgreSQL; do not add a provider dependency merely to imitate Supabase. Any required dependency or container change needs explicit architecture and provenance review within this story.

[AUTO-DECISION] Live database scope → local disposable fixtures only; real provider/service acceptance is explicitly NOT_ASSESSED.

## Testing

Verify both detection and non-detection: each seeded defect must produce the expected finding, and clean controls must avoid the same finding. Capture before/after fixture state to prove audits did not mutate it. Provider-unavailable tests must fail or report blocked, never verified.

## CodeRabbit Integration

Database / Security / Integration, high risk. `@dev` implements; `@qa` independently gates; `@data-engineer` supplies domain review if available, without becoming the quality gate. Self-healing: dev light; QA full. Focus: SQL classification bypass, RLS truthfulness, credential leakage, query bounds, fixture isolation, backup claims, and provider labeling.

## References and provenance limits

- Audit `REPORT.md` sections **E7** and **Wave 3**, plus `squads-brain.md` sections describing `db-sage`, **P2 — read-only database reliability**, and **Licensing and product risk**.
- [AEX-4.21](STORY-AEX-4.21-CRITICAL-SDLC-CONTRACTS-AND-INSTALLED-JOURNEYS.md) and [accumulated context](accumulated-context.md).

No upstream script execution, real-provider test, backup restoration, production-readiness claim, or license assumption is authorized.

## Story Draft Checklist

READY, clarity 9/10. All categories PASS; read-only contract, denial matrix, fixtures, evidence fields, provider limits, and integration points are explicit. Implementation and QA acceptance remain pending.

## PO Validation Notes

**Verdict:** GO (9/10 readiness; high confidence) for preparation only. Validated on 2026-10-10 against the PO story-validation task, accumulated context, the audit's read-only database slice, governance/confinement boundaries, and AEX-4.21 evidence conventions.

- Actionability and denial coverage: PASS. Contract limits, statement classification, DDL/DML and operational denials, safe catalog/EXPLAIN behavior, timeout/row bounds, seeded and clean fixtures, redaction, unavailable-provider behavior, and before/after mutation checks are testable.
- Dependency hold: AEX-4.21 and its AEX-4.20 prerequisite must achieve independent acceptance before database evidence can join an accepted installed journey. `Ready` permits preparation only.
- Read-only boundary: PASS. Migration apply/rollback, RLS installation, query termination, backup/restore, role/extension changes, and live customer/provider operations remain unreachable. Fixture setup/teardown is the only authorized mutation and must be independently checked.
- Evidence and provider claims: PASS. Observed metadata, fixture assumptions, inferred risk, unsupported checks, Supabase-specific NOT_ASSESSED behavior, and secret-free result identity remain distinct.
- Execution dependency: BLOCKED for acceptance on this host. `docker.exe` is installed, but the `dockerDesktopLinuxEngine` pipe is unavailable, and `psql`/`pg_ctl` are not on `PATH`. AC4 and AC7 still require an actual disposable PostgreSQL runtime; static SQL fixtures may supplement unit coverage but cannot satisfy or be reported as equivalent acceptance evidence.
- Scope: PASS. The story reuses data-engineer guidance, capability broker, task contracts, and confined evidence; it adds no autonomous DBA service or provider dependency. Any container/dependency choice remains subject to explicit architecture and provenance review.
- Quality boundary: Disposable fixtures do not certify a real provider, production readiness, or independent `@qa` acceptance.

## File List

- External original-scope closure evidence: existing `ordinary-integration-20261012/current-parity-readiness/` records (`source-reuse-check-20261016.json`, `original-scope-gates-20261016.json`, `accepted-correlation-check-20261016.json`, `original-scope-independent-review.{md,json}`); backups under `before-original-scope-acceptance/`.

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.24-READ-ONLY-DATABASE-RELIABILITY.md`.
- Added `.aexos-core/core/database-reliability/{contract,catalog,audit,postgres-adapter,index}.js` and `.aexos-core/cli/commands/database/index.js`.
- Updated `.aexos-core/cli/index.js` and `bin/aexos.js` for the existing CLI registration, plus the single `database-audit-contracts` entry in `.aexos-core/data/installed-capability-catalog.json`.
- Added `tests/unit/database-reliability/`, `tests/fixtures/database-reliability/`, `tests/cli/database.test.js`, `docs/guides/database-reliability.md`, and this epic's `provenance/database-reliability-intake.json`.
- Added `tests/integration/database-reliability/postgres-live.test.js`; updated root/internal package manifests and lockfiles for reviewed exact `pg@8.23.1`.
- Updated `.aexos-core/development/tasks/security-audit.md`, already a canonical data-engineer dependency, to route read-only reliability assessment through the reviewed guide and existing authority boundary.

## QA Results

Current continuation: independent live R5 is **APPROVED** within the registered disposable-fixture scope (103 focused tests, unchanged semantic snapshots, zero audit sessions and exact compiler/report/dispatch provenance). Actual installed testing added 27 passing live cases. The data-engineer guidance link received separate independent coverage approval. Source and report hashes are in external `continuation-20261011/evidence/database-independent-r5/review.md` and `acceptance-coverage-review.md`. Final package/gates and the AEX-4.21 dependency remain separately tracked in `continuation-evidence-index.json`; historical pending/failed verdicts below apply to their original candidates.

Independent component R3: **APPROVED within the bounded pure component**. All eight findings are closed: validated compiler origin and immutable parameters, request-bound observations, requested schema coverage, partial/null evidence, duplicate identities, quoted credential patterns, nested row accounting and collision-free structural index comparison. Five focused suites / 78 tests pass; scoped lint passes; 50 independent cases preserve both clean and negative controls. The unavailable transport rejects before all host access. Exact probes and frozen hashes: external `aexos-implementation/evidence/database-4-24-review.md`. PostgreSQL/server read-only enforcement, real nonmutation, installed delivery and whole-story acceptance remain held. Combined-candidate verdict is recorded separately in external `current-gates.json`.

Continuation implementation evidence (2026-10-11): the official Windows PostgreSQL 16.15 binaries run in a retained disposable loopback-only cluster without service installation or elevation. Developer gates passed 63 unit/CLI tests, eight real database cases and scoped lint/typecheck. The product session's semantic before/after digests matched, captured SQL reconciled fixed templates, rollback/close were acknowledged and no audit session remained. This is developer evidence pending separate live QA; it supersedes the historical unavailable-runtime prerequisite above, not the story acceptance hold. Exact source/report hashes: external `continuation-20261011/evidence/database-live-implementation.md`.

## Change Log

### 2026-10-13 fresh-fixture reproducibility correction

Fresh installed verification exposed two missing setup prerequisites previously supplied by retained fixture history: the ordinary inherited migration row and the unsafe planner-function/index dependency. The live test now seeds both explicitly and asserts their presence before capturing baselines; all prior test assertions remain. The fresh PostgreSQL 16.15 run passed 27/27 cases with zero skipped, equal before/after snapshots, no remaining audit sessions, and observed shutdown of the owned server. No product adapter changed. Independent review accepted the bounded correction and raw evidence in external `ordinary-integration-20261012/database-fixture-correction/` and `correction-independent-review/review.md` (SHA-256 `32dd2112c2cdc55c33aba277cac1a48b82ab55b24a5405ff7353369fad77b64c`). The run used archive `1cbb5e8b3686829ada891ccfe33fa7c84ac778a40b26e88430c7e310f8662f51`; corrected-candidate global/package gates, customer databases, restore proof and whole-story acceptance remain separate.

### 2026-10-11 independent live continuation

The second live candidate passed 88 focused tests, including 17 actual PostgreSQL cases, but independent R2 remains **NEEDS_WORK**. It reproduced inherited migration rows outside the requested schema, RLS-only grant omission, false complete coverage for a missing schema, bypass of the aggregate raw-plan byte bound, and volatile session identity in canonical hashes. Corrections must preserve the retained inheritance fixture and prior R1/R2 evidence; no fixture cleanup may hide the failure. The current review and closure matrix are external `aexos-implementation/continuation-20261011/evidence/database-live-review.md`; new correction evidence is retained in `database-live-r3-candidate/`. Complete privilege graphs, unmanufactured invalid-index live states, actual restore, provider and whole-story acceptance remain unproved. Fresh installed and global gates follow independently accepted source corrections.

The third live candidate passed 96 focused tests, including 23 actual PostgreSQL cases, and independently closed all five R2 repros. R3 still returned **NEEDS_WORK**: an attached partial-index predicate executed a user-defined function during migration SELECT planning while the approved baseline remained unchanged. The retained function/index and real SQL/snapshot evidence are in `database-independent-r3/`. R4 independently closed that safety defect with the retained unsafe seed and a genuine safe positive path, but reported the default-parent statement hash for the selected safe parent. R5 binds live analysis to the exact sealed compiler bundle used for dispatch, including effective limits and fixed relation selection. Six focused suites / 103 tests pass; safe/original hashes are distinct, the unsafe parent remains denied, semantic snapshots match and observed audit sessions are zero. Exact evidence is in `database-live-r5-candidate/`; independent R5 and installed acceptance remain pending.

Independent live R5: **APPROVED within bounded source/live-fixture scope**. The reviewer replayed the original R4-1 probe, verified exact report/compiler/receipt equality and effective limits, rejected unsealed compiler input, and reconfirmed the unsafe original-parent denial without notices/history dispatch. All 103 focused tests and scoped lint pass; source/evidence hashes remained unchanged, semantic snapshots matched and audit sessions were zero. Decision and exact receipts: external `continuation-20261011/evidence/database-independent-r5/review.md`. Actual installed composition, production/provider, full privilege graph, restore and whole-story acceptance remain separate holds.

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-10 | 0.1 | Draft read-only database reliability story. | Chronos / `@sm` |
| 2026-10-10 | 0.1.1 | Validated GO (9/10) for preparation — Status: Draft → Ready; AEX-4.20/AEX-4.21 acceptance remains gating. | @po |

