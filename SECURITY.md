# Security & privacy

Fields is meant to be shared as public source. **Do not commit API keys.**

## Keys

| Secret | Where it lives | Sent to |
| --- | --- | --- |
| CoRE Stack API key | `.env` as `VITE_CORESTACK_API_KEY` (dev build) and/or Settings → localStorage `fields_corestack_api_key` | CoRE Stack HTTPS only, header `X-API-Key` |
| Tessera proxy URL | Settings / env | Your proxy, if you run one |

`.gitignore` excludes `.env`, `creds/`, keystores. The folder `creds/` is for your machine only.

There is **no** Google Earth Engine OAuth in the current app.

## On device

| Data | Where | Leaves the phone? |
| --- | --- | --- |
| Photos, GPS, notes | IndexedDB | Only when **you** export or share |
| API key | localStorage | CoRE API requests |
| Map tiles | HTTP cache | Tile servers |

## Network (when online)

- CoRE Stack + GeoServer (maps)
- Open-Meteo (weather)
- GBIF (species hints)
- Nominatim (place search)
- CARTO / Esri (basemaps)

No analytics SDK. Review notes before you share a ZIP.

## APK contents

Public code, bundled Western Ghats rasters, **no** baked-in CoRE key unless you set `VITE_CORESTACK_API_KEY` at **your** build time (do not do that on the public GitHub Actions build).
