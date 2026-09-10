# Story AEX-4.11: Truthful npm onboarding and Portuguese/Spanish entry docs

| Field | Value |
| --- | --- |
| Story ID | AEX-4.11 |
| Status | Ready for Review — selected documentation checks passed; final Git/PR acceptance recorded separately |
| Epic | AEXOS Evolution |
| Executor | `@dev` documentation; `@devops` isolated Git/PR |
| Quality gates | Independent `@qa`, `@po` content coherence; selected links, commands and translation parity |

## Story

As a new AEXOS user reading English, Portuguese or Spanish, I want one accurate
npm getting-started path and clear release/distribution labels, so I can reach
free Core first value without mistaking unpublished source, paid extensions or
a proposed commercial transition for the installed product.

## Integration context

The original documentation-only correction was locally accepted on 2026-09-08.
This copy records its isolated onboarding integration on the first-value fix in
[PR #4](https://github.com/CyryxLabs/aexos-engine/pull/4), exact base
`d848c7f58ad4a8da3afc93398ec608be4bf4d23a`, whose manifest remains 5.3.0.
The npm 5.3.0 artifact and that locally corrected source share a version label
but differ in content and behavior. Their evidence must remain separate.
Original local acceptance is not final acceptance of this new documentation
identity, a merged PR or a public release.

The [distribution decision](adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md)
defines the intended 6.x free-Core/private-paid boundary. This documentation
candidate preserves the historical 5.3.0 allowlist and does not implement that
boundary, certify paid delivery or change any copy's shipped license.

## Acceptance criteria

- [x] AC1: README leads with concise product identity and visible Start Here using `npx @aexos/core`, followed by commands matching the actual supported init/help path. Remove the website hero from the primary onboarding/header and omit prices or paid sales gates there. GitHub installation is not the default. Preserve the existing working npm command rather than claiming its absence.
- [x] AC2: Verify live npm package metadata/dist-tags and a clean published-package init/help flow before documenting current stable/public behavior. Clearly separate that verified public release from local `6.0.0-alpha.1` source or another then-current unpublished candidate. Replace/remove stale hardcoded badges and counts unless their scope and evidence are accurate. Do not present local fixes, unreleased Office commands or future availability as already published. Record commands, timestamp, exact package version and results.
- [x] AC3: Align current commercial explanation with ADR-AEX-011: free Core first value and privately distributed paid extensions, with actual paid availability qualified by current certification. Preserve historical users' shipped license terms without inventing a new grant or retroactive restriction. Remove contradictory future paid-only promises; introduce no prices, seller terms or unsupported superiority/autonomous-company claims.
- [x] AC4: Provide mutually linked English, Portuguese and Spanish main entry documents (prefer `README.md`, `README.pt-BR.md`, `README.es.md` unless an existing canonical location is discovered). All three cover the same prerequisites, npm init/doctor/first-value commands, selected-host optionality, public-versus-source release distinction, Core/paid boundary and next documentation links. Translate explanations naturally; leave commands/package identifiers intact. This does not require translating the whole framework.
- [ ] AC5: Check internal links/anchors, equivalent EN/PT/ES command blocks and release/distribution statements; verify referenced commands against actual help and distinguish published defects from source corrections. Record targeted documentation checks and independent review. No installation success or Doctor-green claim may exceed observed evidence. No source/package/lockfile or provider mutation is included.


These original criteria are retained without replacing their product scope.
The reference to alpha source in AC2 is historical context; this isolated
candidate is the separately identified 5.3.0 PR #4 stack. AC1–4 have current documentation evidence. AC5 retains final independent
review/delivery tracking; historical acceptance is not a substitute for exact
Git candidate review.

## Tasks and ownership

- [x] Preserve the original five acceptance criteria and historical npm evidence.
- [x] Adapt EN/PT-BR/ES release labels to the actual 5.3.0 integration base.
- [x] Independently inspect translated entry semantics and literal command parity.
- [x] Verify selected links/anchors and entry commands against the actual base; inspect the retained CLI surface.
- [ ] Final independent QA/PO acceptance and DevOps normal PR read-back.

Root/dev owns the three README adaptations. PO owns this public-safe story and
verification; DevOps owns isolated assembly and Git/PR. The accepted ADR is copied
unchanged. Preserve all runtime, manifests, locks, existing IDE guidance and
unrelated documents. No price, paid gate, legal terms or product feature is added.

## File list

- `README.md`.
- `README.pt-BR.md`.
- `README.es.md`.
- `docs/framework/epics/aexos-evolution/adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md`.
- `docs/framework/epics/aexos-evolution/STORY-AEX-4.11-TRUTHFUL-NPM-ONBOARDING-AND-PT-ES-DOCS.md`.
- `docs/framework/epics/aexos-evolution/ONBOARDING-VERIFICATION-20260908.md`.

The implementation-linked release SOP and release integration plan travel with
their actual workflow implementation, not this onboarding-only base. This avoids
an invalid document dependency without closing or abandoning release work.

## Verification and review

See [commands and evidence boundaries](ONBOARDING-VERIFICATION-20260908.md).
Independent PO review finds equivalent prerequisites, four literal command
blocks, selected-host optionality, dated public defects, local correction status,
future distribution design and shipped-license preservation in all three entries.
Actual installed base help passed four commands with all 3,454 payload files
preserved. Base inspection confirmed config/sdc/wave and absence of office; the
English reference now labels Office separate unintegrated development and omits
the unsupported npm office command. Defined method principles no longer claim
universal runtime enforcement. Entry parity does not certify native execution.

The actual-base check passed 71 links/anchors and four identical entry blocks
on 2026-09-09 at 00:57 UTC. Independent PO review accepted the corrected Office
and method wording. Final candidate identity and normal PR delivery are recorded
separately when complete. No native host greeting, Office orchestration,
provider payment cycle, deployment or npm publication is accepted by this story.
Rollback concerns only the six selected documents. Do not reset shared checkouts.
