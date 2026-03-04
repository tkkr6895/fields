# Fields — Implementation Tasks

> Ordered backlog · Updated March 2026 (v0.2: deprioritised auth/gamification, real data sources, custom layers)
> Status: ☐ Not started · ◑ In progress · ✅ Done · ⊘ Blocked

---

## Phase 1: Stabilise Offline Validation & Annotation Export

### 1.1 Bug Fixes & Code Health

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.1.1 | Fix `loadCachedData()` → `loadOfflineData()` call | `src/services/LocationDataService.ts:119` | ✅ |
| 1.1.2 | Add `VITE_DW_GEE_PROXY_URL` to `.env.example` | `.env.example` | ✅ |
| 1.1.3 | Read version from `package.json` in SettingsPanel | `src/components/SettingsPanel.tsx` | ✅ |
| 1.1.4 | Remove duplicate sync logic from FieldLog inline code — mark as TODO for SyncEngine migration | `src/components/FieldLog.tsx` | ✅ |

### 1.2 Type System & Data Model

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.2.1 | Add `SyncStatus` type: `'pending' \| 'queued' \| 'syncing' \| 'synced' \| 'failed'` | `src/types/index.ts` | ✅ |
| 1.2.2 | Add `ObservationType` type: `'land_cover' \| 'species_sighting' \| 'water_body' \| 'restoration_site' \| 'general'` | `src/types/index.ts` | ✅ |
| 1.2.3 | Add `Season` type and `deriveSeason()` utility | `src/types/index.ts`, `src/services/SeasonService.ts` | ✅ |
| 1.2.4 | Expand `Observation` interface: `observationType`, `userId`, `deviceId`, `confidence`, `season`, `tags`, `protocolId`, `speciesId`, `speciesData`, `syncStatus`, `syncedAt`, `enrichmentSources` | `src/types/index.ts` | ✅ |
| 1.2.5 | Add `SpeciesSightingData` interface | `src/types/index.ts` | ✅ |
| 1.2.6 | Add `Species` and `VernacularName` interfaces | `src/types/index.ts` | ✅ |
| 1.2.7 | Add `CustomLayer` and `CustomLayerStyle` interfaces | `src/types/index.ts` | ✅ |
| 1.2.8 | Add `SyncQueueItem` interface | `src/types/index.ts` | ✅ |
| 1.2.9 | Add `ExportLogEntry` interface | `src/types/index.ts` | ✅ |

### 1.3 Database Migration (v1 → v2)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.3.1 | Add Dexie `version(2)` schema with new tables: `species`, `customLayers`, `syncQueue`, `exportLog` | `src/db/database.ts` | ✅ |
| 1.3.2 | Write `.upgrade()` migration: populate `syncStatus`, `observationType`, `userId`, `season` for existing observations | `src/db/database.ts` | ✅ |
| 1.3.3 | Add CRUD helpers for new tables: `enqueueSyncItem`, `dequeueSyncItems`, `logExport`, `saveCustomLayer`, `getCustomLayers`, `deleteCustomLayer` | `src/db/database.ts` | ✅ |
| 1.3.4 | Add `getObservations` filter support for `observationType`, `userId`, date range, sync status | `src/db/database.ts` | ✅ |
| 1.3.5 | Test migration with existing v1 data (manual test) | — | ☐ |

### 1.4 Unified SyncEngine

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.4.1 | Create `SyncEngine.ts` with `enrichObservation(id)` calling Weather + DW + CoreStack | `src/services/SyncEngine.ts` | ✅ |
| 1.4.2 | Add `processQueue()` — drain syncQueue, process up to 5 concurrently, retry logic (3 attempts, exponential backoff) | `src/services/SyncEngine.ts` | ✅ |
| 1.4.3 | Add `startAutoSync()` with configurable interval, pauses when offline | `src/services/SyncEngine.ts` | ✅ |
| 1.4.4 | Add status subscription system (`subscribe(listener)` pattern) | `src/services/SyncEngine.ts` | ✅ |
| 1.4.5 | Migrate FieldLog to use SyncEngine instead of inline sync | `src/components/FieldLog.tsx` | ✅ |
| 1.4.6 | Wire SyncEngine.startAutoSync() in App.tsx on mount | `src/App.tsx` | ✅ |
| 1.4.7 | Add `useSyncStatus` hook for UI components | `src/hooks/useSyncStatus.ts` | ✅ |
| 1.4.8 | Deprecate `SyncService.ts` (keep file, add deprecation comment) | `src/services/SyncService.ts` | ✅ |

### 1.5 Annotation Export Pipeline

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.5.1 | Create `AnnotationExporter.ts` with `exportGeoAI(options)` — GeoJSON + CSV + images ZIP | `src/services/AnnotationExporter.ts` | ✅ |
| 1.5.2 | Add STAC Item Collection export (`stac_items.json`) | `src/services/AnnotationExporter.ts` | ✅ |
| 1.5.3 | Add COCO-lite training manifest export (`manifest.json`) | `src/services/AnnotationExporter.ts` | ✅ |
| 1.5.4 | Add model card metadata (`model_card.json`) with provenance | `src/services/AnnotationExporter.ts` | ✅ |
| 1.5.5 | Add SHA-256 image checksums using Web Crypto API | `src/services/AnnotationExporter.ts` | ✅ |
| 1.5.6 | Add incremental export: track last export timestamp in `exportLog` | `src/services/AnnotationExporter.ts` | ✅ |
| 1.5.7 | Update DataExportPanel UI: add "GeoAI Export" and "STAC Export" buttons alongside existing options | `src/components/DataExportPanel.tsx` | ✅ |
| 1.5.8 | Wire AnnotationExporter into ExportService (delegate, keep backward compat) | `src/services/ExportService.ts` | ✅ |

### 1.6 Capacitor Plugin Migration

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.6.1 | Integrate `@capacitor/camera` in ImageService — native capture with HTML fallback | `src/services/ImageService.ts` | ✅ |
| 1.6.2 | Integrate `@capacitor/network` in useNetworkStatus — supplement browser API | `src/hooks/useNetworkStatus.ts` | ✅ |
| 1.6.3 | Update `capacitor.config.ts` — add Camera and Network plugin permissions | `capacitor.config.ts` | ✅ |
| 1.6.4 | Test camera capture on Android emulator | — | ☐ |
| 1.6.5 | Test offline queue + reconnection sync on Android | — | ☐ |

### 1.7 Enhanced CaptureModal

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.7.1 | Add observation type selector (land_cover, species_sighting, water_body, restoration_site, general) | `src/components/CaptureModal.tsx` | ✅ |
| 1.7.2 | Add confidence slider (1-5) | `src/components/CaptureModal.tsx` | ✅ |
| 1.7.3 | Add tags input (comma-separated or chip input) | `src/components/CaptureModal.tsx` | ✅ |
| 1.7.4 | Auto-populate season from timestamp | `src/components/CaptureModal.tsx` | ✅ |
| 1.7.5 | Auto-populate userId (deviceId) and deviceId | `src/components/CaptureModal.tsx` | ✅ |
| 1.7.6 | Enqueue observation in SyncEngine after save | `src/components/CaptureModal.tsx` | ✅ |

### 1.8 Custom Layer Upload & Management

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.8.1 | Create `CustomLayerManager.ts` service — `importFile()` with format detection (GeoJSON, KML, CSV, GeoPackage) | `src/services/CustomLayerManager.ts` | ✅ |
| 1.8.2 | Implement GeoJSON parser: validate FeatureCollection, extract bounds, count features | `src/services/CustomLayerManager.ts` | ✅ |
| 1.8.3 | Implement KML/KMZ parser using `@tmcw/togeojson` → GeoJSON conversion | `src/services/CustomLayerManager.ts` | ✅ |
| 1.8.4 | Implement CSV parser: auto-detect lat/lon columns, build Point FeatureCollection | `src/services/CustomLayerManager.ts` | ✅ |
| 1.8.5 | Create `CSVColumnMapper.tsx` — UI for selecting lat/lon columns when auto-detect fails | `src/components/customlayers/CSVColumnMapper.tsx` | ✅ |
| 1.8.6 | Implement GeoPackage parser using `sql.js` (SQLite WASM) | `src/services/CustomLayerManager.ts` | ✅ |
| 1.8.7 | Add validation: CRS check (EPSG:4326), feature count warning (>10k), file size limit (~50MB) | `src/services/CustomLayerManager.ts` | ✅ |
| 1.8.8 | Add `toDatasetLayer()` — convert CustomLayer to DatasetLayer for MapView rendering | `src/services/CustomLayerManager.ts` | ✅ |
| 1.8.9 | Create `CustomLayerImporter.tsx` — file picker, parsing progress, preview on map, metadata form, confirm | `src/components/customlayers/CustomLayerImporter.tsx` | ✅ |
| 1.8.10 | Create `CustomLayerStyleEditor.tsx` — fill/stroke colour pickers, opacity slider, label field dropdown | `src/components/customlayers/CustomLayerStyleEditor.tsx` | ✅ |
| 1.8.11 | Add "My Layers" section to LayerPanelPro — list custom layers with toggle/edit/delete | `src/components/LayerPanelPro.tsx` | ✅ |
| 1.8.12 | Add "+ Import Layer" button to LayerPanelPro footer | `src/components/LayerPanelPro.tsx` | ✅ |
| 1.8.13 | Wire custom layers into MapView: render custom GeoJSON layers alongside bundled layers | `src/components/MapView.tsx`, `src/App.tsx` | ✅ |
| 1.8.14 | Wire custom layers into DatasetManager: include in `getValuesAtPoint()` queries | `src/services/DatasetManager.ts` | ✅ |
| 1.8.15 | Install dependencies: `@tmcw/togeojson`, `sql.js` | `package.json` | ✅ |

### 1.9 Lightweight User Identity

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.9.1 | Generate and persist `deviceId` (UUID in localStorage) on first launch | `src/services/DeviceService.ts` | ✅ |
| 1.9.2 | First-launch prompt: display name + optional affiliation (stored in localStorage) | `src/components/SettingsPanel.tsx` | ✅ |
| 1.9.3 | Stamp `userId` (= deviceId) and `deviceId` on every new observation | `src/components/CaptureModal.tsx` | ✅ |

### 1.10 Settings & Data Management

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.10.1 | Add storage usage display (observation count, image size, cache, custom layer count) | `src/components/SettingsPanel.tsx` | ✅ |
| 1.10.2 | Add "Clear All Data" with confirmation dialog | `src/components/SettingsPanel.tsx` | ✅ |
| 1.10.3 | Add "Import Backup" — read ZIP file, restore observations + images | `src/services/AnnotationExporter.ts`, `src/components/SettingsPanel.tsx` | ✅ |
| 1.10.4 | Add map preferences: default basemap, default center/zoom | `src/components/SettingsPanel.tsx` | ✅ |

---

## Phase 2: Biodiversity Module

### 2.1 Species Database — Real API Data Sources

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 2.1.1 | Create `SpeciesDatabase.ts` service skeleton — initialize, search, getById, getStats | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.2 | Implement `fetchFromGBIF(bbox)` — query GBIF species search + occurrences for Western Ghats, normalise to Species schema | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.3 | Implement `fetchIUCNStatus(speciesNames[])` — enrich species with conservation status from IUCN Red List API | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.4 | Implement `fetchFromIBP(region)` — fetch vernacular names + endemic flags from India Biodiversity Portal | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.5 | Implement `initialize()` — check IndexedDB count; if empty + online, fetch from GBIF+IUCN; show progress bar | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.6 | Implement `searchOnline(query)` — if species not in local DB, query GBIF/COL in real-time, cache result | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.7 | Add tokenization of common/vernacular names for multi-index search in IndexedDB | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.8 | Add `addVernacularName(speciesId, name, language)` — user contributions tagged `source='user_contributed'` | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.9 | Add `getChecklist(lat, lon, radiusKm)` — cross-reference species with local observations | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.10 | Add `refreshData()` — re-fetch from all APIs, merge/upsert with existing by sourceId | `src/services/SpeciesDatabase.ts` | ☐ |
| 2.1.11 | Add IUCN API token configuration to SettingsPanel + `.env.example` | `src/components/SettingsPanel.tsx`, `.env.example` | ☐ |
| 2.1.12 | Initialize SpeciesDatabase in App.tsx startup (non-blocking, background fetch) | `src/App.tsx` | ☐ |

### 2.2 Species Guide Overhaul

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 2.2.1 | Refactor SpeciesGuide: remove all hardcoded species data, use SpeciesDatabase service exclusively | `src/components/SpeciesGuide.tsx` | ☐ |
| 2.2.2 | Add "Source: GBIF" / "Source: IUCN" badges on species cards | `src/components/SpeciesGuide.tsx` | ☐ |
| 2.2.3 | Add kingdom filter (Plantae, Animalia, Fungi) alongside existing category filters | `src/components/SpeciesGuide.tsx` | ☐ |
| 2.2.4 | Add IUCN status filter | `src/components/SpeciesGuide.tsx` | ☐ |
| 2.2.5 | Add online search: if local search has no results + online, query GBIF/COL and show results | `src/components/SpeciesGuide.tsx` | ☐ |
| 2.2.6 | Connect "Record Sighting" → CaptureModal with `observationType='species_sighting'` + pre-filled `speciesId` | `src/components/SpeciesGuide.tsx`, `src/App.tsx` | ☐ |
| 2.2.7 | Add "Contribute Local Name" button → VernacularNameInput component | `src/components/SpeciesGuide.tsx` | ☐ |
| 2.2.8 | Add "Refresh Species Data" button (triggers SpeciesDatabase.refreshData()) | `src/components/SpeciesGuide.tsx` | ☐ |

### 2.3 Species Sighting Form

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 2.3.1 | Create `SpeciesSightingForm.tsx` — count, life stage, behaviour, habitat type, vernacular name input | `src/components/biodiversity/SpeciesSightingForm.tsx` | ☐ |
| 2.3.2 | Integrate SpeciesSightingForm into CaptureModal when `observationType='species_sighting'` | `src/components/CaptureModal.tsx` | ☐ |
| 2.3.3 | Add TEK consent checkbox with explanation text (appears when traditional use info is entered) | `src/components/biodiversity/SpeciesSightingForm.tsx` | ☐ |
| 2.3.4 | Create `VernacularNameInput.tsx` — name + language selector (Kannada, Tulu, Malayalam, Marathi, Hindi, Tamil, Other) | `src/components/biodiversity/VernacularNameInput.tsx` | ☐ |

### 2.4 Registry View (People's Biodiversity Register)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 2.4.1 | Create `RegistryView.tsx` — PBR view for current location | `src/components/biodiversity/RegistryView.tsx` | ☐ |
| 2.4.2 | Add location header with radius selector (1km, 5km, 10km) | `src/components/biodiversity/RegistryView.tsx` | ☐ |
| 2.4.3 | Add summary cards: total species, endemic count, threatened count, total observations | `src/components/biodiversity/RegistryView.tsx` | ☐ |
| 2.4.4 | Add aggregated species list with observation counts and last-seen dates | `src/components/biodiversity/RegistryView.tsx` | ☐ |
| 2.4.5 | Add seasonal occurrence chart (observations per month) | `src/components/biodiversity/RegistryView.tsx` | ☐ |
| 2.4.6 | Add contributor list with observation counts | `src/components/biodiversity/RegistryView.tsx` | ☐ |
| 2.4.7 | Add PBR export button (species checklist + observations as ZIP) | `src/components/biodiversity/RegistryView.tsx` | ☐ |
| 2.4.8 | Update BottomNav: replace "Protocols" tab with "Registry" | `src/components/BottomNav.tsx`, `src/App.tsx` | ☐ |
| 2.4.9 | Move FieldProtocols access to SettingsPanel or Guide section | `src/components/SettingsPanel.tsx` | ☐ |

### 2.5 PBR Export

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 2.5.1 | Add `exportPBR(options)` to AnnotationExporter — species checklist JSON + sightings GeoJSON + TEK (with consent) + PBR summary | `src/services/AnnotationExporter.ts` | ☐ |
| 2.5.2 | Generate human-readable PBR summary (Markdown → rendered in-app or included in export) | `src/services/AnnotationExporter.ts` | ☐ |

---

## Phase 3: Pilot, Auth, Gamification & Foundation Model Integration

### 3.1 Onboarding & Pilot Support

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 3.1.1 | Create guided onboarding flow (3-5 screens) for first launch | `src/components/Onboarding.tsx` | ☐ |
| 3.1.2 | Add in-app feedback/bug report mechanism | `src/components/settings/FeedbackForm.tsx` | ☐ |
| 3.1.3 | Add anonymous usage telemetry (opt-in) — observation counts, feature usage | `src/services/TelemetryService.ts` | ☐ |

### 3.2 Full Authentication (deferred from Phase 1)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 3.2.1 | Create `AuthService.ts` — createUser, authenticate, PIN hashing (PBKDF2 via Web Crypto) | `src/services/AuthService.ts` | ☐ |
| 3.2.2 | Create `useAuth` hook — reactive auth state, auto-lock timer | `src/hooks/useAuth.ts` | ☐ |
| 3.2.3 | Create `LoginScreen.tsx` — username + PIN entry, create account flow | `src/components/auth/LoginScreen.tsx` | ☐ |
| 3.2.4 | Create `PinLock.tsx` — lock screen overlay, PIN entry to unlock | `src/components/auth/PinLock.tsx` | ☐ |
| 3.2.5 | Create `ProfileEditor.tsx` — edit name, affiliation, role | `src/components/auth/ProfileEditor.tsx` | ☐ |
| 3.2.6 | Wire auth into App.tsx — gate main UI behind login, show PinLock when locked | `src/App.tsx` | ☐ |
| 3.2.7 | Add `users` table to Dexie schema (v3 migration) | `src/db/database.ts` | ☐ |

### 3.3 Gamification (deferred from Phase 2)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 3.3.1 | Create `AchievementService.ts` — define badges, check conditions, unlock, persist | `src/services/AchievementService.ts` | ☐ |
| 3.3.2 | Define badge set: First Observation, 10/50/100 Obs, 10 Species, Endemic Spotter, Seasonal Observer, Protocol Master, Multi-Layer, 7/30-Day Streak | `src/services/AchievementService.ts` | ☐ |
| 3.3.3 | Create `AchievementsPanel.tsx` — badge grid, streak counter, personal stats | `src/components/gamification/AchievementsPanel.tsx` | ☐ |
| 3.3.4 | Create `StreakBadge.tsx` — small badge in Header showing active streak | `src/components/gamification/StreakBadge.tsx` | ☐ |
| 3.3.5 | Wire achievement checks after each observation save + toast notification | `src/App.tsx` | ☐ |
| 3.3.6 | Add `achievements` table to Dexie schema (v3 migration) | `src/db/database.ts` | ☐ |

### 3.4 Foundation Model Integration Prep

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 3.4.1 | Define JSON schema for training pipeline ingestion (document + validate) | `docs/schemas/training_pipeline_schema.json` | ☐ |
| 3.4.2 | Design confidence overlay layer — heatmap of model prediction confidence | `src/services/ConfidenceLayerService.ts` | ☐ |
| 3.4.3 | Design "validation tasks" system — low-confidence areas flagged for field visit | `src/services/ValidationTaskService.ts` | ☐ |
| 3.4.4 | Ensure all exports include model card metadata (app version, protocols, spatial/temporal extent, sources) | `src/services/AnnotationExporter.ts` | ☐ |

### 3.5 Companion Web Portal (Fields Studio) — Design

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 3.5.1 | Design web portal architecture: file upload → GDAL processing → PMTiles/GeoJSON output | `docs/plan/FIELDS_STUDIO_DESIGN.md` | ☐ |
| 3.5.2 | Design Shapefile → GeoJSON conversion pipeline (server-side GDAL) | Design only | ☐ |
| 3.5.3 | Design GeoTIFF/COG → PMTiles conversion pipeline | Design only | ☐ |
| 3.5.4 | Design downloadable layer pack format (manifest.json + data files) compatible with app's DatasetManager | Design only | ☐ |

### 3.6 Scale Preparation

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 3.6.1 | Design REST API spec for server-side sync (OpenAPI 3.0 YAML) | `docs/api/sync_api.yaml` | ☐ |
| 3.6.2 | Add multi-region support — region selector on first launch, downloadable data packs | Design only | ☐ |
| 3.6.3 | Add i18n scaffolding — string extraction, translation file structure | `src/i18n/` | ☐ |

---

## Implementation Order (Recommended)

```
Sprint 1 (Foundation):
  1.1.1 → 1.1.4   Bug fixes & code health
  1.2.1 → 1.2.9   Type system expansion
  1.3.1 → 1.3.4   Database migration
  
Sprint 2 (Sync & Export):
  1.4.1 → 1.4.8   Unified SyncEngine
  1.5.1 → 1.5.8   Annotation Export Pipeline

Sprint 3 (Capture & Mobile):
  1.6.1 → 1.6.5   Capacitor plugin migration
  1.7.1 → 1.7.6   Enhanced CaptureModal

Sprint 4 (Custom Layers):
  1.8.1 → 1.8.15  Custom Layer Upload & Management
  1.9.1 → 1.9.3   Lightweight User Identity
  1.10.1 → 1.10.4 Settings & Data Management

Sprint 5 (Species — Real APIs):
  2.1.1 → 2.1.12  Species Database (GBIF/IUCN/IBP)
  2.2.1 → 2.2.8   Species Guide Overhaul

Sprint 6 (Biodiversity Features):
  2.3.1 → 2.3.4   Species Sighting Form
  2.4.1 → 2.4.9   Registry View (PBR)
  2.5.1 → 2.5.2   PBR Export

Sprint 7 (Pilot Prep):
  3.1.1 → 3.1.3   Onboarding & Pilot Support
  3.4.1 → 3.4.4   Foundation Model Integration Prep
  3.5.1 → 3.5.4   Web Portal Design
  3.6.1 → 3.6.3   Scale Preparation

Sprint 8 (Deferred — post-pilot):
  3.2.1 → 3.2.7   Full Authentication
  3.3.1 → 3.3.6   Gamification
```

---

## Testing Checklist

### Per-task Verification
- [ ] TypeScript compiles without errors (`tsc --noEmit`)
- [ ] App loads in dev mode (`npm run dev`)
- [ ] Target feature works in browser (PWA mode)
- [ ] No regression in existing features (manual smoke test: capture, log, export, layers)

### Phase Gate: Phase 1 Complete
- [ ] All 1.x tasks ✅
- [ ] Observation captured offline → synced when online → enriched with 3+ sources
- [ ] GeoAI export generates valid GeoJSON + STAC + COCO-lite ZIP
- [ ] Custom layer imported (GeoJSON + CSV) and visible on map offline
- [ ] Existing v1 observations migrated successfully (no data loss)
- [ ] Android APK builds and camera works natively

### Phase Gate: Phase 2 Complete
- [ ] All 2.x tasks ✅
- [ ] Species data fetched from GBIF/IUCN (not hardcoded), cached offline
- [ ] Species search works offline with cached data
- [ ] Species sighting → observation with linked species data
- [ ] Registry shows aggregated species list for location
- [ ] PBR export generates valid ZIP
- [ ] TEK data only included in export when consent is given
- [ ] Build and test on Android device

---

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Dexie v2 migration corrupts existing data | Backup prompt before upgrade; auto-recovery (existing pattern) |
| GBIF/IUCN API unavailable or rate-limited | Graceful degradation: app works without species data; retry with backoff; cache aggressively |
| IUCN API requires registration token | Document in setup guide; app works without IUCN (just missing conservation status) |
| Custom layer file too large for IndexedDB | File size validation at import; warn >50MB; suggest web portal for large rasters |
| GeoPackage parsing via sql.js WASM slow on mobile | Show progress bar; async parsing; limit to <10MB for in-app import |
| Web Crypto API unavailable on older Android WebView | Deferred to Phase 3 (auth); Capacitor ensures modern WebView |
| CoreStack API rate limits during bulk sync | SyncEngine respects 5-concurrent limit; exponential backoff |
| Offline grid linear scan too slow with more data | Considered acceptable for Phase 1; spatial index (R-tree) if needed in Phase 3 |
| Camera plugin permissions rejected by user | Graceful fallback to HTML file input (existing code preserved) |
