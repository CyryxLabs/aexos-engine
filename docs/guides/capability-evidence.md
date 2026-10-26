# Capability evidence tools

These tools retain the existing CLI and use the existing task-contract and
squad-registry formats. They do not certify a squad or a provider as operational.

## Structural coverage

```sh
node bin/aexos.js capabilities --json
node bin/aexos.js capabilities --project-root=C:/AEXOS --strict
npm run validate:grok-projection
```

Coverage exits 1 for definition/manifest errors, 2 in strict mode for incomplete
coverage or an empty group, otherwise 0. Legacy frontmatter incompatible with V1
is diagnostic evidence, not proof that the underlying methodology is defective.
Grok checking generates into an isolated temporary directory and leaves installed
projections unchanged. It does not run the Grok host.

## Outcome verification

Create `outcome.json` with actual project-relative output paths:

```json
{
  "contract": {
    "contractVersion": 1,
    "inputs": [],
    "produces": [{ "name": "report", "kind": "file", "path": "report.md" }],
    "verify": [{ "type": "file-exists", "target": "report.md" }]
  },
  "success": true,
  "produced": ["report.md"]
}
```

```sh
node bin/aexos.js capabilities --verify=outcome.json --project-root=C:/my-project
```

The file must exist. Missing artifacts, wrong kinds, undeclared paths, outside
paths, symlinks/junctions and unsupported checks fail. Successful CLI evaluation
exits 0; errors exit 1. This example proves existence only, not report quality.

For runtime integration, construct `AgentRuntime` with trusted `outcomeVerifiers`
for additional check types, and pass `requireAcceptance: true` and a V1 contract
to `execute`. A trusted adapter receives `(check, { projectRoot, artifacts })`
and must return boolean `true`. A string such as `PASS` is not accepted. The task
cannot install an adapter. No arbitrary shell execution is built into this tool.
The operator is responsible for adapter timeout, resource limits and isolation.

Acceptance returns `evidenceLevel: declared-checks-passed` and a contract hash.
It is not a signed or enduring artifact attestation. Legacy calls receive no
acceptance claim. System-wide enforcement and OS-level containment are separate.

## Decision rubric

Example `rubric.json` (illustrative scores, not measured product performance):

```json
{
  "criteria": [
    { "id": "quality", "weight": 3, "minimum": 80 },
    { "id": "cost-efficiency", "weight": 1 }
  ],
  "sources": [{ "id": "pilot", "reference": "evidence/pilot-results.json" }],
  "alternatives": [
    {
      "id": "option-a",
      "scores": {
        "quality": { "value": 90, "sources": ["pilot"] },
        "cost-efficiency": { "value": 70, "sources": ["pilot"] }
      }
    },
    {
      "id": "option-b",
      "scores": {
        "quality": { "value": 75, "sources": ["pilot"] },
        "cost-efficiency": { "value": 100, "sources": ["pilot"] }
      }
    }
  ]
}
```

```sh
node bin/aexos.js capabilities --rank=rubric.json
```

Option B is excluded by the quality minimum. Higher scores always mean better;
raw cost/duration must first be converted to an explicit documented utility scale.
Optional `weightOverrides` maps criterion ids to non-negative weights. Required
minimums still apply at weight zero. Missing source references prevent eligibility;
ties return a null winner. Scores are rounded to four decimals and equal displayed
scores are treated as ties. The program validates references, not source truth or
freshness, and never fetches URLs. A valid evaluation with no winner still exits 0;
callers must inspect `winner`, `ties` and alternative statuses before proceeding.
