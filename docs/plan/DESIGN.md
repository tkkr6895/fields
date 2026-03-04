# Fields — Technical Design Document

> Version 0.2 · March 2026 (revised: deprioritised auth/gamification, real data sources, custom layers)

---

## 1. Architecture Evolution

### Current State (v1.0)
```
┌──────────────────────────────────────────────────────┐
│                    React SPA (Vite)                   │
│  Components → Services → Dexie (IndexedDB)           │
│  MapLibre GL · Capacitor (Android shell)             │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP (when online)
        ┌───────────────┼───────────────────┐
        ▼               ▼                   ▼
   CoRE Stack API   DW Proxy (GEE)    Open-Meteo API
```

### Target State (v2.0 — end of Phase 2)
```
┌──────────────────────────────────────────────────────────────────────┐
│                         React SPA (Vite)                             │
│                                                                      │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────┐  │
│  │ Map Module   │ │ Observation  │ │ Biodiversity│ │ Auth Module  │  │
│  │ (MapView,    │ │ Module       │ │ Module      │ │ (Profile,    │  │
│  │  Layers,     │ │ (Capture,    │ │ (Species,   │ │  PIN Lock,   │  │
│  │  Controls)   │ │  Log, Export)│ │  PBR, TEK)  │ │  Multi-user) │  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬──────┘ └──────┬───────┘  │
│         │                │                │               │          │
│  ┌──────┴────────────────┴────────────────┴───────────────┴───────┐  │
│  │                      Services Layer                            │  │
│  │  SyncEngine · EnrichmentPipeline · AnnotationExporter          │  │
│  │  SpeciesDB · AuthService · OfflineQueueManager                 │  │
│  └──────────────────────────┬────────────────────────────────────┘  │
│                              │                                      │
│  ┌──────────────────────────┴────────────────────────────────────┐  │
│  │                      Data Layer (Dexie v2)                     │  │
│  │  observations · images · species · users · syncQueue ·         │  │
│  │  exportLog · achievements · datasets                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Capacitor: Camera · Geolocation · Filesystem · Share · Network     │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ HTTP (queued, retried)
           ┌───────────────┼───────────────────┐
           ▼               ▼                   ▼
      CoRE Stack API   DW Proxy (GEE)    Open-Meteo API
```

---

## 2. Data Model Changes

### 2.1 Database Schema (Dexie v2 Migration)

```typescript
// db/database.ts — Schema v2

const db = new Dexie('FieldValidatorDB');

db.version(1).stores({
  observations: 'id, timestamp, userValidation, [location.lat+location.lon]',
  images: 'id, createdAt',
  datasets: 'id, layerId, updatedAt',
});

db.version(2).stores({
  // Observations — expanded indexes
  observations: 'id, timestamp, userValidation, observationType, userId, syncStatus, [location.lat+location.lon]',
  
  // Images — unchanged
  images: 'id, createdAt',
  
  // Datasets — unchanged
  datasets: 'id, layerId, updatedAt',
  
  // NEW: Species lookup database (fetched from GBIF/IUCN/IBP)
  species: 'id, scientificName, *commonNameTokens, *vernacularTokens, family, kingdom, iucnStatus, isEndemic, source',
  
  // NEW: Custom user-imported layers
  customLayers: 'id, title, createdAt, category',
  
  // NEW: Sync queue for offline-first enrichment
  syncQueue: '++id, observationId, status, createdAt, [status+createdAt]',
  
  // NEW: Export log for incremental exports
  exportLog: '++id, exportedAt, recordCount, format',
  
}).upgrade(tx => {
  // Migrate existing observations: add syncStatus, observationType
  return tx.table('observations').toCollection().modify(obs => {
    obs.syncStatus = obs.synced ? 'synced' : 'pending';
    obs.observationType = obs.observationType || 'land_cover';
    obs.userId = obs.userId || 'device';
    obs.tags = obs.tags || [];
    obs.confidence = obs.confidence || null;
    obs.season = deriveSeason(obs.timestamp);
  });
});
```

### 2.2 Observation Type (v2)

```typescript
// types/index.ts — Enhanced Observation

type SyncStatus = 'pending' | 'queued' | 'syncing' | 'synced' | 'failed';
type ObservationType = 'land_cover' | 'species_sighting' | 'water_body' | 'restoration_site' | 'general';
type Season = 'monsoon' | 'post_monsoon' | 'winter' | 'summer';  // Indian meteorological

interface Observation {
  id: string;
  timestamp: number;
  location: LocationData;
  
  // v2 additions
  observationType: ObservationType;
  userId: string;
  deviceId: string;
  confidence?: number;          // 1-5 observer confidence
  season: Season;               // auto-derived from timestamp
  tags: string[];               // user-defined labels
  protocolId?: string;          // link to field protocol
  speciesId?: string;           // link to species (for sightings)
  speciesData?: SpeciesSightingData;  // detailed sighting info
  
  // existing fields
  context?: ObservationContext;
  datasetValues?: DatasetValues;
  image?: ImageData;
  userValidation?: ValidationStatus;
  notes?: string;
  
  // v2: replace boolean synced
  syncStatus: SyncStatus;
  syncedAt?: number;
  enrichmentSources?: string[]; // e.g. ['weather', 'dynamicworld', 'corestack']
}

interface SpeciesSightingData {
  speciesId: string;
  count?: number;               // abundance
  lifeStage?: 'seedling' | 'juvenile' | 'adult' | 'flowering' | 'fruiting' | 'dead';
  behaviour?: string;
  habitatType?: string;
  vernacularName?: string;      // user-contributed local name
  vernacularLanguage?: string;  // e.g. 'Kannada', 'Tulu'
  isTEK?: boolean;              // traditional ecological knowledge flag
  tekConsent?: boolean;         // explicit consent for TEK sharing
}
```

### 2.3 Species Type

```typescript
interface Species {
  id: string;
  scientificName: string;
  commonName: string;
  vernacularNames: VernacularName[];
  family: string;
  order?: string;
  class?: string;
  kingdom: 'Plantae' | 'Animalia' | 'Fungi';
  iucnStatus: IUCNStatus;
  isEndemic: boolean;
  isMedicinal: boolean;
  restorationValue: 'low' | 'medium' | 'high';
  habitat: string[];
  elevationRange?: { min: number; max: number };
  characteristics?: string;
  traditionalUses?: string[];
  imageUrl?: string;
  thumbnailUrl?: string;
  regions: string[];
  // for search indexing
  commonNameTokens?: string[];    // lowercase tokenised
  vernacularTokens?: string[];    // lowercase tokenised
  // provenance — NO synthetic data: all from real APIs
  source: 'gbif' | 'iucn' | 'ibp' | 'inaturalist' | 'col' | 'user_contributed';
  sourceId?: string;              // e.g. GBIF taxonKey
  fetchedAt?: number;             // timestamp of last API fetch
}

interface VernacularName {
  language: string;
  name: string;
  script?: string;  // e.g. 'Kannada script'
}

type IUCNStatus = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD' | 'NE';
```

### 2.4 Custom Layer Type

```typescript
interface CustomLayer {
  id: string;            // UUID
  title: string;
  description?: string;
  category: string;      // user-assigned or auto-detected
  format: 'geojson' | 'kml' | 'csv' | 'gpkg';
  originalFilename: string;
  featureCount: number;
  geometryType: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'Mixed';
  bounds: { west: number; south: number; east: number; north: number };
  style: CustomLayerStyle;
  geojsonData: GeoJSON.FeatureCollection;  // parsed + normalised to GeoJSON
  properties: string[];   // available property/column names
  createdAt: number;
  sizeBytes: number;
  attribution?: string;
}

interface CustomLayerStyle {
  fillColor: string;      // hex
  strokeColor: string;    // hex
  strokeWidth: number;
  opacity: number;
  labelField?: string;    // property to use as label
  symbolSize?: number;    // for point layers
}
```

### 2.5 Sync Queue Item

```typescript
interface SyncQueueItem {
  id?: number;          // auto-increment
  observationId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  lastAttemptAt?: number;
  error?: string;
  createdAt: number;
}
```

---

## 3. Service Architecture Changes

### 3.1 Unified SyncEngine (replaces SyncService.ts + FieldLog inline sync)

```
SyncEngine
├── enrichObservation(id)
│   ├── WeatherService.getWeather(lat, lon)
│   ├── DynamicWorldService.fetchPointData(lat, lon, date)
│   ├── CoreStackService.enrichLocation(lat, lon)
│   └── Updates observation.datasetValues + observation.enrichmentSources
├── processQueue()
│   ├── Reads syncQueue where status = 'pending', ordered by createdAt
│   ├── Processes up to 5 concurrently
│   ├── Retries failed items (max 3 attempts, exponential backoff)
│   └── Updates syncQueue status + observation.syncStatus
├── startAutoSync(intervalMs = 60000)
│   └── Only runs when online (using @capacitor/network)
└── getStatus() → { pending, processing, completed, failed }
```

**Key design decision**: All enrichment logic lives in `SyncEngine`. Components never call Weather/DW/CoreStack directly for enrichment. Components only call `syncEngine.enqueue(observationId)`.

### 3.2 AnnotationExporter (replaces/extends ExportService)

```
AnnotationExporter
├── exportGeoAI(options: ExportOptions) → ZIP
│   ├── annotations.geojson     — RFC 7946 FeatureCollection
│   ├── annotations.csv         — Flat CSV with all properties
│   ├── stac_items.json         — STAC Item Collection
│   ├── images/                 — Renamed to {observation_id}.jpg
│   ├── manifest.json           — Record count, bbox, date range, checksums
│   └── model_card.json         — App version, protocols, sources, provenance
│
├── exportPBR(options) → ZIP
│   ├── species_checklist.json  — Aggregated species list for location
│   ├── observations.geojson    — All species sightings
│   ├── tek_data.json           — TEK records (only if consent given)
│   └── pbr_summary.md         — Human-readable biodiversity register summary
│
├── exportIncremental(since: timestamp) → ZIP
│   ├── Only observations modified after `since`
│   └── Updates exportLog table with new timestamp
│
└── computeChecksum(blob) → SHA-256 hex string
```

**STAC Item structure** (per observation):
```json
{
  "type": "Feature",
  "stac_version": "1.0.0",
  "id": "{observation_id}",
  "geometry": { "type": "Point", "coordinates": [lon, lat] },
  "bbox": [lon, lat, lon, lat],
  "properties": {
    "datetime": "2026-03-03T10:30:00Z",
    "fields:observation_type": "land_cover",
    "fields:validation_status": "match",
    "fields:land_cover_label": "trees",
    "fields:confidence": 4,
    "fields:season": "summer",
    "fields:enrichment_sources": ["weather", "dynamicworld", "corestack"],
    "fields:app_version": "2.0.0",
    "fields:protocol_id": "land_cover_ground_truth"
  },
  "assets": {
    "photo": {
      "href": "./images/{observation_id}.jpg",
      "type": "image/jpeg",
      "roles": ["data"]
    }
  },
  "links": []
}
```

### 3.3 SpeciesDatabase Service (new — backed by real APIs)

```
SpeciesDatabase
├── initialize()
│   ├── Check IndexedDB species table count
│   ├── If empty + online: fetchFromGBIF() + fetchIUCNStatus()
│   └── If populated: skip (use cached). User can trigger manual refresh.
├── fetchFromGBIF(bbox?) → Species[]
│   ├── GET api.gbif.org/v1/species/search?q=*&rank=SPECIES&limit=100
│   │   filtered by Western Ghats bounding box via occurrence endpoint
│   ├── GET /v1/species/{key}/vernacularNames → vernacular names
│   └── Normalise to Species schema, tag source='gbif'
├── fetchIUCNStatus(speciesNames: string[]) → enriches iucnStatus field
│   └── GET apiv3.iucnredlist.org/api/v3/species/{name}?token=...
├── fetchFromIBP(region?) → Species[] (regional vernacular names + endemic flags)
│   └── GET indiabiodiversity.org/api/species?location=Western+Ghats
├── searchOnline(query) → Species[]
│   └── If species not in local DB: query GBIF/COL in real-time, cache result
├── search(query: string, filters?) → Species[] (local IndexedDB)
│   ├── Fuzzy match on commonNameTokens + scientificName + vernacularTokens
│   └── Filter by: kingdom, iucnStatus, isEndemic, isMedicinal, region
├── getById(id) → Species
├── getForRegion(regionId) → Species[]
├── getChecklist(lat, lon, radiusKm) → AggregatedChecklist
│   └── Cross-reference species table with observation sightings in radius
├── addVernacularName(speciesId, name, language) → void
│   └── Persists user-contributed names locally, tagged source='user_contributed'
├── refreshData() → void
│   └── Re-fetch from all APIs, merge with existing (upsert by sourceId)
└── getStats() → { total, endemic, threatened, observed, lastRefreshed }
```

**Key design decision**: Species data is NEVER synthetic or hardcoded. The 12 existing hardcoded species in `SpeciesGuide.tsx` are removed. All data flows from GBIF/IUCN/IBP APIs → IndexedDB cache → UI. Offline users see whatever was last cached.

### 3.4 CustomLayerManager Service (new)

```
CustomLayerManager
├── importFile(file: File) → { preview: CustomLayer, warnings: string[] }
│   ├── Detect format from extension + content sniffing
│   ├── Parse:
│   │   ├── .geojson / .json → JSON.parse, validate FeatureCollection
│   │   ├── .kml / .kmz → KML parser (toGeoJSON library)
│   │   ├── .csv → PapaParse, detect lat/lon columns, build Point features
│   │   └── .gpkg → sql.js (SQLite in WASM), read features table
│   ├── Validate: geometry present, CRS is 4326 (or detectable + reprojectable)
│   ├── Warnings: >10k features, missing CRS, mixed geometry types
│   └── Returns preview object (not yet persisted)
│
├── saveLayer(layer: CustomLayer) → void
│   └── Store in IndexedDB `customLayers` table
│
├── getLayers() → CustomLayer[]
├── getLayerById(id) → CustomLayer
├── deleteLayer(id) → void
├── updateStyle(id, style: CustomLayerStyle) → void
│
├── toDatasetLayer(custom: CustomLayer) → DatasetLayer
│   └── Converts CustomLayer to DatasetLayer for MapView rendering
│
├── importFromManifest(manifestUrl: string) → CustomLayer[]
│   └── For web portal exports: downloads manifest + referenced data files
│
└── getStorageUsage() → { layerCount, totalSizeBytes }
```

**Format support matrix**:

| Format | In-App Import | Web Portal | Notes |
|--------|--------------|------------|-------|
| GeoJSON | ✅ | ✅ | Native, no conversion needed |
| KML/KMZ | ✅ | ✅ | Via `@tmcw/togeojson` library |
| CSV (lat/lon) | ✅ | ✅ | Auto-detect coordinate columns |
| GeoPackage | ✅ | ✅ | Via `sql.js` (SQLite WASM) |
| Shapefile | ❌ (too heavy) | ✅ | Needs GDAL server-side |
| GeoTIFF/COG | ❌ | ✅ | Converted to PMTiles server-side |

**CSV coordinate detection**: Scans column names for patterns like `lat`, `latitude`, `y`, `lon`, `longitude`, `lng`, `x`, `long`. Falls back to asking user to select columns if ambiguous.

---

## 4. Component Changes

### 4.1 CaptureModal v2

```
CaptureModal
├── Step 1: Photo capture (native camera via @capacitor/camera)
├── Step 2: Location confirmation (GPS + EXIF comparison)
├── Step 3: Observation type selector
│   ├── Land Cover → validation buttons (match/mismatch/unclear)
│   ├── Species Sighting → species search + sighting form
│   ├── Water Body → condition assessment fields
│   ├── Restoration Site → progress documentation fields
│   └── General → freeform notes
├── Step 4: Confidence slider (1-5) + tags input
├── Step 5: Review & save
└── Auto-populated: season, userId, deviceId, enrichment queued
```

### 4.2 SpeciesGuide v2

```
SpeciesGuide
├── Data source: SpeciesDatabase service (IndexedDB-backed)
├── Search: fuzzy across common/scientific/vernacular names
├── Filters: kingdom, endemic, medicinal, IUCN status, restoration value
├── Detail view: species card with image, characteristics, uses
├── Record Sighting: opens CaptureModal with observationType='species_sighting'
│   └── Pre-fills speciesId, shows species-specific fields
├── Contribute: add vernacular name + language
└── Regional checklist: species observed near current location
```

### 4.3 New: RegistryView (PBR)

```
RegistryView
├── Header: location name + observation radius selector
├── Summary cards: total species, endemic, threatened, observations
├── Species list: aggregated from observations within radius
│   ├── Species name + observation count + last seen
│   ├── Status badges (IUCN, endemic)
│   └── Tap → species detail + sighting history
├── Seasonal chart: observation frequency by month
├── Contributors: list of userIds with observation counts
└── Export: generate PBR summary document
```

### 4.4 New: CustomLayerImporter

```
CustomLayerImporter
├── File picker: accepts .geojson, .json, .kml, .kmz, .csv, .gpkg
├── Progress bar during parsing
├── Preview: renders parsed data on map with default styling
├── Metadata form: title, description, category, attribution
├── Style editor: fill/stroke colour pickers, opacity slider, label field dropdown
├── Validation warnings: >10k features, missing CRS, large file size
├── Confirm: saves to IndexedDB, adds to layer panel
└── Accessible from: LayerPanelPro (“+ Import Layer” button) and SettingsPanel
```

### 4.5 Custom Layer Management (in LayerPanelPro)

```
LayerPanelPro (enhanced)
├── Existing: bundled layers by category
├── New section: "My Layers" at top or bottom of panel
│   ├── Lists all user-imported layers
│   ├── Toggle on/off (same as bundled layers)
│   ├── Tap to edit style / view info
│   ├── Swipe or long-press to delete
│   └── Badge: feature count + geometry type
└── “+ Import Layer” FAB/button at bottom
```

### 4.5 BottomNav Update

```
Current tabs: Map | Layers | Protocols | Log
New tabs:     Map | Layers | Registry | Log
                                 ↑
                     (replaces Protocols — Protocols move to settings/guide)
```

---

## 5. Capacitor Plugin Migration

| Current | Target | Change |
|---------|--------|--------|
| HTML `<input type="file" capture>` | `@capacitor/camera` | Native camera UX, better quality control |
| Browser `navigator.onLine` | `@capacitor/network` | Reliable connectivity + connection type |
| Dexie only | Dexie + `@capacitor/filesystem` | Backup/restore database to device storage |
| — | `@capacitor/preferences` | Lightweight key-value storage for deviceId, user display name |

### Camera Integration Design

```typescript
// services/ImageService.ts — updated

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

async capturePhoto(): Promise<File> {
  if (Capacitor.isNativePlatform()) {
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      correctOrientation: true,
      width: 2048,
      saveToGallery: false,
    });
    return uriToFile(photo.webPath!);
  } else {
    return this.captureFromCamera(); // existing HTML fallback
  }
}
```

---

## 6. Export Formats — Detailed Schema

### 6.1 GeoAI GeoJSON Feature Properties

```json
{
  "observation_id": "uuid",
  "timestamp": "2026-03-03T10:30:00.000Z",
  "observation_type": "land_cover",
  "validation_status": "match",
  "land_cover_label": "trees",
  "dw_class_id": 1,
  "dw_confidence": 0.87,
  "dw_class_probabilities": { "trees": 0.87, "crops": 0.05, "...": "..." },
  "observer_confidence": 4,
  "season": "summer",
  "weather": { "temp_c": 28.3, "humidity_pct": 65, "description": "Partly cloudy" },
  "elevation_m": 842,
  "accuracy_m": 4.2,
  "corestack_district": "Dakshina Kannada",
  "corestack_mws_id": "MWS-12345",
  "enrichment_sources": ["weather", "dynamicworld", "corestack"],
  "photo_filename": "uuid.jpg",
  "photo_checksum_sha256": "abc123...",
  "app_version": "2.0.0",
  "user_id": "user-uuid",
  "device_id": "device-uuid",
  "tags": ["riparian", "disturbed"],
  "notes": "Mixed plantation with areca and coconut canopy"
}
```

### 6.2 Training Manifest (COCO-lite)

```json
{
  "info": {
    "description": "Fields ground-truth annotations",
    "version": "2.0.0",
    "date_created": "2026-03-03",
    "contributor": "Fields App",
    "spatial_extent": { "bbox": [74.5, 12.0, 76.0, 14.0] },
    "temporal_extent": { "start": "2026-01-01", "end": "2026-03-03" }
  },
  "images": [
    {
      "id": "uuid",
      "file_name": "uuid.jpg",
      "width": 2048,
      "height": 1536,
      "date_captured": "2026-03-03T10:30:00Z",
      "geo_location": { "latitude": 12.87, "longitude": 75.34, "accuracy_m": 4.2 },
      "checksum_sha256": "abc123..."
    }
  ],
  "annotations": [
    {
      "id": "uuid",
      "image_id": "uuid",
      "category_id": 1,
      "category_name": "trees",
      "attributes": {
        "validation_status": "match",
        "observer_confidence": 4,
        "season": "summer"
      }
    }
  ],
  "categories": [
    { "id": 0, "name": "water", "supercategory": "land_cover" },
    { "id": 1, "name": "trees", "supercategory": "land_cover" },
    { "id": 2, "name": "grass", "supercategory": "land_cover" },
    { "id": 3, "name": "flooded_vegetation", "supercategory": "land_cover" },
    { "id": 4, "name": "crops", "supercategory": "land_cover" },
    { "id": 5, "name": "shrub_and_scrub", "supercategory": "land_cover" },
    { "id": 6, "name": "built", "supercategory": "land_cover" },
    { "id": 7, "name": "bare", "supercategory": "land_cover" },
    { "id": 8, "name": "snow_and_ice", "supercategory": "land_cover" }
  ]
}
```

---

## 7. Season Derivation Logic

```typescript
function deriveSeason(timestamp: number): Season {
  const month = new Date(timestamp).getMonth() + 1; // 1-12
  // Indian Meteorological Department seasons
  if (month >= 6 && month <= 9) return 'monsoon';       // Jun–Sep
  if (month >= 10 && month <= 11) return 'post_monsoon'; // Oct–Nov
  if (month >= 12 || month <= 2) return 'winter';        // Dec–Feb
  return 'summer';                                        // Mar–May
}
```

---

## 8. Offline Queue Flow

```
User captures observation
    │
    ▼
Save to observations table (syncStatus = 'pending')
    │
    ▼
Enqueue in syncQueue (status = 'pending')
    │
    ▼
Is online? ──No──► Queue waits. Network listener watches.
    │
   Yes
    ▼
SyncEngine.processQueue()
    │
    ├── Fetch weather data
    ├── Fetch DW land cover
    ├── Fetch CoreStack admin/watershed
    │
    ▼
Update observation (syncStatus = 'synced', enrichmentSources = [...])
    │
    ▼
Update syncQueue item (status = 'completed')
    │
    ▼
Notify UI subscribers
```

---

## 9. File Structure (Target)

```
src/
├── App.tsx
├── main.tsx
├── components/
│   ├── map/
│   │   ├── MapView.tsx
│   │   ├── MapControls.tsx
│   │   └── SearchBar.tsx
│   ├── observation/
│   │   ├── CaptureModal.tsx        ← enhanced with observation types
│   │   ├── FieldLog.tsx            ← uses SyncEngine, not inline sync
│   │   ├── ObservationDetailModal.tsx
│   │   └── DataExportPanel.tsx
│   ├── biodiversity/
│   │   ├── SpeciesGuide.tsx        ← connected to SpeciesDatabase (GBIF/IUCN)
│   │   ├── SpeciesSightingForm.tsx ← NEW: species-specific capture fields
│   │   ├── RegistryView.tsx        ← NEW: PBR aggregated view
│   │   └── VernacularNameInput.tsx ← NEW: contribute local names
│   ├── customlayers/
│   │   ├── CustomLayerImporter.tsx   ← NEW: file import + preview + style
│   │   ├── CustomLayerStyleEditor.tsx ← NEW: colour/opacity/label config
│   │   └── CSVColumnMapper.tsx       ← NEW: lat/lon column selection for CSV
│   ├── layers/
│   │   ├── LayerPanelPro.tsx
│   │   └── LocationInfoPanel.tsx
│   ├── shared/
│   │   ├── Header.tsx
│   │   ├── BottomNav.tsx
│   │   ├── BottomSheet.tsx
│   │   ├── NetworkIndicator.tsx
│   │   └── QuickActions.tsx
│   └── settings/
│       ├── SettingsPanel.tsx       ← enhanced with profile, data mgmt
│       └── FieldProtocols.tsx      ← moved here (reference material)
├── services/
│   ├── SyncEngine.ts              ← NEW: unified sync (replaces SyncService)
│   ├── AnnotationExporter.ts      ← NEW: GeoAI + PBR export
│   ├── SpeciesDatabase.ts         ← NEW: species from GBIF/IUCN/IBP APIs
│   ├── CustomLayerManager.ts      ← NEW: import/parse/store user layers
│   ├── OfflineQueueManager.ts     ← NEW: queue with retry
│   ├── SeasonService.ts           ← NEW: season derivation
│   ├── CoreStackService.ts        ← existing (unchanged)
│   ├── CoreStackLayerService.ts   ← existing (unchanged)
│   ├── DynamicWorldService.ts     ← existing (bug fix)
│   ├── WeatherService.ts          ← existing (unchanged)
│   ├── GeoLocationService.ts      ← existing (minor enhancements)
│   ├── ImageService.ts            ← existing (Capacitor Camera migration)
│   ├── LocationDataService.ts     ← existing (bug fix)
│   ├── DatasetManager.ts          ← existing (enhanced: custom layer integration)
│   ├── RasterLayerService.ts      ← existing (unchanged)
│   ├── TileLayerService.ts        ← existing (unchanged)
│   └── ExportService.ts           ← existing (delegate to AnnotationExporter)
├── db/
│   └── database.ts                ← v2 schema migration
├── config/
│   └── westernGhatsLayers.ts      ← existing
├── hooks/
│   ├── useNetworkStatus.ts        ← existing (add Capacitor Network)
│   └── useSyncStatus.ts           ← NEW
├── types/
│   └── index.ts                   ← expanded types
└── styles/
    └── global.css                 ← existing
```

---

## 10. Migration Strategy

### Database Migration (v1 → v2)
1. Dexie `version(2)` with `.upgrade()` callback.
2. Existing observations get: `syncStatus = synced ? 'synced' : 'pending'`, `observationType = 'land_cover'`, `userId = 'legacy'`, `season` derived from timestamp.
3. New tables created empty: `species`, `customLayers`, `syncQueue`, `exportLog`.
4. Backward compatible: v1 data preserved, new fields have defaults.

### Component Migration
- Phase 1 changes are additive — existing components enhanced, not replaced.
- New components added alongside existing ones.
- `SyncService.ts` deprecated but kept until `SyncEngine.ts` is verified.
- `ExportService.ts` delegates to `AnnotationExporter.ts` for new formats, keeps existing methods as aliases.
- Hardcoded species data in `SpeciesGuide.tsx` replaced by SpeciesDatabase service (GBIF/IUCN API-backed).

### Risk Mitigation
- All IndexedDB operations wrapped in try/catch with fallback.
- Feature flags for Phase 2 features (disabled by default until tested).
- Existing export formats maintained as options alongside new formats.
