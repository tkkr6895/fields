# Pending issues — first public release (DW + IndiaSAT validator)

Open follow-ups that genuinely require user input or out-of-band work.
Items previously listed and now resolved in code (placeholder data
removal, MapView decoupling, `gh` auth setup, in-app smoke test) have
been dropped from this list.

---

## 1. Confirm IndiaSAT band naming on real GEE assets
**Labels:** `bug-risk`, `gee`, `indiasat`, `priority:p1`
`server/dynamicworld-proxy.mjs` currently uses a heuristic to pick the
label / confidence bands inside each yearly IndiaSAT asset
(`/label|class|predict|lulc/i` and `/conf|prob/i`). Until we have one
successful round-trip with real GEE credentials, we don't know:

- The actual asset path pattern under
  `projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence/`
  (we try `${year}`, `LULC_${year}`, `lulc_${year}`, `India_${year}`,
  `${year}_LULC`, then `ee.data.listAssets` fallback).
- The actual band names.
- Whether the asset is `Image` or `ImageCollection` (handler supports both).

**Action:** run the proxy with GEE credentials against any one year, log
`bandNames`, and replace the heuristic with explicit names. See
`pickIndiaSATBands` in `server/dynamicworld-proxy.mjs`.

## 2. IndiaSAT confidence band semantics (0–1 vs 0–100)
**Labels:** `data`, `indiasat`, `priority:p1`
`IndiaSATService.fetchPointData` returns `confidence` as a raw number.
`PredictionCard` renders it via `Math.round(confidence * 100)`. If the
provider serves 0–100 (e.g. `confidence_percent`), the bar will saturate
at 100 % and lose precision. Normalize defensively once we see real
values (`c > 1 ? c : c * 100`).

## 3. Offline IndiaSAT tile pack for AOI mode
**Labels:** `offline`, `indiasat`, `priority:p2`
Dynamic World already has the `dynamicworld://live` + offline grid
pattern (`public/data/dynamicworld/grid-*.json`). IndiaSAT is currently
**online-only** (live XYZ via GEE proxy). Need a `scripts/` job that:
- Prepares per-year, per-AOI raster tiles
  (`public/tiles/indiasat/${year}/${z}/${x}/${y}.png`).
- Generates a manifest analogous to the DW one.
- Wires `IndiaSATService.getLiveTileUrlTemplate` to prefer cached tiles
  when offline.

## 4. Android APK rebuild + Capacitor sync after refactor
**Labels:** `android`, `release`, `priority:p1`
Bottom nav, App shell, services, and types all changed. Re-run:

```
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

and refresh the artifact link in `BUILD_APK.md` / `README.md`.

## 5. Export schema update for new observation fields
**Labels:** `export`, `priority:p2`
`Observation` now carries `predictionValidation`, `fieldData`, and
`weather`. `src/services/ExportService.ts` and
`src/services/AnnotationExporter.ts` still emit the pre-pivot schema and
need new columns / mappings so researchers receive the full validation
payload (per-source agreement, cover composition, dominant species,
weather). The upcoming Parquet/STAC alignment work depends on this.
