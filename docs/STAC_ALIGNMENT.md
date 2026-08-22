# CoreStack STAC Spec Alignment

> **v1.2:** live land cover is IndiaSAT via CoRE GeoServer, not a local CoreStack GeoJSON pack. STAC export still comes from `AnnotationExporter`.

How data captured and exported by Fields aligns with the [STAC v1.0.0](https://stacspec.org/) specification.

How data captured and exported by the WG Field Validator aligns with the [STAC v1.0.0](https://stacspec.org/) specification and CoreStack's data model.

---

## Data Flow: CoreStack → App → STAC Export

| Stage | What happens |
|---|---|
| **Ingest** | CoreStack GeoJSON files (village boundaries, LULC) are loaded as local vector layers. Each feature carries properties from CoreStack's Know Your Landscape (KYL) API — administrative hierarchy, Census 2011 demographics, satellite-derived land cover areas. |
| **Display & Inspect** | The Vector Feature Inspector surfaces schema-defined properties (area in hectares, population, literacy, cropping patterns) with per-field attribution to source (CoreStack API, Census of India 2011, Sentinel-2/Landsat composites). |
| **Validate** | User records a ground-truth observation (match / mismatch / unclear) with optional field notes and geotagged photo. The observation is stored locally with the full vector feature context attached. |
| **Export (GeoAI)** | `AnnotationExporter` writes a ZIP containing STAC-structured Items, plus GeoJSON and image assets. |

---

## STAC Mapping

### What aligns well

| STAC Concept | App Implementation |
|---|---|
| **Item** | Each `Observation` becomes one STAC Item with `stac_version: "1.0.0"`, Point geometry, bbox, and ISO 8601 datetime. |
| **Item Properties** | Custom `fields:` namespace carries observation type, validation result, confidence, season, and sync status. Vector-validated observations include `fields:vector_layer_id`, `fields:vector_data_source`, and the full CoreStack feature properties. |
| **Assets** | Field photos are exported as `assets.image` with `href` (relative path in ZIP), `type: "image/jpeg"`, `roles: ["data"]`, and `file:checksum` (SHA-256). |
| **Geometry** | WGS 84 Point geometry with degenerate bbox (single coordinate). |

### CoreStack properties preserved in STAC Items

**Village Boundaries layer** → `fields:vector_feature_properties`:
- Administrative: village name, district, tehsil, state (CoreStack boundary data)
- Demographic: households, total/male/female population, literacy, SC/ST (Census 2011)

**LULC layer** → `fields:vector_feature_properties`:
- Land cover areas in hectares: forest, shrub, built-up, barren, water (Sentinel-2 / Landsat annual composite via CoreStack)
- Cropping patterns: single (kharif), double, triple crop area; seasonal water presence

### Known gaps vs. full STAC compliance

| Gap | Detail | Severity |
|---|---|---|
| **No Collection object** | Export uses GeoJSON `FeatureCollection` wrapper, not a STAC Collection with `license`, `extent`, `summaries`, `providers`. | Medium — consumers can still parse Items individually. |
| **Empty `links`** | Items lack required `self`, `root`, `parent` links. Acceptable for offline/file-based exchange but not for a STAC API. | Low for offline use. |
| **Extension URIs not declared** | `file:checksum` is used but `stac_extensions` array is empty. The custom `fields:` namespace is undocumented. | Low — easy to fix. |
| **No `label` extension** | Ground-truth validation data is a natural fit for the [STAC Label Extension](https://github.com/stac-extensions/label) (`label:type`, `label:classes`, `label:tasks`). Not currently used. | Medium — would improve interoperability with ML/GeoAI pipelines. |
| **SyncEngine enrichment not in STAC** | CoreStack KYL indicators, Dynamic World class, and weather data written by SyncEngine are saved to IndexedDB but not surfaced in STAC export properties. Only vector feature context flows through. | Medium — data is captured but not exported. |
| **No `eo` / `projection` extensions** | Satellite imagery provenance (platform, bands) and CRS (EPSG:4326) are implicit but not declared. | Low. |

---

## Summary

The app produces **structurally valid STAC v1.0.0 Items** that preserve CoreStack's vector feature properties (demographics, land cover, cropping) as-is in the `fields:vector_feature_properties` block, with photo assets checksummed via the `file` extension. This is sufficient for offline data exchange and GeoAI training pipelines. Full STAC API compliance would require adding Collection metadata, required links, extension declarations, and surfacing the SyncEngine enrichment data that is currently captured but not exported.
