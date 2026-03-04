# Field Validator - Database Reference

> Complete documentation of IndexedDB schema, queries, and data management

## Overview

The application uses **Dexie.js** (v4) as a wrapper around IndexedDB for persistent local storage. All user data (observations, images, cached datasets) is stored client-side and persists across browser sessions.

## Database Location

**File:** `src/db/database.ts`  
**Database Name:** `WGFieldValidator`

## Schema

### Tables

```typescript
this.version(1).stores({
  observations: 'id, timestamp, userValidation, [location.lat+location.lon]',
  images: 'id, createdAt',
  datasets: 'id, layerId, updatedAt'
});
```

### Table: `observations`

Stores field observations with validation status and metadata.

| Index | Type | Description |
|-------|------|-------------|
| `id` (primary) | string | UUID v4 identifier |
| `timestamp` | string | ISO 8601 datetime |
| `userValidation` | string | 'match' \| 'mismatch' \| 'unclear' |
| `[location.lat+location.lon]` | compound | Spatial lookup index |

**Full Record Structure:**

```typescript
interface Observation {
  id: string;                    // UUID v4
  timestamp: string;             // ISO 8601 (e.g., "2025-01-15T10:30:00.000Z")
  
  location: {
    lat: number;                 // Latitude in degrees
    lon: number;                 // Longitude in degrees
    accuracy: number;            // GPS accuracy in meters
    timestamp?: number;          // GPS timestamp (epoch ms)
    altitude?: number;           // Altitude in meters (if available)
  };
  
  context: {
    region: string;              // Human-readable region string
    areaMode: 'point' | 'buffer' | 'watershed';
    bufferM?: number;            // Buffer radius if applicable
    watershedId?: string;        // MWS ID if applicable
    adminData?: {
      state?: string;
      district?: string;
      tehsil?: string;
      block?: string;
      source?: 'boundary_geojson' | 'corestack_api' | 'corestack_local';
      confidence?: 'verified' | 'approximate';
    };
  };
  
  datasetValues: {
    [layerId: string]: {
      [field: string]: unknown;  // Values from active layers at location
    };
  };
  
  image?: {
    blobId: string;              // References images table
    exif: {
      timestamp?: string;
      dateTime?: string;
      lat?: number;
      lon?: number;
      orientation?: number;
      camera?: string;
      make?: string;
      model?: string;
    };
    thumbnail?: string;          // Base64 data URL
  };
  
  userValidation: ValidationStatus;  // 'match' | 'mismatch' | 'unclear'
  notes: string;                     // Free-text field notes
  synced?: boolean;                  // Sync status flag
}
```

### Table: `images`

Binary blob storage for captured photos.

| Index | Type | Description |
|-------|------|-------------|
| `id` (primary) | string | UUID matching observation.image.blobId |
| `createdAt` | string | ISO 8601 creation timestamp |

**Record Structure:**

```typescript
interface ImageBlob {
  id: string;
  blob: Blob;           // Binary image data
  createdAt: string;    // ISO 8601
}
```

### Table: `datasets`

Cache for downloaded dataset files.

| Index | Type | Description |
|-------|------|-------------|
| `id` (primary) | string | Cache entry ID |
| `layerId` | string | Layer identifier |
| `updatedAt` | string | Last update timestamp |

**Record Structure:**

```typescript
interface CachedDataset {
  id: string;
  layerId: string;
  data: unknown;        // Parsed dataset content (GeoJSON, CSV array, etc.)
  updatedAt: string;
}
```

---

## Database API

### Initialization

```typescript
import { db, dbReady } from './db/database';

// Wait for database to be ready
const isReady = await dbReady;
if (!isReady) {
  console.error('Database unavailable');
}
```

### Observations

#### Save Observation

```typescript
import { saveObservation } from './db/database';

const observation: Observation = {
  id: uuidv4(),
  timestamp: new Date().toISOString(),
  location: { lat: 13.0, lon: 75.5, accuracy: 10 },
  context: { region: 'Karnataka', areaMode: 'point' },
  datasetValues: {},
  userValidation: 'match',
  notes: 'Forest cover verified'
};

await saveObservation(observation);
```

#### Get Observations

```typescript
import { getObservations } from './db/database';

// All observations (most recent first)
const all = await getObservations();

// Filtered by validation status
const mismatches = await getObservations({ validation: 'mismatch' });

// Limited results
const recent = await getObservations({ limit: 10 });
```

#### Get Single Observation

```typescript
import { getObservationById } from './db/database';

const obs = await getObservationById('uuid-here');
```

#### Delete Observation

```typescript
import { deleteObservation } from './db/database';

await deleteObservation('uuid-here');
// Also deletes associated image blob
```

### Images

#### Save Image

```typescript
import { saveImage } from './db/database';

const file: File = ...; // From camera or file input
const blobId = uuidv4();
await saveImage(blobId, file);
```

#### Get Image

```typescript
import { getImage } from './db/database';

const blob = await getImage(blobId);
if (blob) {
  const url = URL.createObjectURL(blob);
  // Use url in <img src={url} />
  // Remember to URL.revokeObjectURL(url) when done
}
```

### Datasets

#### Cache Dataset

```typescript
import { cacheDataset } from './db/database';

const geojson = await fetch('/data/boundaries/district.geojson').then(r => r.json());
await cacheDataset('district_boundary', geojson);
```

#### Get Cached Dataset

```typescript
import { getCachedDataset } from './db/database';

const cached = await getCachedDataset('district_boundary');
if (cached) {
  console.log('Using cached data from:', cached.updatedAt);
  return cached.data;
}
```

---

## Export Functions

### Export to GeoJSON

```typescript
import { exportToGeoJSON } from './db/database';

const observations = await getObservations();
const geojsonString = await exportToGeoJSON(observations);

// Result: GeoJSON FeatureCollection
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [75.5, 13.0]
      },
      "properties": {
        "id": "uuid",
        "timestamp": "2025-01-15T10:30:00.000Z",
        "validation": "match",
        "notes": "Forest cover verified",
        "region": "Karnataka",
        "state": "Karnataka",
        "district": "Shimoga",
        ...
      }
    }
  ]
}
```

### Export to CSV

```typescript
import { exportToCSV } from './db/database';

const observations = await getObservations();
const csvString = await exportToCSV(observations);

// Result: CSV with headers
// id,timestamp,lat,lon,accuracy,validation,notes,region,state,district,...
```

---

## Direct Dexie Access

For advanced queries, access Dexie tables directly:

```typescript
import { db } from './db/database';

// Count observations
const count = await db.observations.count();

// Query with compound index
const nearbyObs = await db.observations
  .where('[location.lat+location.lon]')
  .between([12.9, 75.4], [13.1, 75.6])
  .toArray();

// Bulk operations
await db.observations.bulkAdd(observationsArray);
await db.observations.bulkDelete(['id1', 'id2', 'id3']);

// Update observation
await db.observations.update('uuid', { synced: true });

// Transaction
await db.transaction('rw', db.observations, db.images, async () => {
  await db.observations.add(observation);
  if (imageBlob) {
    await db.images.add({ id: observation.image.blobId, blob: imageBlob, createdAt: new Date().toISOString() });
  }
});
```

---

## Live Queries (React Hook)

Use Dexie's React hooks for reactive queries:

```typescript
import { useLiveQuery } from 'dexie-react-hooks';
import { db, dbReady } from './db/database';

function FieldLog() {
  const observations = useLiveQuery(async () => {
    const ready = await dbReady;
    if (!ready) return [];
    
    return db.observations
      .orderBy('timestamp')
      .reverse()
      .limit(50)
      .toArray();
  });

  if (!observations) return <div>Loading...</div>;
  
  return (
    <ul>
      {observations.map(obs => (
        <li key={obs.id}>{obs.timestamp}: {obs.userValidation}</li>
      ))}
    </ul>
  );
}
```

---

## Error Handling

### Database Recovery

The database class includes automatic recovery:

```typescript
private async initDatabase(): Promise<boolean> {
  try {
    await this.open();
    return true;
  } catch (error) {
    console.warn('IndexedDB failed, attempting recovery...');
    
    try {
      await this.delete();  // Delete corrupted database
      await this.open();    // Recreate
      return true;
    } catch (retryError) {
      console.error('Database recovery failed:', retryError);
      return false;
    }
  }
}
```

### Availability Check

Always check database availability:

```typescript
import { db } from './db/database';

if (!db.isAvailable) {
  // Show offline/degraded mode UI
  console.warn('Database unavailable');
}
```

---

## Storage Limits

### IndexedDB Quotas

| Platform | Typical Limit |
|----------|---------------|
| Chrome Desktop | 60% of disk space (min 1GB) |
| Chrome Android | 50% of available space |
| Firefox | 50% of disk space |
| Safari | 1GB (may prompt for more) |

### Monitoring Usage

```javascript
// Check storage usage (Chrome/Firefox)
if (navigator.storage && navigator.storage.estimate) {
  const estimate = await navigator.storage.estimate();
  console.log(`Used: ${(estimate.usage / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Quota: ${(estimate.quota / 1024 / 1024).toFixed(2)} MB`);
}
```

### Data Management

Periodically clean up old data:

```typescript
// Delete observations older than 30 days
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const oldObs = await db.observations
  .where('timestamp')
  .below(thirtyDaysAgo.toISOString())
  .toArray();

for (const obs of oldObs) {
  await deleteObservation(obs.id);
}
```

---

## Migration Notes

### Schema Versioning

Adding new fields to existing data:

```typescript
// Future version upgrade example
this.version(2).stores({
  observations: 'id, timestamp, userValidation, [location.lat+location.lon], synced'
}).upgrade(tx => {
  return tx.table('observations').toCollection().modify(obs => {
    obs.synced = obs.synced ?? false;  // Set default for existing records
  });
});
```

---

*Last updated: 2025*
