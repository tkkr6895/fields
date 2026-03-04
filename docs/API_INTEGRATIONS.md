# Field Validator - API Integrations

> Complete documentation of external API integrations and proxy configurations

## Overview

The application integrates with multiple external services to provide comprehensive geospatial data. This document covers API endpoints, authentication, request/response formats, and error handling.

## API Summary

| Service | Base URL | Authentication | Purpose |
|---------|----------|----------------|---------|
| CoRE Stack | `api-doc.core-stack.org/api/v1` | API Key | Watershed & admin data |
| CoRE Stack GeoServer | `geoserver.core-stack.org:8443` | None | Vector layer tiles |
| Dynamic World Proxy | `localhost:8787` (dev) | GEE OAuth | Land cover data |
| Open-Meteo | `api.open-meteo.com` | None | Weather data |

---

## CoRE Stack API

### Overview

CoRE Stack provides geospatial data for India's agricultural and watershed management systems. The API offers access to administrative boundaries, watershed indicators, cropping patterns, and waterbodies.

**Documentation:** https://api-doc.core-stack.org

### Authentication

```
Header: Authorization: Bearer <API_KEY>
```

Get an API key from [core-stack.org/use-apis](https://core-stack.org/use-apis/)

### Proxy Configuration (Development)

```typescript
// vite.config.ts
proxy: {
  '/api/corestack': {
    target: 'https://api-doc.core-stack.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/corestack/, '/api/v1'),
    secure: true
  }
}
```

### Endpoints

#### GET `/admin_detail/{latitude}/{longitude}`

Get administrative hierarchy for a coordinate.

**Request:**
```
GET /api/v1/admin_detail/13.0/75.5
Authorization: Bearer <api_key>
```

**Response:**
```json
{
  "State": "Karnataka",
  "District": "Shimoga",
  "Tehsil": "Sagar"
}
```

**App Usage:**
```typescript
const admin = await coreStackService.getAdminDetails(13.0, 75.5);
```

#### GET `/mws_kyl_basic/{state}/{district}/{tehsil}`

Get micro-watershed basic indicators (Know Your Landscape).

**Request:**
```
GET /api/v1/mws_kyl_basic/Karnataka/Shimoga/Sagar
Authorization: Bearer <api_key>
```

**Response:**
```json
{
  "mws_id": "4D2A3B4C5D6E",
  "date": "2024-01-15",
  "et": 3.5,
  "runoff": 12.3,
  "precipitation": 45.6,
  "soil_moisture": 0.78
}
```

#### GET `/layers_for_location/{state}/{district}/{tehsil}`

Get available GeoServer layer URLs for an area.

**Response:**
```json
[
  {
    "layer_name": "Drainage",
    "url": "https://geoserver.core-stack.org:8443/geoserver/wms?...",
    "type": "vector",
    "format": "application/json"
  },
  {
    "layer_name": "Waterbody",
    "url": "https://geoserver.core-stack.org:8443/geoserver/wfs?...",
    "type": "vector"
  }
]
```

#### GET `/waterbody/{latitude}/{longitude}/{buffer_km}`

Find waterbodies within a buffer radius.

**Response:**
```json
[
  {
    "uid": "WB001",
    "name": "Sharavathi Reservoir",
    "type": "Reservoir",
    "area_ha": 450.5,
    "volume_ml": 12500,
    "status": "Full"
  }
]
```

### Error Responses

| Status | Meaning |
|--------|---------|
| 401 | Invalid or missing API key |
| 404 | Location not found in database |
| 429 | Rate limit exceeded |
| 500 | Server error |

---

## CoRE Stack GeoServer

### Overview

GeoServer provides vector tile access to detailed spatial layers (drainage, settlements, crops, etc.).

### Proxy Configuration

```typescript
// vite.config.ts
proxy: {
  '/api/geoserver': {
    target: 'https://geoserver.core-stack.org:8443',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/geoserver/, '/geoserver'),
    secure: true
  }
}
```

### WFS GetFeature (GeoJSON)

**Request:**
```
GET /geoserver/{workspace}/ows?
  service=WFS&
  version=1.0.0&
  request=GetFeature&
  typeName={workspace}:{layer_name}&
  outputFormat=application/json&
  CQL_FILTER=state='Karnataka' AND district='Shimoga'
```

**Response:** GeoJSON FeatureCollection

### WMS GetMap (Tiles)

```
GET /geoserver/{workspace}/wms?
  service=WMS&
  version=1.1.1&
  request=GetMap&
  layers={workspace}:{layer_name}&
  bbox={west},{south},{east},{north}&
  width=256&
  height=256&
  srs=EPSG:4326&
  format=image/png
```

---

## Dynamic World (GEE Proxy)

### Overview

The Dynamic World proxy server authenticates with Google Earth Engine and provides simplified endpoints for land cover queries.

**Server:** `server/dynamicworld-proxy.mjs`

### Starting the Proxy

```bash
# Authenticate first
earthengine authenticate

# Set project
export GEE_PROJECT=your-project-id

# Start server
npm run dev:dw-proxy
# or
node server/dynamicworld-proxy.mjs
```

### Vite Proxy Configuration

```typescript
proxy: {
  '/api/dw': {
    target: 'http://localhost:8787',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/dw/, '')
  }
}
```

### Endpoints

#### GET `/dynamicworld/point`

Get land cover classification for a specific point.

**Request:**
```
GET /dynamicworld/point?lat=13.0&lon=75.5&date=2024-01-15
```

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| lat | number | Yes | Latitude |
| lon | number | Yes | Longitude |
| date | string | No | ISO date (default: recent 90 days) |

**Response:**
```json
{
  "lat": 13.0,
  "lon": 75.5,
  "timestamp": "2024-01-15",
  "landCoverClass": "Trees",
  "confidence": 0.87,
  "probabilities": {
    "water": 0.01,
    "trees": 0.87,
    "grass": 0.05,
    "flooded_vegetation": 0.0,
    "crops": 0.03,
    "shrub_and_scrub": 0.02,
    "built": 0.01,
    "bare": 0.01,
    "snow_and_ice": 0.0
  }
}
```

#### GET `/dynamicworld/mapid`

Get an authenticated XYZ tile URL for map display.

**Request:**
```
GET /dynamicworld/mapid?date=2024-01-15
```

**Response:**
```json
{
  "mapid": "abc123...",
  "token": "xyz789...",
  "urlFormat": "https://earthengine.googleapis.com/v1/projects/{project}/maps/{mapid}/tiles/{z}/{x}/{y}?token={token}"
}
```

### Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Missing lat/lon parameters |
| 401 | GEE authentication failed |
| 404 | No data for location/date |
| 500 | GEE query error |

---

## Open-Meteo Weather API

### Overview

Open-Meteo provides free weather data with no API key required. Used for current conditions and forecasts.

**Documentation:** https://open-meteo.com/en/docs

### Base URL

```
https://api.open-meteo.com/v1/forecast
```

### Request

```
GET /v1/forecast?
  latitude=13.0&
  longitude=75.5&
  current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code,is_day&
  daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code&
  timezone=auto
```

### Response

```json
{
  "latitude": 13.0,
  "longitude": 75.5,
  "timezone": "Asia/Kolkata",
  "current": {
    "time": "2024-01-15T14:00",
    "temperature_2m": 28.5,
    "relative_humidity_2m": 65,
    "precipitation": 0.0,
    "wind_speed_10m": 12.3,
    "wind_direction_10m": 225,
    "weather_code": 2,
    "is_day": 1
  },
  "daily": {
    "time": ["2024-01-15", "2024-01-16", ...],
    "temperature_2m_max": [31.2, 30.8, ...],
    "temperature_2m_min": [22.1, 21.5, ...],
    "precipitation_sum": [0.0, 2.5, ...],
    "precipitation_probability_max": [10, 60, ...],
    "weather_code": [2, 61, ...]
  }
}
```

### Weather Codes (WMO)

| Code | Description |
|------|-------------|
| 0 | Clear sky |
| 1 | Mainly clear |
| 2 | Partly cloudy |
| 3 | Overcast |
| 45 | Fog |
| 51-55 | Drizzle |
| 61-65 | Rain |
| 80-82 | Rain showers |
| 95 | Thunderstorm |

---

## Basemap Tile Services

### CARTO Dark

```
https://{a|b|c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png
```

No authentication required.

### ESRI Satellite

```
https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

No authentication required. Note: `{y}/{x}` order differs from typical XYZ.

---

## Rate Limits and Caching

### CoRE Stack
- **Rate Limit:** ~100 requests/minute (varies by subscription)
- **Caching:** Implement client-side caching for admin details (they rarely change)

### Open-Meteo
- **Rate Limit:** 10,000 requests/day (free tier)
- **Caching:** Weather data cached for 30 minutes in WeatherService

### Dynamic World
- **Rate Limit:** GEE quotas (typically generous for authenticated users)
- **Caching:** Map tiles cached by browser; point queries not cached

### Implementation

```typescript
// WeatherService caching example
private cache: Map<string, { data: WeatherData; expiry: number }> = new Map();
private cacheDuration = 30 * 60 * 1000; // 30 minutes

async getWeather(lat: number, lon: number): Promise<WeatherData | null> {
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = this.cache.get(cacheKey);
  
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  
  // Fetch fresh data...
  const data = await this.fetchFromApi(lat, lon);
  this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheDuration });
  return data;
}
```

---

## Network Handling

### Online/Offline Detection

```typescript
// src/hooks/useNetworkStatus.ts
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return { isOnline };
}
```

### Service Availability Check

```typescript
// Each service tracks its own availability
class CoreStackService {
  private isOnline: boolean = navigator.onLine;
  
  constructor() {
    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);
  }
  
  isAvailable(): boolean {
    return this.isOnline && this.hasApiKey();
  }
}
```

---

## Timeout Handling

```typescript
// Standard timeout pattern
private async request<T>(endpoint: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## CORS Configuration

### Development (Vite Proxy)

All API calls go through Vite's proxy to avoid CORS:
- `/api/corestack/*` → `api-doc.core-stack.org`
- `/api/geoserver/*` → `geoserver.core-stack.org`
- `/api/dw/*` → `localhost:8787`

### Production

- **CoRE Stack API:** Allows CORS from any origin
- **Open-Meteo:** Allows CORS from any origin
- **Dynamic World Proxy:** Must be deployed separately and configured with appropriate CORS headers

---

*Last updated: 2025*
