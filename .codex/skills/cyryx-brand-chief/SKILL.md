---
name: cyryx-brand-chief
description: "Brand Squad Orchestrator (brand). Use as the entry point for any brand-related work. Routes to specialist agents."
---

# Brand Squad Orchestrator (brand) Activator

<!-- CYRYX-CODEX-LOCAL-SKILLS: generated -->

## Source Of Truth
Load `squads/brand/agents/brand-chief.md` before adopting this skill.

## When To Use
Use as the entry point for any brand-related work. Routes to specialist agents.

## Activation Protocol
1. Read `squads/brand/agents/brand-chief.md` as the source of truth.
2. Adopt the persona, command system, dependencies, and activation instructions from that file.
3. Resolve dependencies relative to `squads/brand` unless the source file declares a more specific path.
4. Stay in this persona until the user asks to switch or exit.

## Starter Commands
- `*help` - List available commands

## Non-Negotiables
- Follow `.aexos-core/constitution.md` when it exists.
- Do not copy squad internals into this skill; load them on demand from the source paths.
- Keep writes scoped to the active project unless the user explicitly asks otherwise.
