# Brownfield evidence

Brownfield analysis captures a bounded, immutable view of an existing project and returns static evidence. It does not execute project source, run tests, install dependencies, clone repositories, refactor code, or publish files.

## Contract

The request must conform to `.aexos-core/schemas/brownfield-analysis-v1.schema.json`. The caller separately supplies the authorized absolute project root; the root inside the request must resolve to the same directory. Unknown fields, URL or Git locators, traversal and alias paths, unsupported verification modes, and unbounded limits are rejected before analysis.

```json
{
  "protocol": "aexos.brownfield-analysis/v1",
  "analysisId": "customer-api-review",
  "projectRoot": "C:/work/customer-api",
  "allowedPaths": ["."],
  "exclusions": ["private/**"],
  "requestedViews": ["architecture", "domain", "api", "data", "dependencies", "tests", "risks"],
  "limits": {
    "maxFiles": 1000,
    "maxDirectories": 500,
    "maxDepth": 12,
    "maxFileBytes": 524288,
    "maxTotalBytes": 16777216,
    "maxFindings": 2000,
    "maxElapsedMs": 30000
  },
  "output": { "mode": "return", "path": "evidence/brownfield.json" },
  "verification": {
    "mode": "static-only",
    "requireSourceHashes": true,
    "requireNoMutation": true
  }
}
```

After the shared CLI dispatcher registration is integrated, use:

```powershell
node bin/aexos.js brownfield analyze request.json --project-root C:\work\customer-api --format json
node bin/aexos.js brownfield validate request.json --project-root C:\work\customer-api
```

Both commands print to stdout. There is no `--write` option. `validate` prepares and hashes an in-memory publication input but does not submit it to a filesystem or publication runtime.

## Evidence semantics

Concrete findings carry the project-relative path, exact source SHA-256, one-based line and column locations, UTF-16 code-unit offsets used by the TypeScript parser, and a SHA-256 over the referenced UTF-8 span. A finding is either observed syntax or a labeled inference. Static imports, declarations, guard predicates, and locally bound literal HTTP routes are syntax evidence; they do not prove runtime reachability, deployed topology, business meaning, package installation, database state, test success, or coverage.

Source IDs hash the canonical project-relative path and source hash. Finding IDs hash the finding kind, name, assertion and confidence levels, extractor identity, every exact source reference, and exported attributes. Relationship IDs hash the relationship fields and references. Generation and public validation use the same helpers, so changing an identity-bearing field requires a new deterministic ID and malformed coordinates or authority claims are rejected.

Every requested view reports `complete-within-declared-supported-scope`, `partial`, or `unavailable`. Unsupported languages remain inventory-only. Parse failures, dynamic targets, ambiguous module resolution, ignored or unreadable content, limit exhaustion, and missing analyzers reduce coverage rather than producing invented facts.

The snapshot honors hard exclusions for source-control metadata, dependencies, generated output, vendor content, caches, known credential filenames, operator exclusions, and nested `.gitignore` rules. Operator and hard exclusions cannot be negated by repository ignore files. Ancestor rules and directory-relative basename rules apply even when analysis starts below the project root. Source bytes are read only through the confined read boundary. Invalid UTF-8, binary, oversized, linked, changed, and denied files are not parsed. Credential-bearing metadata values are omitted from exported findings. Secret-pattern suppression is an additional false-positive control and does not replace explicit private exclusions.

## Packaging and acceptance limits

Local JS and TS syntax analysis uses the trusted installed TypeScript parser and the installed ignore parser. Their presence in this checkout does not establish production package availability. Installed syntax support remains unavailable until the applicable package manifests and lockfile make those parsers supported runtime dependencies and the exact package is independently tested.

The returned evidence can be transformed into `aexos.brownfield-publication-input/v1` for an existing governed runtime. Analysis never calls a writer. Default-disabled native publication and the Windows privilege gate remain external blockers. Fixture tests establish local behavior only; they are not AEX-4.21 installed-journey acceptance, runtime parity, source-checkout parity, or independent QA.
