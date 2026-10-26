# Installer and SYNAPSE hardening contract — 2026-09-08

Status: bounded architecture recommendation for ACL.13/story authoring. No product implementation or provider acceptance by this document.

## Installer decision

Current `packages/installer/src/wizard/pro-setup.js` extracts artifacts by running npm, uses `--silent`, and falls back to `npm.cmd` with `shell: true` on Windows. Fresh AIOX source adds a bundled npm CLI lookup and in-process tar extraction but still retains that shell fallback. Absorb the useful behavior while preserving AEXOS signed-descriptor verification and ACL.10 preservation/rollback; do not replace the file wholesale.

Declare the selected supported `tar` release as a production dependency in both root `package.json` and `packages/installer/package.json`, with matching lockfile resolution. The root's current `overrides.tar: ^7.5.22` is not an installed or declared direct dependency. An unrelated backup-manager import does not establish packaged availability. This is the minimal dependency decision for the requested upstream extraction hardening; record it explicitly before implementation and verify the resolved version's engine requirements/audit. Do not invent a tar parser or depend on an operating-system tar executable. The dependency adds maintenance cost but avoids a new custom archive security implementation.

Extraction contract:

- Run the existing signed descriptor/payload verification before extraction. Preserve issuer trust, product/plan/version/platform/channel, account/machine, expiry/revocation, digest and byte-count checks.
- Extract to a new private temporary directory, never directly over the user's project. Require one npm `package/` payload root, valid `@aexos/pro` metadata and matching descriptor version on acquisition; clean the temporary extraction on failure.
- Reject absolute/traversing paths, unexpected roots, symbolic/hard links and nonregular file entries. Bound expanded bytes and entry counts; compressed download limits alone are insufficient. Treat malformed/truncated archive warnings as failures; do not silently skip unsafe entries and report success.
- Keep target caching separate from extraction; retain script-disabled, correctly anchored npm target installation and the existing verified-temp-source fallback. Preserve ACL.10 source eligibility and filesystem journal.
- Prefer explicit npm/npx CLI resolution, then `node_modules/npm/bin/npm-cli.js` next to the executing Node distribution. On Windows, if no valid npm CLI file resolves, return an actionable error instead of invoking a batch file through a shell. Continue using direct executable/argv invocation on supported POSIX paths.
- Replace `--silent` with `--loglevel=error`; preserve useful contextual npm stderr while redacting credentials, bearer values and signed URL query strings from surfaced diagnostics. Keep `windowsHide: true`.

The [node-tar security documentation](https://github.com/isaacs/node-tar#security-information) recommends controlled extraction directories, rejecting links and limiting expanded file sizes. Its [error documentation](https://github.com/isaacs/node-tar#warnings-and-errors) distinguishes warnings from errors; strict handling is necessary for the failure semantics above.

## SYNAPSE decision

Current `.aexos-core/core/synapse/runtime/hook-runtime.js` resolves engine and session-manager only from the project. Fresh upstream independently falls back each missing file to package siblings, which can mix distributions in a partial project installation.

Choose one runtime base before requiring either module: use the project's `.aexos-core/core/synapse` when present, otherwise the sibling base of the loaded hook-runtime. A present but partial, unreadable or broken project runtime must produce the existing fail-soft result with a contextual diagnostic, never fall back after a require error or combine roots. Distinguish absent paths from access errors. Both modules must resolve before session creation/cleanup begins.

Preserve `resolveSynapsePath(cwd)`, project `.synapse` data/session paths, explicit `parseManifest(manifestPath)` forwarding, project core configuration, TTL behavior and output shape. Package fallback changes code location only; it must not move project state into node_modules. Do not copy upstream's omission of the domain manifest.

## Ownership and acceptance

Installer Dev owns pro-setup, root/installer dependency manifests and lockfile, plus focused installer tests. SYNAPSE Dev owns hook-runtime and `tests/synapse/hook-runtime.test.js`. QA independently checks their combined behavior; coordinate ownership of the root manifest/lockfile with concurrent work.

Required evidence: packed Core and standalone installer resolve tar without repository hoisting; verified valid TGZ extracts without spawning npm; malformed/path/link/oversize/mismatched metadata fails without outside writes; target paths with spaces and shell metacharacters remain literal; Windows missing npm CLI fails clearly; ACL.10 rollback/preservation regressions stay green. SYNAPSE tests cover complete project precedence, package-only fallback, partial project refusal, project-module require failure without fallback, manifest routing, project sessions/config and absent `.synapse`. Run repository lint/typecheck/build/test and exact packed clean-machine smoke checks. These local checks do not certify provider execution or commercial release.
