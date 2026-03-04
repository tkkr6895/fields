# Field Validator - Services Reference

> Complete API documentation for all service modules

## Overview

The services layer contains all business logic for data fetching, processing, and external API integration. Services are singleton instances that can be imported and used throughout the application.

## Service Index

| Service | File | Purpose |
|---------|------|---------|
| [CoreStackService](#corestackservice) | `CoreStackService.ts` | CoRE Stack API integration |
| [CoreStackLayerService](#corestacklayerservice) | `CoreStackLayerService.ts` | GeoServer layer management |
| [DynamicWorldService](#dynamicworldservice) | `DynamicWorldService.ts` | GEE land cover data |
| [WeatherService](#weatherservice) | `WeatherService.ts` | Open-Meteo weather API |
| [GazetteerService](#gazetteerservice) | `GazetteerService.ts` | Place name search |
| [DatasetManager](#datasetmanager) | `DatasetManager.ts` | Local dataset handling |
| [GeoLocationService](#geolocationservice) | `GeoLocationService.ts` | GPS positioning |
| [ImageService](#imageservice) | `ImageService.ts` | Photo capture and EXIF |
| [LocationDataService](#locationdataservice) | `LocationDataService.ts` | Location enrichment |
| [ExportService](#exportservice) | `ExportService.ts` | Data export utilities |
| [RasterLayerService](#rasterlayerservice) | `RasterLayerService.ts` | Image overlay layers |
| [TileLayerService](#tilelayerservice) | `TileLayerService.ts` | XYZ tile layers |
| [SyncService](#syncservice) | `SyncService.ts` | Data synchronization |

---

## CoreStackService

**File:** `src/services/CoreStackService.ts`  
**Singleton Export:** `coreStackService`

### Purpose

Client for the CoRE Stack API (https://api-doc.core-stack.org), providing access to watershed data, administrative boundaries, and socio-ecological indicators for India.

### Configuration

```typescript
// API key sources (in order of priority):
// 1. localStorage.getItem('corestack_api_key')
// 2. import.meta.env.VITE_CORESTACK_API_KEY
```

### Methods

#### `setApiKey(key: string): void`
Configure the API key at runtime. Persists to localStorage.

```typescript
coreStackService.setApiKey('your-api-key-here');
```

#### `hasApiKey(): boolean`
Check if an API key is configured.

#### `isAvailable(): boolean`
Returns true if online and API key is set.

#### `getAdminDetails(lat: number, lon: number): Promise<AdminDetails | null>`
Get state, district, and tehsil for coordinates.

```typescript
const admin = await coreStackService.getAdminDetails(13.0, 75.5);
// Returns: { state_name: 'Karnataka', district_name: 'Shimoga', ... }
```

#### `getMWSBasicData(state, district, tehsil): Promise<MWSData | null>`
Get micro-watershed basic indicators (KYL - Know Your Landscape).

#### `getLayerUrlsForLocation(state, district, tehsil): Promise<LayerUrl[]>`
Get available GeoServer layer URLs for an admin area.

#### `getWaterbodyNear(lat, lon, bufferKm): Promise<WaterbodyData[]>`
Find waterbodies within a buffer radius.

### Interfaces

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

interface MWSData {
  mws_id: string;
  date: string;
  et?: number;           // Evapotranspiration
  runoff?: number;       // Surface runoff
  precipitation?: number;
  soil_moisture?: number;
}
```

---

## CoreStackLayerService

**File:** `src/services/CoreStackLayerService.ts`  
**Singleton Export:** `coreStackLayerService`

### Purpose

Manages dynamic layer loading from CoRE Stack GeoServer. Handles WMS/WFS requests and GeoJSON conversion.

### Methods

#### `getLayersForLocation(state, district, tehsil): Promise<CoreStackLayer[]>`
Get available layers for an admin area.

```typescript
const layers = await coreStackLayerService.getLayersForLocation(
  'Karnataka', 'Shimoga', 'Sagar'
);
```

#### `fetchLayerGeoJSON(layer: CoreStackLayer): Promise<GeoJSON.FeatureCollection | null>`
Fetch GeoJSON data for a specific layer.

### Interfaces

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

---

## DynamicWorldService

**File:** `src/services/DynamicWorldService.ts`  
**Singleton Export:** `dynamicWorldService`

### Purpose

Provides point-specific land cover data from Google Earth Engine's Dynamic World dataset. Supports both live GEE queries (via proxy) and offline grid data.

### Land Cover Classes

```typescript
const DW_CLASSES: Record<number, { name: string; color: string; description: string }> = {
  0: { name: 'Water', color: '#419BDF', description: 'Open water bodies, rivers, lakes' },
  1: { name: 'Trees', color: '#397D49', description: 'Forest, woodland, dense tree cover' },
  2: { name: 'Grass', color: '#88B053', description: 'Grassland, pasture, low vegetation' },
  3: { name: 'Flooded Vegetation', color: '#7A87C6', description: 'Wetlands, marshes, mangroves' },
  4: { name: 'Crops', color: '#E49635', description: 'Agricultural land, cultivated areas' },
  5: { name: 'Shrub and Scrub', color: '#DFC35A', description: 'Shrubland, sparse vegetation' },
  6: { name: 'Built', color: '#C4281B', description: 'Urban areas, buildings, infrastructure' },
  7: { name: 'Bare', color: '#A59B8F', description: 'Bare soil, rock, sand' },
  8: { name: 'Snow and Ice', color: '#B39FE1', description: 'Permanent snow/ice cover' }
};
```

### Methods

#### `loadOfflineData(): Promise<void>`
Load pre-bundled offline grid data from `/data/dynamicworld/`.

```typescript
await dynamicWorldService.loadOfflineData();
```

#### `fetchPointData(lat, lon, date?): Promise<DynamicWorldPointData | null>`
Get land cover for a specific point. Tries live GEE first, falls back to offline grid.

```typescript
const data = await dynamicWorldService.fetchPointData(13.0, 75.5);
if (data) {
  console.log(`Class: ${data.landCoverClass}, Confidence: ${data.confidence}`);
}
```

#### `hasOfflineData(): boolean`
Check if offline grid data is loaded.

#### `hasLiveAccess(): boolean`
Check if GEE proxy is configured.

#### `getDataSourceStatus(): DataSourceStatus`
Get current data source mode for UI display.

```typescript
const status = dynamicWorldService.getDataSourceStatus();
// Returns: { mode: 'live' | 'offline' | 'unavailable', message: string, coverage?: string }
```

#### `getClassInfoByName(name: string): ClassInfo | undefined`
Get color and description for a class name.

#### `getLiveTileUrlTemplate(date?): Promise<string | null>`
Get XYZ tile URL for map layer rendering.

### Interfaces

```typescript
interface DynamicWorldPointData {
  lat: number;
  lon: number;
  timestamp: string;
  landCoverClass: string;       // e.g., "Trees"
  landCoverClassId: number;     // e.g., 1
  confidence: number;           // 0-1
  probabilities: Record<string, number>;
  source: 'live' | 'offline';
  resolution?: string;          // e.g., "10m" or "~100m grid"
}
```

---

## WeatherService

**File:** `src/services/WeatherService.ts`  
**Singleton Export:** `weatherService`

### Purpose

Fetches weather data from Open-Meteo API. Free, no API key required.

### Methods

#### `isAvailable(): boolean`
Returns true if online.

#### `getWeather(lat, lon): Promise<WeatherData | null>`
Get current weather and 7-day forecast.

```typescript
const weather = await weatherService.getWeather(13.0, 75.5);
if (weather) {
  console.log(`Temperature: ${weather.current.temperature}°C`);
  console.log(`Conditions: ${weather.current.weatherDescription}`);
}
```

### Interfaces

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

### Weather Codes

```typescript
const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  80: 'Slight rain showers',
  95: 'Thunderstorm',
  // ... more codes
};
```

---

## GazetteerService

**File:** `src/services/GazetteerService.ts`  
**Export:** `GazetteerService` (class)

### Purpose

Provides offline place search for Karnataka and Western Ghats region. Contains pre-loaded gazetteer of ~150 places including districts, towns, and natural features.

### Methods

#### `search(query: string, limit?: number): Promise<PlaceResult[]>`
Search places by name. Supports coordinate input format.

```typescript
const gazetteer = new GazetteerService();
const results = await gazetteer.search('Agumbe');
// Returns: [{ name: 'Agumbe', lat: 13.5019, lon: 75.0933, type: 'natural', ... }]

// Coordinate search
const coords = await gazetteer.search('13.5, 75.0');
// Returns: [{ lat: 13.5, lon: 75.0, name: '13.5000, 75.0000', type: 'landmark' }]
```

### Interfaces

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

### Coverage

- All Karnataka districts
- Major towns in Western Ghats districts (Dakshina Kannada, Udupi, Uttara Kannada, Shimoga, Chikmagalur, Kodagu, Hassan)
- Wildlife sanctuaries and national parks (Kudremukh, Nagarhole, Bandipur, etc.)
- Other Western Ghats states: Kerala (Wayanad, Munnar), Tamil Nadu (Nilgiris), Goa, Maharashtra (Kolhapur, Satara)

---

## DatasetManager

**File:** `src/services/DatasetManager.ts`  
**Export:** `DatasetManager` (class)

### Purpose

Manages local dataset loading, parsing, and spatial queries. Handles CSV, GeoJSON, and manifest-driven layer configurations.

### Methods

#### `initialize(): Promise<void>`
Load and parse the dataset manifest.

```typescript
const manager = new DatasetManager();
await manager.initialize();
```

#### `getLayers(): DatasetLayer[]`
Get all configured layers.

#### `getLayerById(id: string): DatasetLayer | undefined`
Get a specific layer by ID.

#### `getValuesAtPoint(lat, lon, layerIds): Promise<DatasetValues>`
Query datasets at a coordinate.

```typescript
const values = await manager.getValuesAtPoint(13.0, 75.5, ['lulc_2020', 'forest_cover']);
```

#### `getSummaryAtPoint(lat, lon, layerIds): Promise<Record<string, unknown>>`
Get human-readable summary at a point.

---

## GeoLocationService

**File:** `src/services/GeoLocationService.ts`  
**Export:** `GeoLocationService` (class)

### Purpose

Wrapper for browser/Capacitor Geolocation API with error handling and watch mode.

### Methods

#### `getCurrentPosition(): Promise<LocationData>`
Get current GPS position (one-shot).

```typescript
const geo = new GeoLocationService();
const location = await geo.getCurrentPosition();
console.log(`${location.lat}, ${location.lon} (±${location.accuracy}m)`);
```

#### `watchPosition(callback: (location: LocationData) => void): void`
Start continuous location watching.

```typescript
geo.watchPosition((loc) => {
  console.log('Location updated:', loc);
});
```

#### `stopWatching(): void`
Stop location watch.

---

## ImageService

**File:** `src/services/ImageService.ts`  
**Singleton Export:** `imageService`

### Purpose

Handles photo capture, EXIF extraction (including GPS), and thumbnail generation.

### Methods

#### `captureFromCamera(): Promise<File | null>`
Open camera for photo capture.

#### `selectFromGallery(): Promise<File | null>`
Open file picker for image selection.

#### `processImage(file: File): Promise<ImageData>`
Extract EXIF, generate thumbnail, save to IndexedDB.

```typescript
const file = await imageService.captureFromCamera();
if (file) {
  const data = await imageService.processImage(file);
  console.log('EXIF:', data.exif);
  console.log('Blob ID:', data.blobId);
}
```

#### `getImageUrl(blobId: string): Promise<string | null>`
Get object URL for an image blob.

### Interfaces

```typescript
interface ExifData {
  timestamp?: string;
  dateTime?: string;
  lat?: number;          // GPS latitude (if available)
  lon?: number;          // GPS longitude (if available)
  orientation?: number;
  camera?: string;
  make?: string;
  model?: string;
}

interface ImageData {
  blobId: string;
  exif: ExifData;
  thumbnail?: string;    // Base64 data URL
}
```

---

## LocationDataService

**File:** `src/services/LocationDataService.ts`  
**Singleton Export:** `locationDataService`

### Purpose

Enriches location coordinates with administrative and contextual data from multiple sources.

### Methods

#### `enrichLocation(lat, lon, isOnline): Promise<LocationEnrichment>`
Get comprehensive location data.

```typescript
const enrichment = await locationDataService.enrichLocation(13.0, 75.5, true);
console.log('State:', enrichment.admin?.state);
console.log('Source:', enrichment.admin?.source); // 'corestack_api' or 'boundary_geojson'
```

### Interfaces

```typescript
interface LocationEnrichment {
  admin?: {
    state?: string;
    district?: string;
    tehsil?: string;
    source: 'corestack_api' | 'boundary_geojson' | 'corestack_local';
    confidence: 'verified' | 'approximate';
  };
  weather?: WeatherData;
  dynamicWorld?: DynamicWorldPointData;
}
```

---

## ExportService

**File:** `src/services/ExportService.ts`

### Purpose

Export observations to standard geospatial formats.

### Functions

```typescript
// Export to GeoJSON FeatureCollection
export function exportToGeoJSON(observations: Observation[]): string;

// Export to CSV
export function exportToCSV(observations: Observation[]): string;
```

---

## RasterLayerService

**File:** `src/services/RasterLayerService.ts`  
**Singleton Export:** `rasterLayerService`

### Purpose

Manages static raster image overlay layers (GeoTIFF, PNG).

### Methods

#### `getRasterLayers(): Promise<DatasetLayer[]>`
Load configured raster overlay layers.

---

## TileLayerService

**File:** `src/services/TileLayerService.ts`  
**Singleton Export:** `tileLayerService`

### Purpose

Manages XYZ tile layers for raster display.

### Methods

#### `getTileLayers(): Promise<DatasetLayer[]>`
Load configured tile layers from tile-manifest.json.

---

## Service Dependencies

```
                    CoreStackService
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
  CoreStackLayer    LocationData    CaptureModal
     Service          Service        (component)
          │               │
          ▼               ▼
      MapView      DynamicWorld
     (component)     Service
                         │
                         ▼
                  LocationInfo
                    Panel
                  (component)
```

---

*Last updated: 2025*
