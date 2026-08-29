# Notes for coding agents

This repository **is** the Fields app (Vite + React + Capacitor). There is no nested `field-validator-app/` directory.

## Read first

1. [README.md](./README.md) — what the product does, how to run it, where the APK lives
2. [CONTRIBUTING.md](./CONTRIBUTING.md) — layout, constraints, what not to commit
3. [docs/DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) — env, scripts, Android
4. [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — capture vs enrich, map stack

`docs/archive/` and `docs/plan/` are historical. Do not treat them as current instructions.

## Constraints (do not violate)

- Offline-first: GPS, notes, and photos must save with no network. Map colouring is optional.
- Do not ship the planet in the APK. Basemaps are cached on device (`src/services/TileCache.ts`). Do not commit regional OSM/Sentinel-2 dumps (`public/tiles/basemap/` packs are gitignored).
- Do not cache or redistribute Esri World Imagery tiles.
- No Google Earth Engine / Dynamic World in the client.
- Never commit `.env`, `creds/`, or keystores.

## Map stack (current)

| Layer | Offline |
| --- | --- |
| OpenStreetMap streets (`fields://carto/…` internally) | Cached |
| Sentinel-2 cloudless (EOX) | Cached |
| Esri World Imagery | Live only |
| IndiaSAT / Tessera | Network (optional) |

Save maps: `src/components/SaveMapsSheet.tsx`. Protocol: `src/services/TileCache.ts`.

## Verify

- Typecheck: `npx tsc --noEmit`
- Browser: map, Save maps, capture, Journal, Settings
- Device: GPS and camera (browser cannot fully substitute)

There is no unit-test suite. Pushing `main` builds a signed APK ([sideload release](https://github.com/tkkr6895/fields/releases/tag/sideload)).
