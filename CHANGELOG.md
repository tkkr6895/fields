# Changelog

All notable changes to the Fields app are documented in this file.

---

## [0.3.0] — 2026-03-04: Real Data Services & Offline Grid

### Summary

Eliminated all placeholder data from the application. Dynamic World (Google Earth Engine), CoreStack, and Weather services now return **real, location-specific data** for every map click. Generated a 38,630-point offline grid covering the full Western Ghats for offline fallback.

### Data Services — Live Integration

- **Dynamic World proxy** (`server/dynamicworld-proxy.mjs`): Rewrote Earth Engine authentication to use `google-auth-library` OAuth2Client instead of browser-only `authenticateViaOauth`. Supports CLI credentials, gcloud ADC, and service account JSON.
- **CoreStack API**: Configured API key (`VITE_CORESTACK_API_KEY` in `.env`). Admin details (State/District/Tehsil), MWS IDs, and KYL indicators all returning real data.
- **Vite proxy SSL fix**: Changed `secure: true` → `secure: false` for CoreStack and GeoServer proxy rules to resolve Windows SSL certificate revocation check failures.
- **DW URL construction fix** (`DynamicWorldService.ts`): `new URL('/dynamicworld/point', '/api/dw')` failed because `/api/dw` is a relative path. Fixed to prepend `window.location.origin` when base URL is relative.
- **E2E verified**: All 5 LocationInfoPanel sections (Map Features, Local Data, Dynamic World, CoreStack Watershed, Weather) confirmed showing real data via browser automation.

### Offline Dynamic World Grid

- **Generated 38,630 grid points** covering the full Western Ghats (8.0°N–21.5°N, 72.5°E–78.5°E) at 5 km resolution.
- **4.7 MB** grid data file with class IDs, confidence scores, and full 9-class probability distributions for every point.
- **Class distribution**: Water 34.1%, Crops 32.0%, Trees 22.1%, Shrub/Scrub 7.3%, Built 4.3%.
- **Offline fallback verified**: When the DW proxy is unavailable, the app automatically falls back to "Offline Grid" source with correct classification.

### Grid Generator Improvements (`scripts/generate-dw-grid.py`)

- Reduced default batch size from 5,000 → 500 points per GEE request to avoid memory/timeout limits.
- Added retry logic (3 attempts with exponential backoff) for transient network failures.
- Added `--batch-size` CLI parameter and resolution-appropriate sampling scale.
- Replaced all Unicode characters (✓, →, °) with ASCII equivalents for Windows cp1252 terminal compatibility.

### Bug Fixes

- **Offline distance threshold** (`DynamicWorldService.ts`): Was hardcoded at 200 m, making the 5 km grid useless. Now reads `resolution` from the grid manifest and uses 1.5× grid spacing.
- **EE package crash on Node 22**: Upgraded `@google/earthengine` 1.7.9 → 1.7.16.
- **DW dateless query empty results**: Default time window changed from 90 → 365 days since Dynamic World can have months of latency.
- **DW point query null results**: Changed from `.first()` + `.sample()` to `.mosaic()` + `.reduceRegion()` for reliable point queries.

### Dependencies

- Added `google-auth-library@7.14.1` (Node.js-compatible OAuth2 token exchange for GEE proxy).
- Upgraded `@google/earthengine` 1.7.9 → 1.7.16 (Node 22 compatibility fix).

---

## [0.2.0] — 2026-03: Phase 1 Implementation (Complete)

### Summary

Full implementation of Phase 1: Stabilise Offline Validation & Annotation Export. All 67 tasks across 10 sub-phases completed.

### Type System & Data Model (1.2)

- Added `SyncStatus`, `ObservationType`, `Season` types.
- Expanded `Observation` interface with 15+ new fields (observationType, userId, deviceId, confidence, season, tags, syncStatus, enrichmentSources, etc.).
- Added `SpeciesSightingData`, `Species`, `VernacularName`, `CustomLayer`, `SyncQueueItem`, `ExportLogEntry` interfaces.
- Created `SeasonService.ts` with `deriveSeason()` utility for Western Ghats seasons.

### Database Migration (1.3)

- Dexie `version(2)` schema with new tables: `species`, `customLayers`, `syncQueue`, `exportLog`.
- Upgrade migration populates `syncStatus`, `observationType`, `userId`, `season` for existing observations.
- CRUD helpers for all new tables.

### Unified SyncEngine (1.4)

- Created `SyncEngine.ts` with `enrichObservation()`, `processQueue()`, `startAutoSync()`.
- 5-concurrent processing, 3-attempt retry with exponential backoff, pauses when offline.
- Subscription system for reactive UI updates. `useSyncStatus` hook.
- Migrated FieldLog from inline sync to SyncEngine.

### Annotation Export Pipeline (1.5)

- GeoAI export: GeoJSON + CSV + images ZIP.
- STAC Item Collection export (`stac_items.json`).
- COCO-lite training manifest (`manifest.json`).
- Model card metadata with full provenance.
- SHA-256 image checksums via Web Crypto API.
- Incremental export tracking via `exportLog`.

### Capacitor Plugin Migration (1.6)

- `@capacitor/camera` integration in ImageService with HTML fallback.
- `@capacitor/network` integration in useNetworkStatus.
- Updated `capacitor.config.ts` with Camera and Network permissions.

### Enhanced CaptureModal (1.7)

- Observation type selector, confidence slider, tags input.
- Auto-populated season, userId, and deviceId.
- SyncEngine enqueue on save.

### Custom Layer Upload & Management (1.8)

- `CustomLayerManager.ts`: GeoJSON, KML/KMZ, CSV, GeoPackage import with format detection.
- `CSVColumnMapper.tsx` UI for lat/lon column selection.
- Validation: CRS check, feature count warnings, file size limits.
- `CustomLayerImporter.tsx`, `CustomLayerStyleEditor.tsx` UI components.
- "My Layers" section in LayerPanelPro with toggle/edit/delete.
- Custom layers rendered in MapView and queryable via DatasetManager.

### Lightweight User Identity (1.9)

- `DeviceService.ts`: UUID generation and persistence.
- First-launch prompt for display name + affiliation.
- userId/deviceId stamped on every observation.

### Settings & Data Management (1.10)

- Storage usage display, "Clear All Data" with confirmation.
- "Import Backup" from ZIP. Map preferences (basemap, center/zoom).

---

## [0.1.0] — 2025-12: UI/UX Professional Polish

### Summary

Complete UI/UX redesign including LayerPanelPro, app usage guide, sync feature, and dark theme polish.

See [CHANGELOG_UI_UX_UPDATES.md](CHANGELOG_UI_UX_UPDATES.md) for detailed UI/UX changes.

---

## [0.0.1] — 2025-11: Initial Release

- Core map view with Western Ghats LULC layers.
- Observation capture with camera and GPS.
- Offline-first IndexedDB storage.
- Basic data export (GeoJSON, CSV).
- Location information panel with layer queries.
- Field protocols guide.
