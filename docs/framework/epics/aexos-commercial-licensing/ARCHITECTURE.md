# AEXOS Entitlement and Paid Distribution Architecture

**Status:** Proposed
**Rule:** licensing is an AEXOS control-plane capability, never an agent or
Cerberus-worker authority.

## Topology

```text
Payment Provider
      |
      v
Commercial Backend --verified event--> License Authority
                                           |
                                  signed entitlement
                                           |
                                           v
Authenticated Artifact Service ----> AEXOS License Client
                                           |
                                  verified local cache
                                           |
                                           v
                                  Entitlement Resolver
                                      /           \
                            AEXOS Runtime      Recovery Allowlist
                                  |
                          Knowledge Gateway
                                  |
                          Cerberus Worker
```

## Authority boundaries

- The payment provider proves a transaction event to the commercial backend.
- The License Authority is the only issuer of signed entitlements.
- The Artifact Service distributes signed release candidates but cannot mint
  entitlements.
- The local Entitlement Resolver verifies signatures and policy. It cannot
  create, extend or upgrade a license.
- AEXOS Master consumes an entitlement decision but cannot override it.
- Cerberus receives only an already-authorized capability request.

## Public bootstrap and private engine boundary

- `@aexos/core@5.3.0` is a historical artifact governed by the terms shipped
  with that release. It is never treated as the paid engine and is not
  retroactively disabled.
- A future public npm package contains only bootstrap, authentication,
  entitlement verification, recovery-safe diagnostics, export and uninstall
  surfaces. It contains no executable AEXOS engine, squads or paid capability
  artifacts.
- The paid engine is built separately and stored behind the Authenticated
  Artifact Service. A public repository or npm tarball is not an artifact
  authority.
- The public bootstrap verifies the descriptor, release channel, SHA-256 and
  signature before extracting any engine file. A URL alone is not authority.
- Package naming, publication, repository visibility and artifact-provider
  configuration remain DevOps/release transactions and are not changed by a
  local implementation story.

## Payment admission rule

- Checkout completion, subscription creation, browser redirects and a local
  `active` status do not independently prove that money settled.
- The first paid entitlement requires a verified `invoice.paid` event tied to
  an allowlisted AEXOS Product/Price, a positive paid amount, the expected
  currency and the authenticated AEXOS customer/subscription namespace.
- The backend retrieves current Stripe authority before admitting payment and
  stores the invoice identifier and paid timestamp in the durable event ledger.
- Subscription events may persist lifecycle state before the paid invoice
  arrives, but `active` cannot become `entitled` without qualifying paid-invoice
  evidence. `trialing` is blocked unless a later founder-approved promotional
  policy explicitly authorizes it.
- Refund, dispute, chargeback, unpaid and terminal subscription states can
  revoke or hold an entitlement even when historical paid-invoice evidence
  exists. Recovery requires current Stripe authority plus no active hold.

## CLI authentication contract

- The paid purchase journey is account-first: the customer creates and verifies
  the account before Checkout. The CLI does not disclose whether an arbitrary
  email is a buyer.
- Interactive and CI password authentication goes directly to Supabase Auth
  using its public URL and anon key discovered from a public auth-config
  endpoint. Passwords never transit the License Authority application route.
- The CLI sends only the short-lived Supabase access token to activation and
  artifact endpoints. The License Authority revalidates that token and verified
  email for every authority-bearing request.
- Browser/device authorization is the preferred future interactive UX, but it
  is not a prerequisite for the first paid candidate and must not be simulated
  by a redirect-only claim.

## Authenticated artifact descriptor

The Artifact Service response is short-lived and binds at minimum:

- authenticated user and entitlement;
- privacy-bounded machine identifier;
- package, version, platform and release channel;
- artifact URL, byte size and SHA-256;
- expiry and descriptor signature/key identifier.

If a private artifact origin, signing key or exact matching artifact record is
not configured, descriptor issuance fails closed. The License Authority never
falls back to the public historical package.

## Canonical entitlement envelope

The final schema must be versioned and strict. At minimum it binds:

- schema and key identifiers;
- entitlement and customer/organization identifiers;
- product and plan;
- allowed feature/capability identifiers;
- seat policy;
- issued, not-before and expiry times;
- offline-cache and grace policy;
- allowed release channel/version range;
- revocation epoch or equivalent freshness control;
- signature.

Unknown fields and algorithms fail closed. The client package contains only
public verification keys with rotation metadata.

## Runtime state machine

```text
NOT_ACTIVATED -> ACTIVATING -> ACTIVE -> OFFLINE_VALID -> GRACE
      ^              |          |            |             |
      |              v          v            v             v
   RECOVERY <------ ERROR     REVOKED       EXPIRED       EXPIRED
```

`ERROR` is not `ACTIVE`. Transport failure is distinguished from entitlement
denial, but neither creates authority beyond a still-valid signed offline
cache.

## Enforcement placement

The primary enforcement point is the canonical CLI/runtime dispatch boundary.
Generated agents, skills, prompts and IDE files must not contain independent
licensing logic. Secondary gates protect direct programmatic exports, installer
operations and worker startup.

Recovery allowlist:

- `aexos license status|activate|validate|recover|deactivate`;
- version and license-safe doctor output;
- export of user-owned project data;
- uninstall and local cleanup limited to installer-owned artifacts;
- access to the applicable license terms and support instructions.

## Internal development and CI

- Internal developer and CI entitlements are signed by a distinct key or
  constrained issuer and auditable as non-customer credentials.
- CI entitlements are short-lived and bound to approved workflows/artifacts.
- Tests use deterministic fixture keys whose private key is test-only and
  rejected by production builds.
- No `AEXOS_SKIP_LICENSE`, magic hostname, debug flag or source-tree detection
  grants production authority.

## Data and privacy

The licensing system may receive product/version, entitlement, organization,
seat, privacy-bounded device binding and security/audit metadata. It must not
receive source code, documents, prompts, agent conversations, Cerberus indexes,
transcripts or retrieved passages.

## Cerberus integration

The Knowledge Gateway requests a capability decision such as
`knowledge.text`, `knowledge.documents`, `knowledge.media`,
`knowledge.semantic` or `knowledge.conclave`. It starts the worker only after
authorization. The worker protocol does not carry payment or raw license
credentials.

## Migration and rollback

1. Ship entitlement infrastructure dark and non-enforcing.
2. Validate signed fixtures and authenticated artifact installation.
3. Run shadow decisions and compare expected coverage without blocking users.
4. Approve replacement license and commercial parameters.
5. Produce a paid-only release candidate with Community surfaces removed.
6. Test old-version detection, explicit upgrade acceptance and rollback.
7. Enable enforcement only in the exact signed candidate.

Rollback returns to the previous candidate but never changes the license terms
of an already distributed version or deletes customer data.

## Security gates

- signature forgery, key substitution and downgrade tests;
- replay, duplicate purchase and webhook-ordering tests;
- cache tamper, clock rollback and machine-clone tests;
- seat-race and activation-rate-limit tests;
- artifact substitution and version-confusion tests;
- secret and PII scans on source, logs, tarball and extracted installation;
- recovery commands proven available under every failure state;
- independent QA review of the same artifact selected for release.
