# Story AEX-4.15: Brand command task dependency closure

| Field | Value |
| --- | --- |
| Story ID | AEX-4.15 |
| Epic | AEXOS Evolution |
| Status | Done — guided command contracts; native/provider execution remains separate |
| Executor | `@dev` |
| Quality gate | `@architect`, independent `@qa` |
| Quality gate tools | Full Brand command-reference inventory; existing squad-validation CLI; task-contract and representative execution evidence |
| Dependencies | Existing Brand task architecture and AEX-4.13 policy/semantic-validation integration |

## Story

As an AEXOS Brand user, I want every advertised file-backed command to reach a real procedure that fulfills its promised input/output contract, so that invoking a specialist does not attempt to read nonexistent tasks or report success from an empty placeholder.

## Verified findings and provenance

The [bounded command inventory](../../../../artifacts/commercial-readiness-20260908/brand-command-dependency-inventory.json) inspected all seven current Brand agent YAML definitions plus explicit direct-Read command tables. All seven current definitions parse. There are 21 direct-Read command references, of which 19 point to missing files. Structured command/loader fields (`dependencies`, singular `dependency`, and `requires`) contain 25 file references and 13 missing references; these overlap the direct-Read findings and must not be added together as independent defects.

| Agent | Advertised commands with missing direct task references |
| --- | --- |
| Sagi | `*logo-brief`, `*category-select`, `*simplicity-test`, `*logo-system`, `*logo-audit`, `*sketch-concepts` |
| Alexandra | `*creative-brief`, `*name-storm`, `*smile-test`, `*scratch-test`, `*tagline`, `*name-audit` |
| Emily | `*obsessed`, `*emotional-hook`, `*brand-narrative`, `*brand-soul`, `*touchpoint-audit`, `*brand-tension`, `*launch-story` |

Sagi's missing files are `logo-brief.md`, `logo-category-select.md`, `logo-simplicity-test.md`, `logo-system.md`, `logo-audit.md` and `logo-sketch-concepts.md`. `logo-evaluation.md` exists and its task includes five-pillar evaluation, simplicity tests and application checks. Existing `visual-identity-brief.md` is a broader Michael-owned identity task; it is not automatically a complete substitute for every Sagi command. Existing `naming-exercise.md`, `movement-architecture.md` and `brand-touchpoint-audit.md` provide concrete content to assess for reuse across Alexandra/Emily commands.

Pinned upstream `aiox-squads` commit `66118db856ef655b8cf5ba44eda963ad4d0b1d78` has the same ten task filenames and the same 19 dangling direct-Read command references. Six upstream agent YAML blocks fail parsing; those upstream command findings are explicitly text-reference/filesystem evidence, not successful parsed-schema validation. Agent hashes, references and parse limits are in the inventory. Literal reference inventory also finds `brand-soul.md` in a resolution example, distinct from the actual `*brand-soul` command's `brand-soul-canvas.md`; do not count that example as a twentieth command.

[AUTO-DECISION] AEX-4.15 is available. Close the verified advertised-command defect under existing squad architecture. Prefer meaningful reuse of real procedures where their semantics fit; implement a missing task contract only where the advertised workflow requires substantive uncovered procedure. Do not copy upstream's broken paths, add placeholder files, silently remove supported commands or claim unavailable native execution.

## Acceptance criteria

- [x] AC1: Complete a command-to-procedure mapping for all seven Brand agents, including nested array/singular dependencies, `command_loader.requires` and explicit lazy/direct-Read tables. For each of the 19 confirmed dangling commands, record its promised inputs/outputs, existing relevant task/section coverage and the chosen valid procedure. Distinguish executable task references from symbolic identifiers, non-file prerequisites and examples. Correct stale examples when they contradict the implemented mapping, without interpreting every prose filename as a command.
- [x] AC2: Each advertised affected command resolves to existing substantive task content with matching scope, prerequisites, outputs and owner. Reuse complete compatible tasks or explicit bounded task sections when their contracts genuinely fulfill the command; do not equate existence with semantic fit or mark an entire multi-phase task complete after executing one section. Where no compatible procedure exists, author a real squad task following the existing anatomy/policy, with explicit inputs, outputs, ordered procedure, acceptance/rejection criteria, evidence and handoff. New contracts derive from the already advertised workflows/methodology, not invented capabilities. Empty wrappers, TODOs and “success” stubs do not satisfy this criterion.
- [x] AC3: Preserve current command names and align every duplicate advertised routing/dependency table with its actual task. Keep AEX-4.13 command-time policy loading, activation/help/exit restrictions, task anatomy, canonical roster and human approval authority. Do not cross specialist/core authority silently, fabricate user interviews or visual test observations, add provider dispatch, or present design advice as generated/validated final artwork. Unsupported empirical steps must request/record real evidence and remain unverified until obtained.
- [x] AC4: Extend existing squad validation to inspect command-level file references, including nested `dependencies`, singular `dependency` and file-valued `requires`, plus the explicit direct-Read loading convention currently used by Brand. Use current path resolution and parse-error handling; do not treat symbolic BR IDs, tool names or natural-language prerequisites as filesystem paths. Missing/malformed required command references fail with agent, command/field and target path. Keep top-level dependency validation and AEX-4.13 semantic checks intact; no generic new runtime or parser architecture is required.
- [x] AC5: Run the real squad-validation CLI against isolated positive and negative fixtures. Removing a nested dependency target, a singular target, a loader target or a direct-Read target must fail; symbolic/non-file guidance must not cause false failures. Check mapped task anatomy and demonstrate representative Sagi, Alexandra and Emily command execution against explicit supplied fixture inputs: produce the expected bounded deliverable, reject insufficient evidence where required, and verify output content against the command's criteria. A static path check or fabricated success record is not execution evidence; report any host/provider step not actually run as unverified.
- [x] AC6: Regenerate canonical component inventory and affected derived agent/skill surfaces through existing generators on an isolated copy when necessary, preserving custom files and deterministic output. Update Brand README's command/task inventory only to match implemented content. Run existing squad schema/reference/YAML checks, AEX-4.13 semantic regressions, focused command tests and lint/typecheck/tests/build/Core package-boundary gates. Keep Brand out of public Core and avoid altering review/paid artifact scope. Record separate source/reference closure, procedure execution, generated parity and native/provider evidence; independent architecture/QA acceptance is required.

## Tasks and exact ownership

- [x] Inspect all current Brand agents/tasks and pinned upstream; write bounded hashed inventory and validate this Ready scope.
- [x] Decide and document semantic command-to-task reuse or substantive missing-contract implementation for all affected commands (AC1-AC2).
- [x] Align routing/dependencies and preserve policy/authority boundaries (AC3).
- [x] Extend command reference validation and actual CLI negative fixtures (AC4-AC5).
- [x] Produce representative procedure deliverables from supplied fixture inputs and check their acceptance criteria (AC5).
- [x] Verify canonical/generated inventory, run gates and record independent review (AC6).

Implementation source ownership:

- `squads/brand/agents/sagi-haviv.md`, `alexandra-watkins.md`, `emily-heyward.md`: command/dependency tables. Other Brand agents may change only if the complete inventory verifies the same reference class there; record exact finding first.
- Existing Brand tasks selected by the semantic mapping, plus only substantively needed missing task contracts under `squads/brand/tasks/`. Do not pre-create all absent filenames as an implementation shortcut.
- `scripts/validate-squads.js` and a small existing-validator helper if needed; focused tests such as `tests/ids/brand-command-dependencies.test.js` and isolated fixtures. Coordinate with the AEX-4.13 validator owner before edits.
- `squads/brand/README.md`; canonical manifest `components.tasks` only if new real tasks require inventory regeneration. No duplication/change to the seven preserved policy blocks or roster authority.
- Existing generated projections only through the approved generators and explicit scoped output inventory; no hand-editing or global sync over unrelated changes.

`@po` owns this story and bounded discovery evidence only. Root's AEX-4.13 implementation/gates remain a separate accepted scope; do not edit its story or treat this later gap as previously fixed. No commit, provider mutation or publication by the story author.

## Risks and evidence boundaries

Primary risk is trading a missing-file defect for a semantically wrong shortcut. Reusing `logo-evaluation` can supply parts of simplicity/audit work, but category selection, design briefs and application-system contracts must be evaluated independently. Likewise a broad naming/movement task cannot automatically fulfill every narrow command. Record actual coverage and explicit remaining procedure before deciding reuse.

The generic validator change must preserve other squads' existing conventions. Test array and singular references, multiline direct-Read instructions, command names with `*`, anchors if used, parse failures and non-file prerequisites. Do not scan every arbitrary prose path as a mandatory dependency. Rollback only this story's exact source/test/content and generated changes, preserving prior policy integration and user files.

This story makes existing guided Brand commands usable and validates their task contracts. It does not implement automatic governed-runtime checkpoint transitions, provider adapters or company-wide orchestration. Those remain separate execution-contract work with actual runtime evidence.

References:

- [Inventory receipt](../../../../artifacts/commercial-readiness-20260908/brand-command-dependency-inventory.json) and [reproduction script](../../../../artifacts/commercial-readiness-20260908/brand-command-dependency-inventory.cjs): current/upstream scoped evidence and limitations.
- [Brand semantic review](../../../../artifacts/commercial-readiness-20260908/brand-semantic-absorption.md): preserved policy and known validator gap.
- [AEX-4.13](STORY-AEX-4.13-BRAND-POLICY-COMMAND-INTEGRATION.md): policy integration to preserve, not replace.
- [Accumulated context](accumulated-context.md): concurrent work and acceptance boundaries.

## CodeRabbit Integration

**Type:** Squad task/validation integration. **Complexity:** Medium. **Risk:** Medium for misleading command contracts and validator regressions. `@dev` implements, `@architect` checks reuse/authority decisions, independent `@qa` verifies real procedure outputs and negative checks; `@devops` exclusively owns later PR/push.

- [x] Pre-commit review or recorded graceful degradation with independent review: architecture and QA accepted; CodeRabbit executable unavailable, no CodeRabbit PASS claimed.
- Pre-PR exact-scope and acceptance evidence check: deferred to DevOps candidate reconstruction; no PR created for this slice.
- Pre-deployment: N/A; no deployment/provider work.

Self-healing: dev light (2 iterations/15 minutes, critical), QA full (3/30, critical/high), DevOps report-only. Focus: substantive procedure coverage, deterministic missing-reference failures, no placeholders, evidence-based outputs and preserved authority.

## Story validation and file list

Brownfield completeness/safety/information checks and applicable story-draft checklist categories pass. Mapping decisions are bounded implementation tasks grounded in existing advertised workflows. Ready for implementation, not a claim of completed runtime integration.

- Created: this story; `artifacts/commercial-readiness-20260908/brand-command-dependency-inventory.cjs` and `.json`.
- Planned product/test changes: scoped ownership listed above; implementer records exact task choices and final paths.

## Dev Agent Record

Implemented the approved mapping as one new `logo-design.md` task and explicit
command sections in `logo-evaluation.md`, `naming-exercise.md`,
`movement-architecture.md` and `brand-touchpoint-audit.md`. Aligned the three
affected agent routing tables, preserving policy and command names. Also separated
the existing `*evaluation` weighted command scale from legacy full-task scoring.
Canonical `squad.yaml` inventory was regenerated in isolation: the only semantic
change is the new task. README records all 20 selected command sections.

Extended `scripts/validate-squads.js` through the new
`scripts/lib/validate-command-dependencies.js`. New
`tests/ids/brand-command-dependencies.test.js` invokes the real CLI; the existing
policy test fixture also copies the new helper. Combined focused execution passes
76 tests. Independent architect probes exposed fenced-example/duplicate-heading
false greens, an incomplete tension matrix and ambiguous full-task frontmatter;
all corrected and architecture re-review PASS recorded in
`artifacts/commercial-readiness-20260908/aex-4.15/architecture.md`.

Actual root-Codex guided execution outputs and explicit synthetic inputs are in
`procedure-outputs.md` and `procedure-inputs.md` in that evidence directory.
These are not native slash/provider invocation or real customer validation.
Isolated repeated generation/check preserves all seven projected agents, the
unchanged policy and a customer file outside generated namespaces; see
`content-receipt.json`. Independent QA APPROVED and isolated full source/package
gates PASS: 10,701 full tests, zero failures, 172 existing skips; 271 focused
tests/four suites/zero skips. See `verification.md` and `gates/receipt.json`.
Additional architecture-required procedure outputs are in
`procedure-additional-outputs.md`. No release, private artifact scope or provider
mutation is included in this story.

Exact additional source paths: the three affected agents listed under ownership,
the five task files named above, `squads/brand/README.md`,
`squads/brand/squad.yaml`, both validator paths and both test paths named above.
Derived outputs remain in the isolated verification fixture and were not
hand-copied over the shared checkout or installed globally.

## QA Results

**APPROVED — bounded source/reference closure, guided procedure execution and generated parity.** Independent QA reviewed the three routed agents, five substantive task surfaces, helper/CLI integration and twenty bounded command mappings; the eleven-task manifest matches the actual files. All nineteen previously dangling commands have real procedures. Weighted evaluation is an additional scope correction, not another missing-file defect.

Independent actual CLI execution passed 26/26 negative/positive regressions without skips. Eight explicit synthetic root-Codex procedure outputs were reviewed against their contracts, including all five missing-observer refusals, 56 distinct names across eight techniques, fifteen taglines with verified word counts and six finalists, and four evidence-aware tension rows. Cross-fixture F3 rationale and Lumen letter-count mistakes were returned and corrected; architecture's three initial defects and their resolutions remain preserved.

Final isolated candidate `C:/AEXOS-LOCAL-TESTS/aex415-core-mxEhvq` is bound to inventory `28d189da11220c248b5c54e296bc873374219da36cd2b4b85b92b5bb7374a84c`. QA independently compared all 4,334 scoped candidate/root source hashes: zero mismatches. Raw results confirm 271 focused passes/zero skips and 10,701 full passes/zero failures/172 existing skips. Lint, typecheck, build, strict focused execution, Core boundary and twelve parity checks passed. Core payload contains 1,929 files, Security only and twelve canonical agents; Brand stays excluded.

All 41 Brand source files match the generated-content fixture, and all fifteen generated/sentinel hashes match; custom content remains preserved. Evidence, source fingerprints and correction history: `artifacts/commercial-readiness-20260908/aex-4.15/qa.md`. Acceptance does not certify native slash execution, other hosts/providers, automatic checkpoints, real customer observations/approval, release or broader Office orchestration. QA changed only its report and this QA Results section; lifecycle/AC checkboxes remain with the lead.


## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready closure of 19 verified advertised Brand command references, with substantive procedure and validator requirements. | Themis / `@po` |
| 2026-09-08 | 1.1 | Implemented substantive command contracts, corrected independent-review findings, passed source/package gates and independent architecture/QA. | Vulcan / `@dev` |
