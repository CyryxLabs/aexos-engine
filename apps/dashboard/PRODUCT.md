# AEXOS Live Office

## Product intent

AEXOS Live Office is the authenticated, read-only web view of a solo founder's
explicitly connected local AEXOS project. The CLI remains the authority for
execution, decisions, project files, and credentials. The dashboard observes
sanitized execution metadata; it cannot dispatch, cancel, retry, or modify work.

## Existing visual direction

Reuse the current Cyryx Labs Virtual Office: the continuous isometric campus,
room navigation, agent roster, accessible list fallback, inspection drawer, and
owner-supplied brand assets. Authentication, project selection, connection
provenance, and stale/offline states extend that world without redesigning it.

## Audience and primary journey

The primary user is the solo founder. They sign in, select or create a project,
copy a non-secret connection command, and enter the one-time ingest token into
the CLI's hidden prompt. The token remains process-only; no token file or
command-line token argument is created. Empty, loading, stale, offline, and
error states must remain honest and actionable.

## Privacy and authority

- Render only the server's metadata-only Office snapshot and static catalog.
- Never display prompts, reasoning, project paths, command arguments, tool I/O,
  environment values, raw errors, or credentials.
- Show an ingest token only in the immediate setup response. Never persist it
  in a file, local storage, logs, analytics, URLs, command arguments, or later
  UI state after dismissal.
- Clear private project and snapshot state on logout or authentication failure.
- Decorative motion never implies work; observed activity and transport status
  are labeled separately.

## Constraints

- Plain JavaScript and the existing packaged Office modules/assets.
- Five-second bounded polling with one request in flight.
- No paid AI/provider API, execution controls, billing, invites, or role editor.
- Responsive keyboard access, reduced-motion support, and list fallback remain
  required product behavior.
