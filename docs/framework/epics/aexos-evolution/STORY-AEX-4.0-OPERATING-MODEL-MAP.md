# Story AEX-4.0: AEXOS Operating Model Map

## Status

Ready for Review

## Story

As a prospective AEXOS user or buyer, I want one visual and interactive map of
the system, its governance, squads, use cases and execution flow, so that I can
understand the current foundation and the proposed operating model without
confusing roadmap capabilities with released behavior.

## Acceptance criteria

- [x] Explain what AEXOS is in plain language and preserve CLI-first authority.
- [x] Show human governance, the free Core bundle, paid company squads and
      vertical packs in one organizational model.
- [x] Include the proposed Security and Workflow Engineering squads.
- [x] Show the agentic execution flow from mission intake to evidence and
      improvement.
- [x] Present representative use cases across software, revenue, corporate
      operations and intelligence.
- [x] Distinguish current, target and commercial states visibly.
- [x] Keep the artifact observational; it must not trigger runtime actions.
- [x] Support responsive layouts, keyboard interaction and reduced motion.
- [x] Avoid invented performance, customer, revenue or maturity claims.

## Implementation notes

- The map is a standalone HTML artifact with no external dependencies.
- Existing AEXOS names and architecture are preserved; proposed layers are
  additive.
- The commercial taxonomy is a proposal and does not activate licensing or
  change the current `legacy` install mode.

## File list

- [x] `docs/framework/epics/aexos-evolution/STORY-AEX-4.0-OPERATING-MODEL-MAP.md`
- [x] `artifacts/aexos-operating-model-map/index.html`
- [x] `artifacts/aexos-operating-model-map/qa-desktop-full.png`
- [x] `artifacts/aexos-operating-model-map/qa-mobile-organogram.png`
- [x] `artifacts/aexos-operating-model-map/qa-mobile-flow.png`

## Validation

- [x] Desktop visual inspection at 1440 × 1000
- [x] Mobile visual inspection at 390 × 844
- [x] Keyboard-compatible semantic buttons and links inspected
- [x] Domain and use-case interactions verified in the browser
- [x] No horizontal document overflow at desktop or mobile viewport
- [x] HTML runtime console inspection: no errors
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npm test -- --runInBand --silent`: 397 suites and 9,917 tests passed;
      12 suites and 163 tests skipped by the repository

The first full-suite attempt ran concurrently with lint, typecheck and build and
exceeded one mocked activation timing threshold (614 ms vs 500 ms). The isolated
test passed in 0.933 s, and the subsequent full suite executed without competing
gates and passed completely.
