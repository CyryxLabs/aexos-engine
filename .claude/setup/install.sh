#!/usr/bin/env bash
# AEXOS Claude Code statusline setup entrypoint.

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"

exec node "$REPOSITORY_ROOT/.aexos-core/product/templates/statusline/install-statusline.js" "$@"
