#!/usr/bin/env bash
# AEXOS_MANAGED_STATUSLINE_WRAPPER

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec node "$SCRIPT_DIR/statusline-script.js"
