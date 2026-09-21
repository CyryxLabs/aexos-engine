# Changelog

All notable changes to AEXOS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and AEXOS uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-21

First public release of the AEXOS repository under its new release history.

### Added

- CLI-first orchestration with governed agent, task, workflow, and squad definitions.
- Multi-IDE projections for Claude Code, Codex, Gemini CLI, and supported editor integrations.
- Installer, diagnostics, validation, update, and recovery paths for greenfield and brownfield projects.
- Read-only Virtual Office observability for local runtime events.
- Public distribution manifests for the core, installer, install CLI, Pro CLI, and legacy compatibility wrapper.

### Changed

- Consolidated the public release identity at version `1.0.0`.
- Aligned public package versions and their internal AEXOS dependency ranges.
- Made GitHub release packaging and npm publication separate, explicitly initiated workflows.

### Attribution

AEXOS incorporates work derived from AIOX. The required attribution and licence terms remain in
the [AEXOS licence](LICENSE), the package notices, and the
[upstream AIOX licence](docs/legal/upstream-aiox-license.txt).
