---
pdf_options:
  format: A4
  margin: 15mm 12mm
  printBackground: true
---

<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; line-height: 1.35; color: #333; }
  h1 { font-size: 22pt; margin: 0 0 3px 0; color: #1a5f2a; }
  h2 { font-size: 13pt; margin: 12px 0 6px 0; color: #2d7a3e; border-bottom: 1px solid #ccc; padding-bottom: 3px; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 8px 0 4px 0; font-weight: 600; page-break-after: avoid; }
  img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9pt; }
  th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
  th { background-color: #f0f0f0; font-weight: 600; }
  p { margin: 4px 0; }
  .subtitle { font-size: 12pt; color: #555; margin-bottom: 10px; }
  .caption { font-size: 8pt; color: #666; text-align: center; font-style: italic; margin: 2px 0 8px 0; }
  .figure { page-break-inside: avoid; margin: 8px 0; }
  .two-col { display: flex; gap: 12px; align-items: flex-start; }
  .two-col > div { flex: 1; }
  .two-col img { width: 100%; }
  .summary-box { background: #f8f9fa; border-left: 3px solid #2d7a3e; padding: 8px 12px; margin: 8px 0; }
  .key-list { margin: 4px 0; padding-left: 18px; }
  .key-list li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 10px 0; }
</style>

# Western Ghats Field Validator
<p class="subtitle">Mobile Application for Ground-Truth Validation of Satellite-Derived Land Cover Classifications</p>

<div class="summary-box">
<strong>Key Capabilities:</strong> Offline-first architecture | CoRE Stack API integration (8 endpoints) | Forest vs plantation classification | GPS-based observation capture | JSON/CSV data export
</div>

## 1. Overview

The Western Ghats Field Validator is a mobile-first progressive web application that enables field researchers to validate satellite-derived LULC classifications through systematic ground-truth observations. It integrates CoRE Stack watershed APIs, Google Dynamic World, and custom forest typology datasets.

<div class="two-col">
<div class="figure">
<img src="screenshots/01_main_view.png" alt="Main View">
<p class="caption">Figure 1: Main interface with Western Ghats boundary</p>
</div>
<div class="figure">
<img src="screenshots/02_layer_panel.png" alt="Layer Panel">
<p class="caption">Figure 2: Layer panel with 31 map layers</p>
</div>
</div>

**Interface Features:** Interactive map with street/satellite base layers | GPS location tracking | Layer toggle with active count | Bottom navigation (Map, Layers, Capture, Guide, Log)

---

## 2. Layer Management

The application organizes **31 map layers** and **15 data tables** across thematic categories:

| Category | Description | Layers |
|----------|-------------|--------|
| Forest Analysis | Plantation vs natural forest classification | 7 |
| Land Cover Maps | Historical LULC from GLC-FCS30D (1985-2022) | 16 |
| Urban Expansion | Built-up area change detection | 14 |
| Dynamic World | Google Earth Engine LULC classification | 2 |
| Boundaries | Administrative boundaries (District, WG) | 2 |
| Watershed Data | Water balance, cropping intensity (CoRE Stack) | 4 |

---

## 3. Forest vs Plantation Classification

<div class="figure">
<img src="screenshots/forest_vs_plantation.png" alt="Forest vs Plantation" style="max-width: 75%; display: block; margin: 0 auto;">
<p class="caption">Figure 3: Forest typology showing natural forest (green) vs plantations (purple/magenta)</p>
</div>

### Classification Methodology

The forest typology distinguishes natural forests from plantations using multi-criteria analysis:

<div class="two-col">
<div>
<h3>Natural Forest Indicators</h3>
<ul class="key-list">
<li><strong>Tree cover persistence:</strong> Consistent cover 2000-2020 (Hansen GFC)</li>
<li><strong>Canopy structure:</strong> Multi-layered, heterogeneous heights</li>
<li><strong>Spatial pattern:</strong> Irregular boundaries, internal heterogeneity</li>
<li><strong>Historical use:</strong> No recent clearing/replanting cycles</li>
</ul>
</div>
<div>
<h3>Plantation Indicators</h3>
<ul class="key-list">
<li><strong>Spectral signatures:</strong> Monoculture reflectance (rubber, teak, eucalyptus)</li>
<li><strong>Row patterns:</strong> Regular geometric planting arrangements</li>
<li><strong>Age uniformity:</strong> Even-aged stands from synchronized planting</li>
<li><strong>Crop cycles:</strong> Periodic harvesting in time-series</li>
</ul>
</div>
</div>

This distinction is critical for biodiversity assessments: natural forests support significantly higher species diversity than commercial plantations, despite both appearing as "forest" in conventional satellite classifications.

---

## 4. Dynamic World and CoRE Stack Integration

<div class="two-col">
<div class="figure">
<img src="screenshots/05_dynamic_world_layers.png" alt="Dynamic World">
<p class="caption">Figure 4: Dynamic World LULC options</p>
</div>
<div>
<h3>Dynamic World LULC</h3>
<p>Google's near real-time land cover with 9 classes: Water, Trees, Grass, Flooded Vegetation, Crops, Shrub/Scrub, Built-up, Bare Ground, Snow/Ice.</p>
<p><strong>Options:</strong></p>
<ul class="key-list">
<li>Live GEE: Real-time via Earth Engine API</li>
<li>Regional (2018-2025): Pre-processed composite</li>
</ul>
</div>
</div>

### CoRE Stack API Endpoints

| Endpoint | Data Provided |
|----------|--------------|
| `get_admin_details_by_latlon` | State, District, Tehsil lookup from coordinates |
| `get_mwsid_by_latlon` | Micro-Watershed ID for location |
| `get_generated_layer_urls` | Available GIS layers for tehsil |
| `get_tehsil_data` | Comprehensive tehsil-level statistics |
| `get_mws_data` | Time series: Evapotranspiration, Runoff, Precipitation |
| `get_mws_kyl_indicators` | Know Your Landscape watershed indicators |
| `get_waterbodies_data_by_admin` | Waterbody inventory for admin unit |
| `get_mws_report` | MWS assessment report URL |

All endpoints tested and documented in `docs/notebooks/corestack_api_tested.ipynb`.

---

## 5. Field Observation Workflow

<div class="two-col">
<div class="figure">
<img src="screenshots/09_capture_observation.png" alt="Capture">
<p class="caption">Figure 5: Observation capture interface</p>
</div>
<div>
<h3>Capture Process</h3>
<ol class="key-list">
<li><strong>Photo capture:</strong> Camera or gallery selection</li>
<li><strong>GPS coordinates:</strong> Automatic with accuracy indicator</li>
<li><strong>Layer values:</strong> Active layer data at location</li>
<li><strong>Validation status:</strong>
  <ul>
  <li>Match: Classification agrees with observation</li>
  <li>Mismatch: Classification differs from ground truth</li>
  <li>Unclear: Cannot determine accuracy</li>
  </ul>
</li>
<li><strong>Field notes:</strong> Optional documentation</li>
</ol>
</div>
</div>

---

## 6. Field Log and Data Export

<div class="two-col">
<div class="figure">
<img src="screenshots/logs.png" alt="Field Log">
<p class="caption">Figure 6: Field log with validation filtering</p>
</div>
<div class="figure">
<img src="screenshots/logs_export.png" alt="Export">
<p class="caption">Figure 7: Data export options</p>
</div>
</div>

**Field Log Features:**
- Chronological observation list with photo thumbnails
- Filter by validation status (All, Match, Mismatch, Unclear)
- View observation details and location on map

**Export Capabilities:**
- **JSON:** Complete data with metadata for programmatic analysis
- **CSV:** Tabular format for spreadsheets and GIS software
- **Offline storage:** Local IndexedDB with sync on connectivity

---

## 7. Additional Features

<div class="two-col">
<div class="figure">
<img src="screenshots/11_satellite_view.png" alt="Satellite">
<p class="caption">Figure 8: Satellite base map for verification</p>
</div>
<div>
<h3>Base Map Options</h3>
<ul class="key-list">
<li>OpenStreetMap: Navigation context</li>
<li>ESRI World Imagery: Visual verification</li>
<li>Dark mode: Low-light conditions</li>
</ul>

<h3>Built-in Field Guide</h3>
<ul class="key-list">
<li>Getting started / GPS setup</li>
<li>Navigation and map controls</li>
<li>Layer management</li>
<li>Observation capture workflow</li>
<li>Offline mode operation</li>
</ul>
</div>
</div>

---

## 8. Technical Architecture and Benefits

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Mapping | MapLibre GL JS |
| Mobile | Capacitor (Android APK) |
| Storage | IndexedDB (offline-first) |
| APIs | CoRE Stack, OSM Nominatim |

<div class="two-col">
<div>
<h3>For Field Researchers</h3>
<ul class="key-list">
<li>Works offline in remote areas</li>
<li>Automatic GPS with accuracy</li>
<li>Multiple layer comparison</li>
</ul>
</div>
<div>
<h3>For Conservation Organizations</h3>
<ul class="key-list">
<li>Systematic ground-truth validation</li>
<li>Plantation vs forest distinction</li>
<li>Standardized methodology</li>
</ul>
</div>
</div>

---

## Resources

| Resource | Location |
|----------|----------|
| Sample field observations | `field-data/recovered-observations/` |
| CoRE Stack API notebook | `docs/notebooks/corestack_api_tested.ipynb` |
| Source code | MIT Licensed on GitHub |

<p style="text-align: center; color: #888; font-size: 8pt; margin-top: 15px;">
Western Ghats Field Validator v1.0.0 | January 2026 | MIT License
</p>
