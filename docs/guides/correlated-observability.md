# Correlated read-only evidence

`aexos office correlate` projects retained workflow receipts and existing Virtual Office events into one bounded read model. It never runs a task, changes a workflow, grants a capability, approves a delivery or starts a server. The existing Virtual Office command remains the entry point.

```powershell
node bin/aexos.js office correlate --file evidence/receipts.json --project-root C:\consumer
node bin/aexos.js office correlate --file evidence/receipts.json --project-root C:\consumer --format graph --limit 100
```

The explicit input file must be confined to the selected project and contains:

```json
{"protocol":"aexos.correlation-input/v1","receipts":[],"events":[]}
```

Each receipt is the unmodified output of the selected SDLC runner. Events are existing Virtual Office event records; prompt, event data and source text are never projected. No directory scan, network request or automatic evidence discovery occurs. A missing association stays unresolved. `--story-id` and `--run-id` filter exact identities; unknown or control options are rejected.

## Identity and evidence

New selected SDLC receipts include `aexos.workflow-correlation/v1`: a fresh UUID for each invocation, canonical project digest, exact story hash, start/finish time and the six required phase/task/owner identities. Repeating one plan yields different run IDs. Legacy receipts without this envelope cannot be correlated by inventing an ID from a plan hash.

The output protocol is `aexos.correlation/v1`. Every row includes its source digest and JSON pointers back to the source, project/run/story identities when available, phase/owner/contract references, bounded artifact path/hash/size metadata, declared status, assurance, acceptance scope, and unresolved reasons. Provider model identity and recovery are `null`/`not-observed` unless an actual supported runtime association exists. Research, database and SOP associations are not inferred from filenames or matching prose.

Imported files are declarations, not authenticated runtime receipts. Even complete imported gate/artifact evidence is `completed-unaccepted`, with `declared-only` acceptance. A same-process receipt returned by the actual runner can retain `live-runtime` provenance only while its bytes are unchanged. This private identity cannot survive JSON serialization, be forged by a caller flag, or be granted by a hash. A trusted retained-receipt association adapter is still required for authenticated cross-process acceptance; this slice does not introduce one.

`accepted` requires all six matching phase contracts, produced artifact paths and exact after-check hashes, passed acceptance checks, completed workflow and confidence gate, no failed phases, and live runtime origin. It means local declared checks passed. It does not certify providers, independent implementation QA, installed native support, release readiness or customer outcomes. Fixtures and simulations retain their own states, and telemetry completion remains unaccepted.

Missing gates/artifact hashes, conflicting same-run receipts, malformed contracts and stale evidence downgrade the view. Identical source records are deduplicated; order changes produce the same rows for a fixed observation time. The default freshness window is 24 hours. The API permits a bounded observation time/window for deterministic tests; these parameters do not authenticate imported data.

## Bounds and privacy

The reader rejects aliases, links, traversal and inputs over 8 MiB. Per invocation limits are 128 receipts, 5,000 events, 2,000 projected artifacts per receipt and 512 output rows. Counts disclose filtering, omissions and duplicates. Tests measure the maximum event fixture under a five-second local ceiling; this is a regression bound, not a production throughput benchmark.

Only allowlisted scalar metadata and project-relative artifact links are exported. Untrusted source fields remain data; raw prompts, bodies, runtime payloads, capabilities and secrets are not rendered. Unsupported or unsafe artifact paths are omitted and prevent complete acceptance evidence. This is not arbitrary-secret discovery. Source digests are integrity references, not signatures.

The graph format derives nodes and edges from the same model and has no HTML or actions. No second execution ledger, scheduler, provider integration or dashboard control plane is created. Installed publication and production native support remain held by AEX-4.21/AEX-4.28.
