# Field Validator - Architecture Documentation

> Comprehensive technical architecture for the Western Ghats Field Validator application

## Overview

The Field Validator is an offline-first Progressive Web Application (PWA) designed for ground-truth data collection of Land Use/Land Cover (LULC) datasets in the Western Ghats biodiversity hotspot. The application integrates multiple satellite and government data sources while functioning reliably in low/no connectivity environments.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Header] [SearchBar] [NetworkIndicator]                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        MapView (MapLibre GL)                          │  │
│  │   - CARTO Dark / ESRI Satellite basemaps                             │  │
│  │   - Vector layers (GeoJSON)                                          │  │
│  │   - Raster layers (XYZ tiles, image overlays)                        │  │
│  │   - User location marker                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  [MapControls]  [LayerPanelPro]  [LocationInfoPanel]  [CaptureModal]       │
│  [BottomNav: Map | Layers | Protocols | Log]                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             SERVICES LAYER                                   │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────────┤
│ CoreStack    │ DynamicWorld │ Weather      │ Gazetteer    │ Dataset        │
│ Service      │ Service      │ Service      │ Service      │ Manager        │
├──────────────┴──────────────┴──────────────┴──────────────┴────────────────┤
│ GeoLocation  │ Image        │ Export       │ LocationData │ RasterLayer    │
│ Service      │ Service      │ Service      │ Service      │ Service        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             DATA LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  IndexedDB (Dexie)                │  Service Worker Cache                   │
│  ├── observations                 │  ├── /data/* (datasets)                 │
│  ├── images                       │  ├── /tiles/* (map tiles)               │
│  └── datasets                     │  └── static assets                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                   │
├──────────────────┬──────────────────┬──────────────────┬───────────────────┤
│  CoRE Stack API  │  GEE DW Proxy    │  Open-Meteo      │  CARTO/ESRI       │
│  (api-doc.core-  │  (localhost:8787 │  (weather API)   │  (basemap tiles)  │
│   stack.org)     │   or configured) │                  │                   │
└──────────────────┴──────────────────┴──────────────────┴───────────────────┘
```

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2.0 | UI framework with functional components and hooks |
| TypeScript | 5.3.0 | Type-safe JavaScript development |
| Vite | 5.0.0 | Build tool with fast HMR and optimized production builds |
| MapLibre GL | 4.1.0 | Open-source vector map rendering |
| Dexie | 4.0.0 | IndexedDB wrapper for offline storage |
| Turf.js | 6.5.0 | Geospatial analysis utilities |

### Mobile
| Technology | Version | Purpose |
|------------|---------|---------|
| Capacitor | 8.0.0 | Native container for Android deployment |
| @capacitor/camera | 8.0.0 | Camera access for photo capture |
| @capacitor/geolocation | 8.0.0 | GPS location services |
| @capacitor/filesystem | 8.0.0 | Local file system access |

### Backend (Optional)
| Technology | Purpose |
|------------|---------|
| Express 5 | Dynamic World proxy server |
| @google/earthengine | Google Earth Engine API client |

## Directory Structure

```
field-validator-app/
├── src/
│   ├── App.tsx                 # Main application component
│   ├── main.tsx                # React entry point
│   ├── components/             # React UI components (22 files)
│   │   ├── MapView.tsx         # Core map component (879 lines)
│   │   ├── LocationInfoPanel.tsx # Data display panel
│   │   ├── CaptureModal.tsx    # Observation form
│   │   ├── FieldLog.tsx        # Observation history
│   │   └── ...
│   ├── services/               # Business logic services (13 files)
│   │   ├── CoreStackService.ts # CoRE Stack API client
│   │   ├── DynamicWorldService.ts # GEE land cover data
│   │   ├── WeatherService.ts   # Open-Meteo weather
│   │   └── ...
│   ├── config/                 # Configuration
│   │   └── westernGhatsLayers.ts # Layer definitions
│   ├── db/                     # Database layer
│   │   └── database.ts         # Dexie schema and queries
│   ├── hooks/                  # Custom React hooks
│   │   └── useNetworkStatus.ts # Online/offline detection
│   ├── styles/                 # CSS stylesheets
│   └── types/                  # TypeScript interfaces
│       └── index.ts            # Shared type definitions
├── public/
│   ├── data/                   # Static datasets
│   │   ├── dataset-manifest.json
│   │   ├── boundaries/         # GeoJSON boundaries
│   │   ├── dynamicworld/       # Offline DW grid data
│   │   └── lulc/               # LULC data files
│   └── tiles/                  # Pre-cached map tiles
├── server/
│   └── dynamicworld-proxy.mjs  # GEE proxy server
├── scripts/
│   ├── generate-dw-grid.py     # Offline data generator
│   └── prepare-datasets.js     # Dataset processing
├── android/                    # Android native project
├── docs/                       # Documentation
└── field-data/                 # Recovered observations
```

## Data Flow Architecture

### 1. Map Initialization Flow

```
App.tsx
  └─► DatasetManager.initialize()
      ├─► Fetch dataset-manifest.json
      └─► Parse layer configurations
  └─► RasterLayerService.getRasterLayers()
  └─► TileLayerService.getTileLayers()
  └─► Combine layers → setLayers(allLayers)
  └─► MapView renders with activeLayers
```

### 2. Location Click Flow

```
User clicks map
  └─► MapView.onMapClick(lat, lon, features)
      └─► App.tsx receives click
          └─► setShowLocationInfo(true)
          └─► LocationInfoPanel renders
              ├─► DatasetManager.getSummaryAtPoint()
              ├─► DynamicWorldService.fetchPointData()
              ├─► CoreStackService.getAdminDetails()
              └─► WeatherService.getWeather()
```

### 3. Observation Capture Flow

```
User opens CaptureModal
  └─► GeoLocationService.getCurrentPosition()
  └─► ImageService.captureFromCamera()
      └─► Read EXIF (exifr library)
      └─► Extract GPS if available
  └─► LocationDataService.enrichLocation()
      ├─► CoreStackService.getAdminDetails()
      └─► Boundary lookup from local GeoJSON
  └─► User selects validation status
  └─► Save to IndexedDB via database.ts
```

### 4. Sync & Export Flow

```
FieldLog.handleSync()
  └─► For each observation:
      ├─► WeatherService.getWeather()
      ├─► DynamicWorldService.fetchPointData()
      └─► CoreStackService.getAdminDetails()
  └─► Update observation with enriched data
  └─► Save to IndexedDB

FieldLog.handleExport()
  └─► exportToGeoJSON() or exportToCSV()
  └─► Web Share API (mobile) or download (desktop)
```

## Offline Capabilities

### Service Worker Caching (Workbox)

```typescript
// vite.config.ts - Caching configuration
workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,geojson,csv}'],
  maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB
  runtimeCaching: [
    {
      urlPattern: /\/data\/.*/,      // All datasets
      handler: 'CacheFirst',         // Local-first
      options: { maxAgeSeconds: 30 * 24 * 60 * 60 } // 30 days
    },
    {
      urlPattern: /\/tiles\/.*/,     // Map tiles
      handler: 'CacheFirst'
    }
  ]
}
```

### IndexedDB Schema (Dexie)

```typescript
// Three tables with indexed fields
this.version(1).stores({
  observations: 'id, timestamp, userValidation, [location.lat+location.lon]',
  images: 'id, createdAt',
  datasets: 'id, layerId, updatedAt'
});
```

### Offline Data Sources

| Source | Location | Size Range |
|--------|----------|------------|
| Western Ghats boundary | `/data/boundaries/` | ~500KB |
| LULC datasets | `/data/lulc/` | 1-10MB each |
| DW offline grid | `/data/dynamicworld/` | 100KB-3MB |
| Basemap tiles | `/tiles/` | Pre-cached areas |
| Gazetteer | Built into service | ~50KB |

## API Integration Details

### CoRE Stack API

**Base URL**: `https://api-doc.core-stack.org/api/v1` (proxied via Vite in dev)

| Endpoint | Purpose |
|----------|---------|
| `/admin_detail/{lat}/{lon}` | Get state/district/tehsil for coordinates |
| `/mws_kyl_basic/{state}/{district}/{tehsil}` | Watershed indicators |
| `/layers_for_location/{state}/{district}/{tehsil}` | Available GeoServer layers |
| `/waterbody/...` | Waterbody data |

### Dynamic World (GEE)

**Proxy URL**: `/api/dw` → `localhost:8787`

| Endpoint | Purpose |
|----------|---------|
| `/dynamicworld/point?lat=&lon=` | Point-specific land cover |
| `/dynamicworld/mapid?date=` | XYZ tile URL for live layer |

### Weather (Open-Meteo)

**Base URL**: `https://api.open-meteo.com/v1/forecast`

No API key required. Fetches current weather and 7-day forecast.

## Build & Deployment

### Development Mode

```bash
npm run dev          # Vite dev server (port 5173)
npm run dev:dw-proxy # DW proxy server (port 8787)
npm run dev:full     # Both servers concurrently
```

### Production Build

```bash
npm run build        # Creates optimized bundle in dist/
npm run preview      # Preview production build locally
```

### Android APK

```bash
npm run android:build  # Build + Capacitor sync
npm run android:open   # Open in Android Studio
# Then Build > Build Bundle(s) / APK(s) > Build APK(s)
```

## Security Considerations

### API Keys
- CoRE Stack API key: Stored in localStorage, configurable via Settings panel
- GEE credentials: Require local Earth Engine authentication

### Data Privacy
- All observations stored locally in IndexedDB
- GPS coordinates and photos remain on-device
- Export requires explicit user action
- No telemetry or analytics

## Performance Optimizations

1. **Layer Loading**: Lazy initialization of datasets
2. **Image Processing**: Thumbnail generation for observation list
3. **Map Rendering**: Visibility toggling vs source removal
4. **Caching**: Aggressive service worker caching with 30-day expiry
5. **Spatial Queries**: Turf.js for client-side geospatial operations

## Extension Points

### Adding New Data Sources

1. Create service in `src/services/`
2. Add types to `src/types/index.ts`
3. Integrate in `LocationInfoPanel.tsx` or `FieldLog.tsx`
4. Optional: Add offline data to `public/data/`

### Adding New Layer Types

1. Update `DatasetLayer` interface in types
2. Extend `DatasetManager` parsing logic
3. Add rendering logic in `MapView.tsx`

---

*Last updated: 2025*
