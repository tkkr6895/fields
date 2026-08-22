---
pdf_options:
  format: A4
  margin: 12mm 10mm
  printBackground: true
---

<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; line-height: 1.3; color: #333; }
  h1 { font-size: 20pt; margin: 0 0 2px 0; color: #1a5f2a; }
  h2 { font-size: 12pt; margin: 8px 0 4px 0; color: #2d7a3e; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  h3 { font-size: 10pt; margin: 5px 0 3px 0; font-weight: 600; }
  img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 2px; display: block; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 8.5pt; }
  th, td { border: 1px solid #ddd; padding: 3px 5px; text-align: left; }
  th { background-color: #f0f0f0; font-weight: 600; }
  p { margin: 3px 0; }
  ul, ol { margin: 3px 0; padding-left: 16px; }
  li { margin: 1px 0; }
  .subtitle { font-size: 11pt; color: #555; margin-bottom: 6px; }
  .caption { font-size: 7.5pt; color: #666; text-align: center; font-style: italic; margin: 1px 0 4px 0; }
  .summary-box { background: #f8f9fa; border-left: 3px solid #2d7a3e; padding: 6px 10px; margin: 6px 0; font-size: 9pt; }
  .section { page-break-inside: avoid; }
  .row { display: flex; gap: 10px; align-items: flex-start; margin: 4px 0; }
  .row > .col { flex: 1; }
  .row > .col-40 { flex: 0 0 40%; }
  .row > .col-60 { flex: 0 0 58%; }
  .row > .col-35 { flex: 0 0 35%; }
  .row > .col-65 { flex: 0 0 63%; }
  .row img { width: 100%; }
  hr { border: none; border-top: 1px solid #ddd; margin: 6px 0; }
  .small-table { font-size: 8pt; }
  .small-table td, .small-table th { padding: 2px 4px; }
</style>

# Western Ghats Field Validator
<p class="subtitle">Mobile Application for Ground-Truth Validation of Satellite-Derived Land Cover</p>

<div class="summary-box">
<strong>Key Capabilities:</strong> Offline-first architecture | CoRE Stack API integration (8 endpoints) | Forest vs plantation classification | GPS-based observation capture | JSON/CSV export
</div>

## 1. Overview and Interface

<div class="row">
<div class="col">
<p>The Western Ghats Field Validator is a mobile-first progressive web application that enables field researchers to validate satellite-derived LULC classifications through systematic ground-truth observations. It integrates CoRE Stack watershed APIs, Google Dynamic World, and custom forest typology datasets.</p>
<p><strong>Interface Features:</strong> Interactive map with street/satellite base layers | GPS location tracking | Layer toggle with active count | Bottom navigation (Map, Layers, Capture, Guide, Log)</p>
</div>
<div class="col-40">
<img src="screenshots/01_main_view.png" alt="Main View">
<p class="caption">Figure 1: Main interface</p>
</div>
</div>

<hr>

## 2. Layer Management

<div class="row">
<div class="col-35">
<img src="screenshots/02_layer_panel.png" alt="Layer Panel">
<p class="caption">Figure 2: Layer categories</p>
</div>
<div class="col-65">
<p>The application organizes <strong>31 map layers</strong> and <strong>15 data tables</strong>:</p>
<table class="small-table">
<tr><th>Category</th><th>Description</th><th>Count</th></tr>
<tr><td>Forest Analysis</td><td>Plantation vs natural forest classification</td><td>7</td></tr>
<tr><td>Land Cover Maps</td><td>Historical LULC from GLC-FCS30D (1985-2022)</td><td>16</td></tr>
<tr><td>Urban Expansion</td><td>Built-up area change detection</td><td>14</td></tr>
<tr><td>Dynamic World</td><td>Google Earth Engine LULC classification</td><td>2</td></tr>
<tr><td>Boundaries</td><td>Administrative boundaries (District, WG)</td><td>2</td></tr>
<tr><td>Watershed Data</td><td>Water balance, cropping intensity (CoRE Stack)</td><td>4</td></tr>
</table>
</div>
</div>

<hr>

## 3. Forest vs Plantation Classification

<div class="row">
<div class="col-40">
<img src="screenshots/forest_vs_plantation.png" alt="Forest vs Plantation">
<p class="caption">Figure 3: Natural forest (green) vs plantations (purple)</p>
</div>
<div class="col-60">
<h3>Data Sources</h3>
<p>The forest typology layer integrates two pre-existing datasets served locally within the application:</p>
<ul>
<li><strong>Google Dynamic World:</strong> Near real-time LULC classification providing tree cover extent</li>
<li><strong>Natural Forest 2020:</strong> AI-based classification separating natural forests from tree plantations, developed by Google Research for deforestation-free supply chain verification (<a href="https://research.google/blog/separating-natural-forests-from-other-tree-cover-with-ai-for-deforestation-free-supply-chains/">source</a>)</li>
</ul>
<p>The Natural Forest 2020 dataset uses machine learning trained on global forest inventory data to distinguish between natural forests (multi-species, uneven age) and managed plantations (monoculture, even-aged stands) at 10m resolution.</p>
<p><em>This distinction is critical: natural forests support significantly higher biodiversity than plantations, despite both appearing as "forest" in conventional satellite classifications.</em></p>
</div>
</div>

<hr>

## 4. Dynamic World and CoRE Stack Integration

<div class="row">
<div class="col-35">
<img src="screenshots/05_dynamic_world_layers.png" alt="Dynamic World">
<p class="caption">Figure 4: Dynamic World options</p>
</div>
<div class="col-65">
<h3>Dynamic World LULC</h3>
<p>Google's near real-time land cover with 9 classes: Water, Trees, Grass, Flooded Vegetation, Crops, Shrub/Scrub, Built-up, Bare Ground, Snow/Ice. Available as Live GEE (real-time) or Regional composite (2018-2025).</p>
<h3>CoRE Stack API Endpoints</h3>
<table class="small-table">
<tr><th>Endpoint</th><th>Data Provided</th></tr>
<tr><td><code>get_admin_details_by_latlon</code></td><td>State, District, Tehsil lookup</td></tr>
<tr><td><code>get_mwsid_by_latlon</code></td><td>Micro-Watershed ID</td></tr>
<tr><td><code>get_generated_layer_urls</code></td><td>GIS layers for tehsil</td></tr>
<tr><td><code>get_tehsil_data</code></td><td>Tehsil-level statistics</td></tr>
<tr><td><code>get_mws_data</code></td><td>ET, Runoff, Precipitation time series</td></tr>
<tr><td><code>get_mws_kyl_indicators</code></td><td>Watershed indicators</td></tr>
<tr><td><code>get_waterbodies_data_by_admin</code></td><td>Waterbody inventory</td></tr>
<tr><td><code>get_mws_report</code></td><td>MWS report URL</td></tr>
</table>
<p><em>All endpoints tested in <code>docs/notebooks/corestack_api_tested.ipynb</code></em></p>
</div>
</div>

<hr>

## 5. Field Observation Workflow

<div class="row">
<div class="col-35">
<img src="screenshots/09_capture_observation.png" alt="Capture">
<p class="caption">Figure 5: Capture interface</p>
</div>
<div class="col-65">
<h3>Capture Process</h3>
<ol>
<li><strong>Photo capture:</strong> Camera or gallery selection</li>
<li><strong>GPS coordinates:</strong> Automatic with accuracy indicator</li>
<li><strong>Layer values:</strong> Active layer data at location displayed</li>
<li><strong>Validation status:</strong> Match (agrees) | Mismatch (differs) | Unclear</li>
<li><strong>Field notes:</strong> Optional text documentation</li>
</ol>
<p>Observations are stored locally in IndexedDB and sync when connectivity is restored.</p>
</div>
</div>

<hr>

## 6. Field Log and Data Export

<div class="row">
<div class="col">
<img src="screenshots/logs.png" alt="Field Log">
<p class="caption">Figure 6: Field log with filtering</p>
</div>
<div class="col">
<img src="screenshots/logs_export.png" alt="Export">
<p class="caption">Figure 7: Export options</p>
</div>
<div class="col">
<h3>Log Features</h3>
<ul>
<li>Chronological list with thumbnails</li>
<li>Filter by status (All/Match/Mismatch/Unclear)</li>
<li>View details and map location</li>
</ul>
<h3>Export Formats</h3>
<ul>
<li><strong>JSON:</strong> Full metadata for analysis</li>
<li><strong>CSV:</strong> Spreadsheet/GIS compatible</li>
</ul>
</div>
</div>

<hr>

## 7. Additional Features and Technical Architecture

<div class="row">
<div class="col-35">
<img src="screenshots/11_satellite_view.png" alt="Satellite">
<p class="caption">Figure 8: Satellite base map</p>
</div>
<div class="col-65">
<div class="row">
<div class="col">
<h3>Base Maps</h3>
<ul>
<li>OpenStreetMap: Navigation</li>
<li>ESRI Imagery: Verification</li>
<li>Dark mode: Low-light</li>
</ul>
<h3>Field Guide</h3>
<ul>
<li>Getting started / GPS setup</li>
<li>Layer management</li>
<li>Offline operation</li>
</ul>
</div>
<div class="col">
<h3>Technical Stack</h3>
<table class="small-table">
<tr><td>Frontend</td><td>React 18 + TypeScript + Vite</td></tr>
<tr><td>Mapping</td><td>MapLibre GL JS</td></tr>
<tr><td>Mobile</td><td>Capacitor (Android)</td></tr>
<tr><td>Storage</td><td>IndexedDB</td></tr>
<tr><td>APIs</td><td>CoRE Stack, Nominatim</td></tr>
</table>
</div>
</div>
</div>
</div>

<hr>

## 8. Bidirectional Value: Field Data and Geospatial Models

<div class="row">
<div class="col">
<h3>Geospatial Data Enriches Field Work</h3>
<p>Field investigators can leverage satellite-derived datasets and models to enhance their data collection:</p>
<ul>
<li>Pre-visit planning using LULC classifications to identify target areas</li>
<li>Real-time context from CoRE Stack watershed indicators at any location</li>
<li>Historical change detection layers to prioritize validation sites</li>
<li>Multi-layer comparison to cross-reference classifications during fieldwork</li>
</ul>
</div>
<div class="col">
<h3>Field Data Refines Geo-Models</h3>
<p>Ground-truth observations collected through this app can programmatically improve model accuracy:</p>
<ul>
<li>Structured JSON/CSV exports compatible with ML training pipelines</li>
<li>GPS-tagged photos provide labeled samples for classification refinement</li>
<li>Match/Mismatch validation flags identify systematic model errors</li>
<li>Offline collection enables data gathering in remote, under-sampled regions</li>
</ul>
</div>
</div>

<div class="row">
<div class="col">
<h3>Resources</h3>
<p>Sample data: <code>field-data/recovered-observations/</code> | API notebook: <code>docs/notebooks/corestack_api_tested.ipynb</code> | License: MIT</p>
</div>
</div>

<p style="text-align: center; color: #888; font-size: 7.5pt; margin-top: 10px;">
Western Ghats Field Validator v1.0.0 | January 2026 | MIT License
</p>
