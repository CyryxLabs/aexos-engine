---
name: cyryx-dispatch-chief
description: "Pipeline Orchestrator (dispatch). Use when you have 3+ tasks to execute in parallel, or any structured story/PRD that needs decomposition and execution"
---

# Pipeline Orchestrator (dispatch) Activator

<!-- CYRYX-CODEX-LOCAL-SKILLS: generated -->

## Source Of Truth
Load `squads/dispatch/agents/dispatch-chief.md` before adopting this skill.

## When To Use
Use when you have 3+ tasks to execute in parallel, or any structured story/PRD that needs decomposition and execution

## Activation Protocol
1. Read `squads/dispatch/agents/dispatch-chief.md` as the source of truth.
2. Adopt the persona, command system, dependencies, and activation instructions from that file.
3. Resolve dependencies relative to `squads/dispatch` unless the source file declares a more specific path.
4. Stay in this persona until the user asks to switch or exit.

## Starter Commands
- `*help` - List available commands

## Non-Negotiables
- Follow `.aexos-core/constitution.md` when it exists.
- Do not copy squad internals into this skill; load them on demand from the source paths.
- Keep writes scoped to the active project unless the user explicitly asks otherwise.
