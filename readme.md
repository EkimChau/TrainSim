# TrainSim · Prototype 01

Modular Node.js/Express + Bun-powered browser prototype based on the original three-file Brisbane SimScene seed. It follows the component ownership defined in the original TrainSim README. **This is an illustrative demo, not a railway engineering or safety system.**

## Quick start

Prerequisites: Node.js **22+**, [Bun](https://bun.sh/docs/installation), npm. From the project root:

```bash
cp .env.example .env
npm install
npm run build
npm start
# open http://127.0.0.1:3000
```

With **no credentials**, the complete Compile → Run → Stop workflow works on an embedded **SVG schematic canvas**, with all three original scenarios, layer toggles and telemetry. It needs no Google account, Google Maps billing, or network APIs after installation.

For a **dependency-free local preview** (no npm install/Bun required), run `npm run preview` or `node scripts/preview.mjs`. It serves the **same modular frontend** through native browser ES modules and a minimal Node HTTP preview server, but **does not provide Express or working GIS sign-in**. Use the normal start above to validate Express/auth integration.

`./run.sh` is the one-command Express path (auto-installs dependencies when Bun is available). `./run.sh --preview` launches only the UI preview.

`npm run dev` builds once and starts a Node watch server. For frontend edits, rerun `npm run build` (or run `bun build ./src/client/main.js --target browser --format esm --outfile ./public/assets/app.js --watch` in another terminal).

`npm test` runs dependency-free pure simulation tests. `npm run check` runs both tests and bundling.

## Optional Google integrations

Maps rendering and Google sign-in are **separate Google products and credentials**:

- `GOOGLE_MAPS_API_KEY`: browser Maps JavaScript API key. Enable Maps JavaScript API and configure key restrictions for the authorized web referrers (`http://localhost:3000/*` and/or `http://127.0.0.1:3000/*` locally). Google Maps Platform billing rules may apply. **The key is necessarily delivered to the browser.** Restrict application/referrers and API scope; set quotas/alerts. A failed Maps load falls back to the SVG canvas.
- `GIS_CLIENT_ID`: Google Identity Services **Web OAuth client ID**, with local JavaScript origins configured in Google Cloud (for example `http://127.0.0.1:3000`). Set `SESSION_SECRET` to a random 32+ character secret (e.g. `openssl rand -hex 32`). The backend verifies Google's ID token audience/signature before setting a signed HttpOnly SameSite cookie. `POST /api/auth/google` is available only with GIS configured. This is **sign-in**, not authorization to production data.
- Production: serve via HTTPS, set `COOKIE_SECURE=1`, configure HTTPS proxy/origin carefully, use a stronger production session/CSRF policy and access control, and enforce deployment policy. This prototype stores only public identity fields in a signed (not encrypted) cookie; never store access tokens or secrets in this cookie.

**Security note:** The original seed HTML contained an embedded Maps API key. That seed key is **not copied** into this platform. Restrict/rotate it in Google Cloud if not already done. `.env` is gitignored.

## Architecture / file map

| Responsibility (per original README) | Location / current implementation |
|---|---|
| Node/Express app & GIS authentication | `server/app.js`, `server/auth.js`, `server/index.js` |
| Browser build and HTML shell | `src/client/main.js`, `public/index.html`, `public/style.css`, `npm run build` |
| SimAdaptor: map-only drawing contracts | `src/client/adapters/google.js` / `svg.js` |
| BaseModels: unconfigured types | `src/shared/models.js` |
| SimWorld: TrainSim-owned track/station model | `src/shared/simworld.js`; mock data in `seed-world.js` |
| SimSpec: trackside instrumentation compiler | `src/shared/simspec.js` — placeholder midpoint heuristic |
| SimScene: scenario definitions | `src/shared/simscene.js` |
| SimRun: deterministic step engine | `src/shared/simrun.js` |
| SimStates / live overlay | `SimRun.step()` state + `main.js` UI loop; persistence not yet implemented |

## Prototype scope & roadmap

**Implemented:** 4 synthetic tracks, 6 synthetic stations, 10 illustrative virtual balises, 3 seed scenes, fixed 300ms stepping, schematic/Google Maps adaptors, layer toggles, telemetry, health/config endpoints, optional verified GIS sign-in and protected route.

**Not implemented:** real OpenRailwayMap/OSM ingestion and provenance, exact track topology, railway-law/regulation tables, verified UNISIG/ETCS L0/L1/L2 instrumentation rules, RBC movement authorities, engineering braking curves, interlocking, safety proofs, accurate kinematics, schedule control, persistence, authorization roles, offline map tiles. Do not confuse warnings in this demo with real ETCS enforcement.

**Next stages:** Add versioned WGS84/OSM ingest constrained to the Brisbane region; immutable source/provenance and validation; configured BaseModels from authoritative specifications; reproducible SimScene schema; deterministic SimStates export and replay; rule traceability and tests; then role/access controls and secure deployment before any production-style use.

See [architecture contract](docs/architecture.md) for module ownership, provenance and future assurance requirements.

## API

| Route | Purpose |
|---|---|
| `GET /api/health` | Process health |
| `GET /api/config` | Browser-safe config incl. maps key and GIS client ID |
| `GET /api/auth/me` | Current signed-in identity or null |
| `POST /api/auth/google` | Verify Google credential and issue signed session cookie (when configured) |
| `POST /api/auth/logout` | Delete cookie |
| `GET /api/private/ping` | Authenticated-only example (401 when anonymous) |

Simulation remains client-side and deliberately pure; the backend does not pretend to be an authoritative simulation service.

## Stage 2: Real OSM railway world (regional dataset)

**New workflow:** preserve the historical 2012 TransLink diagram in `data/reference/`, keep the complete manual station/line catalog separate from GIS truth, and import real OpenStreetMap/OpenRailwayMap-style railway objects as raw OSM data. See [regional ingestion and data lineage](docs/real-railway-ingestion.md).

```bash
python3 scripts/ingest_osm.py --download  # public Overpass network access required
# Or import an existing raw Overpass JSON response:
python3 scripts/ingest_osm.py --osm-json ./your-osm-export.json
./run.sh                              # Google Maps when a valid API key is configured
```

On successful ingestion, the UI replaces *synthetic* tracks/stations with OSM WGS84 ways, railway stations and mapped OSM signal nodes. Diagram service paths are visualized with a train only if the complete stop sequence can be resolved through connected OSM way nodes. Unmatched stops and disconnected routes remain unresolved, not faked. Original simulation tests still run without network access or downloaded data. The 2012 schematic is not precise track geometry, and OpenStreetMap infrastructure is **not** a validated railway operational/safety model.
