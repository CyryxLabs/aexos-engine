# Story ACL.5: Preview and 20-cycle sandbox certification

| Field | Value |
| --- | --- |
| Story ID | ACL.5 |
| Epic | AEXOS Paid-Only Commercial Licensing |
| Status | In Progress — dedicated staging database migrated; hosted provider cycles pending |
| Executor | `@devops` |
| Quality gate | `@qa` |
| Depends on | ACL.1-ACL.4 |

## Story

As the release owner, I want a deployed Preview certified with least-privilege
Stripe credentials and at least 20 complete sandbox cycles, so that Checkout,
Portal, invoices and recovery are proven before any beta customer is admitted.

## Acceptance criteria

- [ ] Preview uses a separate restricted Stripe sandbox key, webhook signing
      secret and isolated database; no credential is stored in source or logs.
- [ ] Checkout, Customer Portal and real `invoice.paid` complete end to end in
      Preview with evidence tied to the deployed commit/artifact.
- [ ] At least 20 isolated cycles execute, covering success, cancellation,
      refund, dispute/chargeback, pause, `past_due`, `unpaid`, payment recovery,
      duplicate delivery and out-of-order delivery.
- [ ] Every cycle records expected/actual states, event IDs, cleanup status and
      contains no customer PII or secret values.
- [ ] All synthetic Stripe, auth and license records are cleaned or retained
      under an explicit test-retention record.
- [ ] Tax settings and registrations are reported per environment; certification
      does not claim legal/tax approval.

## Tasks / subtasks

- [ ] Provision Preview secrets and isolated persistence. (AC: 1)
- [ ] Deploy exact candidate and record immutable identity. (AC: 2)
- [ ] Run the 20-cycle matrix and collect evidence. (AC: 3, 4)
- [ ] Reconcile cleanup and publish a bounded QA report. (AC: 5, 6)

## Dev notes

- Production artifacts and entitlements require authenticated, signed paths.
  `[Source: ARCHITECTURE.md#topology]`
- Independent QA must review the exact artifact selected for release.
  `[Source: ARCHITECTURE.md#security-gates]`
- Legal review and commercial parameters remain release blockers.
  `[Source: PRD-AEXOS-PAID-LICENSING.md#release-blockers]`

## CodeRabbit integration

- Primary type: Deployment; secondary: Integration, Security; complexity: High.
- Pre-deployment is report-only under `@devops`; QA owns the verdict.

## File list

- [x] `C:/tmp/aexos-license-server/scripts/sandbox-certification.mjs`
- [x] `C:/tmp/aexos-license-server/docs/preview-certification.md`
- [ ] `docs/qa/licensing/`

## Current certification state

### Dedicated staging continuation — 2026-09-09

The owner narrowed this sprint to hosted database, paid delivery, site and release;
Office/orchestration acceptance is deferred to the next release. The owner approved
the separate `aexos-staging` project in Cyryx Labs Pro (USD10/month additional).
Target project: `xnnpxoqnnjzanrjclrbx`; existing projects were not modified.

- [x] Verify empty staging public schema and apply source migrations 0001–0003
  from clean server candidate `c9741887efb48112c8599f040d94f98ba7dd1aaf`.
- [x] Verify forced RLS and absent public-role DML privileges on all 15 business tables.
- [x] Correct real inherited PUBLIC EXECUTE exposure with additive migration
  `0004_private_function_permissions.sql`; preserve service-role execution.
- [x] Run transactional hosted probes for public-role read/function rejection,
  two synthetic identities, seat ceiling/duplicate/release, authority versioning
  and artifact immutability. Verify zero synthetic rows remain afterward.
- [ ] Run authenticated HTTP account isolation, concurrent sessions and actual
  backup restoration. Transaction rollback is not backup restoration.
- [ ] Configure branch-specific Preview credentials for the dedicated staging.
- [ ] Complete Stripe sandbox reconnection, hosted 20-cycle matrix and beta.

Server correction and verification report committed locally as `88b52b8` in
`C:/AEXOS-LOCAL-TESTS/license-server-commercial-integration`; working tree clean.
Lint/typecheck/build passed, Vitest 180 passed / 44 skipped. Push was denied twice
by the PreToolUse agent-authority hook (`Current agent: @unknown`) despite the
official DevOps greeting activation; no hook was disabled or weakened. The
official unified activation fallback was also run, without a subsequent push.
Subsequent verification confirmed remote delivery: PR #3 in
`CyryxLabs/aexos-license-server` now has head
`88b52b8190df3b27834b3a43157778408801563c`. The supported command-scoped
`AEXOS_ACTIVE_AGENT=devops` declaration resolved the activation mismatch;
no hook was changed. Vercel lists no deployment for that commit, so this
confirms source delivery only.

Evidence/source file list for this continuation:
- `C:/AEXOS-LOCAL-TESTS/license-server-commercial-integration/migrations/0004_private_function_permissions.sql`
- `C:/AEXOS-LOCAL-TESTS/license-server-commercial-integration/docs/ACL5-HOSTED-DATABASE-VERIFICATION.md`
- `artifacts/public-readiness-20260909/staging-database-acceptance.sql`
- `artifacts/public-readiness-20260909/supabase-staging-project.json`

Vercel project access works through the configured CLI, though its connector
returned 404. Stripe connector still exposes only live mode; owner said they
will connect test mode. Staging PostgreSQL/server-side Supabase credentials are
not available through the exposed connector (publishable keys only). These are
required inputs for hosted application deployment, not waived acceptance gates.

- The validator exists and fails closed. Its current result is **0 certified
  Preview cycles**.
- Vercel Preview does not currently expose an AEXOS restricted Stripe test key,
  webhook signing secret, Ed25519 signing key, ops token or cron token, and no
  isolated Preview database declaration is present.
- Twenty local synthetic cycles pass, but they are explicitly excluded from
  this story's provider-backed 20-cycle requirement.
- Checkout, Customer Portal and real `invoice.paid` remain unverified in the
  deployed Preview. This story remains In Progress and blocks beta.

### Provider reconnection continuation — 2026-09-10 UTC

- [x] User completed Vercel authentication and Stripe sandbox consent; connector confirms test mode.
- [x] Existing sandbox monthly price verified: USD39, one month, no trial; existing product reused.
- [x] Dedicated Vercel staging project created after branch-specific configuration failed in CLI and UI. Existing production/shared variables were not changed.
- [x] Ten Preview variables configured, including existing Supabase and Stripe test secrets and an independent random staging license secret. No secret values are recorded here.
- [ ] PostgreSQL connection requires the staging database password; user handoff prepared with the verified IPv4 transaction pooler.
- [ ] Configure checkout/portal/webhook and signed approved delivery, deploy the candidate, and run hosted account/payment/recovery cycles. No cycle or public launch is certified by configuration alone.

Evidence file list: artifacts/public-readiness-20260909/provider-reconnection-staging.json (local, secret-free). The isolated server checkout is linked only to the staging project; generated environment files remain ignored.

### Provider read-back — continuation

- [x] Rechecked the isolated Vercel Preview: ten configured variables remain present; POSTGRES_URL is absent.
- [x] Inspected Stripe sandbox portal/webhook inventory. Only the default portal and unrelated Townyx/Grok endpoints exist. None is accepted as an AEXOS-specific configuration and none was changed.
- [ ] Dedicated AEXOS portal and webhook configuration, PostgreSQL connection and hosted cycles remain pending. Engine PR12 is still OPEN / REVIEW_REQUIRED at e4bb3a875d1d1a8c7e2e31072ee962544afd592d.

### PostgreSQL credential continuation

- [x] Converted the owner's privately entered database password into the verified staging IPv4 transaction-pooler URI and saved POSTGRES_URL in Preview. No password or complete URI recorded.
- [ ] Actual connection remains unverified. First upload failed (fetch); archived upload created deployment dpl_EmWcXehPY8CvWAJkYA7Gmn12Tedg with target production despite explicit --target preview. Removed that deployment immediately; removal confirmed. This was the separate staging project, not the existing commercial server. Resolve Preview targeting before retry.

### Hosted connection verified during owner-access work

Dedicated staging initialized with an inert static first deployment (no application routes), then framework explicitly set to nextjs. Actual baseline server 88b52b8 deployed as Preview dpl_FLvPkBZtY16puhpQpB6Fgby4yVy1. Formatted nonexistent license key POST to /api/v1/license/validate returned HTTP401 INVALID_KEY at 2026-09-10T02:46:18Z, reaching the real license database lookup. This verifies request-path database connectivity, not a valid-owner activation or paid journey. Vercel curl used authenticated deployment protection access; passing --scope caused curl argument errors, omission with linked project succeeded. The static initialization deployment is not a commercial product release.
