# Story ACL.9: Squad host compatibility and accurate content inventory

| Field | Value |
| --- | --- |
| Story ID | ACL.9 |
| Epic | AEXOS Commercial Licensing |
| Status | Done — bounded content portability correction independently approved |
| Executor | `@dev` |
| Quality gate | Independent `@qa` |
| Quality gate tools | Source/installed dependency audit; manifest inventory comparison; repository quality gates |
| Dependencies | Existing accepted Core installation from AEX-4.2/AEX-4.3; existing Products, Marketing and Ops content |

## Story

As an AEXOS user working through the CLI with my chosen host, I want the existing Products, Marketing and Ops content to reference available framework governance and describe its actual inventory, so that using the content does not require an unselected Claude installation or misrepresent what is included.

## Context and scope

The owner explicitly requested remaining sale-readiness blockers and clean-machine CLI correctness. The current content audit found 13 unconditional `.claude/CLAUDE.md` context references among 19 canonical agent files: Products chief, all seven Marketing agents and all five Ops agents. The same reference appears in the three squad manifests. A default CLI installation can omit `.claude/`; the packaged `.aexos-core/constitution.md` is already an installer core file. Products README also cites a Claude-only authority path and incorrectly describes seven tasks and empty supporting directories.

This is a bounded content compatibility correction. It enables honest evaluation of existing content; it does not approve its commercial license, price, paid packaging or sale. ACL.8 retains authenticated artifact delivery, ACL.5 hosted/provider certification and ACL.6 promotion. The older epic's proposed paid-only migration remains unapproved for this correction; preserve free Core first value and the current public/private boundary documented in ACL.8.

[AUTO-DECISION] Which story ID and scope? → ACL.9 was available at discovery. Use the owner's defect-remediation authorization and the verified content findings; no new product capability, pricing, licensing rights, TGZ, website, payment or production change is included.

[AUTO-DECISION] Which governance context replaces Claude-only context? → Reuse `.aexos-core/constitution.md`, already packaged by `packages/installer/src/installer/aexos-core-installer.js`. Keep existing framework configuration/entity-registry dependencies, applicable host/project instructions and authority boundaries. Do not create placeholder host files or silently manufacture missing required Core context.

[AUTO-DECISION] How should host mirrors be verified? → Use the existing projection transformer in a disposable fixture project for the 13 changed canonical agents. Preserve wrappers/frontmatter and prove regenerated content inherits the correction. Keep the repository source diff to 13 agents, three manifests and one README; no global workspace sync or unrelated host drift. Existing workspace mirrors are not certified as refreshed by this fixture check.

## Acceptance criteria

- [x] AC1: The 19 canonical agent definitions under `squads/products/agents/`, `squads/marketing/agents/` and `squads/ops/agents/` contain no unconditional `.claude/CLAUDE.md` context dependency. Replace the 13 verified references with the existing `.aexos-core/constitution.md`, using an accurate comment. The six unaffected Products specialists remain unchanged unless the same verified defect is found. Preserve commands, task routing, methodology attribution, inputs/outputs, core-config and entity-registry references.
- [x] AC2: The three corresponding `squad.yaml` manifests use the same host-neutral constitutional context. Products README points Agent Authority to Constitution Article II. Applicable existing host/project instructions remain applicable when present; missing optional Claude files never become required, and missing required framework files must not be disguised as valid context.
- [x] AC3: Products README accurately describes the existing manifest and filesystem inventory: 7 agents, 15 tasks, 2 workflows, 12 checklists, 19 templates and 10 data files at discovery. Remove the stale empty-directory/non-live-artifact statements. Reconcile README statements with current files and manifest entries before acceptance; do not add invented content to satisfy the counts or alter methodology/capability claims.
- [x] AC4: Generate derived host projections of the 13 affected agents in a disposable fixture using the existing transformer and verify corrected canonical dependencies without stale mandatory Claude paths. Preserve host-specific wrappers. Do not globally regenerate workspace host trees or move canonical logic into a host directory. If selected existing workspace mirrors are refreshed as a follow-up, record their exact scope separately; fixture success alone does not certify all workspace mirrors.
- [x] AC5: Record a read-only content/dependency check against a clean accepted default CLI installation with no `.claude/` directory: Core constitution exists, changed canonical/installed content references resolve to it, and the selected source content/mirrors do not require Claude context. Exercise the same content inspection where Claude context exists to demonstrate compatibility. This validates dependency portability, not native execution or provider parity; record that limit explicitly. Do not delete an existing user's host directory to create the test condition.
- [x] AC6: Record exact scope and commands/results for source parsing, Products inventory consistency, selected projection parity and `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus `npm run validate:core-package`. Independent review confirms existing CLI/free-first-value and agent authority remain intact. Local source/installed checks cannot close hosted purchase, immutable artifact, legal/IP, signing or release gates.

## Tasks / subtasks

- [x] Verify source findings, available story ID, Core constitution packaging and actual Products inventory; validate this bounded story draft (AC1-AC6).
- [x] Correct 13 canonical agent dependencies and three manifest references; preserve unaffected content (AC1-AC2).
- [x] Correct Products README inventory and constitutional authority reference (AC2-AC3).
- [x] Generate and inspect affected projections in a disposable fixture using the existing transformer, recording exact fixture paths and preserving wrappers (AC4).
- [x] Record source/manifest/installed dependency evidence for absent and present Claude context; document any unresolved dependency without replacing it with fabricated state (AC5).
- [x] Run quality gates, record exact evidence and obtain independent review before completion (AC6).

## Dev notes

Canonical agent targets:

- Products: `products-chief.md`.
- Marketing: `analytics-lead.md`, `brand-lead.md`, `content-lead.md`, `demand-lead.md`, `funnel-lead.md`, `marketing-chief.md`, `offer-lead.md`.
- Ops: `flow-lead.md`, `incident-lead.md`, `lean-lead.md`, `ops-chief.md`, `reliability-lead.md`.

Dependencies live inside each agent's YAML block. Use existing Markdown/YAML formats; no dependency, API, environment variable, executable runtime or new data model is needed. Existing projections can include `.claude/commands/AEXOS/squads/{squad}/{agent}.md`, `.claude/skills/AEXOS/squads/{squad}/{agent}/SKILL.md` and `.agents/skills/AEXOS/squads/{squad}/{agent}/SKILL.md`; discover their actual presence and any other existing mirrors rather than assuming these examples are exhaustive. Constitution Articles I, II and XI retain CLI authority, agent authority and canonical squad portability.

Products manifest `components` declares agents/tasks/workflows/checklists/templates. Its data inventory must be compared to actual `squads/products/data/` files because `components.data` is not currently declared; this story does not add a manifest schema field. At discovery the contents are complete enough to count, which does not establish commercial rights or promise autonomous execution.

References:

- [Constitution](../../../../.aexos-core/constitution.md), Articles I, II and XI: authority and portability requirements.
- [ACL.8 context and scope](STORY-ACL.8-AUTHENTICATED-PRIVATE-ARTIFACT-DELIVERY.md#context-and-scope): current distribution boundary and separate provider gates.
- [Accumulated context](../aexos-evolution/accumulated-context.md#2026-09-06-audit-and-experience-remediation): preserve concurrent work and distinguish source/installed/provider evidence.
- `packages/installer/src/installer/aexos-core-installer.js`: existing required `constitution.md` core file.

## Testing and risk

Risk is low and limited to declarative dependency/documentation drift. The main regression risk is changing authority or modifying unrelated generated files. Compare each affected YAML block before/after, parse the manifests, inspect actual referenced paths and report selected projection differences. Existing source checks and bounded verification receipts are sufficient; do not add tests that merely snapshot replacement prose. Use real installed file evidence for the absent-host condition and identify the accepted Core version/hash used.

Rollback consists only of reverting this story's exact dependency substitutions, README edits and corresponding selected mirror updates, preserving all pre-existing dirty work. No database, provider, licensing state or environment changes are needed.

## CodeRabbit Integration

**Story type:** Integration / documentation. **Complexity:** Low. **Risk:** Low. **Integration points:** canonical squad dependencies, three manifests, Products inventory, existing selected host projections.

**Agents:** `@dev` implements; independent `@qa` reviews portability and scope; `@devops` alone handles any later PR/push.

- [x] Pre-commit: CodeRabbit CLI unavailable on this host; independent review completed under the existing graceful-degradation policy. No CodeRabbit pass is claimed.
- [ ] Pre-PR: `@devops` checks accepted evidence and exact scoped diff if a PR is requested; no PR is created by this story-authoring task.
- Pre-deployment: N/A; no deployment or release in scope.

**Self-healing:** `@dev` light mode, at most 2 iterations/15 minutes for critical findings; independent `@qa` full mode, at most 3 iterations/30 minutes for critical/high findings; `@devops` reports only. Focus on regression prevention, canonical-to-derived consistency, truthful documentation, rollback isolation and missing-context handling. Do not label an unavailable CodeRabbit run as passed.

## Story validation

Applied `.aexos-core/product/checklists/story-draft-checklist.md` and the brownfield task's final completeness, safety and information-gap checks. All applicable items pass: goal/context, technical guidance, reference effectiveness, self-containment, testing guidance and CodeRabbit planning. API/data-model/environment-variable items are N/A because this correction changes none. Status **Ready**, clarity **9/10**, no implementation-blocking information gaps. This is story readiness, not an implementation QA verdict.

## File list

- Created: `docs/framework/epics/aexos-commercial-licensing/STORY-ACL.9-SQUAD-HOST-COMPATIBILITY-AND-INVENTORY.md`.
- Planned source changes: 13 canonical agent files listed above; `squads/{products,marketing,ops}/squad.yaml`; `squads/products/README.md` (17 source files). Generated projection verification stays in a disposable fixture. Implementer records exact changed and evidence paths after execution.

## Dev Agent Record

Implemented the 17 planned source changes: the thirteen listed agents, the three
manifests and Products README. Each agent/manifest diff changes only the context
dependency; the six remaining Products agents are unchanged. README corrects the
task/support-file inventory and points authority to Constitution Article II.

`node scripts/validate-squads.js`: 22 squads, zero errors/warnings.
`node artifacts/commercial-readiness-20260908/verify-acl9-content.cjs`: PASS,
19 parsed agents, 26 projections of the 13 changed agents generated with the
existing transformer. Receipt `acl9-content-receipt.json` includes all 17 source
hashes and the disposable fixture path. The accepted default CLI project lacks
Claude context and contains constitution SHA-256
`764460fe81dcf58a17035fc2227cb7f80bf681723ab630b1553bbbafedde1761`, matching the
repository where Claude context is present. Neither existing project is altered
by this inspection. No workspace-wide mirror regeneration is claimed.

Exact aggregate gate command:
`node artifacts/commercial-readiness-20260908/run-gates.cjs core`.
Lint/build/typecheck/test/package-boundary all passed, exit 0. The fresh test
run ended 2026-09-08T04:06:05Z with 10,524 passing tests, zero failures, 163
explicit skips and 440 passing suites. Package boundary completed 04:06:10Z.
Evidence/tooling added: `artifacts/commercial-readiness-20260908/verify-acl9-content.cjs`
and `acl9-content-receipt.json`. The commercial inventory is refreshed separately
to bind its review proposal to these corrected source bytes; legal/provider and
paid installation acceptance remain open.

## QA Results

Independent `@qa`: **APPROVED**, bounded ACL.9 only. Reviewed all 17 source
diffs, parsed 19 agents and three manifests, independently checked current
inventory and all 26 generated projection files, verified the installed
constitution without any Claude directory, and read the fresh aggregate gate
receipts. Report: `artifacts/commercial-readiness-20260908/acl9-qa.md`.
No material findings remain in this scope. This verdict does not refresh every
workspace mirror, certify provider execution or approve sale/release.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Bounded story from verified clean-host content and inventory findings; Ready for implementation. | Themis / `@po` |
