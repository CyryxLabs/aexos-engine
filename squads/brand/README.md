# Brand Squad

## Overview

Elite brand building squad powered by documented frameworks from 6 of the world's greatest branding minds. Every agent is cloned from a real expert with skin in the game, documented methodology, and battle-tested results.

## Purpose

Build brands with authority, emotional resonance, memorability, and premium perception. Strategy first, identity second. Every output is distinctive, emotionally powerful, commercially smart, and designed for long-term brand equity.

## When to Use This Squad

- Building a brand from scratch (startup, product, company)
- Repositioning an existing brand
- Auditing brand strengths and weaknesses
- Creating brand naming and verbal identity
- Designing visual identity systems and brand guidelines
- Building brand movements and emotional connection

## Agents

| Agent | Mind | Tier | Domain |
|-------|------|------|--------|
| **brand-chief** | *(orchestrator)* | 0 | Routes, coordinates, quality gates |
| **marty-neumeier** | Marty Neumeier | 0 | Brand strategy, diagnosis, Brand Gap, Zag |
| **april-dunford** | April Dunford | 1 | Positioning, Obviously Awesome canvas |
| **michael-johnson** | Michael Johnson | 1 | Visual identity, brand guidelines, 5.5 Steps |
| **sagi-haviv** | Sagi Haviv | 1 | Logo design, CGH methodology |
| **alexandra-watkins** | Alexandra Watkins | 1 | Naming, SMILE/SCRATCH frameworks |
| **emily-heyward** | Emily Heyward | 2 | Brand building, movements, Obsessed framework |

## Workflows

| Workflow | Description | Phases |
|----------|-------------|--------|
| `wf-brand-from-zero` | Complete brand creation from scratch | 5 phases: Diagnose → Position → Name → Identify → Activate |
| `wf-brand-audit` | Comprehensive multi-dimensional audit | 3 phases: Collect → Audit (6 dimensions) → Synthesize |

## Tasks

| Task | Agent | Purpose |
|------|-------|---------|
| `brand-diagnosis` | marty-neumeier | Brand Gap analysis, onliness, brand ladder |
| `positioning-exercise` | april-dunford | 10-step positioning canvas |
| `naming-exercise` | alexandra-watkins | SMILE/SCRATCH naming process |
| `visual-identity-brief` | michael-johnson | Typography, color, identity system |
| `logo-evaluation` | sagi-haviv | 5-pillar logo evaluation |
| `logo-design` | sagi-haviv | Logo brief, category decision, responsive system and concept specifications |
| `brand-book-creation` | michael-johnson | Complete brand guidelines |
| `brand-audit` | brand-chief | 6-dimension brand audit |
| `brand-touchpoint-audit` | emily-heyward | Touchpoint coherence analysis |
| `movement-architecture` | emily-heyward | Brand Soul Canvas, movement design |
| `coherence-check` | brand-chief | Cross-phase brand coherence verification |

## Templates

| Template | Agent | Purpose |
|----------|-------|---------|
| `positioning-canvas-tmpl.md` | april-dunford | Obviously Awesome positioning canvas |
| `brand-book-tmpl.md` | michael-johnson | Complete brand guidelines template |
| `brand-soul-canvas-tmpl.md` | emily-heyward | Obsessed framework brand soul canvas |

## Checklists

- `brand-strategy-checklist.md` — Post-diagnosis validation
- `positioning-checklist.md` — Post-positioning validation
- `naming-checklist.md` — SMILE/SCRATCH validation
- `visual-identity-checklist.md` — Identity completeness
- `brand-book-checklist.md` — Guidelines quality
- `brand-launch-checklist.md` — Pre-launch readiness

## Data / Knowledge Base

- `brand-archetypes.md` — 12 Jungian archetypes for brands (Mark/Pearson)
- `color-psychology.md` — Color-emotion mapping and strategy system
- `brand-voice-matrix.md` — Voice dimensions and tone modulation
- `brand-pantheon.md` — Top 30 iconic brands DNA reference
- `brand-audit-methodology.md` — 6-dimension audit framework

## Usage Examples

### Build a Brand from Scratch
```
/brand:brand-chief
*brand-from-zero
```

### Audit an Existing Brand
```
/brand:brand-chief
*brand-audit
```

### Activate a Specific Agent
```
/brand:marty-neumeier    → Brand strategy
/brand:april-dunford     → Positioning
/brand:alexandra-watkins → Naming
/brand:michael-johnson   → Visual identity
/brand:sagi-haviv        → Logo design
/brand:emily-heyward     → Brand activation
```

## Brand Building Sequence

```
Strategy → Positioning → Naming → Identity → Activation
   (1)         (2)         (3)       (4)         (5)

@marty-    @april-    @alexandra-  @michael-   @emily-
neumeier   dunford     watkins     johnson +    heyward
                                   @sagi-haviv
```

## Key Frameworks

| Framework | Expert | Use |
|-----------|--------|-----|
| Brand Gap (5 Disciplines) | Neumeier | Diagnose brand health |
| Zag (Onliness) | Neumeier | Find brand differentiation |
| Obviously Awesome Canvas | Dunford | Crystallize positioning |
| SMILE/SCRATCH | Watkins | Evaluate brand names |
| 5.5 Steps | Johnson | Create visual identity |
| CGH Logo Process | Haviv | Design logos |
| Obsessed (5 Pillars) | Heyward | Build brand movements |

## Pack Structure

```
squads/brand/
├── agents/
│   ├── brand-chief.md
│   ├── marty-neumeier.md
│   ├── april-dunford.md
│   ├── michael-johnson.md
│   ├── sagi-haviv.md
│   ├── alexandra-watkins.md
│   └── emily-heyward.md
├── checklists/
│   ├── brand-strategy-checklist.md
│   ├── positioning-checklist.md
│   ├── naming-checklist.md
│   ├── visual-identity-checklist.md
│   ├── brand-book-checklist.md
│   └── brand-launch-checklist.md
├── config/brand-runtime.yaml
├── data/
│   ├── brand-archetypes.md
│   ├── brand-audit-methodology.md
│   ├── brand-pantheon.md
│   ├── brand-voice-matrix.md
│   └── color-psychology.md
├── README.md
├── squad.yaml
├── tasks/
│   ├── brand-audit.md
│   ├── brand-book-creation.md
│   ├── brand-diagnosis.md
│   ├── brand-touchpoint-audit.md
│   ├── coherence-check.md
│   ├── logo-design.md
│   ├── logo-evaluation.md
│   ├── movement-architecture.md
│   ├── naming-exercise.md
│   ├── positioning-exercise.md
│   └── visual-identity-brief.md
├── templates/
│   ├── positioning-canvas-tmpl.md
│   ├── brand-book-tmpl.md
│   └── brand-soul-canvas-tmpl.md
└── workflows/
    ├── wf-brand-audit.yaml
    └── wf-brand-from-zero.yaml
```

---

**Built with strategy first, identity second. Every output distinctive, emotionally powerful, and designed for long-term brand equity.**

## Command-time policy

Every Brand work entry, including direct specialist requests, requires
`config/brand-runtime.yaml`. Agent command instructions load it when work starts,
not during activation, help, exit or idle chat. Tasks and workflows reference the
same file; `squad.yaml` remains the discovery and roster authority. Follow the
existing phase routing, checkpoints, vetoes and success criteria. User/host
instructions and core agent authority take precedence; humans retain human
approvals. Executor categories guide planning and do not authorize dispatch,
external messages or provider execution.

The seven policy blocks were preserved from `SynkraAI/aiox-squads` commit
`66118db856ef655b8cf5ba44eda963ad4d0b1d78`, `squads/brand/config.yaml`
(SHA-256 `5c8342cceac0b91a8dd89e24b5c20a2da6047679b961b81a20ef52bd7a67185b`).
The local policy retains those values; its reference `pack.author` is adapted to
Cyryx Labs AEXOS (file SHA-256
`dc0bfb69500462f898d4b814ca54580b5f468f11a19de29ff953bd975d1a8fda`).
Canonical ownership/license metadata remains in the manifest. `BR-TP-001` and
`BR-EP-*` are specification identifiers, not executable validators or adapters;
the empty pattern library does not supply implementations.

Run `node scripts/validate-squads.js` from the AEXOS repository to check the
concrete task fields, executor references, tiers and policy dependencies.
This validates source content and declared command guidance. It does not prove
that a native host loaded the policy, enforce runtime checkpoints, or certify
provider execution. Those require separate execution evidence.

## Specialist command procedures

Load the policy and the base task file, then execute only the named section.
The section anchor identifies a procedure; it is not part of a filesystem Read
path. Completing a section does not complete the full multi-phase task.

| Agent | Command | Task section |
| --- | --- | --- |
| Sagi | `*logo-brief` | [logo-brief](tasks/logo-design.md#logo-brief) |
| Sagi | `*category-select` | [category-select](tasks/logo-design.md#category-select) |
| Sagi | `*logo-system` | [logo-system](tasks/logo-design.md#logo-system) |
| Sagi | `*sketch-concepts` | [sketch-concepts](tasks/logo-design.md#sketch-concepts) |
| Sagi | `*simplicity-test` | [simplicity-test](tasks/logo-evaluation.md#simplicity-test) |
| Sagi | `*evaluation` | [evaluation](tasks/logo-evaluation.md#evaluation) |
| Sagi | `*logo-audit` | [logo-audit](tasks/logo-evaluation.md#logo-audit) |
| Alexandra | `*creative-brief` | [creative-brief](tasks/naming-exercise.md#creative-brief) |
| Alexandra | `*name-storm` | [name-storm](tasks/naming-exercise.md#name-storm) |
| Alexandra | `*smile-test` | [smile-test](tasks/naming-exercise.md#smile-test) |
| Alexandra | `*scratch-test` | [scratch-test](tasks/naming-exercise.md#scratch-test) |
| Alexandra | `*tagline` | [tagline](tasks/naming-exercise.md#tagline) |
| Alexandra | `*name-audit` | [name-audit](tasks/naming-exercise.md#name-audit) |
| Emily | `*obsessed` | [obsessed](tasks/movement-architecture.md#obsessed) |
| Emily | `*emotional-hook` | [emotional-hook](tasks/movement-architecture.md#emotional-hook) |
| Emily | `*brand-narrative` | [brand-narrative](tasks/movement-architecture.md#brand-narrative) |
| Emily | `*brand-soul` | [brand-soul](tasks/movement-architecture.md#brand-soul) |
| Emily | `*brand-tension` | [brand-tension](tasks/movement-architecture.md#brand-tension) |
| Emily | `*launch-story` | [launch-story](tasks/movement-architecture.md#launch-story) |
| Emily | `*touchpoint-audit` | [touchpoint-audit](tasks/brand-touchpoint-audit.md#touchpoint-audit) |

Command sections state their own inputs, score scales, deliverables and evidence
requirements. Legacy full-task scales remain explicitly separate. Missing
customer observations, artwork tests or legal clearance remain unverified;
design judgments and draft specifications do not establish those facts.

_Version: 1.0.0_
_Compatible with: AEXOS v4+_
