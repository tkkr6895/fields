# Field Validator - Components Reference

> Complete documentation of all React UI components

## Overview

The application uses functional React components with hooks. All components are written in TypeScript with proper prop interfaces.

## Component Index

### Core Components
| Component | File | Description |
|-----------|------|-------------|
| [MapView](#mapview) | `MapView.tsx` | Main map display with MapLibre GL |
| [LocationInfoPanel](#locationinfopanel) | `LocationInfoPanel.tsx` | Location query results display |
| [CaptureModal](#capturemodal) | `CaptureModal.tsx` | Observation capture form |
| [FieldLog](#fieldlog) | `FieldLog.tsx` | Observation history list |

### Navigation & Layout
| Component | File | Description |
|-----------|------|-------------|
| [Header](#header) | `Header.tsx` | Top app bar with title and status |
| [BottomNav](#bottomnav) | `BottomNav.tsx` | Bottom tab navigation |
| [BottomSheet](#bottomsheet) | `BottomSheet.tsx` | Slide-up panel container |

### Panels & Controls
| Component | File | Description |
|-----------|------|-------------|
| [LayerPanelPro](#layerpanelpro) | `LayerPanelPro.tsx` | Layer toggle interface |
| [MapControls](#mapcontrols) | `MapControls.tsx` | Zoom, locate, reset buttons |
| [SearchBar](#searchbar) | `SearchBar.tsx` | Location search input |
| [SettingsPanel](#settingspanel) | `SettingsPanel.tsx` | API configuration UI |

### Information Displays
| Component | File | Description |
|-----------|------|-------------|
| [LocationSummary](#locationsummary) | `LocationSummary.tsx` | Compact location card |
| [LocationSummaryEnhanced](#locationsummaryenhanced) | `LocationSummaryEnhanced.tsx` | Extended location info |
| [DataExportPanel](#dataexportpanel) | `DataExportPanel.tsx` | Export options interface |
| [NetworkIndicator](#networkindicator) | `NetworkIndicator.tsx` | Online/offline status |

### Reference Content
| Component | File | Description |
|-----------|------|-------------|
| [SpeciesGuide](#speciesguide) | `SpeciesGuide.tsx` | Species identification guide |
| [FieldProtocols](#fieldprotocols) | `FieldProtocols.tsx` | Field survey protocols |

### Deprecated/Legacy
| Component | File | Description |
|-----------|------|-------------|
| LayerPanel | `LayerPanel.tsx` | Replaced by LayerPanelPro |
| LayerPanelEnhanced | `LayerPanelEnhanced.tsx` | Replaced by LayerPanelPro |

---

## MapView

**File:** `src/components/MapView.tsx`

### Purpose

Core mapping component using MapLibre GL JS. Handles map rendering, layer management, and user interactions.

### Props

```typescript
interface MapViewProps {
  center: [number, number];           // [longitude, latitude]
  zoom: number;                       // Zoom level (0-22)
  basemap: 'dark' | 'satellite';      // Active basemap style
  layers: DatasetLayer[];             // Available data layers
  activeLayers: Set<string>;          // Enabled layer IDs
  currentLocation: LocationData | null;
  onMapMove: (center: [number, number], zoom: number) => void;
  onMapClick?: (lat: number, lon: number, info?: MapClickInfo) => void;
  onCoreStackLayersLoaded?: (layers: CoreStackLayer[]) => void;
}
```

### Ref Methods

```typescript
interface MapViewRef {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (center: [number, number], zoom?: number) => void;
  resetView: () => void;
  loadCoreStackForAdmin: (state: string, district: string, tehsil: string) => Promise<void>;
  loadCoreStackAtPoint: (lat: number, lon: number) => Promise<void>;
}
```

### Features

- **Basemaps**: CARTO Dark, ESRI Satellite
- **Layer Types**: Vector (GeoJSON), Raster (XYZ tiles), Image overlays
- **Interactions**: Click to query, pan, zoom, rotate
- **User Location**: Blue pulsing dot for GPS position
- **CoreStack Integration**: Dynamic layer loading from GeoServer

### Default View

```typescript
const DEFAULT_CENTER: [number, number] = [75.5, 13.0];  // Western Ghats
const DEFAULT_ZOOM = 8;
```

---

## LocationInfoPanel

**File:** `src/components/LocationInfoPanel.tsx`

### Purpose

Displays comprehensive information about a clicked map location by querying multiple data sources.

### Props

```typescript
interface LocationInfoPanelProps {
  location: LocationData;
  isOnline: boolean;
  activeLayerIds: string[];
  mapClickInfo?: MapClickInfo | null;
  onClose: () => void;
}
```

### Data Sections

| Section | Source | Icon |
|---------|--------|------|
| Map Features | Rendered vector layers | 🧩 |
| Local Data | Bundled datasets | 💾 |
| Dynamic World | GEE/offline grid | 🌍 |
| CoreStack | API | 💧 |
| Weather | Open-Meteo | 🌤️ |

### State Management

```typescript
interface DataSection {
  title: string;
  icon: string;
  status: 'loading' | 'loaded' | 'error' | 'offline';
  data: Record<string, unknown> | null;
}
```

### Behavior

1. Resets all sections when location changes
2. Fetches data from each source in parallel
3. Shows loading spinner per section
4. Gracefully handles offline/error states
5. Expands relevant sections automatically

---

## CaptureModal

**File:** `src/components/CaptureModal.tsx`

### Purpose

Full-screen modal for capturing field observations with photo, location, and validation data.

### Props

```typescript
interface CaptureModalProps {
  currentLocation: LocationData | null;
  getDatasetValues: (lat: number, lon: number) => Promise<DatasetValues>;
  onCapture: (observation: Observation) => void;
  onClose: () => void;
}
```

### Observation Flow

1. **Get Location** - From GPS, device, or photo EXIF
2. **Capture Photo** - Camera or file selection
3. **Extract EXIF** - Pull GPS, timestamp from photo
4. **Query Datasets** - Get layer values at point
5. **User Validation** - Match/mismatch/unclear
6. **Add Notes** - Optional field notes
7. **Save** - Store in IndexedDB

### Location Sources

| Source | Priority | Icon |
|--------|----------|------|
| EXIF | Highest | 📷 |
| GPS | High | 🛰️ |
| Device | Fallback | 📱 |

### Validation Options

```typescript
type ValidationStatus = 'match' | 'mismatch' | 'unclear';
```

---

## FieldLog

**File:** `src/components/FieldLog.tsx`

### Purpose

Displays list of captured observations with filtering and detail view.

### Props

```typescript
interface FieldLogProps {
  observations?: Observation[];
  onSelectObservation?: (observation: Observation) => void;
  onDeleteObservation?: (id: string) => void;
}
```

### Features

- **Filtering**: By validation status
- **Sorting**: Reverse chronological
- **Preview**: Thumbnail, location, timestamp
- **Detail Modal**: Full observation view
- **Delete**: Remove with confirmation
- **Export**: Via DataExportPanel

### Filter Options

| Filter | Description |
|--------|-------------|
| All | Show all observations |
| Match | Land cover matches satellite |
| Mismatch | Discrepancy found |
| Unclear | Uncertain classification |

---

## Header

**File:** `src/components/Header.tsx`

### Purpose

Top application bar with branding, network status, and settings access.

### Props

```typescript
interface HeaderProps {
  isOnline: boolean;
  pendingSync: number;
  onSettingsClick?: () => void;
}
```

### Elements

- **App title**: "Field Validator"
- **Network indicator**: Green (online) / Red (offline)
- **Sync badge**: Count of unsynced observations
- **Settings button**: Opens SettingsPanel

---

## BottomNav

**File:** `src/components/BottomNav.tsx`

### Purpose

Bottom tab bar for main navigation between app sections.

### Props

```typescript
interface BottomNavProps {
  activeTab: 'map' | 'layers' | 'protocols' | 'log';
  onTabChange: (tab: 'map' | 'layers' | 'protocols' | 'log') => void;
  onCaptureClick: () => void;
}
```

### Tabs

| Tab | Icon | View |
|-----|------|------|
| Map | 🗺️ | MapView |
| Layers | 📊 | LayerPanelPro |
| Protocols | 📋 | FieldProtocols |
| Log | 📓 | FieldLog |

### Capture Button

Center floating action button triggers CaptureModal.

---

## LayerPanelPro

**File:** `src/components/LayerPanelPro.tsx`

### Purpose

Advanced layer management interface with categories, search, and CoreStack integration.

### Props

```typescript
interface LayerPanelProps {
  layers: DatasetLayer[];
  activeLayers: Set<string>;
  onToggle: (layerId: string) => void;
  onClose: () => void;
  coreStackLayers?: CoreStackLayer[];
  mapCenter?: { lat: number; lon: number };
  selectedLocation?: { lat: number; lon: number };
  onLoadCoreStackAtPoint?: (lat: number, lon: number) => Promise<void>;
  onLoadCoreStackByAdmin?: (state: string, district: string, tehsil: string) => Promise<void>;
}
```

### Layer Categories

| Category | Icon | Color | Description |
|----------|------|-------|-------------|
| Forest | 🌳 | #2e7d32 | Plantation vs natural forest |
| LULC | 🌿 | #66bb6a | Historical land cover maps |
| Built | 🏘️ | #ff7043 | Urban expansion tracking |
| Dynamic World | 🌍 | #26c6da | Live/derived Google DW |
| Boundary | 🗺️ | #42a5f5 | Administrative boundaries |
| CoreStack | 💧 | #29b6f6 | Watershed data |
| Tree Cover | 🌲 | #43a047 | Tree cover density |

### Features

- **Search**: Filter layers by name
- **Toggle All**: Enable/disable category
- **CoreStack Loader**: Fetch layers by admin area
- **Layer Info**: Description tooltips

---

## MapControls

**File:** `src/components/MapControls.tsx`

### Purpose

Floating control buttons for map interaction.

### Props

```typescript
interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocateMe: () => Promise<boolean>;
  onResetView: () => void;
}
```

### Controls

| Button | Icon | Action |
|--------|------|--------|
| Zoom In | + | Increase zoom level |
| Zoom Out | - | Decrease zoom level |
| Locate | 📍 | Fly to GPS position |
| Reset | ⌂ | Return to default view |

---

## SearchBar

**File:** `src/components/SearchBar.tsx`

### Purpose

Location search with autocomplete for place names.

### Props

```typescript
interface SearchBarProps {
  onSelectLocation: (location: LocationData) => void;
  placeholder?: string;
}
```

### Behavior

1. User types search query
2. Debounced search triggers after 300ms
3. Results shown in dropdown
4. Selection flies map to location

---

## SettingsPanel

**File:** `src/components/SettingsPanel.tsx`

### Purpose

Configuration interface for API keys and service status.

### Props

```typescript
interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}
```

### Sections

| Section | Purpose |
|---------|---------|
| CoreStack API | API key input, status indicator |
| Dynamic World | GEE proxy status, setup instructions |
| Data Sources | Overview of available data |
| About | App version, links |

### API Key Flow

1. User enters API key
2. Key validated via test request
3. Success: Stored in localStorage
4. Error: Shown with retry option

---

## SpeciesGuide

**File:** `src/components/SpeciesGuide.tsx`

### Purpose

Reference guide for species identification in the Western Ghats.

### Props

```typescript
interface SpeciesGuideProps {
  onClose: () => void;
}
```

### Content

- Species categories (birds, mammals, reptiles, amphibians, plants)
- Identification tips
- Conservation status
- Endemic species highlights

---

## FieldProtocols

**File:** `src/components/FieldProtocols.tsx`

### Purpose

Field survey protocols and best practices documentation.

### Props

```typescript
interface FieldProtocolsProps {
  onClose?: () => void;
}
```

### Sections

- Pre-field checklist
- Data collection protocols
- Photo documentation standards
- Safety guidelines
- Data validation procedures

---

## DataExportPanel

**File:** `src/components/DataExportPanel.tsx`

### Purpose

Export options for observation data.

### Props

```typescript
interface DataExportPanelProps {
  onExport: (format: 'json' | 'geojson' | 'csv' | 'zip') => Promise<void>;
}
```

### Export Formats

| Format | Extension | Contents |
|--------|-----------|----------|
| JSON | .json | Raw observations array |
| GeoJSON | .geojson | FeatureCollection |
| CSV | .csv | Flat tabular data |
| ZIP | .zip | All data + photos |

---

## NetworkIndicator

**File:** `src/components/NetworkIndicator.tsx`

### Purpose

Visual indicator of network connectivity status.

### Props

```typescript
interface NetworkIndicatorProps {
  isOnline: boolean;
}
```

### States

| State | Color | Label |
|-------|-------|-------|
| Online | Green | "Online" |
| Offline | Red | "Offline" |

---

## QuickActions

**File:** `src/components/QuickActions.tsx`

### Purpose

Floating quick access buttons for common actions.

### Props

```typescript
interface QuickActionsProps {
  onCapture: () => void;
  onLayers: () => void;
  onExport: () => void;
}
```

---

## ObservationDetailModal

**File:** `src/components/ObservationDetailModal.tsx`

### Purpose

Full-screen view of a single observation with all details.

### Props

```typescript
interface ObservationDetailModalProps {
  observation: Observation;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onEdit?: (observation: Observation) => void;
}
```

### Sections

- Photo (full resolution)
- Location map snippet
- Coordinates and accuracy
- Timestamp and source
- Dataset values
- User validation and notes

---

## Component Patterns

### Event Handling

Components use `useCallback` for stable function references:

```typescript
const handleClick = useCallback(() => {
  // Handler logic
}, [dependencies]);
```

### Loading States

Components show appropriate loading indicators:

```typescript
if (loading) {
  return <div className="loading-spinner" />;
}
```

### Error Boundaries

Critical components catch and display errors gracefully:

```typescript
try {
  await riskyOperation();
} catch (err) {
  setError(err.message);
}
```

### Responsive Design

Components adapt to screen size via CSS:

```css
@media (max-width: 768px) {
  .panel { width: 100%; }
}
```

---

**Next:** [API-INTEGRATION.md](API-INTEGRATION.md) - External API documentation
