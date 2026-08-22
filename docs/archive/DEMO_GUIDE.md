# WG Field Validator — Demo Guide

## Quick Setup
1. Open app → http://localhost:5174 (or deployed URL)
2. App opens on **Map** tab showing Western Ghats boundary outline

---

## Demo Flow

### 1. Show the Layer Panel
- Tap **Layers** tab at bottom
- Point out: **31 map layers**, **19 data tables**, **46+ live CoreStack layers**
- Categories: Forest Analysis, Land Cover Maps, Urban Expansion, Dynamic World, Boundaries, **CoreStack Data**

### 2. Enable CoreStack Layers
- Expand **CoreStack Data** category
- Toggle ON: **Land Cover (CoreStack Sindhudurg-Kudal)** → LULC choropleth
- Toggle ON: **Village Boundaries (Sindhudurg-Kudal)** → 160 village polygons
- Note LULC legend appears at bottom-left (Forest / Shrub / Cropland / Built-up / Barren)

### 3. Navigate to Kudal
- Tap search bar → type **16.02, 73.68** → select the suggestion
- Map flies to Kudal, Sindhudurg (Maharashtra)
- Close the Location Info panel (×)
- Zoom out 2-3 clicks to see full village mosaic
- **Choropleth visible**: green = forest-dominant, gold = cropland, etc.

### 4. Inspect a Village (Vector Feature Inspector)
- Tap any polygon on the map
- **Inspector slides up** with 3 tabs: Land Cover | Village Boundaries | Western Ghats Boundary

#### Land Cover tab:
- **Ground-truth question**: "Does the reported land cover class match the ground reality at this location?"
- **Satellite Land Cover bar**: shows dominant class (e.g., "Forest 68%") with stacked color bar
- Breakdown: Forest / Cropland / Shrub / Water / Built-up / Barren percentages
- Key properties: Area in hectares, cropping data, water area

#### Village Boundaries tab:
- Shows: **Village Name**, District, Tehsil, Total Population, Households
- Additional: Development indices (ADI, Asset, Forest Cover for 2019), literacy, SC/ST population
- Ground-truth: "Does this village boundary match ground reality?"

### 5. Validate a Feature
- On any tab, scroll to **Validate this feature**
- Three options: **Present/Matches** ✅ | **Absent/Wrong** ⚠️ | **Unclear** ❓
- Tap one → observation saved locally (works offline)
- Check **Log** tab to see saved validations

### 6. Show Other Capabilities (if time)
- **Forest Analysis layers**: Toggle "Natural Forest (52% threshold)" → raster overlay
- **Historical LULC**: Toggle any GLC-FCS30D year (1987–2020) → see land cover change
- **Urban Expansion**: Toggle built-up area layers across decades
- **CoreStack Live Data**: Expand → 46 real-time watershed layers from API
- **Location Info**: Click anywhere → weather, coordinates, all intersecting layer data
- **Offline**: Works fully offline after first load (PWA + IndexedDB)

---

## Key Talking Points
- **Offline-first**: All data cached locally, syncs when connected
- **Ground-truthing workflow**: Tap polygon → see satellite data → validate against what you see in the field
- **Multi-source**: Combines CoreStack API, GLC-FCS30D historical data, Dynamic World live LULC, local GeoJSON
- **160 villages**: Full Kudal tehsil with census demographics + development indices  
- **LULC choropleth**: Data-driven coloring by dominant land cover class
- **Export-ready**: Observations can be exported for analysis
