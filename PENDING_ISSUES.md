# Pending issues — first public release (DW + IndiaSAT validator)

These are open follow-ups that need user input or non-trivial work. Each
will also be filed on `tkkr6895/fields` once the personal `gh` auth is
active. Filed locally here so they survive auth churn.

---

## 1. Confirm IndiaSAT band naming on real GEE assets
**Labels:** `bug-risk`, `gee`, `indiasat`, `priority:p1`
The server (`server/dynamicworld-proxy.mjs`) currently uses a heuristic to
pick the label / confidence bands inside each yearly IndiaSAT asset
(`/label|class|predict|lulc/i` and `/conf|prob/i`). Until we have one
successful round-trip with real credentials, we don't know:

- The actual asset path pattern under
  `projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence/`
  (we try `${year}`, `LULC_${year}`, `lulc_${year}`, `India_${year}`,
  `${year}_LULC`, then `ee.data.listAssets` fallback).
- The actual band names.
- Whether asset is `Image` or `ImageCollection` (handler supports both).

**Action:** run the proxy with GEE credentials against any one year, log
`bandNames`, and replace heuristic with explicit names. See
`pickIndiaSATBands` in `server/dynamicworld-proxy.mjs`.

## 2. IndiaSAT confidence band semantics (0–1 vs 0–100)
**Labels:** `data`, `indiasat`, `priority:p1`
`IndiaSATService.fetchPointData` returns `confidence` as a raw number.
PredictionCard renders it via `Math.round(confidence * 100)`. If the
provider serves 0–100 (e.g. `confidence_percent`), the displayed bar
will saturate at 100 % and drop precision. Decide once we see real values.

## 3. Offline IndiaSAT tile pack for AOI mode
**Labels:** `offline`, `indiasat`, `priority:p2`
Dynamic World already has the `dynamicworld://live` + offline grid
pattern (`public/data/dynamicworld/grid-*.json`). IndiaSAT is currently
**online-only** (live XYZ via GEE proxy). Need a `scripts/` job that:
- Prepares per-year, per-AOI raster tiles (`public/tiles/indiasat/${year}/${z}/${x}/${y}.png`)
- Generates a manifest analogous to the DW one
- Wires `IndiaSATService.getLiveTileUrlTemplate` to prefer cached tiles
  when offline.

## 4. Replace remaining placeholder vector data or remove it
**Labels:** `data-credibility`, `cleanup`, `priority:p1`
`public/data/corestack/*` and similar JSON were populated heuristically
in earlier sessions and pretend to be authoritative admin/hydrology
boundaries. They are no longer surfaced by the new App.tsx, but the
files still ship in the PWA precache. Either:
- Replace with verified Survey of India / WRIS / OSM extracts, citing source, **or**
- Delete the files and the `LocationInfoPanel` / `CoreStackService` /
  `CoreStackLayerService` code paths that load them. (MapView still
  imports those services, so removal needs a parallel decoupling PR.)

## 5. Personal vs official `gh` CLI auth for the public release
**Labels:** `ops`, `priority:p1`
Local `gh` keyring only has `trkumar_deloitte`. Commit author is set to
`tkkr6895` via the project-local git config, but push and `gh issue
create` need `gh auth login` against the personal account. This commit
batch was authored locally only until that login lands.

## 6. Android APK rebuild + Capacitor sync after refactor
**Labels:** `android`, `release`, `priority:p1`
Bottom nav, App shell, services and types all changed. Re-run:
```
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```
and refresh the artifact link in `BUILD_APK.md` / `README.md`.

## 7. Export schema update for new observation fields
**Labels:** `export`, `priority:p2`
`Observation` now carries `predictionValidation` + `fieldData` +
`weather`. `src/services/ExportService.ts` and
`src/services/AnnotationExporter.ts` need new columns / mappings so
researchers receive the validation payload (per-source agreement, cover
composition, dominant species, weather). Public observations export and
the upcoming Parquet/STAC alignment work both depend on this.

## 8. Decouple MapView from CoreStack services to finish the strip-down
**Labels:** `refactor`, `priority:p2`
`src/components/MapView.tsx` still statically imports
`coreStackService` and `coreStackLayerService`. The new `App.tsx`
deliberately does not pass those layers through. Either:
- Remove those imports from MapView (preferred — surface a simpler
  `DatasetLayer[]` interface), **or**
- Convert them to lazy imports so the unused services tree-shake out.

## 9. Verify Open-Meteo coverage and add graceful failure
**Labels:** `weather`, `priority:p3`
`ValidationCapture` captures weather at submit time via Open-Meteo.
Add a UX-level fallback (note "weather unavailable") and rate-limit
guard for offline submission queues.

## 10. Smoke-test matrix for first public release
**Labels:** `qa`, `release`, `priority:p1`
Manual run-through, recorded in CHANGELOG:
- Online, GPS lock → PredictionCard shows both rows → Validate flow saves.
- Offline → DW falls back to grid; IndiaSAT shows offline notice; capture
  flow still saves observation (no weather, no live prediction).
- Year change in overlay panel triggers IndiaSAT tile refresh.
- Pinned-on-map vs follow-GPS toggles correctly.
- FieldLog reflects new observation, "Go to location" recenters map.
