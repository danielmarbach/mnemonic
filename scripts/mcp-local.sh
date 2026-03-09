#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

npm --prefix "$ROOT_DIR" run build:fast >/dev/null
exec node "$ROOT_DIR/build/index.js" "$@"
