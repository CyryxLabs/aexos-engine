# Public CI integration verification — 2026-09-09

This records the independently accepted isolated source verification for
[ACL.12](STORY-ACL.12-PRO-DISTRIBUTION-CI-INTEGRITY.md), based on
`ece92e5d9a0f2ffe3b42ceabfa673b5b4f1390fe`. No current run is labeled PASS merely
because an earlier combined snapshot passed. The historical 133 mandatory /
10,589 full-test counts must not be reused as the current candidate result.

## Mandatory public execution

The reusable public workflow must run without a private token, submodule, local
Pro code or customer credential. Preserve the selected base versions of these
seven suites; execute their exact command and then require exactly seven passing
suites, positive executed tests and zero failed/pending/todo cases:

```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/pro/pro-detector.test.js tests/pro/pro-updater.test.js tests/unit/licensing/paid-squad-artifact.test.js tests/installer/pro-setup-signed-artifact.test.js tests/installer/pro-setup-target-install.test.js tests/installer/pro-scaffolder.test.js tests/cli/core-package-boundary.test.js --json --outputFile=contract-results.json
node scripts/ci/assert-contract-results.js contract-results.json 7
npm run validate:core-package
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/unit/ci/pro-distribution-workflows.test.js
```

The candidate verification harness should direct reports outside the checkout or
record their exclusion as generated output. Capture actual Jest exit first;
reporter success cannot override a failed Jest command. The separate machine
binding matrix must execute its selected one-suite verifier and require exactly
one passing suite with the same zero-skip/todo/failure contract. Local Windows
execution does not claim observed hosted Linux/macOS matrix execution.

```bash
node node_modules/jest/bin/jest.js --runTestsByPath tests/unit/licensing/paid-squad-artifact.test.js --runInBand --json --outputFile=machine-binding-results.json
node scripts/ci/assert-contract-results.js machine-binding-results.json 1
```

Workflow regressions must execute real failed/skipped Jest negative controls,
missing/empty/wrong-suite/todo report refusal, and aggregate failed/skipped/
cancelled/absent mandatory-job outcomes. Both mandatory jobs must equal success;
`always()` makes their aggregate run, not turn failures into success. No path
filter, `continue-on-error`, `--passWithNoTests` or missing-token success may
satisfy mandatory public coverage.

## Private-runtime and provider refusals

```bash
npm run test:private-artifact-contracts
```

On the intended public-only candidate this command must exit nonzero because
the two private-service suites import absent `pro/artifact-service` at load time.
Retain the exact error/exit. This is a verified refusal, not two passing suites
or a paid-provider cycle. Public discovery excludes only those two anchored
paths; public signature/extraction/refresh security tests must remain executable.

Retired submodule/public-Pro workflows are manual-only, permissionless guards,
without checkout, credentials, mutation or publication steps, and exit 1.
The protected paid-provider prerequisite workflow refuses untrusted context and
also exits 1 on trusted main while the actual runner/approved evidence is absent.
Run its shell refusal paths only as isolated tests; do not dispatch hosted jobs
or fabricate provider credentials/approved artifact state to get green output.

## Required current candidate gates

```bash
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm test -- --runInBand --no-coverage --json --outputFile=full-results.json
npm run build
npm run validate:manifest
npm run validate:core-package
npm run validate:package-completeness
npm run validate:port-denylist
npm run validate:registry-determinism
```

Record exact final source/workflow identities, commands, exits, full test totals,
mandatory zero-skip totals and existing ordinary skips separately. The mandatory
subset overlaps the full suite and must not inflate its count. Any unexpected
private dependency or missing selected suite is a defect, not a graceful skip.
The twelve-path architecture delta introduces no lock/dependency/version change;
verify those preserved bytes and actual base dependency closure.

## Current handoff and external boundaries

Architecture approved the bounded assembly and independent QA approved the
actual source gates, negative controls and preserved source identities. PO
verified this record against those results. Final Git/push/PR identity and
readback remain delivery work; no CI/source/candidate changes were performed
by the document author.

Core 5.3.0 still fails Security's preserved minimum 6.0.0. Public package mechanics
and strict CI cannot certify compatible Security execution or approve a release
version. Hosted Actions outcomes/protection settings, signed production trust,
immutable private catalog, paid-provider cycles, merge and publication remain
separate evidence. Retiring a broken paid publisher does not change the free
Core release workflows or create a licensed product release.

## Executed isolated acceptance — 2026-09-09

The exact twelve-path implementation passed fresh locked installation and all
nine source gates: lint, typecheck, full tests, build, install manifest, actual
Core package boundary, package completeness, port denylist and registry
determinism. Full Jest execution reports **10,156 PASS / 0 FAIL / 168 SKIP**,
with 409 passing and 12 skipped suites. Independent QA compared all 168 skipped
assertion names with the accepted base and found no additional hidden tests.

The seven mandatory suites executed **134 passing tests, zero skips**; the
one-suite machine-binding run executed **50 passing tests, zero skips**. Both
strict result validators exited 0. The **26 workflow negative regressions**
passed with actual shell/Jest child processes, supplemented by independent
reporter refusal probes. These subsets overlap the full suite and are not added
to its total. The separate private command exited 1 because private runtime is
absent; this is expected refusal, not passing private coverage or certification.

All **4,319 source file hashes** remained unchanged. Independent QA verified
the source inventory, nine source-gate log hashes/exits and eight initial
command log hashes. The source inventory is
`7b5b346846850ca957e10aa77537be4592f718268ac0812bafb9e606165cbca5`;
the final source-gate receipt is
`fa15dcf7275116125be3e2586e4f3a1a4be1135096edd63503f7672650870e3e`.
Architecture and independent QA approved the bounded local implementation;
PO verified evidence coherence before this public documentation freeze.

The final Git commit, public documentation binding, push and PR readback are
recorded separately by delivery evidence. Their identity is not manufactured
inside its own packaged documentation. Prerequisite PR #9's observed hosted
checks were label/welcome only; no technical hosted CI acceptance is inferred.
This stage closes only the approved integration subset. It adds no new slice,
provider journey, version approval, publication or Office acceptance.
