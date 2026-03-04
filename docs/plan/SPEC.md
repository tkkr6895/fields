# Fields — Product Specification

> Landscape Intelligence for Environmental Commons
> Version 0.2 · March 2026 (revised: deprioritised auth/gamification, real data sources, custom layers)

---

## 1. Vision

Fields fuses two complementary goals into a single mobile-first application:

1. **For GeoAI**: A reliable stream of standardised, geo-tagged, time-stamped ground-truth observations exportable for training, fine-tuning, and quality-assurance of earth-observation foundational models.
2. **For Biodiversity Registers**: A living, community-maintained People's Biodiversity Register (PBR) that captures local flora, fauna, traditional ecological knowledge, and vernacular taxonomy — pre-populated from trusted sources and enriched in the field.

The app replaces the current fragmented workflow of switching between multiple GNSS, basemap, annotation, and note-taking apps by bundling all of these into an offline-first, tricorder-like field experience.

---

## 2. Users & Stakeholders

| Persona | Needs | Current Pain |
|---------|-------|-------------|
| **Field Researcher** | Capture ground-truth with GPS + photo + label + notes. Export training-ready annotations. | Juggles 4+ apps; data cleaning is manual; exports are ad-hoc. |
| **Biodiversity Steward** | Record species sightings, local names, TEK. Contribute to PBR. | PBRs are inaccessible PDFs. No digital-first workflow exists. |
| **Community Volunteer** | Quick observations with gamification. Sustained engagement. | Niche citizen-science apps (eBird/iNaturalist) not focused on restoration or local context. |
| **Model Developer** | Clean, labelled annotations with metadata (season, land-cover context, confidence). | Ground-truth acquisition expensive, fragmented, unstandardised. |
| **CoRE Stack Partner Org** | Deploy to field teams. Track contributions. QA data. | No coordinated collection tool aligned with STAC/CoRE Stack. |

---

## 3. Phased Requirements

### Phase 1 — Stabilise Offline Validation & Annotation Export

**P1.1 Bug Fixes & Code Health**
- [BUG] Fix `LocationDataService.ts` calling non-existent `dynamicWorldService.loadCachedData()` (should be `loadOfflineData()`).
- [BUG] Consolidate duplicate sync logic: `SyncService.ts` vs inline sync in `FieldLog.tsx`. Single source of truth.
- [BUG] `Observation.synced` typed `boolean | undefined` but indexed as `0` — normalise to enum `'pending' | 'syncing' | 'synced' | 'failed'`.
- [CHORE] Add `VITE_DW_GEE_PROXY_URL` to `.env.example`.
- [CHORE] Read version from `package.json` in SettingsPanel instead of hardcoded `1.0.0`.

**P1.2 Enhanced Observation Model**
- Add `observationType` field: `'land_cover' | 'species_sighting' | 'water_body' | 'restoration_site' | 'general'`.
- Add `protocol` optional field linking observation to a protocol ID.
- Add `tags` array for user-defined labels.
- Add `confidence` field (observer's self-assessed confidence 1-5).
- Add `season` auto-populated from timestamp (kharif/rabi/summer/monsoon for Indian context).
- Add `userId` and `deviceId` fields for multi-user deployment.

**P1.3 Annotation Export Pipeline**
- **GeoAI-ready export**: GeoJSON FeatureCollection where each Feature contains:
  - `geometry`: Point (WGS84)
  - `properties`: timestamp (ISO 8601), land_cover_label (Dynamic World class vocabulary), observer_confidence, season, weather_context, enrichment_source, photo_filename, validation_status
- **STAC-aligned metadata**: Export a STAC Item Collection JSON alongside GeoJSON, with `datetime`, `bbox`, `assets` (photo URLs), `properties` aligned with CoRE Stack field types and units.
- **Training-ready image bundle**: ZIP with `/images/` folder, `annotations.json` (COCO-lite format mapping image filenames → labels + bounding boxes), `metadata.csv`.
- **Incremental export**: Only observations modified since last export timestamp. Delta marker stored in IndexedDB.
- **Data integrity**: SHA-256 checksums per image. Export manifest with record count, date range, spatial extent.

**P1.4 Offline Hardening**
- Use `@capacitor/camera` for native camera UX on Android (replace HTML file input).
- Use `@capacitor/network` for reliable connectivity detection (supplement browser API).
- Implement observation queue with retry logic: capture → local store → queue for enrichment → enrich when online → mark synced.
- Add DB migration support (Dexie schema versioning from v1 → v2).
- Offline dataset packaging: bundle additional GeoJSON/raster layers, enable STAC-aligned metadata per dataset.

**P1.5 Custom Layer Upload & Management**
- Users can load their own geospatial data into the app for offline use, without needing pre-bundled APK layers.
- **Supported import formats** (in-app): GeoJSON, KML/KMZ, CSV with lat/lon columns, GeoPackage (.gpkg).
- **Import workflow (in-app)**:
  - File picker or drag-and-drop.
  - Auto-detect format, parse, validate geometry and CRS (reproject to EPSG:4326 if needed).
  - Preview: render on map with default styling before committing.
  - Style configuration: colour, opacity, label field, symbol.
  - Name, description, category assignment.
  - Store parsed GeoJSON + metadata in IndexedDB (`customLayers` table) for offline access.
- **Companion web portal** (future, design now):
  - Simple browser-based tool at e.g. `fields-studio.web.app`.
  - Supports heavier formats: Shapefile (.shp/.dbf/.prj ZIP), GeoTIFF, Cloud-Optimised GeoTIFF (COG).
  - Server-side processing: Shapefile → GeoJSON, GeoTIFF → PMTiles via GDAL.
  - Raster layers converted to PMTiles or XYZ tile sets, served as downloadable packs.
  - Generates a layer manifest JSON compatible with `DatasetManager`.
  - User downloads the processed pack → drops into app via file import or USB sideload.
- **Layer management UI**: enable/disable/delete custom layers alongside bundled layers in LayerPanelPro.
- **Best practices enforced**:
  - Maximum feature count warning (>10k features may slow mobile rendering).
  - CRS validation — only EPSG:4326 or auto-reprojectable CRS accepted.
  - File size limit for in-app import (~50 MB); portal handles larger files.
  - Attribution/source metadata required for shared layers.

**P1.6 Lightweight User Identity**
- No full authentication in Phase 1 — deferred to Phase 3.
- Lightweight: user enters a display name + optional affiliation on first launch. Stored in localStorage.
- `deviceId` auto-generated (UUID) and persisted.
- `userId` = `deviceId` for now (1 user per device assumption).
- Export includes `userId`/`deviceId` for attribution.

**P1.7 Settings & Configuration Enhancements**
- Data management: clear database, import backup ZIP.
- Map preferences: default basemap, default center/zoom, GPS accuracy threshold.
- Storage usage display (observation count, image size, cache size, custom layer count).

---

### Phase 2 — Biodiversity Module (Living PBR)

**P2.1 Species Database — Real Data from Trusted Sources**

No synthetic or hardcoded species data. All species information must be sourced from authoritative, verifiable APIs and databases. The app fetches from these sources when online, caches results in IndexedDB for offline use.

- **Primary data sources** (in priority order):
  1. **GBIF (Global Biodiversity Information Facility)** — `api.gbif.org`
     - Species occurrence records for Western Ghats bounding box.
     - Taxonomic backbone: scientific names, family, order, class, kingdom.
     - Free, open-access, CC-licensed. No API key required for search.
     - Endpoint: `GET /v1/species/search?q={name}&rank=SPECIES&habitat=TERRESTRIAL`
     - Occurrence: `GET /v1/occurrence/search?geometry=POLYGON(...)&limit=300`
  2. **IUCN Red List API** — `apiv3.iucnredlist.org`
     - Conservation status (LC/NT/VU/EN/CR) for each species.
     - Requires API token (free registration).
     - Endpoint: `GET /api/v3/species/{name}?token={token}`
     - Regional assessment: `GET /api/v3/species/region/southern_asia`
  3. **India Biodiversity Portal (IBP)** — `indiabiodiversity.org`
     - Region-specific species checklists, vernacular names, endemic status.
     - REST API: `GET /api/species?location=Western+Ghats`
     - Provides local language names (Kannada, Malayalam, Tamil, Marathi).
  4. **iNaturalist** — `api.inaturalist.org`
     - Community-verified observations with photos.
     - Endpoint: `GET /v1/observations/species_counts?lat=13&lng=75&radius=100`
     - CC-licensed photos usable as reference images.
  5. **COL (Catalogue of Life)** — `api.catalogueoflife.org`
     - Taxonomic names resolution and synonymy.
     - Useful for normalising scientific names across sources.

- **Data flow**: 
  ```
  App online → fetch from GBIF/IUCN/IBP → normalise to Species schema → 
  upsert into IndexedDB (species table) → tag with source + fetchedAt timestamp
  ```
- **Offline fallback**: Once fetched, species data persists in IndexedDB indefinitely. A "Refresh species data" button triggers re-fetch when online.
- **Initial load**: On first launch (or when species table is empty), app fetches Western Ghats species from GBIF + IUCN. Progress bar shown. User can skip and use app without species data.
- **Incremental enrichment**: When user searches for a species not in local DB, app queries GBIF/COL in real-time if online, caches the result.
- **Source attribution**: Every species record carries `source` and `fetchedAt` fields. UI displays "Source: GBIF" / "Source: IUCN" badges.
- Offline species search with fuzzy matching on common/scientific/vernacular names.
- Species indexed in IndexedDB for fast lookup.

- Species data model:
  ```
  Species {
    id: string                    // GBIF taxonKey or generated
    scientificName: string
    commonName: string
    vernacularNames: { language: string, name: string }[]
    family: string
    order: string
    class: string
    kingdom: 'Plantae' | 'Animalia' | 'Fungi'
    iucnStatus: 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD' | 'NE'
    isEndemic: boolean
    isMedicinal: boolean
    restorationValue: 'low' | 'medium' | 'high'
    habitat: string[]
    elevationRange: { min: number, max: number }
    characteristics: string
    traditionalUses: string[]
    imageUrl?: string             // from iNaturalist CC photos
    thumbnailUrl?: string
    region: string[]
    // provenance
    source: 'gbif' | 'iucn' | 'ibp' | 'inaturalist' | 'col' | 'user_contributed'
    sourceId?: string             // e.g. GBIF taxonKey
    fetchedAt: number             // timestamp of last API fetch
  }
  ```

**P2.2 Species Observation Integration**
- Connect SpeciesGuide "Record Sighting" → CaptureModal with `observationType: 'species_sighting'` and pre-filled species ID.
- Species sighting form fields: species ID (linked), count/abundance estimate, life stage, behaviour notes, habitat type, photo.
- Vernacular name capture: user can add local name + language if not in database.
- Observation linked to both species record and geo-location context.

**P2.3 People's Biodiversity Register (PBR) View**
- New tab/screen: "Registry" — community-aggregated species checklist for current location.
- Shows all species observed within a configurable radius (e.g. 5 km of village/panchayat boundary).
- Aggregated stats: total species, endemic count, threatened count, observation frequency.
- Timeline view showing seasonal occurrence patterns.
- Contribution leaderboard per location.

**P2.4 Traditional Ecological Knowledge (TEK)**
- Opt-in TEK capture: traditional uses, seasonality knowledge, local management practices.
- Consent workflow: explicit consent checkbox with explanation text before TEK is recorded.
- TEK data flagged separately in exports (not included in public/model-training exports by default).
- TEK attributed to community (not individual) with consent metadata.

---

### Phase 3 — Pilot, Auth, Gamification & Foundation Model Integration

**P3.1 Field Pilot Support**
- Onboarding flow for new users (guided tutorial on first launch).
- Admin dashboard wireframe: view all users' observations on a map, data quality metrics, coverage gaps.
- Feedback mechanism: in-app bug reporting and feature requests.
- Telemetry: anonymous usage stats (opt-in) for pilot evaluation.

**P3.2 Full Authentication (deferred from Phase 1)**
- Local-first auth: username + PIN stored in IndexedDB (no server required).
- PIN hashed with PBKDF2 (Web Crypto API).
- Session management: auto-lock after 15 min inactive, PIN to unlock.
- Multi-user support: switch profiles on shared devices, each user sees own observations.
- User profile management (name, affiliation, role).

**P3.3 Gamification (deferred from Phase 2)**
- Observation streaks: consecutive days with at least one observation.
- Achievement badges:
  - "First Observation", "10 Species", "100 Observations"
  - "Endemic Spotter" (recorded an endemic species)
  - "Seasonal Observer" (observations across all 4 seasons)
  - "Protocol Master" (completed all field protocols)
  - "Multi-Layer" (observation enriched with 3+ data sources)
- Progress bars per protocol completion.
- Personal stats dashboard: total observations, species observed, area covered, data quality score.

**P3.4 Foundation Model Integration**
- **Confidence overlay**: Display model prediction confidence as a heatmap layer. Areas with low confidence are "validation targets" — prioritised for field visits.
- **Annotation → Training pipeline schema**: Define the JSON schema that a training pipeline expects; ensure export conforms.
- **Active learning loop** (design only in Phase 3): Model flags uncertain pixels → app highlights them as "tasks" for field validators → observations feed back to model retraining.
- **Model card metadata**: Each export includes provenance: app version, observation protocols used, enrichment sources, spatial/temporal coverage.

**P3.5 Companion Web Portal (Fields Studio)**
- Browser-based tool for heavy geospatial data processing.
- Supports Shapefile, GeoTIFF, COG uploads.
- Server-side conversion: Shapefile → GeoJSON, GeoTIFF → PMTiles (via GDAL).
- Generates downloadable layer packs compatible with app's DatasetManager.
- User management for team deployments.

**P3.6 Scale Preparation**
- Server-side sync endpoint design (REST API spec for future backend).
- Multi-region support: layer packages for regions beyond Western Ghats.
- Offline data package manager: download region packs (boundaries, species lists, basemap tiles).
- Internationalisation (i18n) scaffolding for Kannada, Malayalam, Marathi, Tamil.

---

## 4. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Offline** | All Phase 1 & 2 features must work fully offline except initial data download and sync/enrichment. |
| **Performance** | App loads in <3s on mid-range Android (4GB RAM). Map interaction at 60fps. |
| **Storage** | Efficient image compression. Warn at 80% IndexedDB quota. |
| **Privacy** | TEK data encrypted at rest. No PII in public exports. Consent flows for sensitive data. |
| **Accessibility** | WCAG 2.1 AA contrast ratios. Touch targets ≥48px. Screen reader labels on key actions. |
| **Data Standards** | GeoJSON (RFC 7946), STAC 1.0, ISO 8601 timestamps, WGS84 (EPSG:4326). |
| **Compatibility** | Android 10+, Chrome 90+, Safari 15+ (PWA). |

---

## 5. Success Metrics

| Metric | Target (Phase 1) | Target (Phase 3) |
|--------|-------------------|-------------------|
| Observations per field day | ≥20 | ≥50 |
| Export-to-training turnaround | <5 min | <1 min (automated) |
| Species per PBR location | — | ≥50 |
| Data enrichment sources per obs | ≥3 | ≥5 |
| Offline capture success rate | 100% | 100% |
| Community volunteers active | — | ≥50 per pilot site |

---

## 6. Out of Scope (for now)

- Real-time server-side sync backend (API design in Phase 3 but no implementation).
- Fauna identification via camera (ML inference on-device).
- Drone imagery integration.
- Multi-language UI (scaffolding in Phase 3, full i18n later).
- iOS native build.
- Full authentication with encrypted storage (deferred to Phase 3).
- Gamification / achievements (deferred to Phase 3).
- Server-side raster processing (Phase 3 — Fields Studio web portal).
