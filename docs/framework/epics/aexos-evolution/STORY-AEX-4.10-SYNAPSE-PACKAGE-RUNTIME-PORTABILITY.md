# Story AEX-4.10: SYNAPSE package runtime portability

| Field | Value |
| --- | --- |
| Story ID | AEX-4.10 |
| Epic | AEXOS Evolution |
| Status | Done — bounded local scope; independent QA APPROVED |
| Executor | `@dev` |
| Quality gate | `@architect`, independent `@qa` |
| Quality gate tools | SYNAPSE runtime regressions; actual packed npm-only fixture; repository gates |
| Depends on | Existing SYNAPSE hook contract and bounded architecture decision of 2026-09-08 |

## Story

As an AEXOS user with Core installed in `node_modules`, I want SYNAPSE hooks to use their installed package runtime when no project runtime is present, so that project context still loads without copying runtime code into my project or mixing incompatible implementations.

## Verified context and scope

The owner requested remaining diagnostic corrections. `.aexos-core/core/synapse/runtime/hook-runtime.js` currently requires both `session/session-manager.js` and `engine.js` exclusively from `cwd/.aexos-core/core/synapse`. It already resolves project `.synapse` state with `resolveSynapsePath(cwd)`, forwards the parsed project manifest and reads project Core configuration/TTL. Preserve those behaviors.

The accepted bounded [architecture contract](INSTALLER-SYNAPSE-HARDENING-CONTRACT-20260908.md#synapse-decision) selects one runtime distribution before loading modules. Fresh upstream's independent per-file fallbacks can mix a partial project runtime with package modules; that behavior must not be copied. This story changes runtime code location only. Installer extraction/npm work remains ACL.13; a later Grok parity story remains separate.

[AUTO-DECISION] Story ID → AEX-4.10 was available at discovery. Derive this small correction from verified hook-runtime behavior and the architecture contract; retain all previous Evolution story criteria and concurrent edits.

## Acceptance criteria

- [x] AC1: Select a single runtime base for both engine and session-manager. When the entire project's `.aexos-core/core/synapse` directory is absent, resolve both modules from the sibling SYNAPSE base of the loaded hook-runtime in the installed distribution. A complete project runtime takes precedence. Do not independently fall back individual files or search unrelated/global runtime installations.
- [x] AC2: A present but partial, unreadable, non-directory or broken project runtime does not trigger package fallback. Distinguish absent paths from access failures. If either selected module is missing or throws during loading, preserve the existing fail-soft `null` result and contextual diagnostic behavior. Both selected modules must successfully resolve before session creation or stale-session cleanup starts; failure cannot create mixed-runtime state or silently mask project corruption.
- [x] AC3: Preserve `resolveSynapsePath(cwd)`, project `.synapse` directory/manifest selection, explicit `parseManifest(manifestPath)` forwarding, project Core configuration and positive TTL/default behavior. Sessions and cleanup remain scoped to the project's SYNAPSE state, never the installed package or global directory. Preserve `session_id`/`sessionId`, returned runtime fields, no-session handling, absent `.synapse` behavior and `buildHookOutput` shape.
- [x] AC4: Extend `tests/synapse/hook-runtime.test.js` to cover absent project runtime using package siblings, complete project precedence, partial project rejection, project-module require failure, access-error distinction, both modules loading before mutations, project-specific manifest/config/session/TTL behavior and absent `.synapse`. Assertions must distinguish selected module roots and verify no fallback/side effects on broken project runtime rather than merely checking a non-null result.
- [x] AC5: Verify an actual freshly packed Core installation in an isolated npm-only fixture under `C:/AEXOS-LOCAL-TESTS/`, with no project `.aexos-core/core/synapse`. Invoke the installed hook-runtime using fixture-local `.synapse` content and record manifest routing, session location and exact Core version/TGZ hash. Package state must remain unchanged. Record exact commands/results and run lint, typecheck, tests, build and Core package-boundary checks plus independent review. Local hook invocation does not certify native Claude/Gemini/Grok/provider execution, commercial release or Grok parity.

## Tasks and ownership

- [x] Inspect current hook-runtime and finalized architecture contract; verify available ID and validate this Ready story.
- [x] Implement single-base runtime selection with absence-only package fallback and safe error handling (AC1-AC2).
- [x] Preserve project state/config/manifest and output behavior; add focused regressions (AC3-AC4).
- [x] Run the packed npm-only fixture and all affected gates; record evidence and independent review (AC5).

Assigned `@dev` owns only `.aexos-core/core/synapse/runtime/hook-runtime.js` and `tests/synapse/hook-runtime.test.js`, plus isolated verification receipts. No root package/lockfile, installer, engine, domain parser, session manager or Grok changes are needed. Coordinate any unexpected additional source ownership with the lead before editing. `@po` owns this story only and does not implement or commit source.

## Dev guidance and risk

Use the existing CommonJS/path/fs conventions. Base the package fallback on the loaded module's own sibling distribution, not `process.cwd()/node_modules` guesses. Determine project runtime absence with filesystem semantics that do not equate permission failure to missing directory. Load the two selected modules inside the existing guarded resolution path before invoking their stateful methods. Existing pure helper imports for manifest parsing/path resolution and existing warning/debug diagnostic policy remain intact.

Risk is silently mixing distributions or moving project session/config state into the package. Mitigate with module identity assertions, failure-side-effect checks and hashes before/after the installed fixture. Roll back only this story's exact hook-runtime/test edits; preserve concurrent installer, CI and Office work. Do not repair a deliberately broken fixture by mutating an existing user's runtime or deleting shared fixture roots.

References:

- [SYNAPSE architecture decision](INSTALLER-SYNAPSE-HARDENING-CONTRACT-20260908.md#synapse-decision): whole-distribution selection and absence-only fallback.
- [Architecture ownership and acceptance](INSTALLER-SYNAPSE-HARDENING-CONTRACT-20260908.md#ownership-and-acceptance): hook-runtime/test ownership and packed evidence.
- [Accumulated context](accumulated-context.md#2026-09-06-audit-and-experience-remediation): preserve concurrent work and current evidence boundaries.
- [Constitution](../../../../.aexos-core/constitution.md): CLI first, agent authority, no invention and quality.

## CodeRabbit Integration

**Type:** Runtime integration. **Complexity:** Low. **Risk:** Medium for mixed runtime and session state. **Agents:** `@dev` implementation; `@architect` decision review; independent `@qa` acceptance; `@devops` exclusively for a later PR/push.

- [ ] Pre-commit: configured automated review or documented unavailability plus independent review under existing graceful degradation.
- [ ] Pre-PR: `@devops` verifies exact source scope and gate evidence if requested.
- Pre-deployment: N/A; no provider activation or deployment in scope.

Self-healing: `@dev` light, 2 iterations/15 minutes for critical findings; `@qa` full, 3 iterations/30 minutes for critical/high; `@devops` reports only. Focus on project precedence, refusal of corrupt runtimes, state/config/manifest preservation and exact installed-distribution evidence.

## Story validation

Applied brownfield completeness/safety/information checks and the existing story-draft checklist. Goal/context, technical guidance, references, self-containment, testing and review planning pass. No new API, dependency, schema or environment setting is needed; no implementation-blocking unknown remains. **Ready** denotes implementation readiness, not provider acceptance.

## File list

- Created: `docs/framework/epics/aexos-evolution/STORY-AEX-4.10-SYNAPSE-PACKAGE-RUNTIME-PORTABILITY.md`.
- Planned source: `.aexos-core/core/synapse/runtime/hook-runtime.js`, `tests/synapse/hook-runtime.test.js`.
- Planned evidence: privacy-safe verification receipts and an isolated packed fixture under `C:/AEXOS-LOCAL-TESTS/`.

## Dev Agent Record

Implemented whole-runtime selection using `lstatSync` and ENOENT-only fallback.
Both selected modules load before session methods run. A present non-directory,
partial, throwing or inaccessible runtime returns the existing fail-soft result;
no alternate distribution is attempted. Project manifest/config/session code is
preserved.

Regression-first verification: the new package-runtime test failed against the
old source (1 failed / 14 passed). After the fix and a throwing-session case,
`node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/synapse/hook-runtime.test.js tests/synapse/session-manager.test.js tests/synapse/engine.test.js`
passed all 115 tests in three suites, no skips. Existing complete-project tests
verify precedence; new tests cover actual package engine identity, project state,
manifest/config/TTL, partial/broken runtime refusal and access-error distinction.
Packed npm-only verification passed at 2026-09-08T16:20:21Z against fresh Core
`6.0.0-alpha.1`, TGZ SHA-256
`dd7575e93d0c7fe5748912233bf5134a658e7b3cf9749e5d95c78a09eef04d95`.
The installed child process resolved the installed engine, routed `AGENT_UX` to
`ux-design-expert`, used fixture-local config/session state and reused the session.
All 1,924 installed package file hashes remained unchanged. Receipt:
`artifacts/commercial-readiness-20260908/synapse-package/dd7575e93d0c/receipt.json`.
An earlier receipt with archive d4ed7a... is retained as intermediate evidence and
is superseded by this exact archive. This intermediate archive was subsequently superseded by the final acceptance below.

Changed source files: `.aexos-core/core/synapse/runtime/hook-runtime.js` and
`tests/synapse/hook-runtime.test.js`. No installer or package manifest edits by
this executor.

Verification harness: `artifacts/commercial-readiness-20260908/run-synapse-package-smoke.cjs`.
Command: `node artifacts/commercial-readiness-20260908/run-synapse-package-smoke.cjs C:/AEXOS-LOCAL-TESTS/acl13-packed-20260908/aexos-core-6.0.0-alpha.1.tgz`.

Final batch package verification supersedes the intermediate archives above:
Core TGZ `db2e658f950d2b221687a52f0bcb933acd682b9c582e7b4bada544ce56404c9f`
passed at 2026-09-08T16:37:39Z in
`C:/AEXOS-LOCAL-TESTS/synapse-package-SKNjOv`. All 1,918 installed package file
hashes remained unchanged. The hook hash remains
`094c7f1c9097433b5ba6553925e9d99058183e26df0c00425e424c0e193f06cb`.
Receipt: `artifacts/commercial-readiness-20260908/synapse-package/db2e658f950d/receipt.json`.
Packaging hygiene and the shared installer metadata helper account for the
updated package; this story's hook implementation did not change between these
installed checks. No immutable commercial release approval is implied.

## QA Results

**APPROVED — bounded package runtime portability (2026-09-08).** Independent
review and 115 focused tests verify single-distribution selection, absence-only
fallback, no session-method invocation after module-load failure and preserved
project manifest/config/session state.

Actual installed fixture `synapse-package-SKNjOv` passes with final Core TGZ
`db2e658f950d2b221687a52f0bcb933acd682b9c582e7b4bada544ce56404c9f`:
installed engine identity, manifest routing, project session reuse and all 1,918
package hashes unchanged. Final public lint/typecheck/test/build pass, 10,589
tests passed/zero failed/172 optional or conditional skips; QA verified all
4,325 source hashes before/after and current root with no drift. See
`artifacts/commercial-readiness-20260908/aex-4.10-qa.md`.
Native host/provider execution, Grok parity and commercial release remain outside
this acceptance.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready bounded whole-runtime package fallback with project-state preservation. | Themis / `@po` |
