# Core Free integration verification — 2026-09-09

Scope: the isolated [AEX-3.7 boundary integration](STORY-AEX-3.7-CORE-FREE-PACKAGE.md)
on signed-installer base `628ee1cd980a39a27bacf00ecbc6da7ad668b258`.
The [accepted ADR](adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md) defines
distribution policy; it does not assign a release version or legal grant.

## Source checks

After the Security evidence correction and generated-metadata refresh, nine
commands passed on Node 24.15.0 between 01:34 and 01:38 UTC on 2026-09-09:

| Command from candidate checkout | Observed result |
| --- | --- |
| `npm run lint` | Exit 0 |
| `npm run typecheck` | Exit 0 |
| `npm test -- --runInBand --no-coverage --json --outputFile <outside-checkout-report.json>` | Exit 0 |
| `npm run build` | Exit 0 |
| `npm run validate:manifest` | Exit 0 |
| `npm run validate:core-package` | Exit 0 |
| `npm run validate:package-completeness` | Exit 0 |
| `npm run validate:port-denylist` | Exit 0 |
| `npm run validate:registry-determinism` | Exit 0 |

The JSON full-suite report contains 408 passing suites, 12 skipped suites,
10,130 passing tests, zero failures and 168 existing skips. The initial 10,127
full-suite result is historical. Earlier focused Security/resolver checks passed
29 tests and boundary/bootstrap checks passed 30; the corrected engine/CLI suite
passed 12. These overlap full-suite coverage and are not added to its total. No required
private/provider runtime is treated as passing because its test skipped.
Before/after source inventory SHA-256 is unchanged:
`13f558cdfbca55484b578d318f1f9dc146678bf32b2c6a800f6ad2fe4f90318f`.
The registry bootstrap test did not change its bound registry bytes.

## Security empty-evidence defect and correction

Independent QA reproduced a resolved critical finding with `evidence: []`
incorrectly producing PASS and `evidenceCount: 0`. Root changed only the existing
`.aexos-core/core/security/security-assessment.js`,
`tests/core/security/security-assessment.test.js` and
`tests/integration/security-cli.test.js` to reject empty/sparse evidence arrays.
This enforces the existing assessment task's evidence requirement; it introduces
no new feature or commercial policy. Generated metadata was refreshed afterward.

The original CLI probe now exits 4 with `SECURITY_FINDING_INVALID` and no PASS
output. Independent direct empty/sparse/null-element/whitespace-element cases
reject, and nonempty valid evidence remains accepted. The 12 focused engine/CLI
regressions pass. This validates evidence structure, not the truth of arbitrary
submitted text. QA accepted the scoped correction; whole-package acceptance
still requires the final corrected archives and independent final review.

## Historical package and installed behavior

These pre-correction, pre-document archives were actually packed and installed
in fresh independent
npm-only consumers/caches and audited, with every command exiting zero:

| Package | Version | Files | SHA-256 |
| --- | --- | --- | --- |
| Core | 5.3.0 | 1,776 | `50dcdb723e13ef7f6f0e606a03ca71778a61526f90a70312b9f2e87cfd077d35` |
| Installer | 3.3.9 | 84 | `2328b59ea96d3e80ca08e300d2a574abc4f0c88b58bc4098fc4f8d6292479509` |

Both actual consumer audits reported zero vulnerabilities. Consumer locks bind
the supplied archives and installed payloads match the archives. Their source and installed payloads remained unchanged during those checks.
The later Security engine correction and generated metadata are absent from
that Core archive. These digests/counts are historical, not asserted for the
future final committed corrected package. Final repacking and actual installed
checks are required after copying these reviewed public documents.

The historical Core archive has twelve canonical agents, only Security squad source/projections and
no private Pro executable payload. The source checkout retains baseline paid
squads. Actual Core and paired installer scaffolding copy only Security, then
skip it on repeat and copy it on force; an existing unrelated legacy squad's
bytes remain unchanged through all three operations. Generated installed registry
count is one. Standalone installer imports successfully without Core; requesting
Core-backed scaffolding refuses with no target write. After installing the actual
Core archive alongside it, the same standalone module uses that Core's manifest.

On the earlier archive, actual installed-bin `init <empty-project> --ci` and
subsequent `doctor --json` both exited zero, with 13 PASS / 2 WARN / 0 FAIL / 3 INFO and all 1,776 payload files
preserved. The warnings are visible diagnostics, not suppressed failures or host
activation proof. The separate architecture-required package/version comparison
is described below; Doctor does not certify it.

On the earlier archives, the inherited public fixture also passed all seven
actual installed scenarios:
module/dependency resolution, hostile extraction refusal, empty-trust refusal,
signed local acquisition through actual npm, version refresh, failed-cache
restoration and authority/payload preservation. It uses ephemeral synthetic
review content, local HTTP and literal Windows paths. Reproduce with verified
supplied archives and a new output directory:

```bash
node scripts/e2e/pro-installed-package-smoke.js --core-tgz <absolute-core.tgz> --installer-tgz <absolute-installer.tgz> --output-dir <new-output-directory>
```

On Windows, supply `--npm-cli <absolute-npm-cli.js>` if npm's executable entry
cannot be discovered. This command is present in the selected base; it does not
need private services or local evidence scripts. The existing
`npm run test:e2e:core-free-install` is the public Core pack/scaffold reproducer;
it checks package mechanics, not the compatibility decision below. The current
additional standalone/paired/force/version checks were actually executed in a
separate external fixture, not falsely attributed to that narrower npm script.

## Compatibility failure and publication hold

Security's unchanged `cyryx.minVersion` is 6.0.0. Actual Core 5.3.0 fails normal
SemVer compatibility; synthetic stable 6.0.0 passes and 6.0.0-alpha.1 fails. The
recorded `publicationAllowed` value is false. These isolated version fixtures
prove the comparison only, not future supported runtime execution.

The scaffolder currently copies content without enforcing that minimum itself.
Therefore the successful file-presence/scaffold checks are not supported Security
installation on 5.3.0. Do not publish this boundary candidate or infer release
approval from build/Doctor exit zero. A separately approved version/channel and
actual compatible candidate verification remain required; do not silently lower
the minimum, transplant an alpha version or relabel synthetic results.

## Review and retained limits

Architecture approved the exact base, selected Security closure and operation-time
Core resolver correction. Independent QA accepted the actual empty-evidence
regression fix; no other material finding was identified in its initial review.
Corrected final packages and installed checks, independent QA/PO and DevOps commit/package/normal
PR read-back remain separate. The original 2026-09-04 delivery and combined
2026-09-08 package-hygiene correction retain historical status; their different
archive/test counts are not reused as evidence for this source identity.
No published npm replacement, merged prerequisites, production signing trust,
paid content rights, hosted provider journey, Office or company orchestration
is certified. Existing local/private squads are preserved; the package boundary
is not a deletion or retroactive licensing migration.
