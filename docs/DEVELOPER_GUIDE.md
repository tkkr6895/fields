# Developer guide

Clone this repo (the app **is** the repository root — there is no nested `field-validator-app/` folder).

## Prerequisites

- Node.js 18+
- npm 9+
- Optional: Android Studio + JDK 21 (local APK). GitHub Actions already builds a debug APK on every push to `main`.

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

Worked examples: [IndiaSAT validation](../example-flows/01-indiasat-validation.html) and [Tessera tree species](../example-flows/02-tessera-tree-species.html).

## Environment

`.env` is never committed. Template: `.env.example`.

| Variable | Required | What it does |
| --- | --- | --- |
| `VITE_CORESTACK_API_KEY` | For live IndiaSAT / tehsil maps | Baked into the **dev/PWA build**. The APK also accepts the same key in **Settings** (stored in localStorage). |
| `VITE_TESSERA_PROXY_URL` | No | Optional embedding sampler. Tile ids are stored without it. |

There is **no** Earth Engine / Dynamic World proxy.

On device, paste the CoRE key in **Settings → Keys & live maps** if you did not bake it at build time.

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Vite on port 5173, proxies `/api/corestack` and `/api/geoserver` |
| `npm run dev:full` | Vite + optional Tessera Python proxy |
| `npm run build` | `tsc` then production bundle |
| `npm run android:sync` | Copy `dist/` into the Capacitor Android project |
| `npm run android:build` | Production web build + `cap sync` |

Dev proxies (see `vite.config.ts`):

- `/api/corestack` → `https://api-doc.core-stack.org/api/v1` (`X-API-Key`)
- `/api/geoserver` → `https://geoserver.core-stack.org:8443/geoserver` (IndiaSAT WMS)

## How a note is saved

1. User taps **+**. `QuickCapture` opens the camera immediately. GPS / map pin / photo EXIF provide coordinates.
2. IndexedDB stores the observation (photo blob, species text, stand type, Tessera tile id).
3. `SyncEngine` queues enrichment. When online: IndiaSAT class (GetFeatureInfo), CoRE admin names, Open-Meteo weather, nearby GBIF plants. This must not block the save UI.
4. **Log** exports GeoJSON, CSV, GeoAI ZIP (photos), STAC, PBR.

## Android

Preferred: push `main` and download the `fields-debug` artifact from [Actions](https://github.com/tkkr6895/fields/actions).

Locally: `npm run build && npx cap sync android`, then Android Studio or `./gradlew assembleDebug`.

The installed WebView talks to CoRE and GeoServer **directly** (no Vite proxy). If WMS tiles work in `npm run dev` but not on the phone, it is usually CORS or the GeoServer TLS certificate — collect notes anyway; overlays are optional.

## Tessera (optional)

`python3 server/tessera-proxy.py` with `geotessera` installed if you want a 128-d sample at a point. Full embedding rasters are too large to stream globally on a phone. Join later using `tessera_tile_id` in the CSV/GeoJSON.

## Layout

```
src/App.tsx                 Map, layers, capture, log
src/components/QuickCapture Photo-first tree note
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
