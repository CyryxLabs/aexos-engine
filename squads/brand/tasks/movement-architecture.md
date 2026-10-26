---
task: movement-architecture
owner: '@brand-chief'
owner_type: agent
atomic_layer: task
Input: Use the selected command section inputs, or the full-task inputs for a full-task request.
Output: Produce every deliverable in the selected command section; full-task requests require all full-task deliverables.
Checklist:
  - '[ ] Execute every step of the explicitly selected scope.'
  - '[ ] Validate every output of that scope without claiming completion of other sections.'
---

# Movement Architecture

```yaml
task:
  policy: config/brand-runtime.yaml
  policy_instructions: >-
    Before this task, load squads/brand/config/brand-runtime.yaml. Apply its task anatomy,
    executor and tier guidance under user/host instructions and core authority. Preserve
    this task's checkpoints, vetoes and success criteria; human approvals remain human.
    This guidance does not grant dispatch, messaging or provider execution authority.
  task_name: "Design Brand Movement Architecture"
  status: pending
  responsible_executor: emily-heyward
  execution_type: Agent
  estimated_time: "1-2h"
  elicit: true

  input:
    - "Complete brand identity (strategy + positioning + name + visual)"
    - "Business context"

  output:
    - "Brand Soul Canvas"
    - "Movement architecture"
    - "Emotional hook definition"
    - "Touchpoint plan"
    - "Launch narrative"

  action_items:
    - step: 1
      name: "Identify Emotional Hook"
      description: |
        Ask:
        1. What frustration exists in this category that NO ONE talks about?
        2. What aspiration do customers have that current brands ignore?
        3. What would make someone say "FINALLY, someone gets it"?

        The emotional hook = the gap between what exists and what should exist.

    - step: 2
      name: "Build Brand Narrative"
      description: |
        Three-act structure:
        1. TENSION: The world is broken because [shared enemy]
        2. BELIEF: We believe [brand worldview]
        3. RESOLUTION: That's why we built [brand] to [transformation]

        Test: Would someone share this story with a friend?

    - step: 3
      name: "Complete Brand Soul Canvas"
      description: |
        Fill all 7 blocks:
        | Block | Content |
        |-------|---------|
        | Founding Myth | The story of the struggle that birthed the brand |
        | The Why | Why would the world be worse without this brand? |
        | Shared Enemy | The status quo you exist to disrupt |
        | Sacred Values | 3-5 non-negotiables (hiring/firing decisions) |
        | Rituals | Internal + external behaviors reinforcing identity |
        | The Lexicon | Specific language used by the tribe |
        | Brand Tension | Two opposing forces the brand balances |

    - step: 4
      name: "Design Movement Architecture"
      description: |
        1. SHARED ENEMY: What are we fighting against?
        2. RALLYING CRY: What's our battle call? (not a tagline — a belief)
        3. TRIBE RITUALS: What do our believers DO?
           - Onboarding ritual (first experience)
           - Regular ritual (recurring engagement)
           - Initiation ritual (becoming an insider)
        4. TRIBE SIGNALS: How do members recognize each other?
        5. ESCALATION: How do casual users become evangelists?

    - step: 5
      name: "Touchpoint Plan"
      description: |
        For each touchpoint, define how it reinforces the brand belief:
        1. Website above the fold — First impression
        2. Onboarding flow — First experience
        3. Packaging/unboxing — Physical encounter
        4. Email communications — Ongoing relationship
        5. Social media — Public personality
        6. Customer support — Crisis moment
        7. Error states — When things go wrong
        8. Success moments — Celebration

    - step: 6
      name: "Launch Narrative"
      description: |
        Create the story for launch:
        - Who are we?
        - Why now?
        - What do we believe?
        - What are we fighting against?
        - What happens when you join us?

        Format: 500-word brand manifesto.

  output_example: |
    ## Brand Soul Canvas — Cyryx Labs

    | Block | Content |
    |-------|---------|
    | Founding Myth | Born from the chaos of managing 12 AI tools that didn't talk to each other |
    | The Why | Without Cyryx Labs, dev teams drown in AI tool fragmentation |
    | Shared Enemy | The "AI tool sprawl" — 50 AI products, zero orchestration |
    | Sacred Values | 1. Clarity over complexity 2. Systems over hacks 3. Human judgment first |
    | Rituals | Weekly "orchestration review," onboarding "first flow" moment |
    | The Lexicon | "Orchestrate" not "automate," "squad" not "team," "flow" not "pipeline" |
    | Brand Tension | Powerful capability x Simple interface |

    ## Movement Architecture
    - **Shared Enemy:** The fragmented AI stack that wastes 40% of dev time
    - **Rallying Cry:** "One system to orchestrate them all"
    - **Tribe Rituals:**
      - Onboarding: First successful multi-agent flow (the "aha" moment)
      - Regular: Weekly orchestration review with squad metrics
      - Initiation: Publishing your first custom squad template
    - **Escalation Path:** User → Power user → Squad builder → Community contributor

    ## Emotional Hook
    "You didn't become a developer to babysit 12 disconnected AI tools.
    You became a developer to build things that matter."

  acceptance_criteria:
    - "Brand Soul Canvas all 7 blocks filled"
    - "Emotional hook is specific and resonant"
    - "Movement architecture has shared enemy"
    - "Touchpoint plan covers 8 key moments"
    - "Launch narrative is emotion-first"

  veto_conditions:
    - "No emotional hook → VETO"
    - "Brand narrative leads with features → VETO"
    - "Sacred values are generic → VETO"

  handoff:
    on_complete: "Present to brand-chief for final review"
    deliverable: "Brand Soul Canvas + Movement Architecture + Launch Narrative"
```

## Standalone command scope and evidence

The full movement task above remains available to *movement. The sections below
are independent Emily-owned procedures: read the base file and Brand policy,
then execute only the selected section. Record input/version, supplied evidence,
proposed content, unknowns and next human decision. No founder story, customer
quote, interview, adoption metric or community result may be invented as fact.
Assumption-based output is a DRAFT/HYPOTHESIS; missing essential facts produce
NEEDS_INPUT. These procedures grant no publishing, outreach or provider authority.

## obsessed

**Inputs:** founder/belief evidence, identity/context, category/customer evidence
and observable touchpoints. **Output:** five-pillar brand obsession blueprint.

1. Strategic foundation: elicit the belief, origin and concrete business behavior
   supporting it. Separate an aspirational belief from current proof.
2. Emotional hook: execute emotional-hook below; preserve all evidence limitations.
3. Narrative: execute brand-narrative using supported facts and the customer as hero.
4. Experience: inventory digital, physical and human touchpoints; execute the
   touchpoint-audit section in brand-touchpoint-audit.md on actual supplied artifacts.
5. Community: define shared identity, non-personal status-quo enemy, five ritual
   types, rally cry, belonging signals and proposed victory-story collection.
   Use the full movement procedure's community steps; never fabricate adoption.
6. Assemble the five pillars with belief → expression → evidence traceability,
   contradictions, owners and next validation steps.

**Acceptance:** all five pillars and their deliverables are present; missing
evidence is explicit. **Reject complete blueprint:** missing pillar or critical
unsupported belief/customer claim. **Handoff:** brand-chief/human review; execution
of proposed campaigns or community activities is a separate authorized action.

## emotional-hook

**Inputs:** category, credible brand capability/belief and customer/competitor
evidence. **Output:** Emotional Hook Statement and Rally Cry.

1. Build the four-dimension audit: current category emotion, desired emotion,
   emotional gap and overlooked gap. Cite supplied observations for each cell.
2. Express the gap as a human insight; avoid turning a product feature into a
   purported customer emotion without evidence.
3. Amplify alternatives through What If, Permission Slip or Calling Out; choose
   the framing the brand can credibly support and explain the choice.
4. Evaluate TRUE, FELT, UNADDRESSED, ACTIONABLE and UNIVERSAL. Record evidence or
   missing evidence per criterion; universality means a relevant shared tension,
   not an unsupported claim about every person.
5. Write the Hook Statement and Rally Cry; separate observed insight from creative
   formulation. List concrete research questions for any unsupported criterion.

**Acceptance:** four-dimension audit, chosen amplification and five-criterion
assessment. **Reject validated-hook status:** absent customer/category evidence.
A hypothesis and research questions are useful output, but not validation.
**Handoff:** human review, research if needed, then brand-narrative.

## brand-narrative

**Inputs:** verified founding facts, belief/hook and intended customer transformation.
**Output:** three-act arc, voice choices and four narrative assets.

1. Separate verified facts, intended transformation and unknowns. Do not invent
   founder hardship, customer results or social proof to fill narrative gaps.
2. Build Tension → Belief → Resolution with the customer as hero and the brand
   as enabler. State how the product/behavior supports the resolution.
3. Choose and justify four voice spectra: playful/serious, expert/friend,
   calm/passionate and casual/elevated.
4. Write Origin Story (300–500 words), Manifesto (150–250 words), Elevator Story
   (about 30 seconds) and Campfire Story (about two minutes). Count written words;
   estimate spoken timing explicitly until an actual read-aloud is recorded.
5. Check consistency across assets and trace factual claims to inputs. Unsupported
   emotional response remains a hypothesis for audience testing.

**Acceptance:** arc, four voice choices, four complete assets and factual traceability.
**Reject:** invented history/results or a missing asset reported as complete.
**Handoff:** human fact/voice approval; launch-story after required inputs exist.

## brand-soul

**Inputs:** founding evidence, purpose, values, practices, belief and tension.
**Output:** a one-page seven-block Brand Soul Canvas.

1. Write Founding Myth from verified origin facts and The Why from a supported
   purpose; label aspiration separately from established history.
2. Name the Shared Enemy as a system, mindset or status quo, not a person or competitor.
3. Choose 3–5 Sacred Values; give each a behavioral anchor and a sacrifice that
   would make it consequential in an actual business decision.
4. Record internal and external Rituals; mark current practices vs proposals.
5. Build The Lexicon with owned words, banned words and tribal phrases.
6. State Brand Tension as two opposing forces and explain how both are held.
7. Place all seven blocks in the existing Brand Soul Canvas template; compress
   to one page without hiding missing facts or claiming proposed rituals exist.

**Acceptance:** seven blocks, 3–5 anchored values, both ritual types and three
lexicon groups. **Reject approved canvas:** missing founding/values evidence or
contradictory core blocks. **Handoff:** human review and brand-tension assessment.

## brand-tension

**Inputs:** belief/positioning, two candidate forces and actual brand expressions.
**Output:** Brand Tension Statement and expression audit matrix.

1. Identify the opposing forces from Emily's force categories, explaining why
   each matters and why reducing the brand to only one would weaken it.
2. State how the brand holds both with concrete product/behavior examples.
3. Build four required matrix rows: **visual, verbal, product, customer**. Inventory
   supplied expressions for each, citing artifact/observation and both forces.
   Assign **balanced**, **skewed_a**, **skewed_b** or **absent** only from supplied
   evidence. Mark a row **UNVERIFIED** when its evidence is missing; missing input
   does not demonstrate absent tension. Explain the emphasized force and neglected
   counterweight, including any contradiction between dimensions.
4. Recommend specific corrections with owners and observable acceptance checks.
   Missing expressions yield an unverified hypothesis, not a completed audit.

**Acceptance:** both forces, synthesis and all four dimension rows with evidence,
explicit status and specific fixes where needed; unverified rows remain open.
**Reject:** abstract opposites without a business relationship or invented observed
balance. **Handoff:** affected content/design owners, then human review.

## launch-story

**Inputs:** reviewed Brand Soul Canvas, approved factual narrative, launch purpose
and audience. **Output:** Launch Narrative Package for review, not publication.

1. Synthesize the canvas into a launch thesis and intended audience transformation.
2. Draft a press-ready origin story using approved facts and flag any missing fact.
3. Write the launch manifesto and a founder narrative suitable for press/podcast.
   Do not fabricate quotations, endorsements or interview participation.
4. Plan pre-launch tease → reveal → rally. For each stage specify message, proposed
   asset/channel, human owner, dependency and acceptance check; distinguish dates
   provided by the user from tentative planning assumptions.
5. Check consistency with belief/voice and list approvals, production and research
   still required before publishing any asset.

**Acceptance:** thesis, origin story, manifesto, founder narrative and all three
sequence stages with ownership/dependencies. **Reject ready-to-publish status:**
unverified claims or absent approvals. **Handoff:** human/content owners; this
command does not contact press, schedule posts or execute a provider.
