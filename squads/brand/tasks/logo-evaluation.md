---
task: logo-evaluation
owner: '@brand-chief'
owner_type: agent
atomic_layer: task
Input: Use the selected command section inputs, or the full-task inputs for a full-task request.
Output: Produce every deliverable in the selected command section; full-task requests require all full-task deliverables.
Checklist:
  - '[ ] Execute every step of the explicitly selected scope.'
  - '[ ] Validate every output of that scope without claiming completion of other sections.'
---

# Logo Evaluation

The original full-task scorecard below uses its legacy /50 scale. Standalone
Sagi commands select the named sections after it and use explicitly labeled
command scales. Read the base file before selecting a section; never send a
`#fragment` as a filesystem Read path or mix results from different scales.

```yaml
task:
  policy: config/brand-runtime.yaml
  policy_instructions: >-
    Before this task, load squads/brand/config/brand-runtime.yaml. Apply its task anatomy,
    executor and tier guidance under user/host instructions and core authority. Preserve
    this task's checkpoints, vetoes and success criteria; human approvals remain human.
    This guidance does not grant dispatch, messaging or provider execution authority.
  task_name: "Evaluate Logo Design"
  status: pending
  responsible_executor: sagi-haviv
  execution_type: Agent
  estimated_time: "30-60min"
  elicit: true

  input:
    - "Logo file/description"
    - "Brand strategy context"
    - "Competitor logos"

  output:
    - "5-pillar evaluation scorecard"
    - "Simplicity test results"
    - "Recommendations"

  action_items:
    - step: 1
      name: "5-Pillar Evaluation"
      description: |
        Score 1-10 on each:
        1. APPROPRIATENESS — Does it fit the brand personality?
        2. DISTINCTIVENESS — Is it ownable in its category?
        3. SIMPLICITY — Can you describe in 10 words? Sketch from memory?
        4. MEMORABILITY — Does it stick after one viewing?
        5. TIMELESSNESS — Will it look relevant in 10+ years?

    - step: 2
      name: "Simplicity Test"
      description: |
        5 questions (pass/fail):
        1. Describable in 10 words or fewer?
        2. Sketchable from memory?
        3. Recognizable at 16px?
        4. Works in one color?
        5. Could a child approximate it?

    - step: 3
      name: "Application Check"
      description: |
        Does the logo work in:
        - Horizontal lockup
        - Vertical/stacked lockup
        - Icon only
        - Favicon (16x16, 32x32)
        - Social avatar (circular)
        - Monochrome (black, white, reversed)
        - On dark backgrounds
        - On light backgrounds
        - At billboard scale

    - step: 4
      name: "Recommendations"
      description: |
        Based on scores:
        - 40+/50: Strong logo. Minor refinements only.
        - 30-39: Good foundation. Specific improvements needed.
        - 20-29: Significant weaknesses. Major rework recommended.
        - <20: Does not meet minimum standards. Redesign.

  output_example: |
    ## Logo Evaluation: Cyryx Labs

    **5-Pillar Scorecard:**
    | Pillar | Score | Finding |
    |--------|-------|---------|
    | Appropriateness | 8/10 | Geometric precision matches tech/orchestration personality |
    | Distinctiveness | 7/10 | Ownable in dev tools; slightly generic in broader tech |
    | Simplicity | 9/10 | Three interlocking arcs — describable, sketchable |
    | Memorability | 7/10 | Clean shape sticks; needs more character to reach 9+ |
    | Timelessness | 8/10 | No gradients or trends; pure geometry ages well |
    | **Total** | **39/50** | **Good foundation. Minor refinements needed.** |

    **Simplicity Test:** 4/5 PASS
    - Describable in 10 words: PASS ("Three arcs forming an S-shape")
    - Sketchable from memory: PASS
    - Recognizable at 16px: PASS
    - Works in one color: PASS
    - Child could approximate: FAIL (arc alignment too precise)

    **Application Check:** All formats work. Favicon strong. Circular crop needs padding adjustment.

    **Recommendation:** Score 39/50 — strong logo. Refine arc weight for better 16px rendering. Consider adding a subtle detail to boost memorability.

  acceptance_criteria:
    - "All 5 pillars scored"
    - "Simplicity test completed"
    - "Application check documented"
    - "Clear recommendations provided"

  veto_conditions:
    - "Logo fails 3+ simplicity test questions → recommend redesign"
    - "Logo scores <5 on appropriateness → misaligned with brand"

  handoff:
    on_complete: "Pass recommendations to michael-johnson for brand guidelines integration"
    deliverable: "Logo evaluation scorecard + recommendations"
```

## Standalone command evidence

The sections below are Sagi-owned independent procedures. Load the common Brand
policy at command time and record the selected command, exact asset/version,
evidence references, evaluator judgments, unknowns and handoff. Missing inputs
produce NEEDS_INPUT; partial observations produce an UNVERIFIED assessment.
Only complete observed tests receive an aggregate. Human approval remains human.
Examples in the legacy task are illustrative, never evidence about the current logo.

## simplicity-test

**Inputs:** exact logo, intended meaning, actual test renderings and observer
records. **Output:** ST-1…ST-5 scorecard, average, verdict and recommendations.

1. Bind every observation to the same mark/version and record observer/context.
2. Run the agent's five tests: ST-1 description in ten words, ST-2 memory sketch,
   ST-3 actual 16px favicon, ST-4 monochrome, ST-5 child approximation. Use the
   per-test 1–5 rubrics in Sagi's `domain.simplicity_test`; quote the observed
   behavior that justifies each score. A drawing task requires a real observer
   record, not a guess about what a person would draw.
3. Mark missing tests UNVERIFIED with the exact required next observation.
   Never convert missing evidence to zero or omit it from a smaller denominator.
4. If all five tests are observed, calculate `sum(scores) / 5`. The command's
   progression threshold is 3.5/5: at least 3.5 permits progression, below 3.5
   requires simplification. Preserve the agent's descriptive bands where used;
   report the five raw scores so the result is reproducible.
5. Give concrete remedies tied to the weakest tests and a repeat-test plan.

**Acceptance:** five evidence-bound scores, correct average and threshold result;
or an explicitly incomplete report with no aggregate/verdict. **Reject complete
PASS:** any missing visual/participant evidence. **Handoff:** exploration and
retest for weak marks; human review for a progressing mark. This is not approval
of the full identity or a substitute for the weighted evaluation.

## evaluation

**Inputs:** exact logo, strategy, competitor marks, use contexts and actual
memorability/reproduction evidence. **Output:** weighted five-pillar report.

1. Score each pillar 1–5 under Sagi's pillar rubrics, separating supplied evidence
   from design judgment: Appropriateness, Distinctiveness, Simplicity, Memorability,
   Timelessness. Do not claim observed recall or future longevity from opinion.
2. Cite asset/context for each score. Missing essential observation is UNVERIFIED;
   withhold a complete aggregate until the five required assessments are supported.
3. Calculate `0.25*A + 0.25*D + 0.20*S + 0.15*M + 0.15*T` on the 1–5 scale.
   Apply the existing Sagi aggregate interpretation bands, recording the band
   and criterion used. This is not the legacy unweighted /50 task score.
4. Identify the weakest pillar, its practical risk, specific improvement and
   required reassessment. Return the source scores and calculation with the verdict.

**Acceptance:** five sourced scores, correct weights, named interpretation band
and actionable weakest-pillar recommendation. **Reject complete result:** missing
input/evidence or mixed scales. **Handoff:** brand-chief and Michael for decisions
and guidelines integration; final design approval remains with the user.

## logo-audit

**Inputs:** current logo versions, strategy, application inventory, renderings,
observer tests and competitor references. **Output:** severity-ranked findings
and a Retain / Refine / Redesign recommendation with explicit confidence limits.

1. Inventory versions and mark missing/obsolete applications. Run simplicity-test
   and evaluation above; retain each scale separately and all UNVERIFIED results.
2. Audit lockups, responsive versions, color variants, clear space, minimum sizes,
   file formats and misuse controls. Compare required vs supplied assets.
3. Inspect actual reproduction contexts and supplied competitor marks. For every
   finding, record artifact, observation, requirement violated and affected use.
4. Prioritize critical unusable/misleading identity, high failure in required
   reproduction or differentiation, medium inconsistent applications and low
   cosmetic issues. This prioritization is a documented design judgment.
5. Recommend Retain when observed requirements hold; Refine for bounded correctable
   issues; Redesign when the core mark conflicts with strategy or fails essential
   uses. Missing critical evidence yields an incomplete audit, not a Retain verdict.
6. Supply correction owner, acceptance check and retest evidence for each finding.

**Acceptance:** both scorecards, system/context/competitor findings, severities
and a reasoned recommendation or explicit evidence hold. **Handoff:** Sagi for
mark revisions, Michael for application guidelines, human for redesign approval.
