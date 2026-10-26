# AEXOS first-sale offer — decision package

**Date:** 2026-09-08  
**Owner:** Product / Cyryx Labs  
**Status:** Founder-approved initial offer on 2026-09-09; legal review, hosted acceptance and activation remain pending.  
**Related:** [Commercial PRD](PRD-AEXOS-PAID-LICENSING.md), [ACL.7](STORY-ACL.7-VERIFIED-PAID-ACCOUNT-ADMISSION.md), [ACL.8](STORY-ACL.8-AUTHENTICATED-PRIVATE-ARTIFACT-DELIVERY.md).

## Decision proposed

Founder decision, 2026-09-09: the owner explicitly selected "Aprovar essa oferta inicial" for US$39/month, one named user and one active machine, no trial, a refund of the first payment requested within 14 days, and no Team/Enterprise sale at the first launch. This closes the commercial choice in item 1 below. It does not certify legal review, content rights, provider setup, successful payment/delivery or public release.

Launch one initial plan, **AEXOS Individual**, at **US$39 per month**, billed monthly in advance with automatic renewal. One named practitioner, one concurrently activated machine, with a tested transfer/recovery process. No annual commitment, free trial, token allowance, or usage-based charge is included. Taxes, when applicable, must be disclosed before payment; this document does not determine tax treatment.

The first paid content candidate is the existing **Products, Marketing and Operations** squad collection: structured tasks, role definitions, workflows, checklists and templates used through AEXOS. The purchase is for the exact reviewed content manifest and the accompanying commercial access/update service. It is not a purchase of an autonomous company or a guarantee of business results. The release must include a usable, compatible CLI path; an artifact containing only licensing code is not a deliverable.

The proposed price retains the current website's individual price direction. It is a packaging decision, not evidence of market willingness to pay or a financial forecast. Root-agent website inspection supplied that price observation; an independent web-tool fetch in this review failed and provided no rendered-page evidence.

**Team and Enterprise are unavailable for purchase at first launch.** Preserve the website's US$499/month for five seats and US$30,000/year figures only as internal historical proposals. Do not publish them as active prices or sell unaccepted seat administration, enterprise runtime, SLA or managed service. New plans require a defined deliverable and their own acceptance evidence.

[AUTO-DECISION] What is the smallest reviewable initial plan? → One monthly individual subscription using existing content (reason: minimizes billing and entitlement variants and avoids selling unfinished organizational capabilities).

[AUTO-DECISION] Is every non-Core squad included? → No; nominate three coherent squads for content/IP review (reason: file availability and a registry entry do not certify scope, authorship, integration or customer value).

## Available assets and limits

Counts below are actual files found in canonical source directories, not claims about independently running agents or completed customer outcomes.

| Candidate source | Role agents | Tasks | Workflows | Checklists | Templates | Customer purpose |
|---|---:|---:|---:|---:|---:|---|
| `squads/products/` | 7 | 15 | 2 | 12 | 19 | Product diagnosis, discovery, positioning, pricing research and experiment planning |
| `squads/marketing/` | 7 | 7 | 2 | 7 | 7 | Brand/demand planning, content planning, offer/funnel definition and measurement |
| `squads/ops/` | 5 | 5 | 2 | 5 | 11 | Operations diagnosis, flow/policy specification and incident/reliability planning |
| **Total nominated** | **19** | **27** | **6** | **24** | **37** | Human-reviewed planning and execution guidance |

Evidence inspected: each directory's `squad.yaml` and README; Products `tasks/triage-product-request.md`; Marketing `tasks/marketing-chief-diagnose.md`; task inventories across the three squads. `node scripts/validate-squads.js` passed on 2026-09-08: 22 squads, zero errors and zero warnings. This is structural acceptance only. ACL.9 corrected the earlier Products README mismatch: it now documents 15 tasks, 12 checklists, 19 templates and 10 data files. Customer-facing delivery inventory must still be generated from the approved release artifact.

Examples of intended first-value output are a product triage record, a positioning document, a marketing brief or an operations policy. The paid release acceptance must run a real representative workflow and inspect its output. Specifying such outputs here does not claim that a hosted paid journey has passed.

### Excluded from the first offer

- `pro/package.json` identifies `@cyryx-squads/pro@0.0.0` as a scaffold; its memory and squads capabilities are unimplemented. `pro/squads/README.md` states that the directory is empty. These are not the nominated content source.
- Pro memory/session digest, unrestricted cross-provider execution, a hosted autonomous workforce, Gather-style multiplayer Office, enterprise orchestration and company-wide operations are not included promises.
- The Virtual Office is not a requirement for buying or operating the CLI. Its unfinished acceptance does not become a subscription benefit by appearing in a screenshot.
- AI model subscriptions, API tokens, cloud services, implementation consulting, custom integrations, account management and guaranteed outcomes are excluded.
- Additional existing squads, especially externally named personas, are outside this initial content candidate pending their own content and rights review.

## Rights and packaging decision

The concrete nomination is available as a [file-level inventory and compatibility review](../../../../artifacts/commercial-readiness-20260908/content-candidate/README.md): 146 files with SHA-256/source revision/dirty markers, observed method attributions and declared dependency resolution. The ACL.9 refresh includes 17 uncommitted source changes and resolves all declared external paths against the existing default CLI-only project, including the canonical constitution replacing Claude-specific instructions. The original finding is retained in the archived inventory. This is review evidence, not an approved release, paid-install certification or rights grant.

The three nominated manifests say `author: Cyryx Labs LLC` and `license: UNLICENSED`. Their READMEs explicitly attribute published methodologies; Products distinguishes method application from impersonation. Root `LICENSE` names Cyryx Labs LLC and separately addresses third-party components. These facts support a **candidate for review**, not a conclusion that all content has a cleared chain of title.

Before signing a customer artifact, attach a file-level inventory with SHA-256, source revision, author/provenance record, applicable license and required attribution. Resolve excerpts, imported assets, external methods and contribution permissions with the rights owner/legal reviewer. Attribution alone is not clearance. Do not change names or remove notices to manufacture apparent ownership.

The existing root `LICENSE` grants free Core rights and requires a separate commercial agreement for Pro. `pro/LICENSE.md` is explicitly TBD and grants no rights. Existing `docs/legal/terms.md` and `license-clarification.md` also describe free Core and have version references that differ from the root license. These files are historical/current-source evidence, not adequate customer terms for this paid release.

The commercial PRD proposes a future paid-only AEXOS. This proposal does not revoke rights in previously distributed copies or silently impose new terms on them. The owner must bind the new commercial grant to an exact effective release/version and explicit acceptance. Do not present already available historical content as newly exclusive. Subscription value must describe the approved distribution, updates, support and content actually being delivered.

Product acceptance requires the private package to contain the nominated, reviewed assets and a usable install manifest. Architecture/DevOps must resolve the current identity mismatch between scaffold `@cyryx-squads/pro@0.0.0` and installer expectation `@aexos/pro@0.4.2` / `pro-library`. Do not approve an empty or renamed scaffold to satisfy a signing gate. The eventual package ID, version, content set, rights notice and hash must match the website, entitlement catalog and installed receipt.

## Customer copy — staged until acceptance

**Headline:** AEXOS Individual  
**Description:** Structured product, marketing and operations work in your CLI. Use guided tasks, workflows and checklists to turn your inputs into reviewable project artifacts.  
**Price:** US$39/month. Renews monthly until canceled. Applicable taxes shown before payment.  
**Included:** One named user and one active machine; the release's listed Products, Marketing and Operations content; access to compatible updates published during an active subscription; installation, billing and license support.  
**Requirements:** A supported Node.js environment and a compatible AI coding tool configured by you. AI subscriptions and API usage are purchased separately. Exact supported versions/platforms must match the release acceptance matrix.  
**Responsibility:** You review and approve outputs and external actions. AEXOS does not guarantee accuracy, revenue or unattended operation.  
**Primary CTA after release:** Subscribe — US$39/month.  
**CTA while blocked:** View launch status. This must lead to a factual status surface, never an unverified checkout or a contact link labeled as a purchase.

Before payment, show the exact plan, currency, recurring amount, billing interval, seat/machine allowance, delivery contents, requirements, cancellation/refund policy, terms/privacy links and seller contact. Display pending/failed payment states plainly. Browser success redirects do not grant access; the verified invoice and license authority decide access.

## Proposed customer-facing policies

These are concrete commercial policy drafts for review, not published promises or legal advice. Approved copy must match implementation and applicable customer rights.

| Policy | Proposed first-sale treatment | Acceptance evidence needed |
|---|---|---|
| Renewal | Monthly renewal at the disclosed plan amount; material changes communicated before they apply. No hidden annual commitment. | Checkout and receipt display recurrence; actual Stripe price mapping matches. |
| Cancellation | Customer cancels renewal through the billing portal; access continues to the end of the paid period unless refund, fraud or another documented hold applies. | Hosted cancel-at-period-end cycle and customer confirmation. |
| Refund | One full refund requested within 14 calendar days of the first subscription payment. No routine renewal refunds under this voluntary policy; billing errors, failed delivery and mandatory customer rights remain separately addressed. | Founder acceptance of this voluntary policy, legal review, support procedure, provider refund and entitlement-state cycle. |
| Support | Email assistance for installation, billing, activation, download and reproducible defects in the included content. No guaranteed response/resolution time, 24/7 coverage, onboarding call or custom implementation. | Confirm a staffed working support address, named owner and intake/escalation process. Do not invent an SLA. |
| End of access | End of paid access stops entitlement-dependent functionality and new downloads/updates according to the accepted grant. Existing customer project data remains accessible; diagnostics, export/recovery and uninstall remain usable. | Expiry/offline/revocation/recovery acceptance for the exact release; historic rights preserved. |
| Device change | One active device; customer can release/transfer a seat with bounded recovery support. | Real lost-device and concurrent-device rejection/recovery tests; no marketing claim before they pass. |
| Updates | Access to compatible updates actually released while subscribed. No promised roadmap delivery date or lifelong update entitlement. | Installed/catalog version and rollback receipts. |

[AUTO-DECISION] Which voluntary refund proposal is easiest to understand? → A 14-day first-payment refund window (reason: gives a stranger a concrete first-value evaluation period without creating a perpetual refund entitlement). This is a proposed business concession, not a statement about any jurisdiction's minimum rights.

## Seller and privacy completion checklist

Source `LICENSE` already records **Cyryx Labs LLC**, **7901 4th St N, Ste 300, St. Petersburg, FL 33702, United States**, and **legal@cyryxlabs.com**. These are source-recorded details, not an independently verified business registration, tax status or staffed inbox. Confirm them rather than requesting an entirely new identity. Confirm the operational support contact and billing descriptor separately.

- [ ] Seller confirms legal entity, correspondence address, supported customer territories, tax/invoicing configuration, billing descriptor and monitored support/privacy contacts.
- [ ] Qualified reviewer approves the exact new license/terms and voluntary refund policy, including historical rights, third-party notices and acceptable customer use of generated work.
- [ ] Customer terms identify the effective release and date, named-user/device allowance, term, renewal, permitted commercial work, restrictions, cancellation and recovery behavior.
- [ ] Privacy notice describes actual billing/account processing: identity/email, payment and invoice references, subscription/entitlement state, activation device hash, download/security events and support submissions.
- [ ] Verify actual processors and purposes before naming them; Stripe payment and Supabase/Vercel/storage processing must reflect the deployed configuration. Identify retention/deletion periods and legal retention exceptions with the owner; none are invented here.
- [ ] Distinguish required account/license processing from optional analytics. Do not reuse blanket claims that no data leaves the machine or that all stored information is plain text.
- [ ] Explain that configured AI tools/providers may receive project content under their own settings and terms. Do not claim that local-first means no external processing.
- [ ] Authenticate account data export/deletion and preserve required invoice evidence. Never instruct customers to delete configuration directories as a substitute for deleting hosted billing/account data.
- [ ] Verify receipt emails, renewal/cancellation/refund notifications, support delivery and accessible terms/privacy links in the actual hosted journey.

## Remaining owner decisions — one reviewable bundle

1. **Approved by the owner on 2026-09-09:** US$39/month, one named user/one active machine, no trial, 14-day initial-payment refund; Team/Enterprise deferred. No external price or paid entitlement is created by this document.
2. Approve the three-squad content candidate after provenance and representative-workflow review, or reject it explicitly. A future promise is not a substitute for the approved payload.
3. Confirm recorded seller details, territories, monitored support contact, tax handling and legal reviewer. Approve the version-bound customer grant and effective release.
4. Accept the exact release only after ACL.5/ACL.6 and purchase → verified invoice → entitlement → signed download → install → Doctor → representative task → cancellation/refund/recovery evidence pass.

## Implementation handoff and risk assessment

Story discovery: ACL.0 covers README/install admission; ACL.7 covers verified paid accounts; ACL.8 covers private artifact delivery. None authorizes describing an unverified collection as a fully operating company. ACL.5 and ACL.6 remain the hosted lifecycle and promotion gates. Ask `@sm`/`@po` to associate a focused website/account-content story with this decision package after the approved commercial facts are recorded. This PM document does not create implementation authority for a draft price or replace legal terms.

The follow-up story should require: one shared approved offer record; no proposed prices displayed as active; accurate feature/content claims; accessible recurrence/terms disclosures; correct checkout and billing-portal destinations; explicit launch-blocked behavior; preservation of historical install rights; responsive/keyboard QA; and immutable evidence linking page content, Stripe price, terms version and delivered package hash. Public activation is the final gate, after reviewable source and Preview validation.

| Risk | Impact | Control |
|---|---|---|
| Selling a scaffold or unproved workflow | Paid buyer receives no usable first value | Require real content manifest and representative installed-task acceptance. |
| Unclear provenance or conflicting terms | Rights dispute or misleading grant | File-level provenance/legal review; retain notices and historic rights. |
| Paid-only promise outruns runtime enforcement | Product/copy contradict actual access behavior | State exact release model; keep issuer/runtime acceptance separate and mandatory where promised. |
| Unstaffed support or unsupported refund promise | Customer harm and unresolved billing disputes | Confirm owner/inbox; test refund/recovery; avoid invented SLA. |
| Price has no willingness-to-pay evidence | Low conversion or churn | Treat first-sale price as a testable proposal; measure verified purchases, activation and cancellations without invented market claims. |
| Broad Office/enterprise claims | Material expectation gap | Exclude them from this offer until independently accepted. |

## Completion record

- [x] Existing content and scaffold boundary inspected.
- [x] Nominated content inventory counted from disk; structural validator passed.
- [x] Price, periodicity, entitlements and exclusions specified as a reviewable proposal.
- [x] Concrete cancellation/refund/support draft and seller/privacy completion checklist prepared.
- [x] Existing stories and required follow-up implementation scope identified.
- [ ] Founder commercial approval recorded.
- [ ] Rights and legal review recorded for the exact proposed payload and terms.
- [ ] Hosted purchase and delivery acceptance / release approval recorded.

**Files changed by this product task:** this document and the review evidence under `artifacts/commercial-readiness-20260908/content-candidate/` (README, current inventory and archived pre-ACL.9 inventory). No application source, website, license grant, provider configuration, customer account or production price was changed by this product task. ACL.9 source changes were implemented separately and are observed here.
