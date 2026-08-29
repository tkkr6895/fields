# Contributing

Fields is a Vite + React + Capacitor app. The repository root **is** the application (there is no nested `field-validator-app/` directory).

**Orientation (humans and agents):** product in [README.md](./README.md); layout and constraints below; env and scripts in [docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md); capture vs enrich in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). Coding agents: [AGENTS.md](./AGENTS.md). Skip `docs/archive/` and `docs/plan/` unless you are excavating history.

## First run

Node.js 22+.

```bash
git clone https://github.com/tkkr6895/fields.git
cd fields
npm install
cp .env.example .env
npm run dev
```

http://localhost:5173 — Chrome device toolbar at ~390×844 matches the phone layout.

`npx tsc --noEmit` is the typecheck. There is no unit-test suite; exercise map, Save maps, capture, Journal, and Settings in the browser (and on device for GPS / camera).

## Layout (for people and agents)

| Path | Role |
| --- | --- |
| `src/App.tsx` | Tabs, track HUD, Save maps, layer panel |
| `src/components/` | MapLibre view, capture, journal, settings, onboarding |
| `src/services/TileCache.ts` | Cache-first `fields://` tiles (OSM + Sentinel-2; Esri live-only) |
| `src/services/OfflineBasemap.ts` | MapLibre styles |
| `src/services/SyncEngine.ts` | Background enrich (IndiaSAT, CoRE, weather, GBIF) |
| `src/db/` | Dexie / IndexedDB |
| `public/data/` | Bundled rasters and sample AOI |
| `example-flows/` | Product walkthroughs with screenshots |
| `docs/` | Reference; `docs/archive/` and `docs/plan/` are historical |
| `.github/workflows/build-android.yml` | Signed APK on every `main` push |

Deeper maps: [docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md), [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md), [docs/SERVICES.md](./docs/SERVICES.md), [docs/COMPONENTS.md](./docs/COMPONENTS.md).

## Product constraints

- **Offline-first:** GPS, notes, and photos must save without a network. Map colouring is optional.
- **Do not ship the planet in the APK.** Basemaps are cached on device (`TileCache`). Do not commit regional OSM extracts or Sentinel-2 tile dumps (`public/tiles/basemap/satellite/`, `*.geojson` there are gitignored).
- **Do not cache Esri World Imagery.** Licence forbids redistributing those tiles.
- **No Earth Engine / Dynamic World** in the client.

## Do not commit

- `.env`, `creds/`, keystores, `VITE_CORESTACK_API_KEY` in CI
- Generated basemap packs (see `.gitignore`)
- OneDrive / editor line-ending rewrites of unrelated `public/data/**` CSVs

## Android CI

Pushes to `main` run **Build Android APK**. The job uploads artifact **Fields** and updates the [sideload](https://github.com/tkkr6895/fields/releases/tag/sideload) release. GitHub always zips Actions artifacts; the APK inside is `Fields.apk`.

Local: `npm run build && npx cap sync android`, then Android Studio or `./gradlew assembleRelease` (see [BUILD_APK.md](./BUILD_APK.md)).

## Pull requests

Keep diffs scoped to the change. Prefer the existing overlay / MapLibre patterns over new UI kits. Update `example-flows/` screenshots only when user-visible behaviour changes.
