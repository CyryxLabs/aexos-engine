# SOP fixtures

These contracts are independently authored local fixtures. `straight-through.json` is the canonical positive fixture. Negative and conditional variants are constructed by tests from this fixture so each test changes one contract property and keeps the cause observable.

The contract declares a project, bounded review policy, environment and artifact/check obligations. `sop-test-host.js` supplies an actual local CapabilityBroker, fixture-only identity/owner/review host and immutable store; tests obtain lifecycle snapshots by replaying creation, independent review, approval and activation. Forged JSON snapshots are negative fixtures only. Synthetic runtime bundles exercise exact obligation, artifact, check and producer associations; they do not establish production identity enrollment or executed SOP adapters.
