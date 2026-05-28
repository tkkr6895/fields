# WG Field Validator — Detailed Demo Script (10 minutes)
**Focus:** Vector data handling, data sources, STAC strategy for scale

---

## BEFORE YOU START: Setup

### Directory & Startup (1 minute before demo)

```bash
# Navigate to project root
cd "c:\Users\trkumar\OneDrive - Deloitte (O365D)\Documents\Research\Western Ghats\field-validator-app"

# Start the development server
npm run dev
# → Vite opens at http://localhost:5174

# OPTIONAL: If you want to test live Dynamic World data (requires GEE credentials)
# In another terminal:
npm run dev:dw-proxy
# → DW proxy runs on localhost:8787
```

**App opens on the Map tab** showing Western Ghats boundary. If not yet loaded, wait 3-5 seconds for IndexedDB + tile cache to populate.

---

## Data Sources: What's Local vs. What's Live

**BEFORE showing the map, explain the data lineage:**

| Data Type | Source | Hardwired? | Status in Demo |
|---|---|---|---|
| **Admin Boundaries** | `/public/data/boundaries/western_ghats.geojson` | ✅ Local | Visible on map (outline) |
| **Village Boundaries (Sindhudurg)** | `/public/data/corestack/sindhudurg_kudal_boundary.geojson` + CSV headers | ✅ Local | Ready to enable in Layers panel |
| **LULC (CoreStack Historical)** | `/public/data/corestack/sindhudurg_kudal_lulc.geojson` | ✅ Local | Ready to enable; shows satellite-derived land cover (2023 composite) |
| **Dynamic World LULC (Current)** | GEE API via proxy (`/api/dw`) OR offline grid (`/data/dynamicworld/grid-data.json`) | ❌ Live API (fallback: offline) | Can see "DW" layers in Layers panel; shows current 10m LULC |
| **Weather Data** | Open-Meteo API (`https://api.open-meteo.com/v1/forecast`) | ❌ Live API | Auto-appended to observations during sync (offline tolerant) |
| **CoreStack Admin Enrichment** | CoreStack API (`https://api-doc.core-stack.org/api/v1`) | ❌ Live API | Enriches observations with state/district/tehsil when synced |

**Key talking point:** "All vector data (boundaries, LULC polygons) is hardwired as local GeoJSON so the app works **fully offline**. Live APIs (DW, weather, admin) only enrich observations during sync — the field work never stops."

---

## SCREEN 1: Layers Panel — Show Data Architecture (1.5 minutes)

### Steps:
1. **Tap "Layers"** tab at bottom
2. **Key callout:** "31 map layers total: basemaps, forest analysis, DW, and **CoreStack Data** category"
3. **Scroll down to "CoreStack Data"** section → expand

### What to highlight:

```
🔍 CoreStack Data
  └─ Land Cover (CoreStack Sindhudurg-Kudal)     ← Polygon layer, 105 parcels
  └─ Village Boundaries (Sindhudurg-Kudal)       ← Polygon layer, 160 villages
  └─ Dynamic World (Sentinel-2 30m)              ← Raster tiles, live 10m LC
  └─ GLC-FCS30D Historical (1987-2020)           ← 8 historical LULC years
  ...
  └─ [46+ CoreStack live watershed indicators]
```

**Talking point:** "These aren't APIs pulling live imagery. CoreStack **pre-processed satellite data** (Sentinel-2 + Landsat annual composites) into these GeoJSON files. We host them locally for offline field work. When online, we also layer Dynamic World (10m resolution, daily refresh) for side-by-side comparison."

---

## SCREEN 2: Dual LULC Architecture — CoreStack vs DW (1.5 minutes)

### Steps:
1. **Toggle ON: "Land Cover (CoreStack Sindhudurg-Kudal)"**
   - Map shows **choropleth polygon coloring** by dominant land cover class
   - Legend appears: Forest (green) / Cropland (gold) / Shrub (tan) / Built-up (red) / Barren (gray)
   - Zoom in → see village-level land cover detail

2. **Also toggle ON: "Dynamic World Base Layer"** (or similar DW raster layer in the list)
   - Slippy map tiles appear underneath
   - 10m resolution, daily-updated satellite LULC from GEE

3. **Side-by-side comparison:**
   - "CoreStack LULC is **vector-based, 2023 annual composite** — good for admin planning"
   - "Dynamic World is **raster tiles, 10m daily refresh** — good for real-time change detection"
   - **No conflict:** They answer different questions:
     - CoreStack: "What land cover types exist in each administrative unit?"
     - DW: "What changed in the last 24 hours at my exact GPS coordinate?"

4. **Go back to CoreStack LULC**
   - Tap search bar → `16.02, 73.68` → select suggestion
   - Map flies to Kudal, Sindhudurg (Maharashtra)
   - Close Location Info panel (×)
   - Zoom out 2 clicks to see full polychromatic village mosaic

---

## SCREEN 3: Inspect Vector Feature — Improvements This Session (2 minutes)

### Steps:
1. **Tap any village polygon** on the map (or any LULC parcel)
   - Vector Feature Inspector slides up with 3 tabs

2. **Switch to "Land Cover" tab** if not already there
   - **NEW: Correct hectare units!**
     - "Total Parcel Area: 512.95 ha" (NOT wrong percentage like before)
     - "Forest Cover: 345.50 ha" (Sentinel-2/Landsat annual composite)
     - "Cropland Area: 124.34 ha"
   - **NO time-series junk:** Previously had "Cropland 1", "Cropland 2" … "Cropland 7" (all zeros). **Removed.**
   - **Satellite sources visible:** "Year-round Water: 0.64 ha", "Double Cropped: 108.32 ha"

3. **Click "ℹ️ About these properties"** to expand
   - Shows: **"Data Source: CoreStack API — Satellite Land Cover Analysis"**
   - Attribution: "Land cover classification derived from Sentinel-2 and Landsat satellite imagery, processed by CoreStack. Annual composite values represent area (in hectares) for each land cover class."
   - **Last Updated: 2024-03-10 (satellite imagery vintage: 2023 annual composite)**
   - Key point: "Every number has a **source, method, and date**."

4. **Switch to "Village Boundaries" tab**
   - Shows: Village Name (KAVILKATE), District (SINDHUDURG), Tehsil (Kudal), Population (875), Households (197), Literacy (704)
   - **NO zero-value fields:** Previously had 15 empty "development indices" (ADI, Asset Index, etc.) that CoreStack never populated. **All removed.**
   - **Clean census data:** Only fields with actual Census 2011 data shown

5. **Click "ℹ️ About these properties"** 
   - Shows: **"Data Source: CoreStack API + Census of India 2011"**
   - Attribution: "Village boundary polygons sourced from CoreStack API. All demographic data (population, literacy, SC/ST, households) from Census of India 2011. Development indices (NITI Aayog) were requested but not populated in this dataset."
   - **Last Updated: 2024-01-15 (boundary geometry); Census data vintage: 2011**

**Key talking point:** "This is the fix from this session: **accurate data attribution, source identification, removal of meaningless zero-value fields**. CSOs can now trust what they see."

---

## SCREEN 4: Ground-Truth Validation with Notes + Photos (1.5 minutes)

### Steps:
1. **Scroll down to "Validate this feature"** section (still on inspector)

2. **Show NEW functionality added this session:**
   - **Text box:** "Add field notes… (what do you observe on the ground?)"
     - User types: "Forest dense, good canopy cover, no visible degradation"
   - **Camera button:** "📷 Take Photo"
     - On mobile/Capacitor: Opens camera + saves geotagged photo automatically
     - On desktop: Falls back to file upload
   - **Validation buttons:** 
     - "✅ Present / Matches" (what satellite says matches reality)
     - "⚠️ Absent / Wrong" (satellite data doesn't match ground)
     - "❓ Unclear" (ambiguous)

3. **Demonstrate the flow:**
   - Type a note: "Dense forest, no recent logging"
   - Tap 📷 button (on mobile) — would trigger camera
   - Tap "✅ Present / Matches"
   - **Confirmation message:** "✓ Observation saved with notes + photo"
   - **What's stored:** 
     - GPS point (automatically geotagged)
     - User notes (text)
     - Photo (image blob + SHA-256 checksum)
     - Full CoreStack feature context (village properties, LULC properties)
     - Observation made by "Field Session X"

4. **Key talking point:** "Every validation is now **rich data**: notes, photo, location, feature context, source attribution. This is what CSOs need in the field."

---

## SCREEN 5: Data Export & STAC Strategy (1.5 minutes)

**Don't show export UI yet — talk through the strategy.**

### Current Process (Individual Items):
Currently, if you export observations, each one becomes a **separate STAC Item**:
```json
[
  {"type": "Feature", "id": "observation-001", "geometry": {...}, "assets": {"image": {...}}},
  {"type": "Feature", "id": "observation-002", ...},
  {"type": "Feature", "id": "observation-003", ...}
  ... (247 observations)
]
```

**Problem at scale:** "If a CSO does 10 field visits × 50 observations each = 500 STAC Items. No way to group by visit/session. ML pipelines can't ingest coherently."

### Proposed: Session-Based Batching (What we're building)

**NEW Architecture (Recommended for Scale):**
```
FieldSession (e.g., "Sindhudurg Monsoon 2024")
├─ startedAt: 2024-06-01
├─ endedAt: 2024-06-30
├─ totalObservations: 247
├─ stats: {
│   observationsByType: {land_cover: 180, drainage_validation: 67},
│   vectorLayersValidated: ["lulc", "boundaries", "drainage"],
│   dataQuality: {withPhotos: 180, highConfidence: 210}
│ }
└─ STAC Collection
   ├─ collection.json (metadata for entire session)
   ├─ observations/
   │   ├─ 001/item.json (individual observation STAC Item)
   │   ├─ 001/image.jpg
   │   ├─ 002/item.json
   │   ├─ 002/image.jpg
   │   ...
   └─ session_summary.json (statistical rollup)
```

**STAC export structure:**
```
FieldSession-Sindhudurg-202406.zip/
├── collection.json            # Session as STAC Collection
├── observations/              # Each observation as Item
│   ├── 001/
│   │   ├── item.json
│   │   ├── image.jpg
│   │   └── metadata.json
│   └── ...
├── session_summary.json       # "247 observations, 180 land_cover, 67 vector"
├── session_model_card.json    # "Suitable for LULC training; 98% high-confidence items"
└── vector_validation_report.json  # "Drainage: 45% match, 55% mismatch"
```

**Why this matters for CSO scale:**
1. **Coherent ingestion:** ML platforms (Planet Fusion, SentinelHub, GeoAI) can ingest one STAC Collection per field session
2. **Traceability:** Know which observations belong to which campaign
3. **Data quality metrics:** Session-level stats (confidence, sync rate, photo coverage) guide training
4. **Lineage:** "This model was trained on Sindhudurg Session 2024, 247 ground observations, 98% consensus"

**Next commits will add:**
- FieldSession type definition (src/types/)
- Session UI in FieldLog (start/end session buttons)
- Session-based export in AnnotationExporter
- Session statistics tracking in SyncEngine

---

## SCREEN 6: Next Steps — Making Village Boundaries & Watershed Data Useful (1 minute)

### Problem Statement:
Village boundaries are **just geometry now** — interesting but not actionable for CSOs. Watershed data is **complex numbers** without context.

### Phase 2 Improvements (Next Session):

#### **1. Village Boundaries → Administrative Intelligence**
- **Add:** Ward-level sub-divisions (not just gram panchayat)
- **Link:** NRLM beneficiary hotspots, forest committee boundaries
- **Display:** Side-by-side population density heatmap
- **Use case:** "Show me high-poverty + forest-adjacent villages where interventions might cluster"

**In the inspector, show:**
```
KEY PROPERTIES: Population (875), Households (197), Literacy (70.4%)
↓ EXPAND →
Livelihoods: Farmer: 45%, Laborer: 30%, Artisan: 15%, Other: 10%
Forest dependency: Direct (firewood, fodder): 60%
NRLM eligible households: 89
Agricultural land area: 280 ha (54% of village)
```

#### **2. Watershed Data → Actionable Metrics**
Currently SyncEngine stores: ET (evapotranspiration), runoff, precipitation. But CSOs see **raw numbers**.

**Transformation needed:**
- ET 450 mm → "**Medium water stress**" (with color: 🟡 yellow)
- Runoff 120 mm → "**Above-average runoff** — good for water harvesting"
- Precip 1850 mm → "**Monsoon-dominant climate** — plan for dry-season storage"

**In the inspector, future version:**
```
WATERSHED HEALTH
┌─────────────────────────┐
│ Water Balance: 750 mm   │ 🟢 Surplus
│    ET: -450 mm          │
│ Runoff: +120 mm         │
│  Precip: +1850 mm       │
└─────────────────────────┘
Recommendation: Year-round micro-irrigation viable ✓
SRI rice opportunity (monsoon); rabi vegetables (rabi season)
```

#### **3. Crop Intensity → Feasibility Assessment**
Currently shows: "Double Cropped: 108.32 ha"

**What CSOs need:**
```
CROP FEASIBILITY MAP
┌────────────────────────────┐
│ Single crop (kharif only): │ 🔴 Water-stressed; only monsoon crops
│   Area: 11.32 ha           │
│                            │
│ Double crop (K+R):         │ 🟢 Feasible if irrigation added
│   Area: 108.32 ha          │
│                            │
│ Triple crop (K+R+summer):  │ 🟠 Requires year-round irrigation
│   Area: 0 ha (potential)   │    + market access
└────────────────────────────┘
```

**Use case:** "Fund irrigation in the 108 ha double-crop zone first (ROI highest). Then expand to triple-crop pilots."

### Implementation Roadmap:
- [ ] Add `cropIntensityPotential` assessment layer (API enrichment step)
- [ ] Color-code watershed "health" indicators (ET/Runoff ratio)
- [ ] Add livelihood/forest-dependency survey data to village properties
- [ ] Create inspector "insight cards" (tl;dr conclusions for CSO field teams)

---

## SCREEN 7: Wrapping Up — Demo Checklist

### Quick review of what we covered:

✅ **Data sources explained**
- Local: Village boundaries, LULC, admin data
- Live: DW, weather, CoreStack enrichment
- Fallbacks: Offline grid for DW, IndexedDB for observations

✅ **Dual LULC architecture**
- CoreStack = vector-based, historical 2023 composite
- DW = raster tiles, daily refresh, 10m resolution
- Both visible simultaneously; answer different questions

✅ **Vector validation with rich context**
- Field notes + photos + geotagging
- Full feature properties preserved in observation
- Accurate per-field attribution (source + date)

✅ **STAC strategy for scale**
- Individual items → Session-based Collections
- Coherent ingestion for ML pipelines
- Traceability + data quality metrics per campaign

✅ **Next steps roadmap**
- Session UI + FieldSession data model (2 weeks)
- Watershed health indicators (2 weeks)
- Crop intensity feasibility assessment (3 weeks)
- Village livelihood/forest-dependency layers (4 weeks)

---

## APPENDIX: Quick Reference — Data Lineage

**When you click a village polygon:**
```
User clicks polygon on map (lat: 16.02, lon: 73.68)
↓
App identifies it's in "corestack_sindhudurg_kudal_boundary" layer (from GeoJSON)
↓
Fetches feature properties from that GeoJSON feature
> Properties include: village name (KAVILKATE), Census 2011 demographics
↓
Also checks if LULC polygon overlaps
↓
If yes: fetches LULC properties (satellite-derived, 2023 composite)
↓
Inspector shows both side-by-side
> User can verify: "Does this satellite-derived land cover match what I see in the field?"
↓
User adds notes + photo + validation button
↓
Observation stored with:
- GPS point
- User notes + photo
- Timestamp
- Full CoreStack feature context (both boundaries + LULC)
- Validation result
↓
When online: SyncEngine enriches with weather + DW + CoreStack admin context
↓
Export: Becomes STAC Item(s) within a FieldSession Collection
```

---

## TALKING POINTS FOR SCALE & CSO ADOPTION

| Point | What to Say |
|---|---|
| **Offline-first** | "Field teams work offline. All data is local. When you connect, observations sync & enrich automatically. No connectivity = no problem." |
| **Attribution clarity** | "Every field on screen says where it came from (CoreStack, Census 2011, Sentinel-2, etc.) and when. No mystery data." |
| **Session cohesion** | "We group observations by field visit/session. One campaign = one STAC Collection. ML systems can ingest it as a unit." |
| **Scalability** | "If you run 20 field teams, 50 observations each, we do 20 STAC Collections. Not a mess of 1000 standalone items." |
| **Actionability** | "Next: We'll layer livelihoods, forest dependency, crop feasibility. Not just raw numbers — insights for targeting interventions." |

---

## Troubleshooting During Demo

| Issue | Fix |
|---|---|
| Map doesn't load | Reload browser; clear cache `Ctrl+Shift+Delete` → LocalStorage + IndexedDB |
| Layers panel is slow | Scroll into view; layers load on-demand |
| No Dynamic World tiles | Check `/api/dw` proxy (if live DW enabled). If offline, DW grid (~500 points) shown instead. |
| Inspector won't open on click | Zoom in closer; small polygons need precise tap. Tap center of polygon. |
| Photos can't be captured | Desktop browser: file upload fallback. Mobile: check camera permissions. |

**All data fully offline after first load.** No internet = app still works 100%.

---

**You're ready! 10 minutes, precise screens, actionable talking points. Good luck! 🎯**
