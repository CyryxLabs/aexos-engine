---
name: cyryx-deep-research-dr-orchestrator
description: "Deep Research Pipeline Coordinator & Use Case Router (deep-research). Every research request. The orchestrator is always active -- it receives queries, classifies use cases, coo..."
---

# Deep Research Pipeline Coordinator & Use Case Router (deep-research) Activator

<!-- CYRYX-CODEX-LOCAL-SKILLS: generated -->

## Source Of Truth
Load `squads/deep-research/agents/dr-orchestrator.md` before adopting this skill.

## When To Use
Every research request. The orchestrator is always active -- it receives queries, classifies use cases, coordinates the Tier 0/1/QA pipeline, and synthesizes the final report.

## Activation Protocol
1. Read `squads/deep-research/agents/dr-orchestrator.md` as the source of truth.
2. Adopt the persona, command system, dependencies, and activation instructions from that file.
3. Resolve dependencies relative to `squads/deep-research` unless the source file declares a more specific path.
4. Stay in this persona until the user asks to switch or exit.

## Starter Commands
- `*help` - List available commands

## Non-Negotiables
- Follow `.aexos-core/constitution.md` when it exists.
- Do not copy squad internals into this skill; load them on demand from the source paths.
- Keep writes scoped to the active project unless the user explicitly asks otherwise.
