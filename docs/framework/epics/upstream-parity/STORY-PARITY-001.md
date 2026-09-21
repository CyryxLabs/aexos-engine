# PARITY-001 — Recover and verify the complete upstream base

Status: In progress

## Source and scope

Owner request: AEXOS must retain the complete AIOX base, preserve AEXOS identity and extensions, and demonstrate behavior in independently installed artifacts. The execution specification is `AEXOS_PARIDADE_TOTAL_AIOX_PROMPT_EXECUCAO.md` supplied by the owner. This story records implementation, not acceptance by assertion.

## Acceptance criteria

- [x] Freeze current upstream and candidate baselines; preserve both original trees and provenance.
- [ ] Reconcile the entire upstream tree and discover capabilities and connections independently of passing tests.
- [x] Keep the existing multi-IDE `validate:parity` contract and add upstream inventory, diff, test, installed, and evidence verification commands.
- [x] Combine SYNAPSE package fallback with AEXOS manifest and path handling; verify context and session behavior.
- [ ] Recover the complete Grok generator/validator/integration contract and verify packaged behavior.
- [ ] Repair all required functional deltas without overwriting AEXOS extensions or copying inherited defects.
- [ ] Verify clean installation, reinstall, migration, update, rollback, activation, workflows, authorization and integrations from real tarballs outside this checkout.
- [x] Record the owner's exact private-Pro exclusion; keep public Pro interfaces and other unavailable hosts/providers mandatory and unverified.
- [x] Reject empty, incomplete, stale, mismatched or tampered evidence and upstream drift.
- [ ] Run focused regression tests and repository quality gates; record exact candidate digest and artifact hashes.

## Execution record

See `docs/parity/CONTINUATION.md`, `baseline-lock.json`, `delta-register.md`, and `acceptance-evidence.json`. Local execution output is retained outside the public source tree. Paid CI, commercial-license changes, global tool changes and external model tests are not authorized by this story.

### Owner-directed 1.0 publication

On 2026-09-21 the owner directed the sprint to close without further audit expansion, restart AEXOS at version 1.0.0, and replace the public GitHub project. The owner explicitly requested that the former repository be archived without public visibility. Preserve the former repository, branches and pull requests in a private archive; publish the validated source with new Git history at `CyryxLabs/aexos-engine`. Repository publication and a GitHub release are authorized. npm publication remains a separate explicit action; pushing a GitHub tag must not implicitly publish registry packages.

The new tree retains framework capabilities, AEXOS extensions, licenses and upstream provenance. It excludes local runtime sessions, caches, diagnostic logs and previous distribution binaries. Verify the actual transition from the released 5.3.0 artifact to the explicitly selected 1.0.0 artifact, including configuration and custom-file preservation. This intentional version-line restart must not be described as an automatic semver upgrade.

## File list

- This story
- `docs/parity/` (baseline, inventory, evidence and continuation)
- `scripts/parity/` (upstream-specific checks)
- `tests/parity/` (behavior, evidence and installed-artifact contracts)
- `.aexos-core/core/synapse/runtime/hook-runtime.js`, `.claude/hooks/synapse-engine.cjs`
- `.aexos-core/infrastructure/scripts/grok-skills-sync/`, `.aexos-core/infrastructure/templates/grok-hooks/`, `.aexos-core/product/templates/ide-rules/grok-rules.md`, `.grok/`
- `.claude/commands/AEXOS/scripts/`, `.claude/templates/`
- `.claude/hooks/enforce-git-push-authority.cjs` (shared canonical policy, public helper compatibility and fail-closed transport)
- `packages/installer/src/wizard/{index,ide-selector,ide-config-generator}.js`
- `packages/installer/src/config/{configure-environment.js,ide-configs.js,templates/core-config-template.js}`
- `packages/installer/src/merger/strategies/yaml-merger.js`, `packages/installer/src/updater/index.js`
- `packages/installer/src/installer/brownfield-upgrader.js` (shared write-ahead metadata serialization)
- `packages/installer/src/installer/synapse-installer.js` (operational domain distribution and transactional missing-only installation)
- `.aexos-core/cli/commands/config/index.js` (lossless migration correction)
- `.aexos-core/core/config/{config-resolver.js,migration-compat.js,schemas/local-config.schema.json}` (migration-only literal null compatibility; ordinary layered deletion unchanged)
- `.aexos-core/core/doctor/{checks/settings-json.js,fix-handler.js}` (explicit protection configuration diagnosis)
- `.aexos-core/data/entity-registry.yaml`, `.aexos-core/install-manifest.yaml`
- `package.json`, `package-lock.json`, `.gitignore`
- `docs/{en,es,pt,zh}/`, `docs/legal/upstream-aiox-license.txt`
- `docs/guides/config-migration-guide.md` (actual five-level hierarchy and literal-null compatibility)
- Existing affected tests under `tests/{installer,integration,unit,updater,config}/` and `packages/installer/tests/unit/`
- `tests/pro-wizard.test.js`, `tests/wizard/integration.test.js` (controlled denial and current installer contracts)
- `.aexos-core/core/synapse/utils/atomic-write.js` (Windows replacement without pre-deletion)
- `.aexos-core/development/scripts/{decision-context,decision-recorder,dev-context-loader,greeting-builder,greeting-preference-manager}.js` (session isolation, current context, configuration integrity and bounded activation)
- `.aexos-core/infrastructure/scripts/{project-status-loader,cicd-discovery,pr-review-ai}.js` (shell-free local reads, supported CI commands and truthful security exit)
- `.aexos-core/product/templates/statusline/`, `.claude/setup/` (selective statusline/setup recovery)
- `packages/installer/src/wizard/{i18n,questions,pro-setup,ide-state-snapshot}.js` (locale completeness, archive/readback and recovery journaling)
- `packages/installer/src/installer/enterprise-upgrade-manifest.yaml` (preserved Grok extension surfaces)
- `tests/{agents/backward-compatibility,integration/npx,integration/greeting-system-integration,integration/greeting-preference-integration,integration/agent-activation-performance,integration/performance,integration/decision-logging-yolo-workflow,performance/decision-logging-benchmark,wizard/index}.test.js` (reactivated meaningful isolated consumers)
- `.aexos-core/core/registry/{build-registry.js,service-registry.json}`, `.aexos-core/core/manifest/manifest-generator.js`, `tests/helpers/isolated-manifest-project.js` (unique worker identities and isolated manifest consumers)
- `.aexos-core/development/{agents/qa.md,tasks/add-tech-doc.md,scripts/add-tech-doc.js}` (canonical dependency and validated preset creation)
- `.aexos-core/core/orchestration/{workflow-executor,workflow-orchestrator,context-manager,subagent-prompt-builder,agent-invoker,master-orchestrator,bob-orchestrator,brownfield-handler,greenfield-handler}.js`, `executors/epic-{3,4,5,6}-executor.js` (real dispatch, artifacts, human decisions, atomic persistence and truthful state propagation)
- `packages/aexos-install/{bin/aexos-install.js,src/installer.js,src/dep-checker.js,src/edmcp/index.js}` (actual execa/scoped package runtime, profile preservation and migration dependency)
- `.aexos-core/{infrastructure/scripts/aexos-validator.js,utils/aexos-validator.js}`, `scripts/e2e/installed-skills-smoke.js` (executable CI entrypoints and Windows argument-safe npm invocation)
- `tests/installer/{v21-path-validation,add-tech-doc}.test.js`, `tests/core/agent-invoker.test.js`, affected orchestration and auxiliary installer suites; `jest.config.js` (reactivated suites; native Node tests retain their proper runner)
- `bin/aexos.js`, `packages/installer/src/installer/install-footprint.js` (managed Grok/template/Claude-command removal, dry-run and customization preservation)
- `.aexos-core/core/errors/{aexos-error,index,serializer}.js`, `.aexos-core/core/mcp/os-detector.js`, `.aexos-core/core/health-check/checks/project/{aexos-directory,index}.js`, `tests/parity/public-interface-compatibility.test.js` (canonical public exports, legacy compatibility and unique check registration)
- `.aexos-core/core/utils/git-head.js`, `tests/parity/git-head.test.js`, `tests/helpers/decision-performance-scenario.js` (fresh Git identity and actual runtime overhead)
- `.aexos-core/infrastructure/scripts/tool-{resolver,validation-helper,helper-executor}.js`, `tests/parity/tool-executable-knowledge.test.js` (opt-in public executable knowledge)
- `packages/installer/{package.json,src/licensing/commercial-license-gate.js}`, `packages/aexos-pro-cli/{package.json,bin/aexos-pro.js,src/error-bridge.js}`, `compat/aexos-core/`, package-local license notices (standalone distribution)
- `.aexos-core/cli/index.js`, `.aexos-core/cli/commands/generate/index.js`, `.aexos-core/core/graph-dashboard/cli.js`, `tests/parity/public-command-routing.test.js` (all registered public CLI routes, complete template context, machine-readable output and actual saved document)
- `.aexos-core/product/templates/engine/{index,loader,validator}.js`, `tests/parity/installed-template-resolution.test.js` (installed template/schema fallback with strict consumer override precedence)
- `tests/cli/pro-buyer.test.js` (public argument/error contracts run without private Pro)
- `.aexos-core/core/doctor/checks/{rules-files,claude-md,hooks-claude-count}.js`, Doctor IDE applicability helper and `tests/parity/doctor-host-awareness.test.js` (selected-host diagnosis without fabricating Claude configuration)
- `.aexos-core/development/workflows/README.md` (replace inherited nonexistent setup command with supported public installer and Doctor routes)
- `.aexos-core/development/scripts/squad/{squad-downloader,squad-publisher}.js`, distribution task guides and focused squad regressions (validated staged download, contained paths, token origin boundaries, catalog preservation and truthful publication subprocess handling)
- `.aexos-core/infrastructure/scripts/tool-health.js`, resolver health/discovery contracts, `infrastructure/tools/{README.md,cli/llm-routing.yaml}` and focused health/upstream-tool tests (explicit bounded health, all packaged declarations and preserved operational metadata)
- `.aexos-core/development/tasks/` and task-path regressions (verified relocations, actual named exports and truthful host-guided bindings for inherited nonexistent metadata wrappers; substantive task contracts remain required)

## Completion sprint

This sprint adds durable updater restart/dependency recovery, locale and full localized operational-content restoration, exact source-path contracts, transactional IDE recovery, public Pro-client readback, all-agent installed activation and corrective divergences for inherited data-loss and CI failures. The only npm-published AEXOS baseline discovered on 2026-09-21 is 5.3.0; historical-version fixtures must remain explicitly synthetic. The actual published artifact is separately integrity-pinned for an installed replacement/migration scenario. Final acceptance remains tied to the new source digest, full required checks and installed execution records, not the number of files or passing isolated tests.

## Acceptance boundary

Implementation and measured local journeys do not satisfy the remaining unchecked criteria. The exact current digest, command results, real tarball, per-journey evidence, unresolved source obligations and next actions belong in `docs/parity/PARITY-REPORT.md` and `acceptance-evidence.json`. No total acceptance is claimed by this story.
