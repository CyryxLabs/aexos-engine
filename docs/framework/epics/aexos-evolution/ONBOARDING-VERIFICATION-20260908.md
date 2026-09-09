# Onboarding verification — 2026-09-08

This is the public evidence summary for
[AEX-4.11](STORY-AEX-4.11-TRUTHFUL-NPM-ONBOARDING-AND-PT-ES-DOCS.md).
Scope: EN/PT-BR/ES npm onboarding, the unchanged distribution ADR and two
self-contained review documents. No runtime, manifest, lock or baseline IDE-guide
change is included. Git/PR acceptance and publication are separate operations.

## Observed published package

On 2026-09-08, registry metadata reported `latest`/version 5.3.0, Node >=18 and
npm >=9. Its recorded npm integrity was
`sha512-IzCaQQXKQfBq/oUMzmFb1YnrLzM9XOPUapvP52l/d9stkr7LlxEt2y/wyzzkXCi86HplxefveFFdiOrH5NdJyw==`.
These are dated observations, not a claim that a future `latest` remains unchanged.

The clean default non-TTY fixture used a fresh npm cache and an empty parent
folder on Node 24.15.0. The following are the portable equivalents of the actual
npm CLI arguments; run the two init/doctor commands from their indicated folders:

```bash
npm view @aexos/core version dist-tags engines dist.integrity --json
npm exec --yes --cache ./npm-cache --package @aexos/core@5.3.0 -- aexos --version
npm exec --yes --cache ./npm-cache --package @aexos/core@5.3.0 -- aexos init --help
npm exec --yes --cache ./npm-cache --package @aexos/core@5.3.0 -- aexos install --help
npm exec --yes --cache ./npm-cache --package @aexos/core@5.3.0 -- aexos doctor --help
npm exec --yes --cache ./npm-cache --package @aexos/core@5.3.0 -- aexos init hello-aexos
cd hello-aexos
npm exec --yes --cache ../npm-cache --package @aexos/core@5.3.0 -- aexos doctor --json
```

Version and all three help commands exited 0. Init exited 0 and installed 12
canonical Core agent files; Doctor exited 1 with 11 PASS / 3 WARN / 4 FAIL.
The failures were `rules-files`, `claude-md`, `npm-packages` and
`hooks-claude-count`. The banner incorrectly marked agents absent, and init help
still showed a GitHub command. The package-inferred short form
`npx @aexos/core --version` and `npx @aexos/core init --help` was checked separately
with exit 0. No global install, paid account or host activation was required.
These known public failures are reported honestly in all three entry documents.

## Locally corrected first-value base

PR #4 head `d848c7f58ad4a8da3afc93398ec608be4bf4d23a` was independently packed and
installed before this onboarding adaptation. Its 5.3.0 TGZ SHA-256 was
`00f8d97c5ca67d3acd9d025c86a237e10ca5dbd68c5c352b54cb4193b52e1cd3`.
On 2026-09-08 at 22:33 UTC, actual installed-bin `init <empty-project> --ci`
exited 0; actual installed-bin `doctor --json` from the new project exited 0
with 13 PASS / 2 WARN / 0 FAIL / 3 INFO. All 3,454 installed package files stayed
unchanged. This identifies local corrected behavior, not the npm artifact above.

To reproduce with an independently supplied exact candidate archive, use a fresh
consumer and an empty project location:

```bash
npm init -y
npm install --ignore-scripts --no-audit --no-fund /absolute/path/to/candidate.tgz
node node_modules/@aexos/core/bin/aexos.js init ./hello-candidate --ci
cd hello-candidate
node ../node_modules/@aexos/core/bin/aexos.js doctor --json
```

Replace only the archive path with the verified candidate TGZ; do not substitute
npm `latest` and then attribute its output to the reviewed source. The two WARNs
were missing Git hooks and the existing Windows npx advisory. Neither is proof of
missing agents or successful host activation. This documentation task does not
rebuild, publish or certify a new archive.

## Current documentation review

PO independently inspected all three staged entry documents: prerequisites,
new-project versus existing-directory commands, optional host selection,
public-versus-local release distinction, intended 6.x distribution boundary,
paid certification status and shipped-license wording agree. The first four
fenced command blocks are byte-identical across EN/PT-BR/ES. The ADR copy is
byte-identical to the accepted decision; it has no Markdown link dependencies.

The original broader-checkout documentation review passed 71 links/anchors and
four entry command blocks on 2026-09-08. That historical result does not certify
this isolated base. The new actual-base check independently passed 71 selected links/anchors and
four identical entry blocks at 2026-09-09 00:57 UTC. Actual installed PR #4
`--help`, `init --help`, `install --help` and `doctor --help` each exited 0;
all 3,454 installed payload files remained unchanged before/after those calls.
Base CLI inspection confirmed config/sdc/wave and absence of office. The English
reference now qualifies Office as separate unintegrated development, removes the
unsupported npm command and describes method principles without claiming universal
runtime enforcement. Independent PO review accepted those narrow corrections.
The final candidate Git/PR identity and acceptance remain separately recorded.
No blanket copy of unrelated documentation is required or accepted. In particular,
retain the baseline IDE guide and defer the release SOP/plan with their workflow
implementation. Existing detailed guides remain baseline references, not newly
accepted product or provider behavior.

## Acceptance boundaries

The current historical 5.3.0 allowlist is unchanged. The intended 6.x Core Free
boundary and private paid artifact delivery remain separate implementation and
certification work. Full translation of the framework, legal changes, pricing,
native host activation, cross-provider Office actions, merge and publication are
outside this documentation acceptance. No product full-suite run is attributed
to changed documentation; targeted checks and independent review are required.
