---
task: logo-design
owner: '@sagi-haviv'
owner_type: agent
atomic_layer: task
Input: The selected command's brief, brand evidence and application requirements.
Output: The selected command's documented logo design deliverable.
Checklist:
  - '[ ] Follow the selected procedure and record evidence gaps.'
  - '[ ] Verify its deliverables and leave human approval with the user.'
---

# Logo Design

```yaml
task:
  task_name: Develop a Logo Design Brief, Direction or Application System
  status: pending
  responsible_executor: sagi-haviv
  execution_type: Agent
  policy: config/brand-runtime.yaml
  policy_instructions: >-
    At command time load squads/brand/config/brand-runtime.yaml. Apply task,
    executor and tier guidance under user/host instructions and core authority.
    Preserve checkpoints and human approval; no provider or messaging authority is granted.
  input:
    - Selected command and its stated prerequisites
    - Versioned brand evidence and user-supplied requirements
  output:
    - Selected command deliverable with rationale and evidence references
    - Open questions, human decisions and next handoff
  action_items:
    - Select exactly one procedure below and verify its inputs.
    - Execute its numbered steps; separate evidence from design judgment.
    - Check its acceptance criteria and report the selected scope only.
  acceptance_criteria:
    - The selected procedure's complete deliverable and decision rationale are present.
    - Missing empirical inputs are explicit and prevent unsupported approval.
    - Rendered artwork, user research and production files are claimed only if actually supplied or produced.
  handoff: Return the selected scope to brand-chief; human review precedes adoption.
```

## Command scope and evidence

A dependency fragment selects a section: read this base file, the shared policy
and the selected section. Complete that command only, not all four procedures.
Record command, brief/asset version, supplied evidence IDs, assumptions, output
and unresolved decisions. Missing essential inputs yield **NEEDS_INPUT** with
specific questions. Work based on assumptions is **DRAFT**, never approved.
Design judgment is labeled as such. Human approval is recorded only when given.
Existing Sagi methodology supplies the design criteria; these steps supply the
command's bounded deliverable. No external contact or provider execution is implied.

## logo-brief

**Inputs:** name/strategy, stakeholder answers, competitor marks, application
requirements and known constraints. **Owner:** Sagi. **Output:** a 1–2 page
creative logo brief, with an evidence/unknowns appendix if needed.

1. Ask who the organization serves, what it does, what differentiates it, what
   must change and what equity must survive. Capture the stakeholder's words;
   do not invent interviews or objectives from a missing response.
2. Choose 3–5 core attributes supported by those answers. For each, state the
   desired meaning and an unwanted interpretation the mark must avoid.
3. Inventory actual competitor marks with source/version and category. Describe
   similarities to avoid; if no marks are available, label this audit incomplete.
4. Inventory every required use: digital/physical, smallest reproduction size,
   backgrounds, print methods and accessibility/legibility constraints.
5. Record provided name, color, legal, budget, timing and technical constraints.
   Unknown constraints remain questions, not assumed approvals or invented budgets.
6. Compile objective, audience, attributes, competitors, applications, constraints
   and success criteria into the brief. Ask the human to approve or correct it.

**Acceptance:** all six areas are traceable, 3–5 attributes have rationale, and
every unknown has an owner/question. **Reject progression:** missing audience,
objective or critical reproduction constraint; unapproved brief cannot be called
ready for design. **Handoff:** approved brief to category-select or sketch-concepts.

## category-select

**Inputs:** approved brief, name characteristics, competitor category inventory,
reproduction requirements and existing brand equity. **Output:** seven-category
decision matrix, primary recommendation and secondary alternative.

1. Audit name length, distinctiveness and meaning. Describe whether the name
   itself must do the identifying work and which existing recognition to retain.
2. Map supplied competitor categories and required reproduction contexts. Keep
   missing competitor/recognition research explicit.
3. Before scoring, define a judgment rubric: 1 = conflicts with a requirement,
   3 = viable with documented tradeoffs, 5 = strong fit. These are ordinal design
   judgments, not measured performance or a statistically validated model.
4. Score **Wordmark, Letterform, Pictorial, Abstract, Emblem, Dynamic/Responsive,
   System** against name fit, differentiation, application fit and equity/maturity.
   Give a concrete reason for every row; mark unassessable cells UNVERIFIED.
5. Eliminate categories that violate a hard constraint regardless of their sum.
   Compare the remaining tradeoffs and identify which unknown could change the choice.
6. Recommend primary and secondary categories with their advantages, costs and
   conditions for reconsideration. Human selection precedes design commitment.

**Acceptance:** all seven rows, rubric, evidence, hard constraints and two reasoned
choices are present. **Reject:** no brief or application requirements; do not
manufacture numerical certainty from missing evidence. **Handoff:** chosen direction
to sketch-concepts, with the original brief and open validation questions.

## logo-system

**Inputs:** accepted mark/version, source files and approved application inventory.
**Output:** logo application specification and file manifest; production exports
are separate deliverables and must not be claimed from this document alone.

1. Inventory supplied assets and acceptance evidence. List horizontal, stacked,
   symbol-only and any required partner lockups; identify missing source files.
2. Define five responsive levels from full identity to smallest mark, with explicit
   application/breakpoint decisions. If a threshold has not been rendered/tested,
   label it proposed rather than validated.
3. Specify full color, reversed, black, white and single-color versions with
   permitted backgrounds. Separate required variants from files actually present.
4. Define the clear-space unit from the mark and its minimum. Specify minimum
   digital/print sizes per version, tied to supplied reproduction evidence.
5. Create a matrix of lockup × color × format × resolution/size × filename ×
   supplied/generated/missing status. Include vector masters and required raster exports.
6. Document ten misuse prohibitions with described examples: distortion, rotation,
   recoloring, low contrast, effects, altered proportions, added borders, undersizing,
   clear-space violation and low-resolution use. Do not imply mockups were rendered.
7. Review specification completeness and give Michael the integration handoff for
   broader identity guidelines. Keep final production/design approval with the human.

**Acceptance:** five levels, variants, clear space, minimums, file matrix and ten
misuses are explicit. **Reject validated-system status:** untested sizes/contrast
or missing required exports. A complete specification can still be DRAFT pending
visual verification. **Handoff:** Michael and brand-chief with outstanding asset work.

## sketch-concepts

**Inputs:** approved brief, 3–5 attributes, category direction and competitor references.
**Output:** concept descriptions and top three recommendations for visual exploration.

1. Extract the design problem and hard constraints from the approved brief.
2. Propose at least six distinct concepts across multiple categories. For each,
   describe visual form, category, strategic rationale and the attribute it serves.
3. Compare each proposal with supplied competitors; state how its structure could
   differ. Without competitor artifacts, distinctiveness remains a hypothesis.
4. Assess likely small-size behavior and simplicity risks as preliminary estimates.
   Do not report favicon, memory-sketch or child-drawing tests that did not happen.
5. Compare constraints/tradeoffs and select the top three with a concrete next
   visual experiment for each. Reject concepts inconsistent with the strategy.

**Acceptance:** six distinct descriptions, multiple categories, complete rationales,
explicit estimated assessments and three prioritized concepts. **Reject:** missing
brief or unsupported claims of tested artwork. **Handoff:** actual sketching and
rendering with human review; this command produces descriptions, not rendered sketches.
