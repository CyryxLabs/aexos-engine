# Story AEX-4.11: Truthful npm onboarding and Portuguese/Spanish entry docs

| Field | Value |
| --- | --- |
| Story ID | AEX-4.11 |
| Status | Done — independently approved documentation-only scope |
| Epic | AEXOS Evolution |
| Executor | `@dev` (documentation) |
| Quality gate | Independent `@qa`, `@po` content coherence |
| Quality gate tools | Public npm metadata and clean install/help evidence; Markdown links and EN/PT/ES parity |

## Story

As a new AEXOS user reading English, Portuguese or Spanish, I want one accurate npm getting-started path and clear release/distribution labels, so that I can reach free Core first value without mistaking unpublished source, paid extensions or a proposed commercial transition for the installed product.

## Context and scope

Current README Start Here already uses `npx @aexos/core`. Its header still contains a website hero, a hardcoded 5.3.0 badge, catalog-wide agent counts and proposed paid-only language. Accepted ADR-AEX-011 instead defines free Core and private authenticated paid extensions. The user's explicit direction is no hero/price on primary Start Here, one npm path, and main PT/ES documentation. The attached diagnosis is a historical snapshot; confirm public npm state before making version or availability claims.

[AUTO-DECISION] AEX-4.11 is available. Correct only primary documentation and localized entry paths, with no product code, price, legal grant, website redesign, publication or release action. Root requested this as a Ready follow-up; implementation starts in a later continuation.

## Acceptance criteria

- [x] AC1: README leads with concise product identity and visible Start Here using `npx @aexos/core`, followed by commands matching the actual supported init/help path. Remove the website hero from the primary onboarding/header and omit prices or paid sales gates there. GitHub installation is not the default. Preserve the existing working npm command rather than claiming its absence.
- [x] AC2: Verify live npm package metadata/dist-tags and a clean published-package init/help flow before documenting current stable/public behavior. Clearly separate that verified public release from local `6.0.0-alpha.1` source or another then-current unpublished candidate. Replace/remove stale hardcoded badges and counts unless their scope and evidence are accurate. Do not present local fixes, unreleased Office commands or future availability as already published. Record commands, timestamp, exact package version and results.
- [x] AC3: Align current commercial explanation with ADR-AEX-011: free Core first value and privately distributed paid extensions, with actual paid availability qualified by current certification. Preserve historical users' shipped license terms without inventing a new grant or retroactive restriction. Remove contradictory future paid-only promises; introduce no prices, seller terms or unsupported superiority/autonomous-company claims.
- [x] AC4: Provide mutually linked English, Portuguese and Spanish main entry documents (prefer `README.md`, `README.pt-BR.md`, `README.es.md` unless an existing canonical location is discovered). All three cover the same prerequisites, npm init/doctor/first-value commands, selected-host optionality, public-versus-source release distinction, Core/paid boundary and next documentation links. Translate explanations naturally; leave commands/package identifiers intact. This does not require translating the whole framework.
- [x] AC5: Check internal links/anchors, equivalent EN/PT/ES command blocks and release/distribution statements; verify referenced commands against actual help and distinguish published defects from source corrections. Record targeted documentation checks and independent review. No installation success or Doctor-green claim may exceed observed evidence. No source/package/lockfile or provider mutation is included.

## Tasks and ownership

- [x] Confirm current README findings and available story ID; define bounded criteria.
- [x] Reverify public npm/release/help facts and choose one matching first-value sequence (AC1-AC2).
- [x] Correct primary README onboarding and commercial/release wording (AC1-AC3).
- [x] Add/update PT/ES main entry documents with reciprocal language links (AC4).
- [x] Verify links, commands and semantic parity; record independent review (AC5).

Owner edits only README and the two localized entry documents, plus a focused evidence receipt. Preserve unrelated sections unless they contradict the corrected onboarding claims. No brand asset production or source behavior changes. Brand's seven missing config-extension keys require separate semantic review and are excluded.

## Guidance, risks and review

Read [diagnostic ledger](../../../../artifacts/commercial-readiness-20260908/diagnostic-status.md) and [ADR-AEX-011](adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md#decision). The attachment at `C:/Users/ppetr/.codex/attachments/710e4de9-1aea-41d2-8b8e-e41da84aba91/pasted-text-1.txt` supplies hypotheses and user context, not proof of current release state. [Accumulated context](accumulated-context.md) requires preserving dirty work and evidence boundaries.

Primary risk is conflating current source with npm or translating different product promises. Mitigate with a shared verified command sequence and explicit release identity. Roll back only these documentation edits; no infrastructure rollback is needed. Do not invent a “green” published result when public npm still contains a known defect; document the observed limit and separate source evidence.

**CodeRabbit Integration:** Documentation integration, low complexity/risk; `@dev` prepares, independent `@qa` reviews. Pre-commit automated review when available, otherwise record graceful degradation and independent review; `@devops` pre-PR only if requested. No deployment gate. Self-healing: dev light (2 iterations/15 minutes, critical), QA full (3/30, critical/high), DevOps report-only. Focus: accurate claims, literal commands, links and translation parity.

## Story validation and file list

Brownfield completeness/safety checks and applicable story-draft checklist categories pass. Public npm facts are deliberately an implementation verification task, not invented assumptions. Ready for later implementation; no product/release acceptance claimed.

- Created: this story.
- Planned: `README.md`, `README.pt-BR.md`, `README.es.md` (or verified existing localized entry locations), focused evidence receipt.

## Dev Agent Record

Implemented 2026-09-08, documentation only. Primary README now opens with npm
Start Here and reciprocal language links. Removed the website hero, unscoped
catalog counts, fixed version badge and contradictory future paid-only promises.
Preserved the deeper English source reference, labeling it as source rather than
published capability. Added natural PT-BR and ES entry documents with the same
prerequisites, four literal command blocks, installation distinction, host
optionality, public defects, release identity and Core/private-paid boundary.

Fresh public registry metadata: latest/version 5.3.0, Node >=18, npm >=9,
integrity `sha512-IzCaQQXKQfBq/oUMzmFb1YnrLzM9XOPUapvP52l/d9stkr7LlxEt2y/wyzzkXCi86HplxefveFFdiOrH5NdJyw==`.
The checkout remains 6.0.0-alpha.1, not published by this task.

Actual isolated npm execution used a fresh cache under
`C:/AEXOS-LOCAL-TESTS/aex411-public-Hf9e70/`. Version, init help, install help and
doctor help all exited 0. Clean public default non-TTY init `hello-aexos` exited 0
and created 12 canonical agent files; Doctor exited 1 with 11 PASS / 3 WARN /
4 FAIL. The four reported checks match the diagnostic hypotheses, and the banner
incorrectly printed `Agents: ⨉`. Public init help still documents GitHub; local
source init help documents npm. Both differences are explicit in every language.
The exact npx package-inferred short form was also verified for version/init-help,
separately from the npm-exec package/binary form used in the clean init fixture.
No global install, provider credentials, paid account or source mutation by the
public fixture was required. Host greeting/activation is not claimed by CLI tests.

Receipts and commands: `artifacts/commercial-readiness-20260908/aex-4.11/`
contains public npm metadata, `published-help-receipt.json`,
`published-init-receipt.json`, `short-form-receipt.json` and preserved CLI logs.
`node artifacts/commercial-readiness-20260908/aex-4.11/check-entry-docs.cjs`
passes 71 internal links/anchors and four identical command blocks in EN/PT/ES;
`docs-check-receipt.json` binds the exact documentation hashes. Semantic content
review remains independent from these mechanical checks.

File list: `README.md`, `README.pt-BR.md`, `README.es.md`, this story and the
evidence directory above. No product source, package.json, lockfile, legal license
text or provider configuration changed. The concurrent AEX-4.12 full source gate
captured the earlier README and explicitly records this authorized documentation
delta; those full tests are not claimed to cover the later README bytes. This
low-impact documentation change uses targeted verification and independent QA.

Final DoD: independent QA APPROVED after correcting the retained first-session
paragraph that conflated missing greeting with installation failure and qualifying
optional CEO examples. Final README SHA-256:
`a6fb3284b8b39ad0c086b253dd0d88e0ef9255b0a56d9dce58f5326f2be39839`.
The 71-link check and EN/PT/ES command parity passed again; no product code or
new dependencies were added. This is documentation acceptance, not publication.

## QA Results

**APPROVED — documentation only.** Independent review verified EN/PT/ES semantic parity, 71 local links/anchors, four identical entry command blocks and final file hashes against `docs-check-receipt.json` at `2026-09-08T17:19:58.911Z`. The remaining first-session contradiction was corrected: missing host greeting no longer proves incomplete installation; optional CEO routing explicitly requires that squad.

Raw public npm/help/init evidence confirms 5.3.0, init exit 0 with 12 canonical agents, Doctor exit 1 with the four documented failures, incorrect agent banner and stale GitHub help. Local default-init/Doctor success is separately bound to the accepted 6.0.0-alpha.1 package evidence; it is not attributed to npm or treated as user host activation proof. Free Core, private optional paid extensions and shipped-license boundaries agree across the three languages. No hero, price or paid gate exists in the primary entry.

Accepted English SHA-256: `a6fb3284b8b39ad0c086b253dd0d88e0ef9255b0a56d9dce58f5326f2be39839`; localized hashes and full review: `artifacts/commercial-readiness-20260908/aex-4.11/qa.md`. No source/runtime/provider changes or release certification are included. The published Doctor defect remains open at the release layer; documenting it accurately does not fix npm. Lifecycle/checklists remain with the lead.

## Change log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 1.0 | Ready documentation-only npm/release truth and PT/ES entry parity. | Themis / `@po` |

## Isolated onboarding integration disposition — 2026-09-09

The earlier Done status accepts the local documentation correction only. Actual
Slice 2 delivery now begins with onboarding-only integration against the reviewed
5.3.0 first-value stack: `README.md`, `README.pt-BR.md`, `README.es.md`, the accepted
[distribution ADR](adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md), and public-safe
copies of this existing story and its verification. This reuses the original
criteria; it neither creates another story nor marks a PR or publication complete.

Bind advertised commands and features to actual installed help. Distinguish the
historical 5.3.0 candidate payload from the unreleased 6.x distribution design in
all three languages; an architectural decision is not shipped package evidence.
Preserve the primary npm entry, no hero/price/paid gate, truthful release status,
EN/PT-BR/ES parity and complete links within the actual selected public files.
Existing baseline IDE guidance and unrelated documents remain unchanged.

The current release SOP depends on accepted AEX-4.16 workflow implementation,
which is absent from this onboarding base. Defer `docs/guides/release-procedure.md`
and the release integration plan to the actual AEX-4.16 workflow integration.
The earlier Slice 2 inventory is not authority to transplant a mismatched SOP.
This removes a dependency cycle without closing or abandoning release traceability.
Root/dev owns the bounded documentation adaptation; DevOps owns isolated assembly
and normal PR; QA checks exact commands, semantics and selected-link closure.
Candidate construction, final verification and actual PR read-back remain open.
