# AEXOS recovery checkpoint — 2026-11-10

This branch preserves the current 6.0.0 development working tree before a computer reset. It is a recovery checkpoint, not a stable release or a production-readiness declaration.

## Primary restore

Clone `https://github.com/CyryxLabs/aexos-engine.git` and check out `codex/backup-before-reset-20261110`. This includes the current CLI/core, dashboard, migration and rollback sources, tests, native runtime installer, and framework stories.

The base before this checkpoint was `0450fdc724fec80358ba871719ab92746e17cdf0`. The original working directory was `C:\Users\ppetr\.codex\worktrees\production-6-0-0\AEXOS`.

Use the private recovery repository at https://github.com/CyryxLabs/aexos-reset-backup-20261110 for the complete local Git histories, saved stash, separate working-copy snapshots, and local qualification records. Its manifests distinguish included files from intentionally excluded credentials and reproducible dependencies. The other working copies contain different unfinished changes; do not overwrite this checkpoint with them.

## Development status

- The current implementation is retained as work in progress. Dashboard changes and Supabase migration/rollback files are included without implying that every deployment has completed.
- Latest recorded native/runtime regression run: six suites, 115 tests passed on 2026-11-09. Earlier full-suite evidence is recorded in STORY-AEX-4.32.
- Protected end-to-end alteration, real interruption, and recovery remain unaccepted. The last prepared host-bound session had not been executed. Error 1314 must not be declared resolved on the basis of this backup.
- AEXOS and Vinner are separate products. This checkpoint is for AEXOS.

## Reset limitations

Reinstall dependencies using the retained lockfiles and restore authentication through the normal login flows. Credentials are not part of the public backup. Use the native PowerShell runtime installer and the recorded official hashes when required.

Do not replay old administrative commands or consumed/expired manifests. Windows ACLs, process identities, live sessions, and host-bound validation state do not survive a reset as valid execution authority. Prepare fresh validation inputs after restoring.

Continue from `docs/framework/epics/aexos-evolution/STORY-AEX-4.32-INDEPENDENT-OPERATIONAL-QUALIFICATION.md` and the dashboard story AEX-4.31. Run the required quality gates before merging or releasing this checkpoint.
