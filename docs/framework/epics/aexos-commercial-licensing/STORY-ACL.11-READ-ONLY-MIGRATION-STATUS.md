# Story ACL.11: Read-only migration status

| Field | Value |
| --- | --- |
| Story ID | ACL.11 |
| Epic | AEXOS Commercial Licensing |
| Status | Done — bounded local acceptance |
| Executor | `@dev` |
| Quality gate | Independent `@qa` |
| Quality gate tools | Actual migration-runner SQL observation; isolated native PostgreSQL checks; License Authority quality gates |
| Dependencies | Existing migration runner and available disposable native PostgreSQL fixture |

## Story

As an AEXOS operator inspecting deployment readiness, I want migration status to report applied and pending files without changing the database, so that I can inspect a new or existing database using read-only permissions before authorizing migrations.

## Verified context and scope

The owner authorized continuation of commercial-readiness blocker correction. In `C:/AEXOS-license-server/scripts/migrate.mjs`, the documented `npm run migrate:status` promises to list migrations without changes, but `main()` executes `CREATE TABLE IF NOT EXISTS public.schema_migrations` before checking `statusOnly`. On a virgin database this creates schema state; even on an existing database it issues DDL and can fail under read-only permissions.

This story corrects that status/apply branch defect only. The existing apply path creates its bookkeeping table, discovers sorted SQL files, applies pending files, and records versions. Preserve those behaviors without redesigning transaction boundaries, concurrency, advisory locking or historical migration bookkeeping. No remote database mutation, provider operation, production migration or deployment is included.

[AUTO-DECISION] Story ID and execution → ACL.11 was available at discovery. The verified defect and the owner's instruction to continue provide sufficient scope for this small compatibility correction; no additional commercial decision is needed.

[AUTO-DECISION] TLS context → the current connection setup strips `sslmode` and specifies the existing CA/TLS options. Potential interactions with other connection query options are context only, not an established defect or required implementation change. Preserve connection security and configuration unless separately reproduced and authorized under an appropriate bounded story. Native tests may use an isolated transport fixture or a minimal test seam; they must execute the real runner logic rather than a rewritten imitation.

## Acceptance criteria

- [x] AC1: On a virgin database where `public.schema_migrations` is absent, `--status` exits zero and reports all discovered migration files as `PENDING` in the existing sorted output format. It issues no DDL/DML and creates neither the bookkeeping table nor any migration object. Missing bookkeeping is handled deliberately; unrelated permission, connection or query failures must not be swallowed as an empty migration history.
- [x] AC2: On an existing database, `--status` reads the actual recorded versions and accurately labels matching migration filenames `applied`, with remaining files `PENDING`. It works with sufficient read-only inspection permissions, issues no create/insert/update/delete or migration SQL, and leaves schema objects and bookkeeping rows unchanged. Connections are closed on successful status and query failure; failures retain nonzero exit/error behavior.
- [x] AC3: Without `--status`, preserve the existing apply path: initialize bookkeeping when required, apply only pending files in filename order, record each applied version, and retain the no-pending message and failure handling. Do not silently mark unapplied files as applied, change the existing migration transactions, or weaken TLS/authentication to satisfy local tests.
- [x] AC4: Add meaningful regressions that exercise the actual runner's status/apply logic and inspect its executed SQL, covering virgin status, populated status, query/permission failure and normal apply/no-pending behavior. Verify status with the available isolated native PostgreSQL fixture: assert table absence remains absence and existing rows/schema remain unchanged, preferably under a read-only role/session. Record exact commands, fixture identity and outcomes. No remote database is used or mutated; fixtures remain under a dedicated `C:/AEXOS-LOCAL-TESTS/` subtree.
- [x] AC5: Record the exact source/test diff and focused test results, run License Authority `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, and obtain independent review before completion. Source/native local acceptance of migration status does not certify actual hosted migration/RLS, Stripe cycles, paid installation or ACL.5/ACL.6 release gates. Preserve unrelated changes in both repositories.

## Tasks / subtasks

- [x] Inspect the actual runner and applicable repository instructions, verify the defect and available story ID, and prepare clear acceptance criteria before implementation.
- [x] Separate read-only status inspection from apply-only bookkeeping initialization; preserve apply semantics (AC1-AC3).
- [x] Add focused tests observing the real runner's SQL and error/connection behavior, with only a minimal execution seam if needed (AC4).
- [x] Run native virgin/existing/read-only fixture checks and record before/after evidence (AC4).
- [x] Run affected repository gates, update file/evidence inventory and obtain independent review (AC5).

## Dev guidance

Primary source is `C:/AEXOS-license-server/scripts/migrate.mjs`. It imports `pg`, loads existing environment files, discovers `migrations/*.sql`, and directly invokes `main()`. Reuse the project's existing test framework. A minimal export/main guard or dependency injection solely to execute the real runner in tests is acceptable if necessary; do not introduce a second migration implementation or new product dependency.

Use a read-only relation-existence query before selecting version rows, or another equivalent read-only approach preserving error distinctions. A status call should not need schema creation privileges. Keep the existing `applied  filename` / `PENDING  filename` output and sorted migration discovery. This story does not prescribe a new database transaction architecture.

Lead's concrete native verification plan uses portable PostgreSQL 17.11 and a transport-only test hook, leaving production TLS unchanged. On a fresh isolated database, a read-only role without CREATE must report all files pending without persistent catalog changes. A local fixture administrator then applies the actual `0001`–`0003` migrations with the required local auth fixture; read-only status must report all applied, and a separate denied-read case must fail nonzero. Baseline runner snapshot: `artifacts/commercial-readiness-20260908/acl11-migration-status/migrate.before.mjs`, recorded SHA-256 `7432e376fe6660a6c7ca9152741c5bbd88f55c834d3deb39ad880dff262da461`. This is planned acceptance and a lead-provided baseline identity, not a test result.

Risks are inaccurate absence detection, accidentally suppressing permission errors, and regression of apply bookkeeping. Mitigate with actual SQL observation and native before/after evidence. Rollback only this story's exact runner/test changes; preserve concurrent commercial, signing and database work. Never delete or move a shared fixture root to prepare a virgin database.

References:

- [ACL.8](STORY-ACL.8-AUTHENTICATED-PRIVATE-ARTIFACT-DELIVERY.md#context-and-scope): local versus hosted database/artifact acceptance boundaries.
- [Accumulated context](../aexos-evolution/accumulated-context.md#2026-09-06-audit-and-experience-remediation): preserve concurrent work and evidence identity.
- [Constitution](../../../../.aexos-core/constitution.md): CLI first, authority, story binding and quality.
- `C:/AEXOS-license-server/AGENTS.md`: applicable repository guidance; this change touches the standalone Node runner, not Next.js request handling.

## CodeRabbit Integration

**Type:** Integration / database tooling. **Complexity:** Low. **Risk:** Medium because a supposedly read-only command currently mutates schema. **Agents:** `@dev` implementation, independent `@qa` acceptance; `@data-engineer` consultation for native fixture behavior if required; `@devops` exclusively for any later PR/push.

- [x] Review fallback: CodeRabbit executable unavailable (`Get-Command coderabbit` found no executable); independent QA APPROVED. No CodeRabbit PASS claimed.
- [ ] Pre-PR: `@devops` checks exact scoped diff and verification evidence if a PR is requested.
- Pre-deployment: N/A; no deployment or remote migration in scope.

Self-healing: `@dev` light, up to 2 iterations/15 minutes for critical findings; `@qa` full, up to 3 iterations/30 minutes for critical/high; `@devops` reports only. Focus: zero writes for status, correct absence/error handling, unchanged apply path, connection cleanup, native fixture isolation and rollback safety.

## Story validation

Applied the brownfield task's completeness/safety/information checks and the existing story-draft checklist: goal/context, implementation guidance, references, self-containment, testing and review planning pass. No new API, schema migration, environment variable or product dependency is required. No blocking information gap remains. **Ready** means implementation may begin, not that native or hosted acceptance has passed.

## File list

- Created: `docs/framework/epics/aexos-commercial-licensing/STORY-ACL.11-READ-ONLY-MIGRATION-STATUS.md`.
- Modified source: `C:/AEXOS-license-server/scripts/migrate.mjs`.
- Created test: `C:/AEXOS-license-server/tests/unit/migration-runner.test.ts`.
- Created native/review tools: `artifacts/commercial-readiness-20260908/acl11-migration-status/run-native-status.cjs`, `native-transport.cjs`, `refresh-preview-candidate.cjs` (same evidence directory).
- Evidence: `acl11-migration-status/migrate.before.mjs`, `native-receipt.json`, `candidate-receipt.json`, per-case SQL/output logs, `verification.md`, and `artifacts/commercial-readiness-20260908/acl11-qa.md`.
- Updated aggregate evidence: `artifacts/commercial-readiness-20260908/verification.md`, `provider-targets.md`, server gate receipts/logs.
- Disposable roots: `C:/AEXOS-LOCAL-TESTS/acl11-status-f1bpOU`, `C:/AEXOS-LOCAL-TESTS/commercial-preview-acl11-NgOG1E`. Earlier evidence/fixtures preserved.

## Dev Agent Record

Status mode now uses BEGIN READ ONLY, to_regclass, an optional version SELECT and
ROLLBACK before returning. Bookkeeping creation occurs only in the apply branch.
Connection cleanup includes connect/query failure. Eight regressions execute the
actual runner in child processes, with pg/dotenv transport mocked; no exported
product test seam or new runtime dependency was introduced.

Native PostgreSQL 17.11 acceptance reproduced the old CREATE defect and passed
virgin/partial/applied read-only status, actual migrations 0001–0003, no-pending
apply and permission-denied exit 1. Catalog/tracker snapshots remained unchanged
during status and all connections closed. The isolated cluster was stopped.
Independent QA caught an unsafe spread in the initial test connection config;
explicit pg fields and an actual constructor override regression corrected it.
The full native run was repeated after that correction, PASS at 15:25:46Z.

Runner SHA-256: `c5522c8344a81be70af86f5631b0fd9b1a72d0df5f2d62a1540767b740a716ef`.
All server gates exit 0 through 15:23:19Z: 178 tests passed, 43 skipped.
Source remained unchanged during test-transport correction. No Core implementation
changed, so ACL.10's Core receipts remain separate applicable evidence.

The prepared Preview snapshot was refreshed to include the corrected runner:
56 matching files, manifest SHA-256
`82b19d9cd8537fc61c1ccdc58e318ccf0248fde4e10859510c8e94f96dbe0ccb`.
Isolated npm ci/build/lint/typecheck passed; prior snapshot is retained. This is
local preparation, not deployment or hosted/provider acceptance.
Exact commands: `artifacts/commercial-readiness-20260908/acl11-migration-status/verification.md`.

## QA Results

Independent QA APPROVED the bounded local status correction. Eight focused tests,
actual PostgreSQL scenarios, corrected test-transport isolation and current server
gates passed. Review: `artifacts/commercial-readiness-20260908/acl11-qa.md`.
No production migration, provider payment cycle, paid install or release was accepted.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready bounded correction for status-mode schema mutation. | Themis / `@po` |
| 2026-09-08 | 1.1 | Corrected status branch, actual-runner/native acceptance, QA approval and refreshed local Preview snapshot. | `@dev` / `@qa` |
