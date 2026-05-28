# Pending issues — first public release (DW + IndiaSAT validator)

This list tracks follow-ups that still require user input or out-of-band
work. Items previously listed and now resolved in code (legacy strip-
down, in-app smoke test, etc.) have been dropped. The most recent agent
pass shipped defensive normalisation, an env-override pathway for
IndiaSAT band naming, and an offline tile packing script. The hard
blocker on full GEE introspection (see #1) is the IndiaSAT folder
sharing.

---

## 1. IndiaSAT GEE asset is not shared with this account
**Labels:** `access`, `gee`, `indiasat`, `priority:p1`
`projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence` (and
every yearly path candidate underneath it) returns
`does not exist or doesn't allow this operation` for our authenticated
GEE project `ee-tkkrfirst`. Earth Engine itself authenticates correctly —
the public Dynamic World asset reads fine — so this is a sharing
permission, not an auth bug.

**What we shipped instead:**

- `server/dynamicworld-proxy.mjs` now supports operator overrides via
  env vars so the path can be pinned without code changes once access is
  granted:
  - `INDIASAT_ASSET_TEMPLATE` — e.g.
    `projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence/LULC_${year}`
  - `INDIASAT_LABEL_BAND` — e.g. `predicted_label`
  - `INDIASAT_CONF_BAND` — e.g. `confidence`
- `pickIndiaSATBands` was rewritten with a ranked list of regex patterns
  (LULC > classification > label/class > category), an explicit
  two-band fallback (other band = confidence), and a one-time
  `[IndiaSAT] bandNames=… → label="…" conf="…"` diagnostic log so the
  first successful round-trip captures the real names without code
  changes.
- `resolveIndiaSATAsset` now emits a richer error that distinguishes
  "no access" from "no asset" and tells the operator which env var to
  set.

**Action (out-of-band):** ask the IndiaSAT / CoRE Stack team
(core-stack.org / ICTD-IITD) to share read access on
`projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence/` with
the GEE project `ee-tkkrfirst` (or whichever project you put in
`GEE_PROJECT`). Once granted, no code changes are needed — restart the
proxy and the diagnostic log will surface the real band names.

## 2. ~~IndiaSAT confidence band semantics (0–1 vs 0–100)~~ — DONE
`IndiaSATService.fetchPointData` now normalises the upstream confidence
defensively: values ≤ 1 are treated as a 0–1 fraction, ≤ 100 as a
percent, ≤ 255 as 8-bit scaled, anything else clamped. Downstream
consumers (PredictionCard, agreement scoring, exports) see a single
canonical 0–1 number. PredictionCard's display formatter still tolerates
either scale defensively. Resolved in this pass.

## 3. ~~Offline IndiaSAT tile pack for AOI mode~~ — script ready, gated on #1
`scripts/pack-indiasat-tiles.mjs` is the new tile-packing job. Given a
year + bbox + zoom range it auths via the same GEE refresh-token flow
as the proxy, resolves the asset (honours `INDIASAT_ASSET_TEMPLATE`),
asks EE for an XYZ urlFormat via `getMap`, walks the tile grid, and
writes `public/tiles/indiasat/<year>/<z>/<x>/<y>.png` plus a
`manifest.json`.

`IndiaSATService.getLiveTileUrlTemplate` already prefers
`/tiles/indiasat/<year>/manifest.json` when one is present, so the
client switches to cached tiles automatically. The script can be run
end-to-end as soon as the access blocker in #1 clears.

Example:

```
node scripts/pack-indiasat-tiles.mjs --year 2022 \
  --bbox 75.0,12.5,76.0,13.5 --minZoom 8 --maxZoom 12
```

## 4. Android APK rebuild + Capacitor sync after refactor
**Labels:** `android`, `release`, `priority:p1`
Bottom nav, App shell, services, and types all changed in the
strip-down + IndiaSAT integration. Re-run:

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
