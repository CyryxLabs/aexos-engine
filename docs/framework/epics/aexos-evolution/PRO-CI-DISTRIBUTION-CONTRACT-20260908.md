# Pro CI distribution contract — 2026-09-08

Status: bounded architecture decision for implementation; no provider certification or release approval.

## Verified findings

The attachment's workflow defects are confirmed in the current working tree. `git ls-tree HEAD pro .gitmodules` returns no entries. `pro-integration.yml` nevertheless relies on a private submodule token and skips checkout and every test when it is missing; Pro internal tests also use `continue-on-error`. `sync-pro-submodule.yml` schedules pointer reconciliation without a gitlink, exports an authenticated remote URL through step outputs, and can push a replacement branch. `publish-pro.yml` masks typecheck/build failures, mutates package versions, publishes Pro publicly and creates release notes with obsolete installation/offline claims.

The fresh AIOX checkout at `4ef6530ff03b83aea953e4a426f95e012b8b70c5` retains the same token-dependent skip design and public Pro publication. Copying those workflows would not fix AEXOS. Upstream source parity is distinct from a successful remote workflow run; no remote-run conclusion is made here.

ADR-AEX-011 already settles the technical decision: public Core Free, authenticated private paid artifacts, verified signatures/digests/bindings and bounded entitlement policy. Keep Cyryx as licensing authority. Preserve historical distribution rights, provenance and notices. This work changes neither license grants nor commercial acceptance.

## Required immediate implementation

1. Replace `pro-integration.yml` with mandatory, credential-free **Core / paid-artifact boundary contracts**. Checkout without submodules or private credentials; run existing tests against temporary generated fixtures. No secret-dependent skip, `continue-on-error`, `--passWithNoTests` or failure-masking shell fallback. Keep a stable job identity or explicitly record any branch-protection mapping needed. If made a required check, avoid workflow-level path filtering that leaves unrelated PRs permanently pending.
2. Retire `sync-pro-submodule.yml`: remove its schedule and all clone/push/PR/token operations. Either delete the workflow with migration documentation, or retain a manual-only read-only guard that exits nonzero and points to ADR-AEX-011. A retired workflow must not report successful synchronization.
3. Retire `publish-pro.yml` public publication: remove tag-triggered public npm publication, version mutation and release creation. Prefer a manual-only explicit nonzero guard explaining the private artifact contract until the provider release process is implemented. Do not build a placeholder publisher or call this gate satisfied by a local review TGZ.
4. Add bounded workflow contract tests that parse YAML and reject missing mandatory tests, credential-gated local jobs, failure masking, active gitlink mutation and public paid publication. Review fixture dependencies from a fresh public checkout; local untracked `pro/` files must not make CI appear self-contained.

Suggested credential-free test command, using existing source tests:

```text
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/pro/pro-detector.test.js tests/pro/pro-updater.test.js tests/unit/licensing/paid-squad-artifact.test.js tests/installer/pro-setup-signed-artifact.test.js tests/installer/pro-setup-target-install.test.js tests/installer/pro-scaffolder.test.js tests/cli/core-package-boundary.test.js
npm run validate:core-package
```

The HTTP service and service unit suites currently import `pro/artifact-service`; do not add them to an allegedly standalone public job without resolving their private dependency. Do not substitute `tests/pro/` wholesale: its memory extractor suite can skip when Pro is absent. Record executed/passed/skipped counts from the selected suites. Required repository lint/typecheck/build/test checks remain applicable; their exit codes must propagate.

## Separate provider acceptance contract

Provider certification belongs in a protected trusted execution context, never a credentialed fork PR or `pull_request_target` checkout of untrusted code. An explicitly invoked run must fail when credentials, approved artifact, trust pin or durable catalog are absent. Inputs bind exact Core commit/package, Pro identity/version/hash/size, approved content/terms and signing key ID; fixture success is not an alternative input. Verify authenticated account/payment/current invoice coverage, machine/seat and holds, private download, installed digest, cancellation/recovery and durable evidence. Existing ACL.5/ACL.6 and server acceptance remain open until those effects occur.

`scripts/licensing-promotion-gate.js` currently evaluates evidence fields and booleans; it is a local checklist evaluator, not an authenticated attestation verifier. Do not use caller-supplied JSON alone as authority to publish or promote.

## Ownership, risk and acceptance

PO/SM creates the story; DevOps owns the three workflows and CI wiring; Dev owns any reusable validator/tests; QA independently validates both failing and passing conditions. No changes to pricing, issuer, production trust, paid source, npm defaults or website are required. Remote push/PR/release remains DevOps authority.

Trade-off: retiring stale automation stops invalid mutations immediately, while the actual private release publisher remains deliberately unavailable until provider and commercial gates exist. This is preferable to repairing a submodule path that conflicts with the accepted distribution decision. A changed required-check label can affect branch protection; inspect remote configuration before claiming remote CI closure. Local YAML validation alone does not prove Actions executed successfully.

Acceptance requires a clean public checkout without Pro credentials to execute the selected tests, intentional test/gate failures to return nonzero, no public paid publication or submodule mutation trigger, and explicit local-only evidence labels. No superiority or release-readiness claim follows from these changes.
