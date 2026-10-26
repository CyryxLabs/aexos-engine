---
id: release-management
name: Manage Software Releases
agent: github-devops
category: devops
complexity: high
tools:
  - github-cli
checklists:
  - github-devops-checklist.md
---

# Manage Software Releases

The authoritative procedure is [Release procedure — @aexos/core](../../../docs/guides/release-procedure.md). Follow its current checklist and the repository Constitution. This task provides routing only; transaction details remain in the SOP.

## Scope

Use for an authorized package release or coordinated package set. DevOps owns GitHub and registry writes. Preserve the shared dirty checkout and review an isolated exact candidate. Do not infer a version, package set, channel, destination or publisher strategy from a historical release.

## Execution

1. Inspect current repository identity, default-branch protection, open PR/check state, registry versions and publisher trust. Historical observations must be refreshed.
2. Record the intended merge set and explicit version/channel decision. Coordinate applicable manifests, dependencies, lockfile and changelog.
3. Complete the exact candidate quality gates and independent review, then normal protected PR review and merge. Keep required protections active.
4. Invoke only `.github/workflows/npm-publish.yml` manual `prepare` for the exact approved source. Review its immutable locator and actual sealed archives.
5. After candidate and publisher prerequisites are satisfied, invoke manual `publish` once against that reviewed locator and the selected authentication strategy.
6. Verify npm/GitHub identities and archive integrity, then run a fresh registry-installed init and Doctor acceptance as defined in the SOP. Retain the actual terminal receipt.

Legacy tag/release event writers are retired. Semantic-release commands produce proposals only. Publishing a package directory, replacing unknown effects or changing protections is not an alternative route.

## Failure handling

Preserve the source, candidate, intent and evidence. Stop promotion on mismatched or unknown outcomes, inspect actual provider state, and use the SOP recovery contract. A green subprocess or missing output cannot establish successful publication. Do not use a tag or publication as a diagnostic.

The predecessor repository and its old PR/run identities remain historical; the supported controller validates the exact current repository identity. Paid-provider cycles, native-host production promotion and web deployment keep their own applicable acceptance requirements.
