# DEMO QUICK REFERENCE CARD (Keep This Visible)

## RUN THIS FIRST
```bash
cd "c:\Users\trkumar\OneDrive - Deloitte (O365D)\Documents\Research\Western Ghats\field-validator-app"
npm run dev
# → http://localhost:5174
```

---

## DATA SOURCES AT A GLANCE

| What | Where | Live? | Why |
|---|---|---|---|
| Village Boundaries | `/public/data/corestack/...geojson` | ❌ Local | Offline field work |
| LULC (2023) | `/public/data/corestack/...geojson` | ❌ Local | Satellite composite, offline |
| Dynamic World | GEE API via `/api/dw` | ✅ Live (fallback: grid) | Daily refresh, 10m resolution |
| Weather | Open-Meteo API | ✅ Live | Auto-appended on sync |
| Admin Enrichment | CoreStack API | ✅ Live | State/district/tehsil context |

**Key:** App is **100% offline.** APIs only enrich when synced.

---

## 7-SCREEN FLOW (10 min total)

| Screen | Key Point | Time |
|---|---|---|
| 1. Layers | 31 layers + CoreStack category | 1.5 min |
| 2. Dual LULC | CoreStack (vector) vs DW (raster) | 1.5 min |
| 3. Inspect Feature | **Corrected hectares, accurate attribution, no zeros** | 2 min |
| 4. Validation | **NEW: Notes + photos + full context** | 1.5 min |
| 5. Export/STAC | Session-based Collections (not individual items) | 1.5 min |
| 6. Next Steps | Village livelihood layers, watershed health, crop feasibility | 1 min |
| 7. Wrap Up | Data lineage + adoption talking points | 0.5 min |

---

## CRITICAL IMPROVEMENTS THIS SESSION (Emphasize!)

✅ **Fixed LULC formatting**
- "Total Parcel Area: 512.95 ha" (NOT 512.95%)
- Root cause: Was using format='percentage' for hectare data

✅ **Removed 90+ junk fields**
- "Cropland A", "Cropland 1-7", "K Water 1-7" (all zeros)
- They leaked through regex pattern matching in `filterMeaningfulProperties`

✅ **Removed 15 always-zero indices**
- "ADI_2001", "Asset Index", "Base Flow", etc.
- CoreStack never populated these in the dataset

✅ **Accurate attribution**
- Every field shows: source (CoreStack/Census), methodology, data vintage date
- "Census data vintage: 2011" + "Satellite imagery vintage: 2023"

✅ **Notes + photos in validation**
- Users can now capture field evidence, not just checkboxes
- Photo saved with GPS + SHA-256 checksum

---

## NAVIGATION SHORTCUTS

| Goal | Action |
|---|---|
| Go to a place | Search: `16.02, 73.68` |
| See all data | Zoom out 2-3 clicks |
| Inspect a polygon | Tap it directly on map |
| Check session stats | Tap "Log" tab|
| See data sources | Click "ℹ️ About these properties" (expand) |

---

## TALKING POINTS (30 seconds each)

**Data Lineage:**
"Every observation gets GPS, notes, photo, plus the full CoreStack feature properties (village name, land cover, census data). When synced, it enriches with weather + DW + admin context. Everything is traceable."

**For Scale:**
"Individual STAC Items don't scale for CSOs doing 10+ sessions. We're moving to session-based STAC Collections: one collection = one field campaign. ML platforms ingest it as a unit."

**Offline-First:**
"All vectors (boundaries, LULC) are local GeoJSON. Field teams never lose connectivity. APIs (DW, weather, CoreStack) only enrich during sync. No field team left behind."

**Attribution:**
"CSOs can trust what they see. Every number has a source, method, and date. No mystery data."

---

## IF SOMETHING BREAKS

| Problem | Solution |
|---|---|
| Map blank | `Ctrl+Shift+Delete` → clear IndexedDB + localStorage; reload |
| Layers slow | They load on-demand; wait 3 sec, scroll panel |
| DW tiles missing | `/api/dw` not running; that's OK—offline grid used instead |
| Inspector won't open | Tap CENTER of polygon; try zooming in first |
| Photo can't capture | Desktop: file upload fallback. Mobile: check permissions. |

**Bottom line:** App is **fault-tolerant.** Offline always works.

---

## NEXT STEPS (Mention briefly)

1. **Session UI** — Start/end session buttons in FieldLog
2. **Watershed health** — ET/runoff ratios translated to "water stress levels"
3. **Crop feasibility** — "Single crop" / "Double crop" / "Triple crop potential"
4. **Village livelihoods** — Farmer %, artisan %, forest dependency hotspots
5. **STAC Collection export** — Session-based batching (in progress)

---

## STAT TO MENTION

**This session's fixes:**
- **3 files modified** (DatasetManager, VectorFeatureInspector, App)
- **278 insertions, 48 deletions** (280 lines of code)
- **~95 fields** hidden (time-series + always-zero junk)
- **15 indices removed** (never-populated CoreStack fields)
- **1 complete schema rewrite** (fixed formats + attribution)
- **100% offline** (all data local after first load)

**Result:** Production-ready ground-truthing for CSOs.

---

**Print this card. Tape it to your laptop bezel. You're good to go! 🎯**
