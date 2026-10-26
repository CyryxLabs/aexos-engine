# Governed SDLC execution

`aexos workflow run` connects the canonical Story Development Cycle to the existing
workflow orchestrator, agent runtime, capability broker, dispatch governance and
outcome verifier. It requires an explicitly approved local plan. It does not
generate an implementation with an LLM.

```powershell
aexos workflow run C:/work/project/run.json --executor local-plan --policy C:/work/project/policy.json --project-root C:/work/project --control-dir C:/work/operator-control --json
```

The run and policy files must be ordinary files inside the authorized project.
The control directory must already exist outside that project. The operator must
protect control storage from consumer writers. It retains prepared publication
receipts and workflow state; it is not a subprocess sandbox. Do not use a live
serving workspace for recoverable replacement: the target name can be absent
between parking the original file and publishing the new file.

## Input contracts

Validate run files against `.aexos-core/schemas/local-plan-run.schema.json` and
operator policies against `.aexos-core/schemas/local-plan-policy.schema.json` in
the installed package. The separate operator policy binds the SHA-256 of the
exact run-file bytes, the canonical project root, one shared positive budget
ceiling and exact per-agent/task operation grants. A plan cannot grant itself
authority. Policy changes require an operator decision.

All six phases must appear once in this order:

| Phase | Task | Owner | Required result |
| --- | --- | --- | --- |
| `create-story` | `create-next-story` | `sm` | Story with status and acceptance criteria |
| `validate-story` | `validate-next-story` | `po` | Validation artifact and structural check of the created story |
| `plan-implementation` | `plan-create-implementation` | `architect` | Plan bound to source, approved content hash and test file |
| `implement-story` | `dev-develop-story` | `dev` | Actual source publication and implementation artifact |
| `run-tests` | `qa-run-tests` | `qa` | Actual named Node tests and test artifact |
| `review-story` | `qa-review-story` | `qa` | Repeated behavioral tests, review artifact and preservation checks |

These six tasks have strict V1 contracts. A separately validated in-process
execution binding adds story identity, task/contract hashes, workspace,
capabilities, budget and mandatory acceptance. This is selected-task coverage;
it does not certify the entire legacy task corpus.

Each phase supplies concrete relative inputs, bounded approved filesystem
operations and before/after checks. Every declared output needs exactly one
publication operation and an independently checked expected hash. Outputs cannot
overwrite the authorization story, plan, policy or acceptance tests. Existing
source changes require an expected original identity/hash and explicit isolated
workspace/absent-name consent. Defect journeys must run the same approved test
before and after repair, observing failure then success. Brownfield and defect
journeys also check an unrelated preserved file.

Node checks execute the current Node executable with a fixed test-runner argument
list and the consumer working directory. The policy must explicitly authorize
child-process I/O. Test counts, names, exit status and output hashes are checked;
skipped, cancelled, empty or failing acceptance tests cannot establish success.
The child process is not confined against arbitrary code or concurrent same-user
attackers. Review the test bytes and their imports before granting this authority.

## Results and support limits

JSON output contains one sanitized receipt. Exit code `0` means all six phases
received deterministic acceptance; exit code `4` means blocked. Progress goes to
stderr when `--json` is selected. Receipts distinguish configured local executor,
observed runtime, artifacts, checks and budget. They do not contain capability
tokens or approved file content. Keep the separate prepared receipts for recovery.

Native publication is governed by [the Windows publication contract](guarded-windows-publication.md).
Production support is disabled by an empty allowlist until independent security
and installed QA gates pass. The ordinary CLI has no validation override. A
separate branded constructor capability permits candidate tests only in isolated
temporary workspaces, bound to exact helper/runtime hashes and a short expiry.
Unsupported hosts must block before publication. Source tests and
deterministic installed fixtures do not establish live-provider, release or
commercial acceptance. Full-security replacement on the observed unelevated
Windows host is blocked with `FULL_SECURITY_OPEN_NATIVE_1314`; successful file
creation does not establish replacement or recovery support.

The legacy Epic 3 adapter can discover an existing confined specification and
reports its hash as reuse evidence. Fresh specification generation and the legacy
Epic 4 subtask adapter return explicit unsupported results. They never create
placeholder success artifacts.

For maintainers, `scripts/e2e/installed-sdlc-journeys-smoke.js --evidence-dir <dir>`
packs one candidate per fresh `run-*` evidence directory and verifies isolated
installed journeys. Repeated runs retain prior packages and receipts. The harness uses
offline dependency installation and fails explicitly if the cache is incomplete.
Its source fixture builder is test setup; execution resolves only the installed
framework. Retained TGZ and installed payload hashes identify the tested candidate.

## Brownfield planning evidence

The brownfield planning phase may declare `inputs.brownfieldEvidence`, pointing to
an existing `aexos.brownfield-evidence/v1` JSON artifact inside the consumer. Its
exact bytes require an approved `before` SHA-256 check. Every captured source
requires an explicit read lease from the operator policy; declare corresponding
source checks so the runner requests those leases. The input evidence is protected
against publication by any phase.

The implementation-plan JSON then contains `brownfield` with `evidencePath`,
`sha256`, `inputDigest`, and a nonempty `findingIds` selection. The checker reads
bounded evidence and current source bytes through the existing permission guard,
recomputes source identities and the input digest, checks finding spans, and
requires a selected finding to reference the affected source. It performs this
source validation before planning and again before accepting the planning result.
Unknown findings, changed bytes, undeclared reads, or mismatched document hashes
block the phase. This is static lineage evidence; it confers no implementation or
independent acceptance. Legacy plans without this optional input have no claim to
brownfield-analysis integration. Installed brownfield acceptance remains pending
the parser/package and native-replacement prerequisites.
