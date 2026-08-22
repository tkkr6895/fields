# Types

Canonical definitions: `src/types/index.ts`. **v1.2:** `predictionValidation.perSource.source` is `'indiasat'` only (no Dynamic World). Tessera and CoRE live on `Observation.tessera` / `Observation.coreStack`.

# Field Validator - TypeScript Types Reference

> Complete reference for all TypeScript interfaces and type definitions

## Overview

All shared type definitions are located in `src/types/index.ts`. This document provides detailed documentation of each type with usage examples.

---

## Core Types

### LocationData

Represents a geographic position with GPS metadata.

```typescript
interface LocationData {
  lat: number;         // Latitude in decimal degrees (-90 to 90)
  lon: number;         // Longitude in decimal degrees (-180 to 180)
  accuracy: number;    // Accuracy radius in meters
  timestamp?: number;  // Unix timestamp in milliseconds
  altitude?: number;   // Altitude above sea level in meters
}
```

**Usage:**
```typescript
const location: LocationData = {
  lat: 13.0869,
  lon: 75.5761,
  accuracy: 10,
  timestamp: Date.now(),
  altitude: 450
};
```

---

### Observation

The primary data model for field observations.

```typescript
interface Observation {
  id: string;                        // UUID v4
  timestamp: string;                 // ISO 8601 datetime
  location: LocationData;            // GPS position
  context: ObservationContext;       // Regional context
  datasetValues: DatasetValues;      // Layer values at location
  image?: ImageData;                 // Captured photo (optional)
  userValidation: ValidationStatus;  // User's assessment
  notes: string;                     // Free-text notes
  synced?: boolean;                  // Server sync status
}
```

**Usage:**
```typescript
import { v4 as uuidv4 } from 'uuid';

const observation: Observation = {
  id: uuidv4(),
  timestamp: new Date().toISOString(),
  location: { lat: 13.0, lon: 75.5, accuracy: 5 },
  context: {
    region: 'Karnataka, Shimoga, Sagar',
    areaMode: 'point',
    adminData: {
      state: 'Karnataka',
      district: 'Shimoga',
      tehsil: 'Sagar',
      source: 'corestack_api',
      confidence: 'verified'
    }
  },
  datasetValues: {
    'lulc_2020': { class: 'Forest', confidence: 0.95 }
  },
  userValidation: 'match',
  notes: 'Dense forest cover confirmed',
  synced: false
};
```

---

### ObservationContext

Regional and administrative context for an observation.

```typescript
interface ObservationContext {
  region: string;              // Human-readable region string
  areaMode: 'point' | 'buffer' | 'watershed';
  bufferM?: number;            // Buffer radius if areaMode is 'buffer'
  watershedId?: string;        // MWS ID if areaMode is 'watershed'
  adminData?: {
    state?: string;
    district?: string;
    tehsil?: string;
    block?: string;
    source?: 'boundary_geojson' | 'corestack_api' | 'corestack_local';
    confidence?: 'verified' | 'approximate';
  };
}
```

**Admin Data Sources:**
| Source | Description |
|--------|-------------|
| `corestack_api` | Live API query |
| `boundary_geojson` | Local boundary file point-in-polygon |
| `corestack_local` | Cached API response |

---

### ValidationStatus

User's assessment of whether satellite data matches ground reality.

```typescript
type ValidationStatus = 'match' | 'mismatch' | 'unclear';
```

| Value | Meaning |
|-------|---------|
| `match` | Satellite data accurately reflects what's on the ground |
| `mismatch` | Satellite data differs from ground observation |
| `unclear` | Unable to determine accuracy |

---

### ImageData

Metadata for a captured photograph.

```typescript
interface ImageData {
  blobId: string;      // ID referencing images table in IndexedDB
  exif: ExifData;      // Extracted EXIF metadata
  thumbnail?: string;  // Base64 data URL for preview
}
```

---

### ExifData

EXIF metadata extracted from photographs.

```typescript
interface ExifData {
  timestamp?: string;    // Original capture time
  dateTime?: string;     // Alternative datetime field
  lat?: number;          // GPS latitude (if geotagged)
  lon?: number;          // GPS longitude (if geotagged)
  orientation?: number;  // Image rotation (1-8)
  camera?: string;       // Camera/phone name
  make?: string;         // Manufacturer
  model?: string;        // Device model
}
```

**Orientation Values:**
| Value | Transform |
|-------|-----------|
| 1 | Normal |
| 2 | Horizontal flip |
| 3 | Rotate 180° |
| 4 | Vertical flip |
| 6 | Rotate 90° CW |
| 8 | Rotate 90° CCW |

---

### DatasetValues

Container for queried values from active layers.

```typescript
interface DatasetValues {
  [layerId: string]: {
    [field: string]: unknown;
  };
}
```

**Example:**
```typescript
const values: DatasetValues = {
  'lulc_2020': {
    class: 'Forest',
    confidence: 0.95,
    source: 'Dynamic World'
  },
  'forest_cover': {
    treecover_pct: 78,
    year: 2020
  }
};
```

---

## Layer Types

### DatasetLayer

Configuration for a map layer.

```typescript
interface DatasetLayer {
  id: string;
  title: string;
  type: 'vector' | 'raster' | 'csv' | 'image-overlay';
  source: {
    format: 'geojson' | 'csv' | 'pmtiles' | 'mbtiles' | 'tiff' | 'png' | 'xyz';
    path: string;
  };
  style?: {
    kind: 'categorical' | 'choropleth' | 'point' | 'polygon' | 'image';
    field?: string;
    colors?: Record<string, string>;
    opacity?: number;
  };
  query?: {
    mode: 'feature_at_point' | 'summary' | 'buffer';
    fields: string[];
  };
  bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  minZoom?: number;
  maxZoom?: number;
  year?: number;
  description?: string;
  category: LayerCategory;
  enabled: boolean;
}
```

---

### LayerCategory

Classification of layer types.

```typescript
type LayerCategory = 
  | 'lulc'         // Land Use / Land Cover
  | 'dynamicworld' // Dynamic World layers
  | 'corestack'    // CoRE Stack API layers
  | 'forest'       // Forest cover data
  | 'boundary'     // Admin boundaries
  | 'built'        // Built-up/urban areas
  | 'treecover'    // Tree cover percentage
  | 'other';       // Miscellaneous
```

---

### DatasetManifest

Root configuration for all datasets.

```typescript
interface DatasetManifest {
  region: string;           // e.g., "Western Ghats"
  generated: string;        // ISO date
  version: string;          // Semantic version
  layers: DatasetLayer[];   // All configured layers
  basemaps: BasemapConfig[];
}
```

---

### BasemapConfig

Configuration for basemap options.

```typescript
interface BasemapConfig {
  id: string;
  type: 'vector' | 'raster';
  title: string;
  offline: boolean;          // Whether tiles are pre-cached
  source: string;            // URL or source identifier
}
```

---

## Filter and Summary Types

### FilterState

Query filter options for observations.

```typescript
interface FilterState {
  validation: ValidationStatus | 'all';
  layer: string | 'all';
  dateRange?: {
    start: Date;
    end: Date;
  };
}
```

---

### LocationSummaryData

Aggregated data for a location.

```typescript
interface LocationSummaryData {
  coordinates: {
    lat: number;
    lon: number;
  };
  layers: {
    [layerId: string]: {
      title: string;
      values: Record<string, unknown>;
    };
  };
}
```

---

## Component Types

### MapClickInfo

Information about active features at a clicked location.

```typescript
interface MapClickInfo {
  features: MapClickFeature[];
}

interface MapClickFeature {
  source: 'corestack' | 'dataset';
  mapLayerId: string;
  datasetLayerId?: string;
  coreStackLayerId?: string;
  properties: Record<string, unknown>;
}
```

**Location:** `src/components/MapView.tsx`

---

### MapViewRef

Methods exposed by MapView via React ref.

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

**Usage:**
```typescript
const mapRef = useRef<MapViewRef>(null);

// Later...
mapRef.current?.flyTo([75.5, 13.0], 14);
mapRef.current?.loadCoreStackAtPoint(13.0, 75.5);
```

---

## Service Types

### DynamicWorldPointData

Point-specific land cover data.

```typescript
interface DynamicWorldPointData {
  lat: number;
  lon: number;
  timestamp: string;
  landCoverClass: string;          // e.g., "Trees"
  landCoverClassId: number;        // e.g., 1
  confidence: number;              // 0-1
  probabilities: Record<string, number>;  // All class probabilities
  source: 'live' | 'offline';
  resolution?: string;             // e.g., "10m" or "~100m grid"
}
```

**Location:** `src/services/DynamicWorldService.ts`

---

### AdminDetails

Administrative boundary information from CoRE Stack.

```typescript
interface AdminDetails {
  state_name?: string;
  state_code?: string;
  district_name?: string;
  district_code?: string;
  tehsil_name?: string;
  tehsil_code?: string;
  mws_id?: string;
}
```

**Location:** `src/services/CoreStackService.ts`

---

### WeatherData

Weather information from Open-Meteo.

```typescript
interface CurrentWeather {
  temperature: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
  weatherCode: number;
  weatherDescription: string;
  isDay: boolean;
}

interface WeatherForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  precipitationProbability: number;
  weatherCode: number;
  weatherDescription: string;
}

interface WeatherData {
  current: CurrentWeather;
  forecast: WeatherForecast[];
  fetchedAt: string;
}
```

**Location:** `src/services/WeatherService.ts`

---

### PlaceResult

Gazetteer search result.

```typescript
interface PlaceResult {
  id: string;
  name: string;
  displayName: string;
  type: 'city' | 'town' | 'village' | 'district' | 'taluk' | 'landmark' | 'natural';
  lat: number;
  lon: number;
  state?: string;
  district?: string;
  importance: number;  // 0-1, used for ranking
}
```

**Location:** `src/services/GazetteerService.ts`

---

### CoreStackLayer

Layer information from CoRE Stack GeoServer.

```typescript
interface CoreStackLayer {
  id: string;
  name: string;
  type: 'vector' | 'raster';
  url: string;
  workspace?: string;
  layerName?: string;
}
```

**Location:** `src/services/CoreStackLayerService.ts`

---

## Database Types

### ImageBlob

Stored image data.

```typescript
interface ImageBlob {
  id: string;
  blob: Blob;
  createdAt: string;
}
```

### CachedDataset

Cached dataset storage.

```typescript
interface CachedDataset {
  id: string;
  layerId: string;
  data: unknown;
  updatedAt: string;
}
```

**Location:** `src/db/database.ts`

---

## Type Guards

Useful type guard patterns:

```typescript
// Check if observation has image
function hasImage(obs: Observation): obs is Observation & { image: ImageData } {
  return obs.image !== undefined && obs.image.blobId !== undefined;
}

// Check ValidationStatus
function isValidationStatus(value: string): value is ValidationStatus {
  return ['match', 'mismatch', 'unclear'].includes(value);
}

// Usage
if (hasImage(observation)) {
  console.log('Image blob ID:', observation.image.blobId);
}
```

---

## Utility Types

### Partial Updates

```typescript
// For updating observations
type ObservationUpdate = Partial<Omit<Observation, 'id' | 'timestamp'>>;

await db.observations.update(id, {
  synced: true,
  notes: 'Updated notes'
} as ObservationUpdate);
```

### Layer ID Extraction

```typescript
// Get all layer IDs from manifest
type LayerId = DatasetManifest['layers'][number]['id'];
```

---

## Importing Types

```typescript
// From main types file
import type { 
  LocationData, 
  Observation, 
  ValidationStatus,
  DatasetLayer,
  ObservationContext 
} from '../types';

// From services (service-specific types)
import type { DynamicWorldPointData } from '../services/DynamicWorldService';
import type { AdminDetails } from '../services/CoreStackService';
import type { WeatherData } from '../services/WeatherService';

// From components
import type { MapClickInfo, MapViewRef } from '../components/MapView';
```

---

*Last updated: 2025*
