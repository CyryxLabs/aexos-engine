# SYNAPSE isolated candidate verification

Date: 2026-09-08. Scope: [AEX-4.17](STORY-AEX-4.17-SYNAPSE-ISOLATED-CANDIDATE-INTEGRATION.md).
This is local candidate verification, not a published package or native-host certification.

## Source and change boundaries

The candidate starts at upstream main
`5342f5a7c1ab6212087da2011265c11f1002503f` on
`codex/synapse-package-portability`. Its package version remains **5.3.0**.
It is not the npm registry's existing 5.3.0 artifact and must not overwrite it.
No version, dependency, lockfile, release workflow or commercial boundary changed.
The existing [first-value PR #4](https://github.com/CyryxLabs/aexos-engine/pull/4)
is independent and remains subject to its normal required review.

The runtime patch selects one complete distribution before loading either the
engine or session manager. Only an absent project SYNAPSE runtime permits the
installed package's sibling runtime. A partial, inaccessible, non-directory or
throwing project runtime retains fail-soft refusal without package fallback.
Project manifest, configuration, sessions and TTL remain project-local.

The runtime SHA256 is
`094c7f1c9097433b5ba6553925e9d99058183e26df0c00425e424c0e193f06cb`.
The matching hook tests and the narrow existing bootstrap-test restoration are
included. The latter restores source registry bytes and timestamps after real
regeneration and fails when that subprocess fails. Production registry behavior
is unchanged. The existing manifest generator changed only its timestamp and
the hook's hash/size; all other 1,167 entries and package version are preserved.
Registry determinism passes with the original 848 entities.

## Reproduction commands

Run from this candidate checkout with Node and npm available:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node node_modules/jest/bin/jest.js --runInBand --no-coverage --runTestsByPath tests/synapse/hook-runtime.test.js tests/synapse/session-manager.test.js tests/synapse/engine.test.js packages/installer/tests/unit/entity-registry-bootstrap.test.js
npm run lint
npm run typecheck
npm test -- --runInBand --no-coverage
npm run build
npm run validate:manifest
npm run validate:package-completeness
npm run validate:port-denylist
npm run validate:registry-determinism
```

For package-only verification, prepare an empty artifact directory, an empty
consumer directory with a private package.json, an empty npm cache and a work
directory, all outside this checkout. Replace the absolute placeholders below.
Run the first command from the candidate, the second from the fresh consumer,
and the last from the candidate. Unset `NODE_PATH` and `NODE_OPTIONS`.

```sh
npm pack --ignore-scripts --json --pack-destination /absolute/artifacts
npm install --ignore-scripts --no-audit --no-fund --cache /absolute/empty-cache /absolute/artifacts/aexos-core-5.3.0.tgz
node scripts/e2e/synapse-package-runtime-smoke.js /absolute/consumer/node_modules/@aexos/core /absolute/work
```

Use the **same fixture script** against a separately packed and freshly installed
unchanged base commit to reproduce the negative control. Do not substitute the
public npm package for that exact source baseline. The fixture prints JSON and
retains its unique project for inspection; hash each TGZ independently and bind
it to its npm pack inventory and installed receipt. Final archive hashes belong
in the external verification receipt or PR body, outside the archive they hash.

## Results and limits

The updated hook suite against unchanged runtime reproduces **2 failed / 14
passed**: missing package fallback and missing required access-error inspection.
After applying the accepted patch, all four focused suites pass **134 tests,
zero failures/skips**. The actual baseline installed fixture exits **1** with
the expected missing-runtime failure and preserves all **3,452 package files**.
The initial candidate fixture exits **0**, including actual domain-rule output,
24-hour cleanup policy, session reuse, project-local routing/configuration, partial-runtime
refusal and unchanged installed payload. Final gates/archive acceptance is
recorded below only after completion; the initial archive is intermediate.

All eight listed lint/typecheck/full-test/build/manifest/package-completeness/
port-denylist/registry-determinism gates exited **0**. The full suite reports
**9,875 passed / 0 failed / 172 existing skipped tests**, with 394 passed and
12 skipped suites (406 total). Skips provide no acceptance coverage. The source
inventory before and after these gates matched exactly. Positive complete-project
runtime precedence is covered by the focused hook tests, separately from the
installed fixture. Final package verification and whole-candidate independent
review are recorded separately in the external candidate receipt or PR review.
CodeRabbit is unavailable locally; no automated clearance
is asserted. The final documentation-only delta is recorded separately from
the tested inventory.

No remote push, review approval, merge, tag, workflow dispatch, publication or
deployment is performed by this verification. Native Claude/Gemini/Grok runtime,
paid delivery, Virtual Office and wider orchestration are outside this slice.
