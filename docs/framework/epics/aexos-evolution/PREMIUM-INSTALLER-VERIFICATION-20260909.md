# Premium installer integration verification — 2026-09-09

Scope: existing [AEX-4.3 V1–V7](STORY-AEX-4.3-PREMIUM-INSTALLER-UX.md), isolated
on signed-installer base `628ee1cd980a39a27bacf00ecbc6da7ad668b258`.
This draft records actual corrected command/package/terminal evidence; independent
local visual QA is approved; committed-package and PR acceptance remain separate.

## Historical versus current evidence

The earlier combined-checkout visual acceptance was independently approved on
2026-09-07 using real Windows ConPTY at 40/60/80/120 columns, truecolor,
256-color and plain modes. The old archive and its 10,524 passing tests are
historical. New branch evidence must bind actual current source and archive
before making equivalent claims; screenshots alone do not establish behavior.

The initial isolated full run finished with 10,140 tests passing, **seven failing**
and 168 explicit skips. Lint, typecheck, build, manifest, package-completeness,
port-denylist and registry-determinism commands exited 0; full tests exited 1.
All eight command results and unchanged source inventory
`97679c3753e0276e5c8d6d1912bad2d301bd72ce60bae023c853389509ee6c4b`
refer to that failing run, not a final accepted implementation.

Its actual 3,465-file Core archive
`df631cd5c948f2f5bd9a9b1ba60946cf3b6f9c9748f77808d080efc91a486025`
ran default free init with exit 0, then Doctor with exit 1. Payload bytes remained
unchanged, which proves preservation but does not convert Doctor failure to PASS.
The CLI-only profile exposed false host-artifact failures; selected-Claude
settings separately exposed a real protection-generation ordering defect. Both
require correction without weakening missing-profile or selected-host checks.

An earlier focused run had 153 pass / two fail / 15 skip; one integration suite
subsequently passed 34 cases. Those overlapping partial results do not certify
the still-failing full candidate. The seven stale full-suite expectations and
root's exact correction paths must be reflected in final regression receipts.

## Required corrected acceptance

Run the repository's actual lint, typecheck, full tests, build, manifest,
package-completeness, denylist and registry-determinism checks on the corrected
source. Record the full test counts, existing skip meanings and source identity.
Use a real packed Core installed into a fresh consumer with a path containing
spaces; default CLI-only and explicitly selected Claude paths must each reach
truthful successful completion and Doctor exit 0 without false FAILs. Keep real
missing/invalid configuration and selected-host failures observable. Bind the
actual settings deny rules to final protection configuration, not an earlier
pre-install snapshot.

Capture real interactive output at 40/60/80/120 columns, with truecolor,
explicit 256-color, NO_COLOR and TERM=dumb. Verify focus versus marked state,
multi-selection, option descriptions, keyboard hints, numbered plain fallback,
review/change/cancel and selected-answer preservation. Plain/non-TTY output must
avoid cursor/color escapes and animations. Cancellation must leave no installed
success artifacts. Quiet/CI modes must remain prompt-free.

Independent visual review must compare the actual AEXOS wordmark/monolith,
metadata and selectors against the accepted direction. Record exact commands,
terminal dimensions/capabilities, application output, exit codes, source/TGZ/
installed binding and concrete pass/fail, rather than treating rendered HTML as
a separately implemented product. Windows-only evidence does not establish
macOS/Linux, screen-reader, clean-OS or native provider acceptance.

## Corrected application and final visual run

The demonstrated CLI-only and selected-Claude defects were corrected under V5,
with missing/invalid profile state still fail-closed and actual selected-host
requirements preserved. The seven stale full-suite expectations were corrected
without deleting Doctor or weakening framework protection. Corrected full gates
passed 10,155 tests with zero failures and 168 existing skips.

The earlier corrected 40-column welcome still used 38 rows within a 36-row
terminal. Root shortened only duplicate monolith middle/taper rows. A fresh
visual-correction run then passed all eight source commands: lint, typecheck,
full tests, build, manifest, package-completeness, denylist and registry
determinism. Current full results are **10,155 PASS / 0 FAIL / 168 SKIP**,
407 passing suites and 12 skipped suites, on unchanged source inventory
`585251335b476a5169067be9a3f23688abeb0a9db19998cde7bdd0bf8943af9f`.
The command run completed at 2026-09-09 02:11 UTC. Skips are not accepted
provider or host functionality.

Fresh pre-document archives were actually packed, installed and audited:

| Archive | Files | SHA-256 |
| --- | --- | --- |
| Core 5.3.0 | 3,465 | `6a2113fcf55760d67708ca643c72f1544670e7a801ded9031d104836ca387fab` |
| Installer 3.3.9 | 86 | `bd644ed56d6f1ab14e4d4ce05567cedc158ab8130ef675f0b47ed8b942ad3e37` |

Actual installations/payload binding and both consumer audits pass. Free default
init and Doctor exit 0 with **9 PASS / 2 WARN / 0 FAIL / 7 INFO**, all Core
package files preserved. Warnings remain visible. These archives precede public
document addition and final Git sealing; their hashes are not future release hashes.

The new real ConPTY run completed eight cases at 02:12 UTC on Windows/Node
24.15.0, each 36 rows high:

| Case | Observed result |
| --- | --- |
| 40 / 60 / 80 columns, interactive choices | All expected eight input steps completed; cancel exit 130; target uninstalled |
| 120 columns, explicit 256-color | Eight steps; cancel 130; 256-color present, truecolor absent |
| 40 columns, NO_COLOR | Five steps; cancel 130; zero application escape bytes |
| 40 columns, TERM=dumb | Five steps; cancel 130; zero application escape bytes |
| 80 columns, direct cancel | Expected cancel 130; target uninstalled |
| 80 columns, review/edit/install | Eleven steps; exit 0; profile bob, Claude Code and Codex selected |

The edit/install case's actual Doctor exits 0 with **16 PASS / 2 WARN /
0 FAIL / 0 INFO**. Package bytes remain unchanged across the matrix. Actual
key/cancellation/output evidence establishes these interactions; independent
visual review now accepts logo recognition, viewport composition and selector
readability using actual cell-coordinate captures and raw terminal/input bindings.
Process success alone was not used as that verdict. Initial failing receipts
and earlier captures remain historical.

## Current handoff state

Corrected source, fresh package/Doctor and current terminal command results are
available. Independent final local visual/source/package QA is APPROVED. PO verified
coherent V1–V7 evidence and freezes these public drafts for delivery. Exact
Git/document/package/PR acceptance remains separately recorded. No npm publication,
paid/provider execution, clean-OS or cross-platform acceptance is inferred. No
source/package/provider version, price, paid gate or new product surface changed.

## Independent local approval and final-delta boundary

Independent QA verified all 4,274 current source files, eight gate logs, both
archives and every source/archive/installed file, consumer locks, six package/
install/audit logs and actual terminal application logs. The prior clipping
finding is resolved: full compact wordmark, split teal/silver monolith, context,
first question, both options and hints are visible in the 40-by-36 viewport.
Wide composition, keyboard focus/marked state and numbered plain fallbacks are
accepted. Twelve correction probes / 33 assertions keep malformed present artifacts
and incomplete selected-host projections observable. No native provider session
or CodeRabbit clearance is claimed.

Only the exact current Windows ConPTY/cell-rendered experience is accepted.
Five whitespace-only CLI lines may be normalized during normal delivery; their
before/after bytes must be declared and included in final committed/package
binding. Public documents are another explicit final delta. Neither is silently
covered by the unchanged-source hash of the earlier gates. Publication, merge,
paid-provider certification and unsupported platforms remain outside this verdict.
