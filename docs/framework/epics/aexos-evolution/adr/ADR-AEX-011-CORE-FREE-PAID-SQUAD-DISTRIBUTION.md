# ADR-AEX-011: Core Free and Authenticated Paid Squad Distribution

## Status

Accepted on 2026-09-04 by Product Owner instruction. Supersedes the future
distribution decision in ADR-AEX-007 and the 6.x packaging consequence of
ADR-AEX-008. It does not rewrite the historical fact that the named squads were
distributed in `@aexos/core@5.3.0`.

## Context

The current package manifest includes the entire `squads/` directory. Any
artifact published that way is already present on the user's machine; a local
license check cannot protect it. The desired 6.x product has a free software
delivery core and a paid library of additional business-domain squads.

The same Stripe account also receives payments for other products. AEXOS access
therefore cannot be derived from the existence of a Stripe customer,
subscription or successful payment without AEXOS-scoped product metadata.

## Decision

1. Core Free contains the framework, the 12 canonical software-delivery agents
   and the Security squad.
2. Non-Core squads are omitted from the public Core artifact and fetched only
   from an authenticated artifact service.
3. The service evaluates a signed AEXOS entitlement before returning an
   artifact and returns a content digest and signature with every response.
4. The installer verifies product, plan, expiry, machine/seat policy, digest and
   signature before extraction.
5. Entitlements use an AEXOS namespace such as `aexos.squads.*`; unrelated
   Stripe products cannot satisfy it.
6. Cached access is a controlled availability feature with bounded grace, not a
   permanent offline license. Revocation and machine-transfer rules are tested.
7. The `legacy` install mode remains unchanged until shadow and restricted beta
   evidence satisfy Sprint 3.

## Compatibility

- Existing 5.x users keep whatever was already downloaded.
- 6.x emits a clear migration report identifying locally present legacy squads.
- No local squad is deleted automatically.
- A 6.x paid entitlement controls updates and authenticated acquisition; it does
  not make retroactive secrecy claims.

## Consequences

- The npm package build needs an explicit Core allowlist and a package-content
  test.
- A remotely available, durable entitlement/artifact service becomes a hard
  dependency for new paid squad acquisition.
- The current local licensing implementation remains Preview work until the
  server, webhook and recovery paths are certified end to end.
- Legal license text for Core Free and paid artifacts requires separate legal
  approval; this ADR defines technical distribution, not legal advice.
