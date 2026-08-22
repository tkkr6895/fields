# Changelog

All notable changes to the Fields app are documented in this file.

---

## [1.1.0] — 2026-08-22: Field-ready Tessera + CoRE Stack notes

Ground-first capture for people who are not GIS users. Load Dynamic World, IndiaSAT (CoRE Stack LULC), and CoRE Stack tehsil maps; record land cover, tree type, and notes that join to Tessera tiles.

- **Onboarding** in plain language; app branded **Fields**.
- **Capture**: what you see first (cover chips, tree type, GBIF name hints, photo optional). Map agreement is a second, skippable step.
- **Tessera**: every observation stores the 0.1° tile id; optional `server/tessera-proxy.py` samples embeddings.
- **CoRE Stack**: admin lookup + WMS layers for the current tehsil when an API key is set.
- **Settings**: CoRE Stack key, Earth Engine proxy URL, Tessera proxy URL on-device (so the APK can be pointed at your servers).
- **Export CSV/STAC/GeoJSON** flatten validation, Tessera, cover fractions, species, weather.
- **GitHub Actions** artifact `fields-debug`; `npx cap sync android` before assemble.
- Docs trimmed; clone path is the repo root (not `fields/field-validator-app`).

---

## [0.4.0] — 2025-06-07: Vector Data Inspection, GBIF & PBR Standards

### Summary

Implemented mentor feedback for the Monday demo: vector feature property inspection with schema-aware display, inline ground-truth validation for vector layers, GBIF species suggestions, PBR (People's Biodiversity Register) export format, and enhanced STAC metadata for vector validation context.

### Vector Feature Inspector

- **New component** `VectorFeatureInspector.tsx`: Click any vector feature on the map to see its properties displayed with schema-aware labels, units, and formatting.
- Properties categorized into Primary / Secondary / Metadata tiers based on `propertySchema` importance.
- Multi-feature tab navigation when multiple features overlap at a click point.
- Inline validation buttons (Match / Mismatch / Unclear) that create georeferenced observations linked to the specific vector feature.
- Auto-inferred validation prompts based on layer type (e.g., waterbody, drainage, farm pond, built-up).
- New observation types: `waterbody_validation`, `drainage_validation`, `farm_pond_validation`, `infrastructure_validation`.

### Property Schema System

- Added `VectorPropertySchema` type: per-property metadata (label, description, unit, type, display priority, format).
- Configured property schemas for all vector layers in `DatasetManager`:
  - Western Ghats boundary (`REC_NUM`, `DATA_VALUE`)
  - Dakshina Kannada boundary (with validation prompt)
  - CoreStack Sindhudurg Kudal boundary (`gp_name`, `block_name`, `area`)
  - CoreStack Sindhudurg Kudal LULC (12 properties with labels, units, and descriptions for all land-use categories)

### GBIF Species Suggestions

- **New service** `GBIFService.ts`: Queries the GBIF Occurrence API for species observed near the user's location.
- Species autocomplete via GBIF Species Suggest API.
- In-memory cache with 30-minute TTL to reduce API calls.
- Integrated into `CaptureModal`: when recording a species sighting, nearby GBIF occurrences appear as tap-to-tag suggestions.

### PBR Export (People's Biodiversity Register)

- **New export method** `exportPBR()` in `AnnotationExporter`: generates a ZIP bundle aligned with NBA India PBR guidelines.
- Includes Form II species checklist (JSON + CSV), GeoJSON of observation points, Traditional Ecological Knowledge section (consent-gated), and metadata.
- Species checklist aggregates observations by species with vernacular names, habitats, and observation counts.

### STAC Export Enhancement

- STAC items now include `fields:vector_layer_id`, `fields:vector_layer_title`, `fields:vector_geometry_type`, `fields:vector_data_source`, `fields:vector_validation_prompt`, and `fields:vector_feature_properties` when the observation is a vector validation.
- Model card tracks `vector_layers_validated` in the dataset section.

### CaptureModal Updates

- Expanded observation type picker from 5 → 9 types (added waterbody, drainage, farm pond, infrastructure validation).
- GBIF species suggestions panel with loading state and online-only indicator.

### Type System

- Added `VectorPropertySchema`, `VectorFeatureContext` interfaces.
- Enhanced `DatasetLayer` with `propertySchema`, `validatable`, `validationPrompt`, `geometryTypes` fields.
- Extended `ObservationType` union with 4 new validation types.
- Added `vectorFeatureContext` optional field to `Observation`.

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
