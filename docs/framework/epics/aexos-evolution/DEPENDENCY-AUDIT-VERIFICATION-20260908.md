# Dependency audit candidate verification — 2026-09-08

The AEX-4.18 candidate corrects four transitive lockfile nodes on main
`5342f5a7c1ab6212087da2011265c11f1002503f`. It changes no application code,
direct dependency, override, script or package version. Package version remains
5.3.0; any local TGZ is a validation artifact and must not overwrite the
already published npm version.

| Lockfile node | Baseline | Candidate | Reason |
| --- | --- | --- | --- |
| fast-uri | 3.1.5 | 3.1.7 | Correct affected URI handling; satisfies AJV and the existing override. |
| @humanfs/node | 0.16.7 | 0.16.8 | Correct recursive-copy symlink handling. |
| @humanfs/core | 0.19.1 | 0.19.2 | Required by the corrected node package. |
| @humanfs/types | absent | 0.15.0 | Required by the corrected humanfs packages. |

The implementation is exactly the 30-line `package-lock.json` diff. Registry
resolution and integrity come from actual npm output; unrelated entries and
their order remain unchanged. Final lock SHA256:
`edff087d502bb0e7296570252e30e3a5e4e64a0670863302956bc3dd4aef5b8a`.

## Observed results

These checks used isolated Windows checkouts, Node 24.15.0 and npm 11.12.1.
Fresh installs used separate caches and empty npm user/global configuration.

| Check | Result |
| --- | --- |
| Baseline locked install and installed dependency tree | PASS, exit 0; baseline lock unchanged. |
| Baseline full audit, 21:46 UTC | Expected FAIL, exit 1: one high and one moderate affected package. |
| Baseline production audit | Expected FAIL, exit 1: one high affected package. |
| Final candidate locked install and dependency tree | PASS, exit 0; exact lock unchanged. |
| Candidate full and production audits, 21:51 UTC | PASS, both exit 0, zero reported vulnerabilities. |
| Lint, typecheck, build, manifest, package completeness, port denylist and registry determinism | PASS, every command exit 0. |
| Full suite | PASS, 9,867 passed, zero failed, 172 existing skipped tests; 406 total suites. |
| Source preservation during all eight gates | PASS; inventory unchanged and no generated registry mutation. |
| Independent affected-library runtime verification | PASS, ten meaningful checks against the actual installed libraries. |

Affected-library checks exercised AJV relative cross-schema references and
invalid-data rejection through its installed fast-uri runtime. URI checks
covered IDN authorities, malformed IPv6, percent encoding and relative
references. Real Windows symlinks reproduced baseline humanfs materializing
a target outside the copied subtree but inside the synthetic QA fixture; corrected `copyAll` and `copy` preserve the link, ordinary
files and original fixture inputs. This verifies copy behavior, not a general
filesystem sandbox.

The original advisory IDs were `GHSA-p498-v437-472g`, `GHSA-5jgf-p345-68v8`,
`GHSA-f65p-4m7j-42xc`, `GHSA-fph4-wmhf-6fwf` and `GHSA-jqff-g426-hqxp`.
Zero alerts is a timestamped npm observation of this installed graph; it does
not establish permanent freedom from vulnerabilities.

## Reproduction commands

Run in separate clean baseline and candidate checkouts. Use a distinct empty
cache and empty user/global npm configuration for each install; retain the
actual lockfiles and output outside the repository.

```sh
npm --version
npm ci --ignore-scripts --no-audit --no-fund
npm ls fast-uri @humanfs/node @humanfs/core @humanfs/types --all --json
npm audit --json
npm audit --omit=dev --json
npm run lint
npm run typecheck
npm test -- --runInBand --no-coverage --json --outputFile <external-test-report>
npm run build
npm run validate:manifest
npm run validate:package-completeness
npm run validate:port-denylist
npm run validate:registry-determinism
```

For the separately required packed-consumer acceptance, create fresh external
pack and consumer directories. From the frozen candidate:

```sh
npm pack --ignore-scripts --json --pack-destination <external-pack-directory>
```

From the new consumer:

```sh
npm install --ignore-scripts --no-audit --no-fund --cache <empty-cache> <exact-tgz>
node node_modules/@aexos/core/bin/aexos.js --help
node -e "const runtime = require('@aexos/core/resilience'); if (!runtime || typeof runtime !== 'object') process.exit(1)"
```

Angle-bracket arguments denote actual isolated locations, not literal shell
input. Record the exact TGZ digest, consumer lock integrity, installed runtime
paths and behavior checks. npm does not ship the repository lockfile into
consumers: their dependency resolution must be inspected separately, not
inferred from the repository audit. Do not alter public dependency ranges to
force the consumer to reproduce a repository-only lock graph.

## Final acceptance boundary

At this document's freeze, final packed-consumer evidence, sealed commit/tree
and independent whole-candidate QA/PO acceptance remain external follow-up
requirements. The PR records their exact results and identity before final
acceptance; the archive does not contain its own digest or future approval.
Full-gate evidence precedes these two documentation additions; they add no
runtime changes. CodeRabbit is unavailable locally, so no automated clearance
is asserted. Independent review and normal GitHub checks remain required.

First-value PR #4 and SYNAPSE PR #5 remain separate. No merge, release tag,
npm publication, deployment, paid-provider or Virtual Office acceptance is
included. See the [bounded story](STORY-AEX-4.18-ISOLATED-TRANSITIVE-AUDIT-REMEDIATION.md).
