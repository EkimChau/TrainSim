#!/usr/bin/env bash
# One-command start: install, build, (optionally) ingest, serve on http://127.0.0.1:3000
#   ./run.sh                 build and start
#   ./run.sh --ingest        fetch OSM data for the whole sheet first (Overpass, ~20-40 min first time; cached after)
#   ./run.sh --ingest --lines "Caboolture Line"   just one corridor
#   ./run.sh --ingest --source geofabrik          bulk PBF path (needs osmium-tool)
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo 'Node.js 22+ is required.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3.10+ is required for ingestion.' >&2; exit 1; }
command -v bun >/dev/null || { echo 'Bun is required to bundle the UI: https://bun.sh/docs/installation' >&2; exit 1; }
[[ -d node_modules/@deck.gl/core && -d node_modules/tabulator-tables ]] || npm install
if [[ "${1:-}" == '--ingest' ]]; then shift; python3 scripts/ingest_osm.py "$@"; fi
[[ -f data/trainsim.sqlite ]] || echo 'Note: no data/trainsim.sqlite yet. Run ./run.sh --ingest (or npm run ingest) to populate the world.' >&2
npm run build
exec npm start
