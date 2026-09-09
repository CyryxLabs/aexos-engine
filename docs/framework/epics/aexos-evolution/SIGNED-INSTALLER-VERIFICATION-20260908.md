# Signed installer verification — 2026-09-09

This public-client backport uses first-value PR #4 head
`d848c7f58ad4a8da3afc93398ec608be4bf4d23a` and the accepted four-node PR #6
lock correction, then exact tar 7.5.22 and compatible js-yaml patch resolutions.
The PR is stacked, not a claim those prerequisites have merged. Core stays
5.3.0 and standalone installer 3.3.9. No new 6.x distribution or sale approval.

[Story and complete behavior contract](STORY-AEX-4.19-SIGNED-INSTALLER-ISOLATED-INTEGRATION.md).

## Scope and observed results

The client preserves pinned signed descriptor authority, exact request/version/
byte binding, empty production trust and bearer confinement. Extraction validates
physical and effective tar/PAX paths and resource bounds before consuming the
same bytes. Windows target npm uses Node/npm-cli literal arguments. Target-first
source resolution rejects malformed/scaffold packages. Managed scaffold/runtime/
cache refresh coordinates rollback and bounded sanitized diagnostics.

| Check | Observed result at this draft |
| --- | --- |
| Original PAX negative control | Unsafe raw names hidden by safe PAX names were accepted; no outside write was observed. Corrected raw/effective preflight rejects them. |
| Independent metadata, transaction and diagnostic review | Scoped PASS; malformed metadata now refused, actual filesystem rollback succeeds, returned/thrown synthetic secret-bearing errors are redacted. |
| Corrected package creation and fresh installation | Core 3,460 files and standalone 84 files matched source/installed bytes; both installed successfully with separate caches and exact archive lock integrity. |
| Corrected consumer audits | Both exit zero; these are dated observations of their actual resolution. |
| Free Core init and Doctor | Both exit zero; Doctor 13 PASS / 2 WARN / 0 FAIL / 3 INFO; all 3,460 package files unchanged. |
| First corrective full run | Seven gates pass; full suite fails with 10,064 passing / one failing / 168 skipped tests. Retained as failure. |
| Narrow existing wizard fixture correction | 39 tests pass; adds actual cache-path contract without weakening runtime validation. |
| Second corrective full run | PASS at 2026-09-09 00:15:55 UTC: all eight commands exit zero; 10,065 tests pass, zero fail, 168 existing skipped; 403 passed/12 skipped suites, 415 total. Source inventory unchanged. |
| Actual standalone and paired signed HTTP/npm matrix | Terminal PASS: seven checks at 2026-09-09 00:12:43 UTC against the corrected installed packages. |
| Public portable installed verifier | PASS at 2026-09-09 00:28:51 UTC: seven cases from fresh supplied-TGZ consumers. |
| Exact final commit/archive, independent candidate QA/PO and PR | Recorded separately in external review evidence; no final identity is inferred from earlier archives. |

The two Doctor warnings are absent Git hooks and the existing Windows npx
advisory. They are not false failures and have not been hidden. The test-only
fixture correction leaves the already packaged production bytes unchanged;
final source/test/doc identity still requires its own reviewed seal.

## Reproduction commands

Run from the selected isolated candidate, with fresh locked dependencies and
separate empty npm cache/user/global configuration; retain JSON/logs externally.
These are real command forms. Angle-bracket values represent actual chosen
paths, not literal shell text.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ls tar js-yaml fast-uri @humanfs/node --all --json
npm audit --json
npm audit --omit=dev --json
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/installer/pro-source-resolution.test.js tests/installer/pro-setup-auth.test.js tests/installer/pro-scaffolder.test.js tests/installer/pro-artifact-extractor.test.js tests/installer/pro-installer-diagnostics.test.js tests/installer/pro-setup-target-install.test.js tests/installer/pro-setup-signed-artifact.test.js tests/pro/pro-detector.test.js tests/unit/licensing/paid-squad-artifact.test.js tests/installer/pro-install-transaction.test.js tests/pro-wizard.test.js
npm run lint
npm run typecheck
npm test -- --runInBand --no-coverage --json --outputFile <external-test-report>
npm run build
npm run validate:manifest
npm run validate:package-completeness
npm run validate:port-denylist
npm run validate:registry-determinism
npm pack --ignore-scripts --json --pack-destination <core-pack-directory>
```

From `packages/installer`, pack separately:

```sh
npm pack --ignore-scripts --json --pack-destination <installer-pack-directory>
```

In separate fresh consumers, install each exact local archive using its own cache:

```sh
npm install --ignore-scripts --no-audit --no-fund --cache <empty-cache> <exact-tgz>
npm audit --json
```

Use the Core consumer's absolute installed CLI path, first from the fixture root
and then from its initialized project, respectively:

```sh
node <installed-core>/bin/aexos.js init <empty-project> --ci
node <installed-core>/bin/aexos.js doctor --json
```

The standalone consumer must load its own `src/wizard/pro-setup.js` and
`src/wizard/pro-artifact-extractor.js` and resolve its declared tar without Core
hoisting. Pairing standalone with Core is a separate explicit consumer case.
The actual local signed HTTP matrix passed seven checks using ephemeral fixture
keys and real target npm: standalone-only public modules/local tar, valid and
hostile extraction, empty trust refusing before artifact download, initial
requested-version install, later requested-version refresh, late cache-failure
restoration, and authority-token/manifest/payload preservation. Its synthetic
licensed module was explicitly confined to fixture inputs; it is not provider
acceptance. The seven terminal results apply to the corrected installed archives,
not a future final commit/archive. Its public reproduction is included at
`scripts/e2e/pro-installed-package-smoke.js`. It has no raw evidence-directory
imports and accepts explicit archive paths. This exact invocation creates new
consumers and preserves prior evidence by refusing an existing output directory:

```sh
node scripts/e2e/pro-installed-package-smoke.js --core-tgz <core-tgz> --installer-tgz <installer-tgz> --output-dir <new-output-directory> --npm-cli <npm-cli.js>
```

`--npm-cli` may be omitted when the fixture safely discovers npm's JavaScript
entry point. Use literal quoted path arguments for spaces/metacharacters. The
seven-case public run completed successfully on 2026-09-09 at 00:28:51 UTC.
Receipt, process output and synthetic fixtures stay in the chosen external
output directory. This is verification tooling, not a new paid product command.

Final source gates bind inventory
`3550e82d6d87f04b48107ca4c73b0355dbe8e914949e625e6dfe9e2d90ec1bbc`.
The initial failed full-run receipt remains separate. Independent source/package QA approved the corrected behavior and existing
package evidence. The subsequent public verification-only file received lint
and its actual seven-case fresh-consumer run; production runtime remains
unchanged. Final exact commit/doc/archive seal and normal PR delivery belong in
the external review record. The original full-suite identity is retained.

## Final boundaries

Repository locks do not pin npm consumers; report their actual dependency
resolutions/audits separately. Preserve original negative-control and failed-run
records. Final commit/tree/TGZ hashes belong in external PR/acceptance evidence,
avoiding an archive containing its own digest. This document records its freeze-time evidence, not future release approval.

The historical 5.x broad squads allowlist remains inherited. Complete AEX-3.7
free-Core/private-paid boundary is a separate prerequisite for new 6.x release/CI.
No private issuer implementation, provider credentials or production signing key
is introduced here. Local ephemeral keys and inert mechanical content do not
certify customer payment, hosted delivery, release, native cross-host execution,
company orchestration or Virtual Office. Normal reviews remain required.

Public verification freeze: the separately authored portable script received
independent lead implementation review PASS, with its executed seven-case receipt,
3,544 installed payloads, command logs and consumer locks independently rehashed.
Final committed identity and repacked consumer acceptance remain external
follow-up requirements; this freeze does not claim them completed.
