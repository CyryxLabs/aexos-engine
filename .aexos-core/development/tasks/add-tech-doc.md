---
task: Add Tech Documentation Preset
owner: @aexos-master
owner_type: agent
atomic_layer: task
Input: |
  - file_path: Path to the source technical documentation
  - preset_name: Optional lowercase kebab-case destination name
Output: |
  - preset_path: Created file under .aexos-core/data/tech-presets/
Checklist:
  - [ ] Read the source without changing it
  - [ ] Confirm metadata and required sections are complete
  - [ ] Refuse ambiguous or incomplete source instead of inventing technical facts
  - [ ] Create a new preset without overwriting an existing one
dependencies:
  scripts:
    - add-tech-doc.js
  data:
    - tech-presets/_template.md
---

# `*add-tech-doc`

Creates a project tech preset from local technical documentation while preserving the source and every existing preset.

## Usage

```text
@aexos-master
*add-tech-doc {file-path} [preset-name]
```

Read the source, extract only facts it supports into the structure from `.aexos-core/data/tech-presets/_template.md`, and save that extracted draft to a temporary file. Then run the canonical writer from the project root:

```bash
node .aexos-core/development/scripts/add-tech-doc.js <file-path> [preset-name] --candidate <extracted-preset-path>
```

If `preset-name` is omitted, the importer uses the source filename without its extension. The name and the `preset.id` value must match and use lowercase kebab-case.

## Source contract

The extracted candidate must follow `.aexos-core/data/tech-presets/_template.md`. It must contain:

- a fenced YAML block with `preset.id`, `name`, `version`, `description`, a non-empty `technologies` list, and a non-empty `suitable_for` list;
- `Design Patterns`, `Project Structure`, `Tech Stack`, `Coding Standards`, and `Testing Strategy` level-two sections.

Map source headings and prose into the closest template sections without changing their meaning. Preserve useful source details that do not fit a required section under `## Additional Source Guidance`. When documentation does not contain required facts, stop and ask for the missing information. Do not infer versions, packages, compatibility, security claims, or operating guidance.

## Write contract

The writer validates the extracted result, records the source filename and SHA-256 digest in a provenance comment, and writes `.aexos-core/data/tech-presets/{preset-name}.md` with exclusive creation. It refuses an existing destination and leaves its content unchanged. Invalid metadata, incomplete sections, path traversal through the preset name, directories, and symbolic-link sources fail before writing. A source that already follows the preset schema can be passed without `--candidate`.

After creation, use `@architect *validate-tech-preset {preset-name}` for the full content-quality review.
