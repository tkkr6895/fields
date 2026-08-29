# Architecture (v1.4)

Fields is an offline-first PWA (and Capacitor Android wrapper) for **GPS tracks** and **ground notes**. Maps are optional colouring.

```
┌─────────────────────────────────────────────────────────────┐
│  Header (offline / REC)              Settings (AOI, API key) │
│  MapLibre: cache-first OSM + Sentinel-2 (Save maps) + Esri when online        │
│  Track HUD: Start / Pause / Save                             │
│  Bottom: Journal | camera | Maps                             │
└─────────────────────────────────────────────────────────────┘
        │ Start track = Android foreground service (works with other apps open) + live notification
        │ Camera = note / waypoint (photo optional)
        ▼
  Dexie: tracks, observations, images, customLayers, syncQueue
        │ SyncEngine when online
        ▼
  CoRE admin + IndiaSAT GRAY_INDEX + weather + GBIF
```

## Critical path vs background

| Must be instant | May wait for signal |
| --- | --- |
| GPS track, camera or tag, save to IndexedDB, Tessera **tile id** | IndiaSAT class, CoRE layer list, WMS colouring, weather, GBIF nearby |

## Map

- Basemaps: OpenStreetMap streets (cached on device), Sentinel-2 (cached), Esri World Imagery (live only).
- Live track: MapLibre line from on-device GPS fixes (accuracy-filtered).
- IndiaSAT / CoRE rasters: WMS via `wmsTiles.ts`. Mutually exclusive with Tessera colour.
- Tessera: one packed JPEG per 0.1° tile as an image overlay.
- Imported AOIs: GeoJSON from IndexedDB.
- Bundled forest PNGs: `RasterLayerService` + `image-manifest`.

## Auth

CoRE: `X-API-Key` from Settings localStorage or `VITE_CORESTACK_API_KEY`. Never commit `.env` or `creds/`.

## Exports

Journal → Share pack: GPX, GeoJSON, CSV, photos. Gaia / QGIS / Google Earth can open the GPX. `AnnotationExporter` still offers GeoAI / STAC packs.

## Stack

React 18, TypeScript, Vite 5, MapLibre 4, Dexie 4, Capacitor 8, `@capgo/background-geolocation`. **No Earth Engine in the client.**
