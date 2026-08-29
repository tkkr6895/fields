# API integrations (v1.4)

The running app does **not** call Google Earth Engine. Land cover is **IndiaSAT** served by **CoRE Stack GeoServer**.

| Service | Base | Auth | Used for |
| --- | --- | --- | --- |
| CoRE Stack | `https://api-doc.core-stack.org/api/v1` | Header `X-API-Key` | Admin (state/district/tehsil), list of generated layers |
| CoRE GeoServer | `https://geoserver.core-stack.org:8443/geoserver` | None on WMS | IndiaSAT / other rasters as WMS GetMap + GetFeatureInfo |
| Open-Meteo | `https://api.open-meteo.com` | None | Weather on enrich |
| GBIF | `https://api.gbif.org/v1` | None | Species name hints |
| Nominatim | `https://nominatim.openstreetmap.org` | None | “Go to a place” in Settings |
| Tessera proxy | optional `VITE_TESSERA_PROXY_URL` | None | 128-d sample; tile id is computed on device either way |
| OpenStreetMap / Esri | public tile URLs | None | Live streets / sharp aerial when online |
| OpenStreetMap | cached on device | None | Offline streets for any viewed or saved area (ODbL) |
| EOX Sentinel-2 cloudless | cached on device | None | Offline satellite (~10 m) for any viewed or saved area |

Dev (Vite) rewrites:

- `/api/corestack` → CoRE `/api/v1`
- `/api/geoserver` → GeoServer `/geoserver`
- `/api/s2` → EOX Sentinel-2 cloudless WMTS (avoids CORS in the browser)

Production APK / hosted PWA should call the HTTPS origins above (see [PENDING_ISSUES.md](./PENDING_ISSUES.md) for CORS).

## CoRE Stack

Docs: [api-doc.core-stack.org](https://api-doc.core-stack.org/) · key: [core-stack.org/use-apis](https://core-stack.org/use-apis/)

```
X-API-Key: <key>
Accept: application/json
```

Not Bearer. Query parameters are `latitude` / `longitude` (not a path).

### `GET /get_admin_details_by_latlon/?latitude=&longitude=`

Returns state / district / tehsil (field names like `State`, `District`, `Tehsil`).

### `GET /get_generated_layer_urls/?state=&district=&tehsil=`

Array of `{ layer_name, dataset_name, layer_type, layer_url, ... }`. Coverage is **uneven**: Sulya (Dakshina Kannada) has many layers; some tehsils only list an admin boundary. The app must still allow capture.

IndiaSAT-style product: `dataset_name` matching `LULC_level_3` (also levels 1–2). URLs are typically WCS; the app paints them as **WMS** using the coverage / typeName from the URL.

Implementation: `src/services/CoreStackService.ts` (`authHeaders`, `loadAtPoint`, `pickLulcLayer`, `wmsTileTemplate`).

## IndiaSAT (no Earth Engine)

`src/services/IndiaSATService.ts`

- **Tiles:** WMS GetMap, EPSG:3857. MapLibre cannot substitute `{bbox-epsg-3857}`; `src/services/wmsTiles.ts` wraps XYZ → bbox in `MapView` `transformRequest`.
- **Point class:** WMS GetFeatureInfo JSON, property `GRAY_INDEX` (class id). Legend in `INDIASAT_CLASSES`.
- **Years:** hydrological-year names on the layer (`LULC_24_25_…` → 2024). Latest default is 2024.

## Tessera

On save: `tesseraTileForPoint(lat, lon)` → `grid_{lon}_{lat}` at 0.1°. The map can paint a **3-band RGB fingerprint** (embedding bands 30/60/90) for the current tile only — packed under `public/data/tessera/` for the Sulya trial AOI (~75 KB per tile), or fetched from `GET /preview` on the optional proxy. Full 128-d embeddings stay on a workstation ([geotessera](https://github.com/ucam-eo/geotessera)).

CoRE Stack also exposes `get_mwsid_by_latlon`, `get_tehsil_data`, and `get_waterbodies_data_by_admin`. The app summarises a few facts on Maps (not the whole tehsil dump) so a walker can check water, cropping, and place names.

## Weather / GBIF

Open-Meteo current conditions and GBIF nearby / suggest run in `SyncEngine` after save (and GBIF suggest while typing a species name, aborted if the user saves immediately).

## Historical GEE / Dynamic World

`server/dynamicworld-proxy.mjs` and `scripts/generate-dw-grid.py` may still exist in the tree. They are **not** started by `npm run dev` and are not used by the UI.
