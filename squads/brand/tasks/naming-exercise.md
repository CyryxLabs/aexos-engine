---
task: naming-exercise
owner: '@brand-chief'
owner_type: agent
atomic_layer: task
Input: Use the selected command section inputs, or the full-task inputs for a full-task request.
Output: Produce every deliverable in the selected command section; full-task requests require all full-task deliverables.
Checklist:
  - '[ ] Execute every step of the explicitly selected scope.'
  - '[ ] Validate every output of that scope without claiming completion of other sections.'
---

# Naming Exercise

```yaml
task:
  policy: config/brand-runtime.yaml
  policy_instructions: >-
    Before this task, load squads/brand/config/brand-runtime.yaml. Apply its task anatomy,
    executor and tier guidance under user/host instructions and core authority. Preserve
    this task's checkpoints, vetoes and success criteria; human approvals remain human.
    This guidance does not grant dispatch, messaging or provider execution authority.
  task_name: "Execute Brand Naming"
  status: pending
  responsible_executor: alexandra-watkins
  execution_type: Agent
  estimated_time: "1-2h"
  elicit: true

  input:
    - "Brand strategy document"
    - "Positioning canvas"
    - "Domain/trademark constraints"

  output:
    - "Naming creative brief"
    - "50+ name candidates"
    - "Top 5 finalists with SMILE/SCRATCH scores"
    - "Recommended name with rationale"
    - "Tagline options"

  action_items:
    - step: 1
      name: "Creative Brief"
      description: |
        Document:
        1. What the brand does (one sentence)
        2. Who it's for (target characteristics)
        3. What it should FEEL like (3 adjectives)
        4. What it should NOT feel like (3 adjectives)
        5. Competitor names to AVOID similarity to
        6. Constraints (domain availability, trademark, language)

    - step: 2
      name: "Name Storm"
      description: |
        Generate 50+ candidates using 8 techniques:
        1. Word associations (from brand values)
        2. Metaphors (what is the brand LIKE?)
        3. Compound words (two words merged)
        4. Portmanteaus (blended words)
        5. Foreign words (relevant languages)
        6. Mythology/history references
        7. Evocative imagery (what picture does it paint?)
        8. Sound symbolism (does it SOUND like what it is?)

    - step: 3
      name: "SMILE Test"
      description: |
        Score each candidate 1-5 on:
        S = Suggestive (evokes brand meaning)
        M = Memorable (sticks in memory)
        I = Imagery (triggers visual)
        L = Legs (extension potential)
        E = Emotional (moves people)

        Total possible: 25. Keep candidates scoring 18+.

    - step: 4
      name: "SCRATCH Test"
      description: |
        Eliminate if ANY apply:
        S = Spelling-challenged (hard to spell)
        C = Copycat (too similar to competitor)
        R = Restrictive (limits future growth)
        A = Annoying (forced puns, groan-worthy)
        T = Tame (bland, forgettable)
        C = Curse of Knowledge (insiders only)
        H = Hard to pronounce (fails radio test)

        One fail = elimination.

    - step: 5
      name: "Shortlist & Present"
      description: |
        Top 5-10 candidates:
        - Name
        - SMILE score (/25)
        - SCRATCH result (PASS/FAIL per criterion)
        - Rationale (why this name works)
        - Domain check (available? alternatives?)
        - Tagline pairing possibility

    - step: 6
      name: "Tagline Creation"
      description: |
        For the top 3 names, create 3 tagline options each.

        Rules:
        - 7 words or fewer
        - Works without the brand name
        - Passes the t-shirt test
        - Types: Imperative, Descriptive, Provocative

  output_example: |
    ## Naming Exercise: Top 5 Finalists

    | Rank | Name | SMILE | S | C | R | A | T | C | H | Rationale |
    |------|------|-------|---|---|---|---|---|---|---|-----------|
    | 1 | **Cyryx Labs** | 22/25 | P | P | P | P | P | P | P | Evokes "sync" + "craft"; short, ownable, global |
    | 2 | Orkos | 20/25 | P | P | P | P | P | P | P | From "orchestrate"; strong, memorable |
    | 3 | Condukt | 19/25 | P | P | P | P | P | F | P | "Conduct" as in orchestra; spelling may confuse |
    | 4 | Fluxon | 19/25 | P | P | P | P | P | P | P | Flow + motion; modern feel |
    | 5 | Agora | 18/25 | P | F | P | P | P | P | P | Greek marketplace; may conflict with existing brands |

    **Recommendation:** Cyryx Labs
    - SMILE breakdown: S=5, M=5, I=4, L=4, E=4
    - Domain: Cyryx Labs.com available
    - Trademark: No conflicts in software class
    - Why it wins: Instantly suggests synchronization and precision. Two syllables, globally pronounceable, no negative connotations in major languages.

    **Tagline Options:**
    1. "Orchestrate everything." (Imperative)
    2. "Your agents. Your workflow." (Descriptive)
    3. "Stop prompting. Start shipping." (Provocative)

  acceptance_criteria:
    - "50+ candidates generated and documented"
    - "Top 5 all score 18+ on SMILE"
    - "Top 5 all pass SCRATCH"
    - "Recommended name has full rationale"
    - "At least 3 tagline options"

  veto_conditions:
    - "Name fails SCRATCH → cannot be recommended"
    - "Name requires explanation → VETO"
    - "Fewer than 30 candidates generated → insufficient exploration"

  handoff:
    on_complete: "Pass to michael-johnson + sagi-haviv for visual identity"
    deliverable: "Selected name + tagline + naming brief"
```

## Standalone command scope

The full naming task above retains its legacy exploration/18+ progression rule.
The independently invoked commands below use the advertised Alexandra command
contracts: do not mix eligibility labels or silently mark the full naming task
complete after one section. Read the base file and shared Brand policy first.
Record command, brief version, candidate IDs, evidence, judgment and unknowns.
No name/tagline is legally cleared by these procedures. Human approval is explicit.

## creative-brief

**Inputs:** stakeholder answers and existing strategy/positioning. **Output:**
approved naming creative brief; missing answers produce NEEDS_INPUT.

1. Elicit all ten naming topics: what is being named; plain-language description;
   audience/pain/language; promise; desired emotions; competitors; constraints;
   tone spectra; admired names with reasons; prohibited names with reasons.
2. Challenge vague claims and distinguish a desired promise from a demonstrated
   guarantee. Capture exact answers and name unresolved questions/owners.
3. Document what the name must suggest, desired/undesired associations, linguistic
   and domain/legal requirements. Use the agent's creative-brief structure.
4. Present the brief for human correction and approval before a name storm.

**Acceptance:** ten topics answered or explicitly outstanding; approved brief
has no unresolved critical audience/positioning/constraint question. **Handoff:**
name-storm only after approval. This command does not generate or select names.

## name-storm

**Inputs:** approved brief and constraints. **Output:** at least 50 distinct
proposed candidates, organized by eight techniques with rationale.

1. Extract audience, promise, desired emotions and restrictions from the brief.
2. Generate 6–8 candidates for each of associations, metaphors, compounds,
   portmanteaus, foreign words, mythology, invented words and real words.
3. Deduplicate across techniques and replenish until at least 50 distinct names
   remain. Six in each bucket is only 48; show bucket counts and distinct total.
4. For every name, give technique and brief-linked rationale. Mark linguistic
   meaning/pronunciation as needing confirmation when not evidenced.
5. Retain the exploration ledger for review; do not call this set a cleared shortlist.

**Acceptance:** all eight techniques represented, 6–8 per technique, at least
50 unique names and rationales. **Reject:** unapproved brief or padding with
duplicates. **Handoff:** SMILE scoring; legal/domain searches remain outstanding.

## smile-test

**Inputs:** supplied candidate set and approved brief. **Output:** scored/ranked
candidates, documented quick-scan exclusions and a shortlist of up to 20–30.

1. Quick-scan for obvious conflicts; record every exclusion and its brief-based reason.
2. Score Suggestive, Memorable, Imagery, Legs and Emotional from 1 to 5 for each
   remaining candidate under the agent's SMILE rubric; give rationale per dimension.
   A memorability judgment is not an observed recall study.
3. Sum the five scores /25. Command bands are **20–25 STRONG**, **15–19 NEEDS_WORK**,
   below 15 weak. These differ from the full-task legacy 18+ progression threshold.
4. Rank by total, explain ties and return the available top 20–30 when enough
   candidates exist. If fewer were supplied, return fewer; do not invent padding.
5. Record scoring confidence, unresolved language/association evidence and next tests.

**Acceptance:** all retained candidates have five reasoned scores and correct
totals/bands; exclusions are visible. **Reject validated audience response:**
no actual audience study. **Handoff:** STRONG candidates to SCRATCH; revise
NEEDS_WORK candidates before treating them as a strong shortlist.

## scratch-test

**Inputs:** SMILE-surviving names, brief, languages and competitor context.
**Output:** complete elimination ledger and surviving preliminary shortlist.

1. Check all seven SCRATCH criteria for each candidate: Spelling challenged,
   Copycat, Restrictive, Annoying, Tame, Curse of knowledge and Hard to pronounce.
2. Record evidence and PASS/FAIL for each performed check. A single FAIL eliminates
   the candidate; preserve its reason instead of hiding it from the output.
3. Mark unperformed pronunciation/radio/language/competitor checks UNVERIFIED.
   A candidate with unknown checks is pending evidence, not a complete pass.
4. Separate eliminated, pending and surviving candidates. List the next exact
   observation/search needed, without claiming trademark or domain clearance.

**Acceptance:** seven outcomes per candidate, one-fail elimination applied,
pending evidence separated from passes. **Handoff:** human shortlist review and
appropriate actual legal/domain investigation; no automatic legal approval.

## tagline

**Inputs:** chosen brand name, established positioning and supported promise.
**Output:** 15–20 proposed taglines, evaluated to a top 5–7 shortlist.

1. Restate the promise and the feeling the line should evoke; reject an unsupported
   guarantee or a missing positioning brief before writing claims.
2. Generate 15–20 distinct lines across all five advertised types: imperative,
   descriptive, superlative, provocative and specific. Label each type.
3. Evaluate each against five rules: at most seven words, works without the brand
   name, t-shirt appeal, not merely a description, and durability. Show actual word
   counts. Even a descriptive-type candidate must do more than label a product.
4. Treat wearable appeal/resonance/durability as evaluator judgment unless tested.
   Eliminate rule failures and explain the top 5–7 with alternatives/tradeoffs.
5. If too few survive, revise candidates until the shortlist is complete; do not
   lower the rules to fill slots. Separate linguistic/legal checks still needed.

**Acceptance:** 15–20 distinct candidates, five types, five-rule ledger and 5–7
reasoned finalists. **Handoff:** human selection and actual audience/legal checks.
The legacy full-task three-options-per-name output does not satisfy this command.

## name-audit

**Inputs:** existing name, positioning, expansion/language constraints and
competitor names. **Output:** KEEP / CONSIDER RENAMING / RENAME recommendation.

1. Run smile-test on the actual existing name using command-mode scores; do not
   require generation of 50 new names merely to assess the current one.
2. Run all seven SCRATCH checks, preserving unknown evidence and elimination reasons.
3. Compare supplied competitor names and future scope/language requirements.
   Record exactly what evidence supports similarity or restriction concerns.
4. Recommend KEEP for a strong, fully screened strategic fit; CONSIDER RENAMING
   for repairable concerns or pending evidence; RENAME for evidenced structural
   naming problems. Explain the decision, not just the numerical score.
5. For renaming, state what the next brief must improve and what existing equity
   must be investigated before a human commits to change.

**Acceptance:** both screens, competition/expansion analysis and evidence-linked
recommendation. **Reject unconditional KEEP:** unresolved critical checks.
**Handoff:** human decision, then creative-brief if renaming is chosen.
