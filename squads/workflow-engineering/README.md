# Workflow Engineering Squad

Turns evidence about a real business process into a dependency-safe workflow
map, canonical AEXOS task contracts and explicit automation decisions.

The squad designs and validates. It does not execute external actions, grant
capabilities, approve its own work or claim that an undocumented process step
exists. Start with `@workflow-chief` or run the deterministic compiler:

```powershell
aexos workflow map process.json --json
```

`PASS` means the map has no governed automation candidates. `CONCERNS` means
one or more steps still require runtime governance, capability leases or human
approval. Neither verdict executes the workflow.
