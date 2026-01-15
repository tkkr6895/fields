---
pdf_options:
  format: A4
  margin: 20mm 15mm
  printBackground: true
---

<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.4; }
  h1 { font-size: 24pt; margin-bottom: 5px; color: #1a5f2a; }
  h2 { font-size: 16pt; margin-top: 20px; margin-bottom: 10px; color: #2d7a3e; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
  h3 { font-size: 13pt; margin-top: 15px; margin-bottom: 8px; }
  img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; margin: 10px 0; }
  .img-small { max-width: 60%; display: block; margin: 10px auto; }
  .img-medium { max-width: 80%; display: block; margin: 10px auto; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background-color: #f5f5f5; }
  p { margin: 8px 0; }
  .subtitle { font-size: 14pt; color: #666; margin-bottom: 20px; }
  .caption { font-size: 9pt; color: #666; text-align: center; font-style: italic; margin-top: -5px; }
</style>

# Western Ghats Field Validator

<p class="subtitle">Mobile Application for Ground-Truth Validation of Satellite-Derived Land Cover Classifications</p>

## Executive Summary

The Western Ghats Field Validator is a mobile-first progressive web application designed to validate satellite-derived land use and land cover (LULC) classifications through ground-truth field observations. The application integrates multiple authoritative geospatial data sources including CoRE Stack APIs, Google Dynamic World, and custom forest typology datasets to provide field researchers with actionable insights at any location.

**Key Capabilities:**
- Offline-first architecture for remote field work without connectivity
- Integration with CoRE Stack watershed data APIs (8 tested endpoints)
- Forest typology layers distinguishing natural forests from plantations
- GPS-based observation capture with photo documentation
- Data export in JSON and CSV formats for analysis workflows

---

## 1. Application Interface

<img src="screenshots/01_main_view.png" class="img-medium" alt="Main View">
<p class="caption">Figure 1: Main application interface showing the Western Ghats region</p>

The application provides an intuitive map-based interface with:
- Interactive map with multiple base layer options (street map, satellite imagery)
- Real-time GPS location tracking shown as a blue indicator
- Layer toggle showing count of active data layers
- Bottom navigation for Map, Layers, Capture, Guide, and Log functions

---

## 2. Layer Management System

<img src="screenshots/02_layer_panel.png" class="img-medium" alt="Layer Panel">
<p class="caption">Figure 2: Organized layer categories for systematic data access</p>

The application organizes **31 map layers** and **15 data tables** across six thematic categories:

| Category | Description | Layer Count |
|----------|-------------|-------------|
| Forest Analysis | Plantation vs natural forest classification | 7 |
| Land Cover Maps | Historical LULC from GLC-FCS30D (1985-2022) | 16 |
| Urban Expansion | Built-up area change detection | 14 |
| Dynamic World | Google Earth Engine LULC | 2 |
| Boundaries | Administrative boundaries | 2 |
| Watershed Data | Water balance and cropping intensity | 4 |

---

## 3. Forest vs Plantation Classification

<img src="screenshots/forest_vs_plantation.png" class="img-medium" alt="Forest vs Plantation">
<p class="caption">Figure 3: Forest typology layer showing natural forest (green) vs plantations (purple/magenta)</p>

### Classification Methodology

The forest typology classification distinguishes natural forests from plantations using a multi-criteria analysis approach:

**Natural Forest Indicators:**
- **Tree cover persistence**: Areas with consistent tree cover from 2000-2020 (Hansen Global Forest Change)
- **Canopy structure**: Multi-layered, heterogeneous canopy heights typical of natural forests
- **Spatial pattern**: Irregular boundaries and internal heterogeneity
- **Historical land use**: No evidence of recent clearing or replanting cycles

**Plantation Indicators:**
- **Spectral signatures**: Distinct reflectance patterns of monoculture species (rubber, teak, eucalyptus, oil palm)
- **Row patterns**: Regular geometric planting arrangements detectable in high-resolution imagery
- **Age uniformity**: Even-aged stands indicating synchronized planting
- **Crop cycles**: Periodic harvesting patterns visible in time-series analysis

This distinction is critical for biodiversity assessments, as natural forests support significantly higher species diversity compared to commercial plantations, despite both appearing as "forest" in conventional satellite classifications.

---

## 4. Dynamic World LULC Integration

<img src="screenshots/05_dynamic_world_layers.png" class="img-medium" alt="Dynamic World">
<p class="caption">Figure 4: Dynamic World layer options for land cover analysis</p>

The application integrates Google Dynamic World, providing near real-time land cover classification with 9 classes: Water, Trees, Grass, Flooded Vegetation, Crops, Shrub/Scrub, Built-up, Bare Ground, and Snow/Ice.

Two layer options are available:
- **Dynamic World (Live GEE)**: Real-time classification via Google Earth Engine API
- **Dynamic World Regional (2018-2025)**: Pre-processed composite optimized for the Western Ghats

---

## 5. CoRE Stack API Integration

The application integrates with CoRE Stack APIs to provide watershed-level contextual data:

| Endpoint | Data Provided |
|----------|--------------|
| `get_admin_details_by_latlon` | State, District, Tehsil lookup |
| `get_mwsid_by_latlon` | Micro-Watershed ID |
| `get_generated_layer_urls` | Available GIS layers for tehsil |
| `get_tehsil_data` | Comprehensive tehsil statistics |
| `get_mws_data` | Time series: ET, Runoff, Precipitation |
| `get_mws_kyl_indicators` | Know Your Landscape indicators |
| `get_waterbodies_data_by_admin` | Waterbody inventory |
| `get_mws_report` | MWS assessment report URL |

All endpoints have been tested and documented in the included Jupyter notebook (`docs/notebooks/corestack_api_tested.ipynb`).

---

## 6. Field Observation Capture

<img src="screenshots/09_capture_observation.png" class="img-medium" alt="Capture">
<p class="caption">Figure 5: Field observation capture interface with validation options</p>

The observation workflow enables systematic ground-truth collection:

1. **Photo capture** via device camera or gallery selection
2. **Automatic GPS coordinates** with accuracy indicator
3. **Layer values** at current location displayed for reference
4. **Validation status** selection:
   - Match: Satellite classification agrees with ground observation
   - Mismatch: Classification differs from observed land cover
   - Unclear: Unable to determine classification accuracy
5. **Field notes** for additional documentation

---

## 7. Field Log and Data Management

<img src="screenshots/logs.png" class="img-small" alt="Field Log">
<p class="caption">Figure 6: Field log showing captured observations with filtering by validation status</p>

The Field Log provides a chronological record of all captured observations with filtering capabilities by validation status (All, Match, Mismatch, Unclear).

<img src="screenshots/logs_export.png" class="img-small" alt="Export">
<p class="caption">Figure 7: Data export options for analysis workflows</p>

**Export Capabilities:**
- **JSON format**: Complete observation data with metadata for programmatic analysis
- **CSV format**: Tabular export compatible with spreadsheet applications and GIS software
- **Offline storage**: All observations stored locally with automatic sync when connectivity is restored

---

## 8. Additional Features

<img src="screenshots/11_satellite_view.png" class="img-medium" alt="Satellite">
<p class="caption">Figure 8: Satellite imagery base map for visual verification</p>

**Base Map Options:**
- OpenStreetMap for navigation and context
- ESRI World Imagery for visual ground-truth comparison
- Dark mode for reduced eye strain in low-light conditions

**Built-in Field Guide:**
- Getting started instructions
- Navigation and map controls
- Layer management guide
- Observation capture workflow
- Offline mode operation

---

## 9. Technical Architecture

| Component | Technology |
|-----------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Mapping | MapLibre GL JS |
| Mobile Build | Capacitor (Android APK) |
| Offline Storage | IndexedDB |
| APIs | CoRE Stack, OSM Nominatim |
| Deployment | Static hosting compatible |

---

## 10. Benefits Summary

**For Field Researchers:**
- Works offline in remote areas without connectivity
- Automatic GPS capture with accuracy indicators
- Compare multiple data layers simultaneously

**For Conservation Organizations:**
- Systematic ground-truth validation of satellite classifications
- Critical plantation vs natural forest distinction for biodiversity assessment
- Standardized data collection methodology

**For Data Scientists:**
- Tested API integrations with documentation
- Export formats (JSON, CSV) for analysis pipelines
- Reproducible methodology with sample data

---

## Sample Data and Resources

- **Sample field observations**: `field-data/recovered-observations/`
- **API testing notebook**: `docs/notebooks/corestack_api_tested.ipynb`
- **Source code**: MIT Licensed, available on GitHub

---

<p style="text-align: center; color: #666; font-size: 9pt; margin-top: 30px;">
Western Ghats Field Validator v1.0.0 | January 2026 | MIT License
</p>
