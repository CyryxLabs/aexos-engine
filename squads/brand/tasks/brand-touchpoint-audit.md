---
task: brand-touchpoint-audit
owner: '@brand-chief'
owner_type: agent
atomic_layer: task
Input: Use the selected command section inputs, or the full-task inputs for a full-task request.
Output: Produce every deliverable in the selected command section; full-task requests require all full-task deliverables.
Checklist:
  - '[ ] Execute every step of the explicitly selected scope.'
  - '[ ] Validate every output of that scope without claiming completion of other sections.'
---

# Brand Touchpoint Audit

```yaml
task:
  policy: config/brand-runtime.yaml
  policy_instructions: >-
    Before this task, load squads/brand/config/brand-runtime.yaml. Apply its task anatomy,
    executor and tier guidance under user/host instructions and core authority. Preserve
    this task's checkpoints, vetoes and success criteria; human approvals remain human.
    This guidance does not grant dispatch, messaging or provider execution authority.
  task_name: "Audit Brand Touchpoints"
  status: pending
  responsible_executor: emily-heyward
  execution_type: Agent
  estimated_time: "1-2h"
  elicit: true

  input:
    - "Brand strategy"
    - "Website URL"
    - "Marketing materials"
    - "Product screenshots"

  output:
    - "Touchpoint scorecard"
    - "Coherence analysis"
    - "Recommendations per touchpoint"

  action_items:
    - step: 1
      name: "Map Touchpoints"
      description: |
        Identify and list all brand touchpoints:
        1. Website (above the fold, key pages)
        2. Product/app (onboarding, key flows, errors)
        3. Email (welcome, transactional, marketing)
        4. Social media (profiles, content style)
        5. Packaging (physical, unboxing)
        6. Customer support (tone, speed, resolution)
        7. Advertising (paid, organic)
        8. Sales materials (decks, proposals)

    - step: 2
      name: "Score Each Touchpoint"
      description: |
        For each, score 1-10 on:
        - Brand alignment: Does it reflect the brand strategy?
        - Emotional impact: Does it make people feel something?
        - Consistency: Is it consistent with other touchpoints?
        - Quality: Is the execution high quality?

    - step: 3
      name: "Identify Gaps"
      description: |
        - Which touchpoints are OFF-brand?
        - Where is the emotional hook missing?
        - Where is inconsistency breaking trust?
        - Which touchpoint has the most impact if fixed?

    - step: 4
      name: "Prioritize Fixes"
      description: |
        Order by: Impact (high→low) × Effort (low→high)
        Quick wins first, then strategic improvements.

  output_example: |
    ## Touchpoint Scorecard — Cyryx Labs

    | Touchpoint | Alignment | Emotion | Consistency | Quality | Avg |
    |------------|-----------|---------|-------------|---------|-----|
    | Website (hero) | 9 | 8 | 9 | 9 | 8.8 |
    | Onboarding flow | 7 | 5 | 8 | 7 | 6.8 |
    | Welcome email | 6 | 4 | 5 | 6 | 5.3 |
    | Social media | 8 | 7 | 6 | 7 | 7.0 |
    | Error states | 4 | 3 | 5 | 4 | 4.0 |
    | Docs site | 8 | 6 | 7 | 8 | 7.3 |

    ### Top 3 Gaps
    1. **Error states (4.0):** Generic browser errors, no brand voice, no emotional recovery
    2. **Welcome email (5.3):** Template-style, no personality, missing brand narrative
    3. **Onboarding flow (6.8):** Functional but emotionally flat, no "aha moment" design

    ### Priority Fixes (Impact x Effort)
    | Priority | Touchpoint | Fix | Impact | Effort | Owner |
    |----------|------------|-----|--------|--------|-------|
    | 1 | Welcome email | Rewrite with brand voice + narrative arc | High | Low | emily-heyward |
    | 2 | Error states | Design branded error pages with helpful tone | High | Medium | michael-johnson |
    | 3 | Onboarding | Add emotional hooks at key moments | High | High | emily-heyward |

  acceptance_criteria:
    - "All touchpoints mapped and scored"
    - "Top 3 gaps identified"
    - "Priority fix list created"

  veto_conditions:
    - condition: "Touchpoint audit conducted without brand strategy as baseline"
      action: "VETO — cannot evaluate coherence without a reference point. Run brand-diagnosis first."
    - condition: "Scoring applied without defining scoring criteria per dimension"
      action: "VETO — subjective scores without criteria are meaningless. Define dimensions first."
    - condition: "Recommendations lack prioritization by impact"
      action: "VETO — an unordered list of fixes is not actionable. Prioritize by brand impact and effort."

  handoff:
    on_complete: "Pass to brand-chief for synthesis with overall brand audit"
    deliverable: "Touchpoint scorecard + priority fixes"
```

## touchpoint-audit

This Emily-owned command uses the shared Brand policy and only the bounded
procedure below. The original full task retains its four-dimension scorecard;
this command explicitly uses the advertised three dimensions. Read the base file
before selecting the section and do not mark the whole movement process complete.

**Inputs:** belief/identity, actual digital/physical/human touchpoint artifacts,
and intended experience. **Output:** scorecard, severity-ranked gaps and redesign plan.

1. Inventory supplied touchpoints, artifact versions and evidence coverage.
   Include observed digital, physical and human interactions; absent categories
   remain unobserved rather than being filled with invented customer encounters.
2. Score each observed item 1–10 on belief alignment, emotional impact and
   consistency, with artifact-linked rationale. Label emotional impact as evaluator
   judgment unless actual customer evidence was provided. Record unassessable
   dimensions UNVERIFIED and do not compute a misleading complete score.
3. Identify contradictions and prioritize critical unusable/misleading experiences,
   high failures in a core belief or key journey, medium inconsistent expression,
   and low cosmetic refinements. Explain impact and confidence for every priority.
4. Propose concrete redesign for failing touchpoints, with accountable owner,
   dependency, observable acceptance condition and evidence to collect after change.
5. Return inventory, scorecard, priority fixes and a separate missing-evidence list.
   Human approval precedes implementation; no external action is authorized here.

**Acceptance:** supplied artifacts covered, three explicit dimensions, reasoned
severities and actionable redesign/acceptance checks. **Reject complete audit:**
missing key journey evidence. A partial audit is labeled as such. **Handoff:**
brand-chief and affected owners; actual customer response/retest remains separate.
