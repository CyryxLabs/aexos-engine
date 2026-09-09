# STORY-AEX-3.7 — Core Free Package Boundary

**Epic:** AEXOS Evolution
**Architecture:** [ADR-AEX-011](adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md)
**Status:** Ready for Review — corrected source gates pass; final corrected packages pending; version blocks publication
**Executor:** root `@dev`; `@devops` isolated candidate/Git
**Quality gates:** independent `@architect`, `@qa`, `@po`

## Story

As the AEXOS publisher, I want one machine-enforced Core Free package boundary
so the public npm artifact contains the orchestration framework, twelve canonical
software-delivery agents and Security squad, without paid squad source or
generated agent projections.

## Existing story and current integration

This is the existing AEX-3.7 scope, integrated on exact signed-installer base
`628ee1cd980a39a27bacf00ecbc6da7ad668b258`, tree
`863f60f4bb553953cbdc6b0d753ed3a041f098b2`, branch `codex/core-free-boundary`.
The original delivery was locally accepted on 2026-09-04. A later package-hygiene
correction was independently accepted on 2026-09-08 in a different combined
checkout: its 1,918-file archive and 10,589-test result are historical evidence,
not results of this isolated candidate. Neither acceptance published a release.

The present assembly preserves the inherited 5.3.0 package version. Security
still declares minimum 6.0.0. **This is a non-publishable boundary candidate.**
Copying Security and a green Doctor prove mechanical installation, not supported
Security execution below its minimum. A synthetic stable-6.0.0 comparison passes;
6.0.0-alpha.1 and actual 5.3.0 comparisons fail. Neither fixture authorizes a
version bump or demonstrates future runtime compatibility.

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | A versioned machine-readable manifest declares Core Free identity, the twelve canonical agent IDs, the single bundled `security` squad, required package paths and protected squad/projection roots. |
| AC2 | `package.json#files` is an explicit allowlist: it includes Core, canonical agents, Security source/projections and core workflow skills, while broad `squads/`, `.claude/commands/` and `.claude/skills/` entries are absent. |
| AC3 | The publish safety gate evaluates actual `npm pack --dry-run --json` output and blocks any non-Security squad under source or Claude projection roots, any `pro/` file, or any missing required Core artifact. |
| AC4 | The Core squad scaffolder defaults to exactly the manifest allowlist even in a full development checkout; private and previously installed local squads remain untouched. |
| AC5 | A real temporary tarball install proves the installed package has all twelve source agents, only Security squad/source projections, a working CLI and an installer that scaffolds only Security. |
| AC6 | Existing 5.x local squads are not deleted or rewritten; this story changes new 6.x artifact contents and Core scaffolding only. |
| AC7 | Tests cover manifest drift, synthetic paid-source/projection leakage, missing Core content, package allowlist and Core-only scaffold behavior. |
| AC8 | Lint, typecheck, full tests, build, package completeness, clean-install smoke and dependency audit pass; no publish, tag, push or Production change occurs. |


The original eight criteria remain intact. AC6's new-6.x artifact consequence
remains a future release boundary: the present 5.3.0 candidate is an isolated
integration, never a replacement 5.x publication. AC8's historical prohibition
on remote operations described the original local delivery; the user's subsequent
explicit integration/PR request authorizes DevOps normal review delivery only.
No tag, publication, merge, release version or Production action is authorized.

## Implementation contract and scope

The versioned manifest and explicit package allowlist bind twelve Core agents,
Security source and its six command/six skill projections. The actual-pack gate
rejects paid source/projections, private Pro runtime, missing Core files and
runtime log/bytecode/cache leakage. Excluding packaged content never deletes the
full source catalog or existing project squads.

Architecture found the previous repository-relative boundary import could break
standalone `@aexos/installer`. The corrected scaffolder loads its boundary lazily
through the existing Core package resolver when Core-backed scaffolding is asked
for. Standalone module loading works without Core; that operation then refuses
with an actionable missing-Core error before writing a target. A paired install
uses its selected installed Core manifest, not a duplicate allowlist or checkout.
`tests/installer/core-squad-resolution.test.js` supplies the narrow regression.

Selected Security CLI help/registration and canonical assessment inputs are
included. Adjacent Office, Workflow, Grok, Cerberus, release-workflow and private
server changes are excluded. Existing tar/YAML fixes and the prior installer
contract remain unchanged. Security-only projections, registries and the install
manifest are generated from the assembled candidate. The source retains all
baseline paid squads; fresh installed squad registry reports only Security.

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

## Tasks and current evidence

- [x] Reconstruct the approved manifest/allowlist and actual-package boundary gate.
- [x] Integrate Security canon/CLI and required generated projections/registries.
- [x] Correct lazy installed-Core resolution and standalone missing-Core behavior.
- [x] Verify pre-correction Core/standalone/paired archives and legacy normal/repeat/force preservation; bind unchanged scaffolder proof separately.
- [ ] Repack corrected committed source and rerun final installed-package checks after the Security correction.
- [x] Run corrected focused/full/source package gates; retain earlier default-init/Doctor and signed-installer package results as historical until final corrected archives are tested.
- [x] Record the real below-minimum version failure without lowering Security's minimum.
- [ ] Independent final candidate QA/PO, exact Git/document/package seal and normal PR read-back.
- [ ] Separately approved compatible release version/channel and actual compatible-package acceptance.

## Verification and boundaries

[Current verification](CORE-FREE-INTEGRATION-VERIFICATION-20260909.md) records
nine successful corrected source gates, 10,130 passing tests, zero failed and
168 explicit skips. The initial 10,127-test run, 29 focused and 30 boundary/bootstrap
checks are historical/overlapping, not additional current full-suite totals.
Earlier archives contained 1,776 Core and 84 standalone files and both consumer
audits reported zero; they predate the Security correction and these documents.

The earlier installed Core and paired scaffolding checks copied only Security and preserved a legacy
sentinel across normal, repeat and forced runs. Standalone missing-Core refusal
leaves the target unwritten. Earlier free init/Doctor exited 0 with 13 PASS / 2 WARN /
0 FAIL / 3 INFO and package bytes unchanged. The inherited portable signed
installer fixture passed seven real installed cases with ephemeral authority on
the earlier archives. Its final corrected-archive run remains required. Scaffolder
source is unchanged by the three-path Security correction; this does not imply
that the old Core archive contains the corrected engine.
No test establishes supported Security execution on Core 5.3.0, paid content
rights, production trust, provider cycles, Office or company orchestration.

Final source/package identities after public-document integration belong in the
external candidate receipt and PR; no archive is claimed to contain its own
future digest. Existing PRs/checkouts remain preserved. Root owns source,
DevOps owns Git/PR and QA independently accepts; PO owns these public documents.

## Exact pre-document file list

The reviewed working-tree diff currently contains 52 source/generated/test paths.
The three public documents are a later explicit documentation delta; derive the
final Git count rather than relabeling this pre-document inventory.

- `.aexos-core/cli/index.js`.
- `.aexos-core/data/entity-registry.yaml`.
- `.aexos-core/data/squad-registry.yaml`.
- `.aexos-core/install-manifest.yaml`.
- `.gitignore`.
- `bin/aexos.js`.
- `bin/utils/validate-publish.js`.
- `package.json`.
- `packages/installer/src/installer/squad-scaffolder.js`.
- `tests/ids/squad-packaging.test.js`.
- `.aexos-core/cli/commands/security/index.js`.
- `.aexos-core/core/security/security-assessment.js`.
- `.aexos-core/data/core-package-boundary.json`.
- `.claude/commands/AEXOS/squads/security/ai-security-lead.md`.
- `.claude/commands/AEXOS/squads/security/appsec-lead.md`.
- `.claude/commands/AEXOS/squads/security/offensive-lead.md`.
- `.claude/commands/AEXOS/squads/security/platform-lead.md`.
- `.claude/commands/AEXOS/squads/security/security-chief.md`.
- `.claude/commands/AEXOS/squads/security/threat-model-lead.md`.
- `.claude/skills/AEXOS/squads/security/ai-security-lead/SKILL.md`.
- `.claude/skills/AEXOS/squads/security/appsec-lead/SKILL.md`.
- `.claude/skills/AEXOS/squads/security/offensive-lead/SKILL.md`.
- `.claude/skills/AEXOS/squads/security/platform-lead/SKILL.md`.
- `.claude/skills/AEXOS/squads/security/security-chief/SKILL.md`.
- `.claude/skills/AEXOS/squads/security/threat-model-lead/SKILL.md`.
- `scripts/e2e/core-free-install-smoke.js`.
- `scripts/validate-core-package.js`.
- `squads/security/CHANGELOG.md`.
- `squads/security/README.md`.
- `squads/security/agents/ai-security-lead.md`.
- `squads/security/agents/appsec-lead.md`.
- `squads/security/agents/offensive-lead.md`.
- `squads/security/agents/platform-lead.md`.
- `squads/security/agents/security-chief.md`.
- `squads/security/agents/threat-model-lead.md`.
- `squads/security/checklists/security-release-gate.md`.
- `squads/security/squad.yaml`.
- `squads/security/tasks/ai-security-review.md`.
- `squads/security/tasks/appsec-review.md`.
- `squads/security/tasks/arbitrate-security-verdict.md`.
- `squads/security/tasks/assess-security.md`.
- `squads/security/tasks/offensive-validation.md`.
- `squads/security/tasks/platform-security-review.md`.
- `squads/security/tasks/scope-security-assessment.md`.
- `squads/security/tasks/threat-model.md`.
- `squads/security/templates/security-assessment-report-tmpl.md`.
- `squads/security/workflows/wf-security-assessment.yaml`.
- `tests/cli/core-package-boundary.test.js`.
- `tests/core/security/security-assessment.test.js`.
- `tests/ids/security-squad-contract.test.js`.
- `tests/installer/core-squad-resolution.test.js`.
- `tests/integration/security-cli.test.js`.

Public documents:

- `docs/framework/epics/aexos-evolution/STORY-AEX-3.7-CORE-FREE-PACKAGE.md`.
- `docs/framework/epics/aexos-evolution/adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md` (unchanged accepted decision).
- `docs/framework/epics/aexos-evolution/CORE-FREE-INTEGRATION-VERIFICATION-20260909.md`.

## QA Results

Independent QA reproduced the real Security false PASS and approved its scoped
correction after an actual CLI exit-4 regression. The nine refreshed source gates
pass 10,130 tests with zero failures and 168 existing skips. Final committed
archives, installed tests, independent integration review and actual Git/PR
delivery remain pending at freeze; earlier archive evidence is historical.
Publication remains blocked by the explicit actual version mismatch, even if
local implementation is accepted. No external gate is waived by this document.
