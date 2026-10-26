# ADR-AEX-012: Capability Leases and Secret Use Boundary

## Status

Accepted for AEXOS 6.0 alpha implementation. Implements story AEX-2.6 and
extends, without replacing, Articles II, III and XII of the Constitution.

## Context

`AgentRuntime` now governs whether an agent may invoke a model, but it does not
yet govern which external tools, resources or credentials that agent may use.
Passing ambient environment variables or a broad tool client into every agent
would make permissions implicit, non-revocable and impossible to audit.

## Decision

Add one process-local capability broker to `core/permissions`.

1. Capability access is deny-by-default and issued only by an injected policy.
2. An approved lease is a short-lived HMAC-signed token bound to agent, task,
   capability, allowed actions, resource hash and scope hash.
3. Every use verifies signature, expiry, revocation, identity and action before
   the operation executes. Leases are reusable only inside their TTL and can be
   revoked immediately.
4. Secrets are resolved just in time by an injected resolver and are supplied
   only to an in-process callback. The broker never reads `.env`, persists a
   secret, adds it to a model prompt or writes it to audit evidence.
5. `AgentRuntime` verifies declared capability requirements after dispatch
   governance and before provider execution. Provider evidence contains only
   sanitized lease metadata.
6. The broker performs no filesystem or network I/O. Durable or distributed
   lease state is deferred; stable 6.0 must not claim cross-process revocation
   until a server-backed authority is implemented and certified.

## Consequences

- Tool authority becomes explicit, least-privilege, expiring and revocable.
- A process restart invalidates every outstanding lease by design.
- Callers must inject both authorization policy and secret resolution; there is
  no permissive default and no automatic credential discovery.
- A malicious tool implementation can still misuse a secret received inside
  its callback. The broker limits delivery and evidence exposure; sandboxing
  and egress control remain separate capability implementations.

## Rejected alternatives

- **Ambient environment access:** cannot express least privilege or revocation.
- **Long-lived API keys as leases:** exposes credentials to logs and models.
- **Client-only allowlists:** bypassable by new runtime callers.
- **Filesystem lease registry on every use:** adds latency and race-prone I/O to
  the execution hot path.

