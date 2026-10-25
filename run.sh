#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo 'Node.js 22+ is required.' >&2; exit 1; }
if [[ "${1:-}" == '--preview' ]]; then
  echo 'Starting dependency-free schematic UI PREVIEW (not Express/GIS).'
  exec node scripts/preview.mjs
fi
command -v bun >/dev/null || { echo 'Bun missing. Install Bun or run ./run.sh --preview (no Express/GIS).' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is required.' >&2; exit 1; }
if [[ ! -d node_modules/tabulator-tables || ! -d node_modules/codemirror || ! -d node_modules/@codemirror/lang-sql ]]; then npm install; fi
npm run build
exec npm start
