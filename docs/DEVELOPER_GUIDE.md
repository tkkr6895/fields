# Developer guide

The git repository **is** the app (no nested `field-validator-app/` folder). First contribution: [CONTRIBUTING.md](../CONTRIBUTING.md).

## Prerequisites

- Node.js 22+
- npm 9+
- Optional: Android Studio + JDK 21 for a local APK. CI publishes [sideload `Fields.apk`](https://github.com/tkkr6895/fields/releases/tag/sideload) on every push to `main`.

## Quick start

```bash
git clone https://github.com/tkkr6895/fields.git
cd fields
npm install
cp .env.example .env
# Put your CoRE Stack key in .env as VITE_CORESTACK_API_KEY=...
npm run dev
```

Open http://localhost:5173. For a phone-shaped window use Chrome DevTools → Toggle device toolbar → 390×844.

Worked examples: [IndiaSAT](../example-flows/01-indiasat-validation.html), [Tessera](../example-flows/02-tessera-tree-species.html), [offline maps](../example-flows/03-offline-maps.html).

## Environment

`.env` is never committed. Template: `.env.example`.

| Variable | Required | What it does |
| --- | --- | --- |
| `VITE_CORESTACK_API_KEY` | For live IndiaSAT / tehsil maps | Baked into the **dev/PWA build**. The APK also accepts the same key in **Settings** (stored in localStorage). |
| `VITE_TESSERA_PROXY_URL` | No | Optional embedding sampler. Tile ids are stored without it. |

There is **no** Earth Engine / Dynamic World proxy.

On device, the CoRE key can also be pasted in **Settings → Keys & live maps**.

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Vite on port 5173, proxies `/api/corestack`, `/api/geoserver`, `/api/s2` |
| `npm run dev:full` | Vite + optional Tessera Python proxy |
| `npm run build` | `tsc` then production bundle |
| `npm run android:sync` | Copy `dist/` into the Capacitor Android project |
| `npm run android:build` | Production web build + `cap sync` |

`src/services/TileCache.ts` is the cache-first `fields://` protocol (OSM + Sentinel-2). Esri is live-only.

Dev proxies (see `vite.config.ts`):

- `/api/corestack` → `https://api-doc.core-stack.org/api/v1` (`X-API-Key`)
- `/api/geoserver` → `https://geoserver.core-stack.org:8443/geoserver` (IndiaSAT WMS)
- `/api/s2` → EOX Sentinel-2 cloudless WMTS (browser CORS bypass)

The APK does not ship planet tiles. MapLibre loads OpenStreetMap streets and Sentinel-2 through a cache-first `fields://` protocol (`src/services/TileCache.ts`). Esri World Imagery is live-only.

## How a note is saved

1. User taps **+**. `QuickCapture` opens the camera immediately. GPS / map pin / photo EXIF provide coordinates.
2. IndexedDB stores the observation (photo blob, species text, stand type, Tessera tile id).
3. `SyncEngine` queues enrichment. When online: IndiaSAT class (GetFeatureInfo), CoRE admin names, Open-Meteo weather, nearby GBIF plants. This must not block the save UI.
4. **Log** exports GeoJSON, CSV, GeoAI ZIP (photos), STAC, PBR.

## Android

CI: push `main` → [sideload release](https://github.com/tkkr6895/fields/releases/tag/sideload) and Actions artifact **Fields**. See [BUILD_APK.md](../BUILD_APK.md).

Locally: `npm run build && npx cap sync android`, then Android Studio or `./gradlew assembleRelease`.

The WebView calls CoRE and GeoServer **directly** (no Vite proxy). If WMS works in `npm run dev` but not on device, it is usually CORS or GeoServer TLS — notes still save; overlays are optional.

## Tessera (optional)

`python3 server/tessera-proxy.py` with `geotessera` installed if you want a 128-d sample at a point. Full embedding rasters are too large to stream globally on a phone. Join later using `tessera_tile_id` in the CSV/GeoJSON.

## Layout

```
src/App.tsx                 Map, layers, capture, log, Save maps
src/components/QuickCapture Photo-first note
src/services/TrackRecorder.ts     GPS track; Android FGS + live notification
src/services/TileCache.ts          Cache-first OSM + Sentinel-2
src/services/CoreStackService.ts   X-API-Key, admin + layer URLs
src/services/IndiaSATService.ts    WMS tiles + GetFeatureInfo
src/services/SyncEngine.ts         Background enrich
src/services/CustomLayerManager.ts AOI import
public/data/                Bundled Western Ghats rasters / sample AOI
```

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| No IndiaSAT colour | CoRE key missing; or this tehsil has no generated LULC yet |
| `npm ci` / Vite native-binary errors | Reinstall `node_modules` **on this OS** (do not copy from Windows) |
| Typecheck | `npx tsc --noEmit` |
| Camera blocked in desktop Chrome | Use gallery, or test on a phone / Android WebView |
