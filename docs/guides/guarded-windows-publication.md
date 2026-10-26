# Experimental guarded Windows publication

AEX-4.28 production publication is disabled by an immutable empty support allowlist checked before helper invocation. The previous candidate failed independent security review; corrected sources still require separate security review and exact installed QA. Existing `create`, overwrite, move and delete operations retain their denials. These operations do not sandbox arbitrary subprocesses or provide general filesystem mutation authority.

The initial candidate is restricted to Windows NT 10.0.26200.0, x64, local NTFS, with already-installed PowerShell 7.6.5. The launcher selects only the standard PowerShell installation or the current user's fixed Codex bundled runtime location; it never searches PATH, downloads, elevates, bypasses execution policy or accepts executable paths/arguments from requests. Fixed packaged C# source is loaded from the launcher's own directory and checked against the invocation hash while held open without write/delete sharing. Unsupported tuples fail before mutation.

An ordinary `AgentRuntime` cannot publish even when all governance conditions pass. Trusted isolated validation code may call `inspectNativeCandidateIdentity()` and `authorizeNativeCandidateValidation({projectRoot, purpose:'candidate-validation', expectedIdentity, ttlMs:60000})` from `native-publication-support.js`, then pass the opaque returned object as constructor option `nativeValidationAuthorization`. Its private identity brand binds a canonical temporary workspace and directory identity, exact executable/helper/launcher hashes, runtime tuple and a maximum 60-second lifetime. It is rechecked at invocation, after asynchronous callbacks and at acceptance. Serialized copies, operation/plan/environment fields and generic enable flags cannot authorize it. Mint a fresh authorization for each phase. This factory is a trusted operator test capability, not security against arbitrary code in the same process. Candidate receipts always state `productionEnabled:false`. Future production entries require exact tuple/runtime/source identities plus distinct security-review and installed-QA evidence hashes; there are currently no entries.

## Runtime contract

### Ordinary finite transport qualification

The trusted validation harness may additionally authorize one fixed ordinary native relay session with `authorizeNativeFiniteSession` from `native-publication-session.js`, then pass its opaque object as `nativeFiniteSessionAuthorization`. This option is forwarded through the workflow runner and AgentRuntime; serialized plans cannot select a transport. The brand binds a temporary project identity, candidate and client component hashes, exact operation/content/original authority, activation bytes and a maximum 60-second lifetime. It is consumed before launching the matching operation. Other approved workflow writes continue through the existing direct transport.

This qualification accepts only `guarded-create` and `guarded-recover`, a 16 KiB request, and ordinary peers. Native governance/accounting/receipt acknowledgements come from the actual runtime. Cancellation fences late acknowledgements; acceptance requires correlated native process termination with an empty owned job, native exit zero and no cancellation. A shim exit alone is insufficient. Stalled callbacks and post-spawn errors retain conservative effects and block acceptance.

The separately reviewed installed ordinary cases prove creation, real cancellation and durable-receipt reopening that correctly reports the existing 1314 recovery conflict. They do not establish privileged replacement, positive recovery, protected controller identity, general transport support or production enablement. Protected integration remains a separate qualification.

### Missing full-security privilege

Fresh replacement requires `SeSecurityPrivilege` to be present and enabled in the actual helper token. A DACL grant or ordinary administrator identity is not proof of that capability. When the original full-security open returns `FULL_SECURITY_OPEN_NATIVE_1314` before reservation or transaction effects, the result is unsuccessful with phase `UNSUPPORTED_BEFORE_MUTATION`; the diagnostic code remains intact. The target, directory entries, receipts and reservation state must remain unchanged. This prerequisite is specific to replacement and does not disable otherwise eligible candidate creation.

The framework does not enable privileges, elevate, assign account rights or choose a less-confined writer. Use an explicitly authorized validation environment already satisfying the prerequisite. Process-scoped privilege enablement in an external validation process, if separately authorized, is not production support: complete security fidelity, recovery, collision and installed acceptance checks remain necessary.

Do not interpret every later 1314 error as a no-effects prerequisite failure. Recovery retains its existing conflict/effect records, and any failure after reservation or transaction mutation preserves the reconstructable phase and retained artifacts.

Microsoft documents the [SACL access prerequisite](https://learn.microsoft.com/en-us/windows/win32/secauthz/sacl-access-right) and the [access rights for security information](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-information). This diagnosis does not require adding backup or restore privileges.

Create `AgentRuntime` with its actual authorized project root, a capability broker and ordinary governance. A structured operation requires a real active story, positive declared governance budget, permission mode allowing writes, and an exact `filesystem` lease: action is the operation name, resource is the absolute target path, and scope is the canonical absolute project-root string. Capability leases must be current at invocation and acceptance. A filesystem phase settles its budget once.

For provider suboperations, put complete operation objects into `request.approvedFilesystemOperations`. The entire list is bound to the signed governance intent. `options.dispatchFilesystem(operation)` accepts each exact approved object once, verifies authority again and invokes the real guard. The closure closes when provider execution finishes. Failed suboperations block phase success even if the provider catches the failure. The runtime retains structured outcomes as `filesystemResults`; direct structured calls retain `filesystemResult`. Legacy direct reads retain their previous compatibility behavior. Closure reads require exact `filesystem/read` authority and return `fileIdentity`, binary `sha256` and `byteLength` in addition to UTF-8 `data`.

```js
const operation = {
  operation: 'guarded-recoverable-replace',
  target: 'output/result.bin',
  contentBase64: newBytes.toString('base64'),
  expectedBefore: { identity: readResult.fileIdentity, sha256: readResult.sha256 },
  isolatedWorkspace: true,
  allowAbsentName: true,
};
```

`guarded-create` requires `operation`, `target` and canonical `contentBase64`. Destination names must be absent. Replacement additionally requires the explicit isolated-workspace and absent-name opt-ins shown above. Identity is decimal `volumeSerial:fileIndexHigh:fileIndexLow`; hashes are lowercase SHA-256. No operation payload may specify source code, commands, environment, helper paths or additional protocol fields.

Replacement is currently unsupported on the observed unelevated host: requesting `ACCESS_SYSTEM_SECURITY` returns Windows error 1314 (`FULL_SECURITY_OPEN_NATIVE_1314`) before any transaction mutation. Reading owner/group/DACL alone cannot prove complete fidelity. The helper requires full `BACKUP_SECURITY_INFORMATION`, including SACL/audit, integrity labels, resource attributes and central access policy; unavailable metadata is denied, and nonempty system ACLs remain unqualified. No privilege is enabled and no elevation is attempted. Even where full access exists, protected caller owner/group descriptors and exact descriptor/timestamp checks remain required. The helper rejects alternate streams, extended attributes, hardlinks, reparse points, non-regular files and attributes beyond ordinary normal/archive. Object identity and filesystem-maintained change time necessarily differ for replacement. Prior partial-descriptor positive tests are historical evidence, not acceptance of the corrected candidate. [Microsoft's security-information requirements](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-information) explain the additional access requirement.

## Trusted retention and recovery

The trusted caller provides three constructor callbacks outside the operation payload:

- `trustedReceiptSink(preparedReceipt)` durably retains the complete receipt independently of the mutable workspace journal, then returns `{ durablyRetained: true, transactionId, preparedSha256 }` matching that receipt. No parking occurs before this acknowledgment.
- `trustedReceiptResolver(transactionId)` reads the independently retained receipt. It authenticates existing accounting entries and recovery requests. A hash stored only beside a mutable journal is insufficient. Missing or unknown retained records deny admission/recovery.
- `trustedPublicationAccounting(event)` durably maintains the complete monotonic reservation inventory outside the workspace. `reserve` records root identity, current ledger identity (or null initially), new transaction ID, complete observed transaction IDs and reserved bytes before workspace mutation; `anchor` binds the newly created ledger before transaction creation; `reconcile` validates recovery inventory. Return `{durablyRecorded:true, action, rootIdentity, ledgerIdentity, transactionId}` only after durable validation/write. Renamed/missing ledger or transaction entries and interrupted pending reservations block further admission. No charge release or cleanup is provided. `createWorkflowControlStore` supplies this callback when its external directory meets the operator-protection precondition.

Receipt storage is a trusted caller responsibility; logging to process memory does not meet this contract. The runtime passes canonical validated story identity, signed phase intent hash, budget ceiling/scope hash and expiry into native authority records, never raw story descriptors, prompts or file content. Receipts include fixed-source/launcher/executable hashes, host observations, transaction/file identities, artifact/content hashes, phases and effects. Model/runtime identity not exposed by the runtime remains `unverified`.

Native component handles pin volume ancestry through project and target parent. Original validation handles remain held while binary backup, staging, immutable prepared journal and hash-linked phase records are created. Publication uses handle-relative no-replace renames. External durable accounting reserves decoded new bytes plus twice the before-image size plus 1 MiB bounded record overhead, at most 16 MiB per transaction and 128 MiB per workspace. The exclusive native ledger and external accounting lock serialize admission. No charge is released and no artifacts are automatically cleaned up. Unknown, missing or unanchored accounting entries block further publication.

Replacement has a visible interval during which the original pathname is absent. A concurrent creator wins that name; its bytes are never replaced. The operation then fails with retained original, backup and journal evidence. After termination or timeout, results conservatively disclose possible effects. Never infer no mutation from a failed result.

To recover, submit a separately governed operation with a fresh `filesystem/guarded-recover` lease:

```js
{ operation: 'guarded-recover', target: 'output/result.bin', trustedReceipt }
```

The resolver must independently authenticate this receipt, and task, story, agent, workspace, ledger and runtime identities must match. Recovery validates prepared/reservation identity and hashes, phase schema/sequence/order/hash links, retained staging identity/hash/streams/attributes/security/metadata, and backup and parked-original identity/hash/security. It restores only into an absent original name. Occupied names, missing/tampered artifacts, inaccessible complete security metadata or uncertain state return `RECOVERY_CONFLICT`. A hash-linked mutable suffix is not independently authenticated historical proof. Full positive recovery remains unsupported on the observed host because full security access is unavailable; synthetic retained-state tests establish rejection behavior only. Retain all evidence for operator review. No delete/overwrite, automatic rollback over a concurrent file, or cleanup operation is provided.

Limits: 4 MiB decoded content, 6 MiB encoded request, 64 KiB per record, 256 KiB stdout, 8 KiB stderr, 64 target components, 1,024 target characters and 30 seconds per native invocation. Lock conflicts fail immediately. Process-crash claims apply only to explicitly tested barriers. Power-loss durability, cross-filesystem atomicity and uninterrupted old-or-new pathname visibility are not claimed.

`nativePhaseObserver` is trusted constructor instrumentation for deterministic tests. Its callback receives a phase and a termination control; it is not an operation field or an authorization mechanism. Production support requires the full independent AEX-4.28 matrix on the exact installed artifact, not successful self-tests or a caller flag.

The 2026-10-10 correction candidate tested in the source checkout has SHA-256 helper `DA33CD4202D80F869199BD56CD624B30C39FD05C794765B3031AC3581B236500`, launcher `B459A785C2CD7F107EE7E01922160EC3700C33DA0F989F5AC3DB900CE62415EC`, and adapter `E39A995635C16A57E37856F959C2D354F073764146CB44139526BAF021281BE4`. These identify implementation test evidence only; they are not production allowlist entries or independent acceptance records.
