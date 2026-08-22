# Components (v1.2)

React + TypeScript in `src/components/`.

| Component | Role |
| --- | --- |
| **App** | GPS, map, layer panel, capture, log, settings, onboarding |
| **MapView** | MapLibre: basemap, WMS, forest PNGs, AOI polygons, note dots, GPS |
| **QuickCapture** | Photo-first tree note (camera first, save local) |
| **SpotBar** | Compact “this spot” + Tessera tile + pending enrich |
| **SettingsPanel** | Place search, AOI import, CoRE key, Tessera URL, storage |
| **FieldLog** | List, detail, export, manual sync |
| **DataExportPanel** | GeoJSON / CSV / GeoAI ZIP / STAC / PBR |
| **Onboarding** | First-launch slides |
| **Header** / **BottomNav** / **MapControls** | Chrome |
| **ObservationDetailModal** | One note + enrichment |
| **ValidationCapture** | Legacy longer capture (not on the + button) |
| **PredictionCard** | Re-exports SpotBar |
| **VectorFeatureInspector** | Vector property inspect (still in tree) |

Layer UI lives in `App.tsx` as `OverlayPanel` (Maps tab): IndiaSAT year, CoRE overlays, bundled forest rasters, link to import AOI.

Capture critical path is **QuickCapture**, not ValidationCapture.
