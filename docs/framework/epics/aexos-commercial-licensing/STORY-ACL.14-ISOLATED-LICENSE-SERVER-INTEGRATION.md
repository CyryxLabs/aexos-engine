# Story ACL.14: Isolated license-server integration

| Field | Value |
| --- | --- |
| Story ID | ACL.14 |
| Epic | AEXOS Commercial Licensing |
| Priority | P0 |
| Status | Ready for Review — corrected local source/build QA and PO accepted; final Git/PR and no-deployment read-back pending |
| Executor | `@devops` isolated server candidate/Git/PR; assigned `@dev` for proven scoped corrections |
| Quality gates | `@architect` dependency/authority scope, independent `@qa`, `@po` coherence |
| Scope | Actual integration of existing locally accepted server commercial code and read-only migration correction |

## Story

As an AEXOS maintainer, I want the locally accepted License Authority changes
assembled with their real tests into an isolated reviewable server candidate,
so that commercial integration can progress without depending on a dirty
checkout or confusing local acceptance with hosted payment certification.

## Verified context

Actual server main and both existing local HEADs are
`09a6ec285b1ae6163d46e36ece51d29f7ab082e1`; read-only inspection returned no
open server PR. The linked checkout `C:/Cyryx/aexos-license-server` is clean;
`C:/AEXOS-license-server` holds the commercial source and must be preserved.
Accepted snapshot `C:/AEXOS-LOCAL-TESTS/commercial-preview-acl11-NgOG1E`, manifest
`82b19d9cd8537fc61c1ccdc58e318ccf0248fde4e10859510c8e94f96dbe0ccb`, still
matches 56 source files. All five native database source bindings remain equal.
These comparisons are current identities, not a new execution of prior gates.

This is broader than ACL.11's single migration-runner correction. Existing
ACL.7 paid-admission, ACL.8 artifact/billing/authority work, signing/native
continuation and ACL.11 local QA records establish the selected behavior.
Their outstanding hosted/provider criteria remain intact. Their status labels
alone are not sufficient approval for every commercial source path.

The initial inventory contained 83 inspected inputs / 55 proposed changes:
56 snapshot source files, 25 tests/helpers, vitest configuration and an example
environment document. PO found that its excluded generated AGENTS change was
still listed as selected. DevOps corrected the inventory to **82 selected inputs /
54 changes**, explicitly preserving baseline AGENTS bytes. Initial inventory,
scan and seal remain separate history; the corrected 82-file pattern scan reports
no credential-pattern matches, not a comprehensive secret-scanner certification.
Architecture must still review selected behavior and public-client closure.

[AUTO-DECISION] ACL.14 is available. The user's single closure sprint and normal
PR request authorize this bounded server integration. It does not authorize
provider deployment/migration/catalog mutation or infer that ACL.11 alone
accepted all 56 application files. Constitution authority remains unchanged;
PO owns this document only, DevOps owns Git/PR, architecture reviews closure and
QA independently accepts. No additional generic user permission checkpoint.

## Acceptance criteria

- [x] AC1: Before source assembly, architect and DevOps approve the actual isolated base/branch/tree and exact selected path/hunk inventory against server main `09a6ec285b1ae6163d46e36ece51d29f7ab082e1`. Map the existing application changes to accepted ACL.7/ACL.8/continuation/ACL.11 behavior and review the 25 tests/helper plus vitest/.env.example closure. Preserve baseline AGENTS instead of its generated-only modification, exclude all real environment/provider-link/key/build/raw-evidence material and record corrected selected/changed counts and hashes. Preserve both existing server checkouts and Core PR #4/#5/#6/AEX-4.19. Actual unexpected missing dependencies require a specific scoped architectural disposition before changes; no blanket dirty-directory copy.
- [x] AC2: Reconstruct the approved existing server behavior without changing its policies: account/authenticated paid-invoice admission, customer/plan/currency/amount/current service-period binding, seat/machine/scope enforcement, deterministic Stripe reconciliation and denial/recovery, authenticated billing routes, strict signed artifact request/descriptor and exact immutable grant/size/digest checks, bounded private URL lifetime, audit/withdrawal and fail-closed provider errors. Preserve migrations 0001–0003/RLS/append-only rules and ACL.11 read-only status before bookkeeping creation, with apply behavior and provider TLS unchanged. Preserve safe key provisioning/environment selection and existing plaintext/secret confinement. No invented invoice coverage, runtime bypass, changed free first-value, price/terms/product catalog, new paid feature or production key is introduced.
- [x] AC3: Close tests and configuration on the actual isolated candidate. Source production modules must remain server-local; no runtime Core/private-Pro dependency. Bind `tests/integration/paid-artifact-route.local.test.ts` explicitly to a reviewed exact public InlineLicenseClient/verifier installation or isolated source identity through AEXOS_CORE_SOURCE, with transitive module/payload hashes and no hidden dirty-root/private-service fallback. Exercise its real local HTTP fixture and ephemeral key path; a skipped optional cross-repository case cannot count as interoperability acceptance. Confirm its chosen client is compatible and label its own acceptance status accurately. Placeholder .env.example values remain inert and secret-free; public docs explain required inputs without embedding credentials or provider-specific deployment links. Retain explicit native/provider-only test dispositions.
- [x] AC4: Run fresh locked installation and actual server lint, typecheck, full tests, build and dependency audits on the reconstructed candidate, preserving existing Node/engine and package versions unless a separately demonstrated in-scope dependency conflict is reviewed. Record commands, exits, required-case skips and unchanged source inventory; zero/suppressed output or network failure is not PASS. Reconcile current selected SQL/store/runner/test hashes with accepted native PostgreSQL receipts. Retain unchanged real native acceptance with exact bindings and rerun affected native paths only if integration differences require it; any new cluster must be fresh, task-owned, loopback-only with validated connection fields and cleanup. Never use existing shared Preview/production persistence or silently reuse a user's cluster. Record actual read-only status/permission/error and apply/RLS evidence versus local fixtures, without hosted certification claims.
- [ ] AC5: Supply a self-contained public server integration story/verification and complete relative-link closure, preserving source/license/certificate provenance and excluding raw workstation evidence. Independent architecture/QA review accepts the exact assembled behavior, dependencies and test/client/native evidence; PO verifies original scope and retained external holds. DevOps seals the actual server commit/tree/complete diff and build artifact identities, verifies no unintended deployment/config/secret effect, and opens the requested focused server PR through normal review with exact read-back and commands/results. If remote delivery is blocked, retain reviewable candidate/body and leave that operation open. No merge, release, hosted migration, deployment, key provisioning, bucket/catalog/payment mutation, twenty-provider-cycle or shadow/beta/promotion acceptance is implied. A newly verified Vercel Git auto-deployment trigger requires a candidate-local safeguard before push: add only vercel.json git.deploymentEnabled mapping codex/commercial-license-integration to false, preserving other branches and existing config. Validate exact branch name, parsed configuration and no unrelated settings; independent QA reviews this scope. After normal PR delivery, read back actual Vercel deployment status for the exact head and verify no deployment was triggered. Missing or contradictory provider evidence cannot be recorded as prevention PASS; retain any unexpected deployment as an explicit incident and stop further promotion. No global provider integration or environment change is authorized.

## Tasks and ownership

- [x] Discover existing source/native evidence, actual base and proposed dependency inventory; verify available ID.
- [x] Architect/DevOps finalize exact selection, AGENTS exclusion and public-client binding before assembly (AC1/AC3).
- [x] DevOps assembles isolated candidate from approved source/test/config bytes and inspects exact diff (AC2).
- [x] Run fresh gates, required local HTTP interoperability and correctly bound native evidence; resolve proven scoped defects through assigned dev (AC3/AC4).
- [ ] Freeze public documentation; independent architecture/QA/PO review and actual normal server PR read-back (AC5).

DevOps owns isolated server checkout, copying reviewed bytes, local Git, package/
build receipts, public verification document and remote PR. Root/assigned dev
owns any demonstrated minimal correction within selected server modules/tests;
record it before edits rather than treating source changes as document assembly.
PO owns this story and a public-safe draft if needed, no server implementation.
All agents share workspaces; never revert others' changes.

### Selected inventory ownership

Exact proposed paths and current/base hashes are in
`artifacts/commercial-readiness-20260908/release-readiness-after-docker/server-inventory.json`.
Selection consists of existing `app/` routes/UI/health, `lib/` admission/billing/
Stripe/entitlement/artifact/storage/auth/database helpers, public assets and
certificate documentation/public CA, migrations 0001–0003, `scripts/migrate.mjs`
and `scripts/provision-artifact-key.mjs`, package/lock/build configuration/LICENSE,
25 explicitly enumerated tests/helper, existing `vitest.config.mts` and reviewed
`.env.example`. Baseline `AGENTS.md` remains unchanged. Directory names describe
ownership groups, not authority to recursively copy additional files.

Final inventory must enumerate every chosen path/hunk, retained baseline path
and exclusion. New documentation may be limited to a sanitized server story and
verification file with exact paths chosen by DevOps before freeze. No new source
surface or CI/deployment provider automation is part of documentation closure.

### Branch-only deployment safeguard

Pre-push inspection found the server's Vercel Git integration can deploy PR
branches into shared Preview persistence. The authorized PR must not silently
cause that deployment. DevOps owns only a new/merged `vercel.json` branch mapping:

```json
{"git":{"deploymentEnabled":{"codex/commercial-license-integration":false}}}
```

Preserve every other branch/default and any existing configuration. This adds
one explicitly owned candidate configuration path, not a global provider setting,
new deploy workflow or permission to change hosted resources. Validate exact
JSON/branch semantics, independent review, Git diff and actual provider read-back
for the final PR SHA. Keep the no-deployment acceptance separate from application
tests. The safeguard and public documentation are post-gate configuration deltas;
rerun affected checks and reseal exact source/config identity before delivery.

### Concrete recovery and financial-hold corrections

Root/dev owns exactly these nine isolated candidate paths under AC2/AC4:

- `lib/stripe-reconciliation.ts`.
- `app/api/v1/webhooks/stripe/route.ts`.
- `tests/unit/stripe-reconciliation.test.ts`.
- `tests/unit/stripe-webhook-route.test.ts` (new regression suite).
- `lib/billing-admission.ts`.
- `lib/stripe-reconciliation-store.ts`.
- `tests/integration/paid-artifact-database.local.test.ts`.
- `lib/billing-commerce-store.ts`.
- `.env.example` (truthful recovery/isolation guidance only).

A still-processing webhook lease must remain retriable: return accepted false
and HTTP 503; completed duplicates retain HTTP 200. Do not mutate the competing
worker's state/effects. The regression uses real Stripe SDK signature verification
and the leased/acquired/completed sequence, including invalid signature/mode cases.
Admission, binding and entitlement refresh must honor active financial holds for
the same customer when the hold names either the exact subscription or null
(customer-wide), matching the existing paid-artifact authority predicate.

Checkout recovery must reuse the already reserved idempotency key after an
ambiguous provider write/timeout, rather than rotating it and permitting a second
session. Its regression exercises actual SQL-backed storage with an inert provider.
The expanded opt-in native suite verifies corrected authority and rollback.

These correct demonstrated existing recovery/authority defects. They introduce no
schema, invoice qualification, event ingestion, commercial terms, provider setting,
production TLS or new paid feature. The prior nine passing gates and build refer
to pre-correction bytes. Fresh independent local PostgreSQL evidence now passes all eight native cases,
36 baseline/current hold combinations and the same-key checkout probe. Corrected
lint, full tests, build and typecheck all pass: 181 tests, zero failures and 43
explicit skips, with 93 gated source files and the bound client unchanged.
Earlier locked install/audits remain bound to the unchanged dependency graph.
Final independent review, exact Git seal and provider no-deployment read-back
remain open; hosted skips do not satisfy them.

## Guidance, risks and rollback

Highest risks are copying unreviewed source under an old snapshot label, optional
tests silently skipping real interoperability, SQL fixtures contacting a shared
provider, exposing secrets via env examples and treating current billable state
as paid invoice evidence. Mitigate through accepted-record mapping, exact hashes,
explicit client binding, fail-closed fixture connection parsing and independent
local/provider evidence separation. Signed Storage capability lifetime must not
outlive the grant/descriptor deadline; signed activation/cache authority cannot
be downgraded silently. Use ephemeral test identities only.

The current provider inventory reports shared Preview database scopes and only
hosted migration 0001; those are separate unresolved deployment/isolation facts.
Portable PostgreSQL 17.11 and earlier native receipts are available, so Docker
recovery does not itself justify extra installation or repeated tests. No hosted
resource costs, branch provisioning or migration is authorized by this story.
Rollback restores only candidate-owned unaccepted patches or task-owned fixture
paths after resolving boundaries; never reset the commercial or linked checkout.

## CodeRabbit Integration

Security/backend integration; high risk. Architecture validates authority and
cross-repository closure, QA reviews actual SQL/HTTP/security evidence, DevOps
owns normal PR. Existing automated tooling may be used when available.

- [ ] Pre-commit: automated review or explicit unavailability plus independent review.
- [ ] Pre-PR: exact diff/evidence/exposure review and normal required review rules.
- Pre-deployment: outside scope; hosted isolation/provider acceptance remains open.

Self-healing: dev light (two iterations/15 minutes, critical); QA full
(three/30, critical/high); DevOps report-only. Never waive an original authority
or required interoperability test to make the integration green.

## References and validation

- [ACL.7 admission](STORY-ACL.7-VERIFIED-PAID-ACCOUNT-ADMISSION.md).
- [ACL.8 delivery](STORY-ACL.8-AUTHENTICATED-PRIVATE-ARTIFACT-DELIVERY.md).
- [ACL.11 status](STORY-ACL.11-READ-ONLY-MIGRATION-STATUS.md).
- [Single closure sprint](../aexos-evolution/CLOSURE-SPRINT-20260908.md).
- [Accepted integration plan](../aexos-evolution/RELEASE-CANDIDATE-SLICES-20260908.md#separate-repository--acl11).
- [Accumulated context](../aexos-evolution/accumulated-context.md).

Readiness/source evidence: `release-readiness-after-docker/readiness.md`,
`source-current.json`, `server-inventory.json`; prior independent decisions:
`independent-qa.md`, `continuation-qa.md`, `acl11-qa.md` and native-db/ACL.11
receipts, all under `artifacts/commercial-readiness-20260908/`. Scope derives
from actual code and accepted local decisions, not document status alone.
Brownfield and story-draft checks PASS: context, ownership, dependency discovery,
safety, testability, public closure and rollback are explicit. Ready authorizes
pre-assembly architectural selection and bounded work; implementation acceptance
and remaining hosted criteria are not inferred.

## File list

- Created: `docs/framework/epics/aexos-commercial-licensing/STORY-ACL.14-ISOLATED-LICENSE-SERVER-INTEGRATION.md`.
- Selected: reviewed server paths/tests/config per inventory; `.env.example`/README truthfulness, nine-node lock correction and two public documents.
- Added configuration: branch-only `vercel.json` safeguard under AC5.
- Root/dev correction ownership: exactly the nine paths listed under Concrete recovery and financial-hold corrections; final changed-file count and hashes must be derived after rerun gates.

## Dev Agent Record

Base-only worktree created from exact `09a6ec285b1ae6163d46e36ece51d29f7ab082e1`
at `C:/AEXOS-LOCAL-TESTS/license-server-commercial-integration`, branch
`codex/commercial-license-integration`. The initial base-only state is superseded by architect-approved assembly and
explicit public-client binding. The pre-correction nine gates passed: 178 tests,
zero failures, 43 explicit skips; 20 unit and 10 local HTTP interoperability tests
executed. The nine correction paths above passed fresh native checks and four
source gates (181 pass / zero fail / 43 explicit skips); final independent review
and Git acceptance remain open. Corrected 82-input/54-change starting inventory excludes
generated AGENTS; it is not the final complete diff count. Final acceptance is open.

## QA Results

**APPROVED — exact corrected local source/build.** Independent QA rehashed all
93 source files, 3,460 bound client files, four corrective logs and all 336 build
files; 181 tests passed, zero failed and 43 explicit skips retained. Native
PostgreSQL 8/8, independent 36 hold comparisons and SQL-backed same-key checkout
recovery pass. The three reproduced defects remain in the evidence history.
The unchanged dependency graph retains its locked-install/zero-audit proof.

PO accepts AC1–4 and local AC5 scope/document coherence. The branch-only safeguard
and real offline gitleaks scan are independently reviewed. The final two public
documents are a separately sealed delta; exact final Git/PR identity and actual
provider no-deployment read-back still require DevOps receipts. No merge,
deployment, payment cycle, production trust/catalog or rollout is accepted.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready bounded server integration with accepted commercial/native provenance, explicit inventory correction and public-client closure. | Themis / `@po` |

2026-09-09 scope addendum: branch-only `vercel.json` deployment safeguard is
required by concrete pre-push discovery. Its configuration review and exact-head
no-deployment read-back remain pending; prior source gates are not that evidence.
