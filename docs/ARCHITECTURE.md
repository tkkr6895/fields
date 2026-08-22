# Architecture (v1.2)

Fields is an offline-first PWA (and Capacitor Android wrapper) for **ground notes**: photos + GPS that later join IndiaSAT / CoRE Stack maps and Tessera tiles.

```
┌─────────────────────────────────────────────────────────────┐
│  Header (online / pending)          Settings (AOI, API key) │
│  MapLibre: satellite/dark, IndiaSAT WMS, AOI, note dots     │
│  SpotBar (place + Tessera tile id)                          │
│  Bottom: Map | Maps |  +  | Log                             │
└─────────────────────────────────────────────────────────────┘
        │ + = QuickCapture (camera, no network wait)
        ▼
  Dexie: observations, images, customLayers, syncQueue
        │ SyncEngine when online
        ▼
  CoRE admin + IndiaSAT GRAY_INDEX + weather + GBIF
```

## Critical path vs background

| Must be instant | May wait for signal |
| --- | --- |
| Camera, GPS or map pin, species text, save to IndexedDB, Tessera **tile id** | IndiaSAT class, CoRE layer list, WMS colouring, weather, GBIF nearby, Tessera embedding sample |

## Map

- Basemaps: CARTO dark, Esri World Imagery.
- IndiaSAT / CoRE rasters: WMS via `wmsTiles.ts` (XYZ rewritten to EPSG:3857 bbox).
- Imported AOIs: GeoJSON from IndexedDB (`CustomLayerManager`).
- Bundled forest PNGs: `RasterLayerService` + `image-manifest`.

## Auth

CoRE: `X-API-Key` from Settings localStorage or `VITE_CORESTACK_API_KEY`. Never commit `.env` or `creds/`.

## Exports

`ExportService` / `AnnotationExporter` / Field Log: GeoJSON, CSV (species, forest type, tessera tile, IndiaSAT, tehsil), GeoAI ZIP with photos, STAC, PBR.

## Stack

React 18, TypeScript, Vite 5, MapLibre 4, Dexie 4, Capacitor 8. Optional Python Tessera proxy. **No Earth Engine in the client.**
