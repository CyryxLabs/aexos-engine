# Upstream semantic review and adopted Grok improvements

This is a bounded implementation review, not a claim of complete semantic equivalence or a defect-free framework.

## Evidence

`artifacts/audit-20260906/upstream-current.json` records the current local comparison against immutable upstream snapshots. Core: `4ef6530ff03b83aea953e4a426f95e012b8b70c5`; squads: `66118db856ef655b8cf5ba44eda963ad4d0b1d78`. Core has 504 byte-identical, 541 normalized-identical, 1445 changed paths requiring review, 532 unmatched paths and one submodule. Squads has 484 byte-identical, 20 normalized-identical, 537 changed and 34 unmatched paths. Name/byte comparison cannot establish behavioral parity.

`upstream-symbol-gaps.json` adds bounded function/class/method-name triage using the TypeScript parser. Renamed, deliberately removed and unrelated functions can appear as gaps; each requires an explicit decision.

## Decisions

| Upstream area | Local evidence and decision |
| --- | --- |
| Grok managed manifest, rules merge, stale cleanup | Added `grok-skills-sync/managed-projection.js`: deterministic content evidence, all-target preflight, preservation of modified/untracked content, unchanged owned-file cleanup and link/containment checks. This is installer protection, not an OS filesystem sandbox. |
| Grok harness configuration and aliases | Canonical AEXOS agent profiles and skills remain the source; aliases reference generated canonical skills. Managed rules/config sections preserve custom text. Native folder trust and permissions remain unchanged. |
| Grok observation hooks | `core/virtual-office/host-hooks.js` emits canonical observer commands using the documented Grok hook envelope. Only lifecycle/tool metadata crosses the bridge. No imported push-authority hook, permission bypass or native-execution claim. |
| Selected-host installer integration | `ide-configs.js` selects the managed adapter; `generateIDEConfigs` invokes `syncGrok` from the installed project's canonical agents. Errors prevent integration success. Unselected hosts remain absent. |
| Missing upstream Grok validator | Existing `scripts/validate-grok-projection.js` is the AEXOS equivalent; extended to compare ownership, managed sections, expected artifacts and stale manifest paths without modifying the target. |
| Wave default executor | Intentionally removed local fabricated-success behavior. A missing upstream symbol here is not a feature deficit. |
| Language prompts | English-only installer is the existing product policy; upstream language-choice helpers are not blindly restored. |
| Synkra marketplace sync and catalog publication | Different upstream service/publishing contracts; excluded from this remediation. No remote marketplace registration or publication performed. |
| Squad designer input/output helpers | Verified local `generateTaskInputs`/`generateTaskOutputs` and their actual callers at lines 662-755 replace Portuguese upstream names. This is an intentional language/schema change, not missing generation logic. |
| CI status reporting helper | Verified local `cicd-discovery.js` lines 834-838 deliberately removed a suggestion invoking nonexistent `status --report-ci` and a nonexistent reporting backend. Restoring the upstream helper would restore a broken generated pipeline. |
| Pro licensing setup | Different local licensing contract; no foreign billing or licensing behavior adopted. Detailed service equivalence remains outside this bounded review. |

## Host contract references

- [Grok Build settings](https://docs.x.ai/build/settings)
- [Grok native hook contract](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/10-hooks.md)
- [Core baseline](https://github.com/SynkraAI/aiox-core/tree/4ef6530ff03b83aea953e4a426f95e012b8b70c5)
- [Squads baseline](https://github.com/SynkraAI/aiox-squads/tree/66118db856ef655b8cf5ba44eda963ad4d0b1d78)

Native Grok execution remains unverified because no Grok runtime was exercised. Generated hook configuration alone is not native acceptance.
