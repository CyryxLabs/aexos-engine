# Stable identity rollout and rollback

The migration `20261029181012_stable_identity_epoch.sql` changes the protocol
accepted for new projects and for existing projects after token rotation. The
following is a staged rollout contract; the local tests do not establish hosted
Supabase or Vercel acceptance.

1. Verify the live migration history, function bodies and privileges. Capture
   the current Edge and dashboard deployment identities for recovery. Do not
   change the ingestion function's authentication or retention policy.
2. Publish and verify an Edge function accepting both protocol versions. Until
   the database migration is applied, do not start a v2 writer: the old database
   does not enforce the v2 identity anchor.
3. Publish and verify the compatible dashboard and distribute and verify the
   compatible CLI. Until migration, provisioning returns no identity anchor and
   continues producing v1 connection instructions.
4. Apply the migration once, using the migration connector and its recorded
   history. The migration transaction refuses to replace functions if their
   prior bodies, owner, security mode, search path or expected ACLs differ from
   the reviewed production baseline. Do not run concurrent administrative
   function or role changes during this check and migration: its preflight does
   not lock function definitions. A five-second lock timeout aborts the entire
   transaction if the schema change cannot acquire its table lock. Check function
   ACLs, the anchor for existing projects and version enforcement, then test
   with an explicitly authorized real project.

New projects and rotated tokens require v2 after step 4. Existing clients will
receive a generic authentication error after rotation; communicate the required
client upgrade. Previously duplicated historical records are not automatically
reconciled.

## Guarded rollback

The adjacent rollback script is a recovery artifact, **not** a forward migration.
It must not be automatically included in an ordinary migration run. Before
running it, stop v2 ingest writers and prevent new project creation and token
rotation; also suspend administrative function and role changes for the whole
rollback, because the preflight does not lock function definitions. Retain the
current deployment identities and user data. The script
locks the project and token tables with a five-second lock timeout, checks the
expected v2 function bodies, security mode, language, search path, `postgres`
ownership and the complete execution ACL observed in this project, and
refuses to run if any project's current epoch differs from its identity anchor.
That refusal includes projects created or rotated under v2. Resolve the recovery
strategy separately rather than overriding the guard or deleting history.

On success, the script restores the pre-v2 function bodies and preserves their
existing ACLs, project rows, events, snapshots, tokens and the v2 columns. Resume
only compatible legacy writers and coordinate the Edge/dashboard/client
reversions before allowing project creation or rotation. The pre-v2 project
rotation function uses the stronger lock it previously used; the v2 lock fix is
not retained by this restoration. Existing 24-hour/200-event retention remains
in force, and rollback cannot restore rows removed by that policy.

## Forward deployment after rollback

Running the rollback SQL directly does **not** remove or change the recorded
Supabase migration-history entry for v2. The database is then in a deliberately
reverted state while that history still says v2 was applied. Record that state
in the deployment incident and compare live function bodies, columns, data and
migration history before any further deployment. Do not automatically edit,
repair or delete the history entry to conceal the difference; a separate,
reviewed recovery migration and history reconciliation must describe the actual
state before rollout continues.

Do not rerun `20261029181012_stable_identity_epoch.sql`: rollback intentionally
retains its two columns, so that migration cannot be applied a second time.
The migration detects existing identity columns and stops with
`IDENTITY_EPOCH_RECOVERY_REQUIRES_RECONCILIATION` before changing any rows.
More importantly, v1 project creation or token rotation after rollback can leave
the retained identity anchor stale, and equality with the current epoch alone
does not prove that no intervening rotation occurred. Reusing that anchor, or
replacing it with a new value, can create duplicate historical events.

Leave v2 disabled until a separately reviewed recovery migration defines an
authoritative identity and transition for each affected project, verifies the
retained history and records its own migration version. Do not delete historical
events or reset anchors merely to make the migration run. If history is
insufficient to reconcile a project, retain its data and mark that project as
not safely migrated; obtain an explicit product decision about the unresolved
duplication before enabling v2 for it. The guarded rollback is a recovery action,
not an automatic retry mechanism.

Local PostgreSQL 17 tests use synthetic credentials and data. They verify a
successful rollback before rotation, refusal after a rotation, function or ACL
drift, bounded failure on a conflicting lock, row and ACL preservation, and the
selected concurrent ingest/rotation sequence.
They do not establish Supabase RLS, PostgREST, Edge, Vercel, real user-token
behavior, or safe recovery after a v2 rotation.
