# AEXOS Workflows

This directory contains workflow definitions for the AEXOS (Cyryx) framework. Workflows define multi-step processes that can be executed by AEXOS agents.

## Available Workflows

### Development Workflows
- **brownfield-discovery.yaml** - Comprehensive technical debt assessment for existing projects
- **brownfield-fullstack.yaml** - Workflow for existing full-stack projects
- **brownfield-service.yaml** - Workflow for existing service/backend projects
- **brownfield-ui.yaml** - Workflow for existing UI/frontend projects
- **greenfield-fullstack.yaml** - Workflow for new full-stack projects
- **greenfield-service.yaml** - Workflow for new service/backend projects
- **greenfield-ui.yaml** - Workflow for new UI/frontend projects

## Project and IDE Setup

Run the public installer from your project directory and select the IDE integrations to configure:

```bash
npx @aexos/core install
```

For an existing project, request configuration merging:

```bash
npx @aexos/core install --merge
```

Primary rule files include:

- Claude Code: `.claude/CLAUDE.md`
- Cursor: `.cursor/rules/aexos-global.mdc`

After installation, run environment diagnostics:

```bash
npx @aexos/core doctor
```

To preview available repairs:

```bash
npx @aexos/core doctor --fix --dry-run
```

Node.js 18 or later is required. Use `install --help` and `doctor --help` for supported options.

## Creating New Workflows

Workflows are defined in YAML format. See existing workflows for examples.

### Workflow Structure
```yaml
workflow:
  id: unique-workflow-id
  name: Human-readable name
  description: What this workflow does
  type: configuration|development|deployment
  metadata:
    elicit: true  # If user interaction required
    confirmation_required: true
  sequence:
    - step: step_slug
      id: step-1
      agent: responsible-agent
      action: What this step does
      next: next-step-id

  # Optional compatibility metadata (non-executable)
  phases:
    - phase_1: Discovery
    - phase_2: Execution
```

## Best Practices
1. Keep workflows focused on a single objective
2. Include error handling for each step
3. Provide clear user feedback
4. Make workflows idempotent when possible
5. Document prerequisites and outcomes
