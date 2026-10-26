# Versioning and releases

The supported release procedure is [Release procedure — @aexos/core](guides/release-procedure.md), owned by DevOps under the Constitution. This page is an entry point; the SOP contains the complete transaction and recovery requirements.

## Supported release path

1. Select the package set, version and channel explicitly. Stable packages use `latest`; beta prereleases use `beta`; other prereleases use `preview`. Keep related package manifests and lockfiles aligned.
2. Review an isolated candidate at an exact source commit. Preserve the shared working tree and obtain the required checks and normal pull-request approval.
3. Run `.github/workflows/npm-publish.yml` with the manual `prepare` operation. It validates and seals the actual npm archives and produces an immutable candidate locator.
4. Review the exact source, completed prepare run, package inventories, archive digests, installed checks and publisher trust.
5. Run the same workflow with manual `publish`, the reviewed locator and one provisioned authentication strategy. Verify the registry, GitHub release and installed package against the sealed candidate.

Tag/release-triggered publication and the legacy release workflow are retired. `npm run release` and `npm run release:test` are semantic proposals only; they do not publish a package. Direct package-directory publishing is not the supported transaction.

## Production identity

Current canonical repository: `CyryxLabs/aexos-engine`, repository ID `1380610939` (verified 2026-10-26). The predecessor with ID `1315531746` is `CyryxLabs/aexos-engine-archive-pre-1.0` and is archived. Its earlier PR, run and artifact identities are historical records.

Normal protected review and required checks remain in force. Local independent QA supplements GitHub review; it does not supply the required approving review. No release step changes branch protections.

## Verification and recovery

Use the exact qualification commands, supported workflow inputs and provider checks in the [canonical SOP](guides/release-procedure.md). A local test, a successful upload or a tag alone does not establish a completed publication. Unknown or partial write outcomes require provider-state inspection before any further write. Preserve archives, intent and receipts; version removal, asset replacement and tag retargeting are separate decisions.

The locally checked-out version and the registry version may differ. Read actual registry metadata before selecting a release; do not assume that unpublished local changes are available through `npx`.
