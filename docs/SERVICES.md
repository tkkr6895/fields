# Services (v1.2)

Singletons in `src/services/`. Older names (Gazetteer, LocationData, SyncService, DynamicWorld) are **not** in the current client.

| Service | File | Role |
| --- | --- | --- |
| **CoreStackService** | `CoreStackService.ts` | `X-API-Key`, admin by lat/lon, generated layer list, WMS templates |
| **IndiaSATService** | `IndiaSATService.ts` | Tehsil LULC tiles + GetFeatureInfo class |
| **wmsTiles** | `wmsTiles.ts` | MapLibre XYZ ↔ WMS bbox |
| **SyncEngine** | `SyncEngine.ts` | Queue: weather, IndiaSAT, CoRE admin, GBIF, Tessera |
| **TesseraService** | `TesseraService.ts` | On-device tile id; optional proxy sample |
| **CustomLayerManager** | `CustomLayerManager.ts` | Import GeoJSON/KML/CSV/GPKG AOIs |
| **AppConfig** | `AppConfig.ts` | CoRE key + Tessera URL (localStorage / env) |
| **PredictionService** | `PredictionService.ts` | IndiaSAT snapshot for enrich (not on capture critical path) |
| **WeatherService** | `WeatherService.ts` | Open-Meteo |
| **GBIFService** | `GBIFService.ts` | Nearby + name suggest |
| **GeoLocationService** | `GeoLocationService.ts` | GPS (Capacitor / browser) |
| **ImageService** | `ImageService.ts` | Camera, gallery, EXIF, thumbnails |
| **ExportService** / **AnnotationExporter** | | GeoJSON, CSV, ZIP, STAC, PBR |
| **DatasetManager** / **RasterLayerService** / **TileLayerService** | | Bundled CSVs and forest PNG overlays |
| **DeviceService** / **SeasonService** | | Device id, display name, Indian seasons |

### CoreStackService (current)

- `getCoreStackApiKey()` / header `X-API-Key`
- `loadAtPoint(lat, lon)` → admin + layers + `pickLulcLayer`
- `toDatasetLayers` / `overlayDatasetLayers` → phone-safe WMS (skips heavy WFS)

### IndiaSATService (current)

- `getLiveTileUrlTemplate(lat, lon, year)`
- `fetchPointData` → `GRAY_INDEX` → `INDIASAT_CLASSES`

### SyncEngine (current)

`enqueue(observationId)` then `processQueue()` immediately if online. Does **not** call Earth Engine.

See [API_INTEGRATIONS.md](./API_INTEGRATIONS.md) for HTTP details. Historical sections below this line in git history described GEE Dynamic World; that path was removed in v1.2.
