# Pending issues — first public release (DW + IndiaSAT validator)

This list tracks follow-ups that still require user input or out-of-band
work. Items resolved in code are marked ~~strikethrough~~.

Last updated: 2025-07-14

---

## ~~1. IndiaSAT GEE asset access~~ — RESOLVED
The old path `projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence`
was never accessible. The real CoRE Stack v4 data lives at
`projects/corestack-trees/assets/LULC_v4/lulc_v4_<year>_<year+1>` and
is fully accessible from GEE project `ee-tkkrfirst`. All 7 years
(2017–2023) verified with band `predicted_label`.

- `resolveIndiaSATAsset` tries v4 first, then v3 fallback at
  `projects/corestack-datasets/assets/datasets/LULC_v3_river_basin/`,
  then env override `INDIASAT_ASSET_TEMPLATE`.
- 14-class legend (0–13 including Orchard Plantation) with official
  CoRE Stack palette wired in both server and client.

## ~~2. IndiaSAT confidence band semantics~~ — RESOLVED
`IndiaSATService.fetchPointData` normalises upstream confidence
defensively: ≤1 → fraction, ≤100 → percent, ≤255 → 8-bit, else clamped.
Note: IndiaSAT v4 has only `predicted_label` (no confidence band), so
confidence will be `null` — this is correctly handled downstream.

## ~~3. Offline IndiaSAT tile pack~~ — RESOLVED
`scripts/pack-indiasat-tiles.mjs` uses real v4 asset paths and
14-class palette. Ready to run:

```
node scripts/pack-indiasat-tiles.mjs --year 2022 \
  --bbox 75.0,12.5,76.0,13.5 --minZoom 8 --maxZoom 12
```

## 4. Android APK rebuild + Capacitor sync
**Labels:** `android`, `release`, `priority:p1`
Bottom nav, App shell, services, and types all changed. Re-run:

```
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

## 5. Export schema update for new observation fields
**Labels:** `export`, `priority:p2`
`Observation` now carries `predictionValidation`, `fieldData`, and
`weather`. `src/services/ExportService.ts` and
`src/services/AnnotationExporter.ts` need new columns for the full
validation payload (per-source agreement, cover composition, dominant
species, weather).
