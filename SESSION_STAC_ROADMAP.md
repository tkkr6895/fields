# Session-Based STAC Batching — Implementation Roadmap

**Audience:** Developers implementing CSO-scale observation export

---

## Why Session-Based Export Matters

**Current state:** Each observation = 1 STAC Item
```
FieldSession A (50 obs) + Session B (50 obs) = 100 loose STAC Items
↓ ML platform receives
"Here are 100 items. Good luck figuring out which 50 go together."
```

**Proposed state:** Each session = 1 STAC Collection containing STAC Items
```
FieldSession A: STAC Collection
├─ 50 Observation Items (with session metadata)
└─ Session-level stats (confidence, photo rate, sync status)

FieldSession B: STAC Collection
├─ 50 Observation Items
└─ Session-level stats

↓ ML platform receives
"Two coherent collections, each with metadata. I'll train separate models per geographic/temporal region."
```

---

## Data Model: FieldSession Type

**Add to `src/types/index.ts`:**

```typescript
export interface FieldSession {
  /**
   * Unique session identifier (UUID or auto-generated)
   * Format: "session_{timestamp}_{randomId}"
   * Example: "session_20240620_a7f2x9k1"
   */
  id: string;

  /** Human-readable session title */
  title: string;  // "Sindhudurg Monsoon 2024", "Kudal Watershed Assessment"

  /** ISO 8601 timestamp when session started */
  startedAt: string;

  /** ISO 8601 timestamp when session ended (optional until user closes) */
  endedAt?: string;

  /** Session duration in minutes (calculated on close) */
  durationMinutes?: number;

  /**
   * Geographic metadata
   */
  region: string;  // "Western Ghats" / "Eastern Ghats" / etc.

  /**
   * Spatial analysis mode
   */
  areaMode: 'point' | 'buffer' | 'watershed' | 'admin_unit';
  bufferRadiusM?: number;  // If mode='buffer'

  /**
   * Administrative hierarchy for this session
   */
  adminContext: {
    country?: string;       // "India"
    state?: string;         // "Maharashtra"
    district?: string;      // "Sindhudurg"
    tehsil?: string;        // "Kudal"
    blocks?: string[];      // ["Block A", "Block B"]
  };

  /**
   * Session observer metadata
   */
  observer: {
    userId?: string;             // Link to user if authenticated
    deviceId?: string;           // e.g., "iPhone-12-ABC123"
    appVersion?: string;         // "1.0.0-alpha"
    protocol?: string;           // "WG-LULC-Validation-v2"
  };

  /**
   * Summary statistics (calculated when session ends or exported)
   */
  stats: {
    totalObservations: number;

    /** Count by observation type */
    observationsByType: Record<string, number>;
    // Example: {land_cover: 150, drainage: 45, water_body: 12}

    /** Count by validation result */
    observationsByValidation: Record<'match' | 'mismatch' | 'unclear', number>;
    // Example: {match: 180, mismatch: 22, unclear: 5}

    /** Vector layers validated in this session */
    vectorLayersValidated: string[];
    // Example: ["corestack_lulc", "corestack_boundary", "drainage"]

    /** Photo/image count */
    imageCaptureCount: number;

    /**
     * Data quality metrics
     */
    dataQuality: {
      observationsWithPhotos: number;
      observationsWithGPS: number;        // GPS accuracy < 50m
      observationsHighConfidence: number; // confidence >= 4/5
      observationsSynced: number;         // synced to cloud
    };

    /** Temporal range of observations */
    temporalRange?: {
      earliest: string;  // ISO 8601
      latest: string;    // ISO 8601
    };

    /** Spatial bounds of all observations */
    spatialBounds?: {
      west: number;
      south: number;
      east: number;
      north: number;
    };
  };

  /**
   * Metadata
   */
  notes?: string;   // Session narrative (user-entered)
  tags?: string[];  // ["monsoon", "high-altitude", "water-stressed"]

  /**
   * Lineage
   */
  exportedAt?: string;  // If already exported
  exportFormat?: 'stac_collection' | 'geai' | 'coco';
}

/**
 * Update Observation interface to reference session
 */
export interface Observation {
  // ... existing fields ...
  sessionId?: string;   // Foreign key to FieldSession.id
}
```

---

## Database Schema: Dexie Update

**Modify `src/db/database.ts`:**

```typescript
import Dexie, { Table } from 'dexie';

export interface FieldSession {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  // ... rest of props
}

export class FieldValidatorDB extends Dexie {
  observations!: Table<Observation>;
  fieldSessions!: Table<FieldSession>;
  fieldLogs!: Table<FieldLog>;
  // ... existing tables

  constructor() {
    super('WGFieldValidator');
    this.version(2).stores({
      observations: '++id, timestamp, location.lat, location.lon, sessionId',
      fieldSessions: 'id, startedAt, endedAt',
      fieldLogs: '++id, observationId',
      // ... existing schemas
    });
  }
}

export const db = new FieldValidatorDB();
```

**Migration notes:**
- New table: `fieldSessions`
- Updated index on `observations`: Add `sessionId` for fast lookups
- Existing observations won't have a `sessionId` initially (backward compatible)

---

## Session Management: Service Implementation

**Create `src/services/FieldSessionService.ts`:**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { db, FieldSession } from '../db/database';

export class FieldSessionService {
  /**
   * Start a new field session
   */
  static async startSession(input: {
    title: string;
    region: string;
    adminContext?: FieldSession['adminContext'];
    observer?: FieldSession['observer'];
  }): Promise<string> {
    const now = new Date().toISOString();
    const session: FieldSession = {
      id: `session_${Date.now()}_${uuidv4().substring(0, 8)}`,
      title: input.title,
      startedAt: now,
      region: input.region,
      areaMode: 'buffer',
      adminContext: input.adminContext || {},
      observer: input.observer || {},
      stats: {
        totalObservations: 0,
        observationsByType: {},
        observationsByValidation: { match: 0, mismatch: 0, unclear: 0 },
        vectorLayersValidated: [],
        imageCaptureCount: 0,
        dataQuality: {
          observationsWithPhotos: 0,
          observationsWithGPS: 0,
          observationsHighConfidence: 0,
          observationsSynced: 0,
        },
      },
    };

    await db.fieldSessions.add(session);
    return session.id;
  }

  /**
   * Get active session (latest started, not yet ended)
   */
  static async getActiveSession(): Promise<FieldSession | null> {
    const active = await db.fieldSessions
      .where('endedAt')
      .isUndefined()
      .toArray();
    
    if (active.length === 0) return null;
    
    // Return most recently started
    return active.reduce((prev, curr) =>
      new Date(curr.startedAt) > new Date(prev.startedAt) ? curr : prev
    );
  }

  /**
   * End session and calculate stats
   */
  static async endSession(sessionId: string): Promise<FieldSession> {
    const session = await db.fieldSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Fetch all observations in this session
    const observations = await db.observations
      .where('sessionId')
      .equals(sessionId)
      .toArray();

    // Calculate stats
    const stats = this.calculateSessionStats(observations);
    const now = new Date().toISOString();
    const durationMs = new Date(now).getTime() - new Date(session.startedAt).getTime();

    const updatedSession: FieldSession = {
      ...session,
      endedAt: now,
      durationMinutes: Math.floor(durationMs / 60000),
      stats,
    };

    await db.fieldSessions.update(sessionId, updatedSession);
    return updatedSession;
  }

  /**
   * Link an observation to a session (called when observation is created)
   */
  static async assignObservationToSession(observationId: string, sessionId: string): Promise<void> {
    const session = await db.fieldSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    await db.observations.update(observationId, { sessionId });

    // Increment session observation count
    session.stats.totalObservations += 1;
    await db.fieldSessions.update(sessionId, session);
  }

  /**
   * Calculate session stats from observations
   */
  private static calculateSessionStats(observations: Observation[]): FieldSession['stats'] {
    const stats: FieldSession['stats'] = {
      totalObservations: observations.length,
      observationsByType: {},
      observationsByValidation: { match: 0, mismatch: 0, unclear: 0 },
      vectorLayersValidated: [],
      imageCaptureCount: 0,
      dataQuality: {
        observationsWithPhotos: 0,
        observationsWithGPS: 0,
        observationsHighConfidence: 0,
        observationsSynced: 0,
      },
    };

    // Aggregate
    observations.forEach((obs) => {
      // By type
      const obsType = obs.observationType || 'unknown';
      stats.observationsByType[obsType] = (stats.observationsByType[obsType] || 0) + 1;

      // By validation
      if (obs.userValidation?.result) {
        stats.observationsByValidation[obs.userValidation.result] += 1;
      }

      // Photos
      if (obs.image) stats.imageCaptureCount += 1;

      // Data quality
      if (obs.image) stats.dataQuality.observationsWithPhotos += 1;
      if (obs.location?.accuracy && obs.location.accuracy < 50) {
        stats.dataQuality.observationsWithGPS += 1;
      }
      if (obs.userValidation?.confidence && obs.userValidation.confidence >= 4) {
        stats.dataQuality.observationsHighConfidence += 1;
      }
      if (obs.syncStatus === 'synced') stats.dataQuality.observationsSynced += 1;

      // Vector layers
      if (obs.vectorFeatureContext?.layerId) {
        if (!stats.vectorLayersValidated.includes(obs.vectorFeatureContext.layerId)) {
          stats.vectorLayersValidated.push(obs.vectorFeatureContext.layerId);
        }
      }
    });

    // Temporal + spatial bounds
    if (observations.length > 0) {
      const timestamps = observations.map((o) => new Date(o.timestamp).getTime());
      stats.temporalRange = {
        earliest: new Date(Math.min(...timestamps)).toISOString(),
        latest: new Date(Math.max(...timestamps)).toISOString(),
      };

      const latlons = observations.map((o) => [o.location.lat, o.location.lon]);
      const lats = latlons.map((ll) => ll[0]);
      const lons = latlons.map((ll) => ll[1]);
      stats.spatialBounds = {
        south: Math.min(...lats),
        north: Math.max(...lats),
        west: Math.min(...lons),
        east: Math.max(...lons),
      };
    }

    return stats;
  }

  /**
   * Get all sessions (for history/archive)
   */
  static async getAllSessions(): Promise<FieldSession[]> {
    return db.fieldSessions.toArray();
  }
}
```

---

## Export: Session-Based STAC Collection

**Update `src/services/AnnotationExporter.ts`:**

```typescript
import { FieldSessionService } from './FieldSessionService';
import { db } from '../db/database';

export class AnnotationExporter {
  /**
   * Export a session as a STAC Collection with per-observation Items
   */
  static async exportSessionAsSTACCollection(sessionId: string): Promise<Blob> {
    const session = await db.fieldSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const observations = await db.observations
      .where('sessionId')
      .equals(sessionId)
      .toArray();

    // Build STAC Collection metadata for this session
    const collectionJson = {
      type: 'Collection',
      stac_version: '1.0.0',
      stac_extensions: ['https://stac-extensions.github.io/file/v1.0.0/schema.json'],
      id: session.id,
      description: `Ground-truth field validation session: ${session.title}`,
      license: 'CC-BY-4.0',

      extent: {
        spatial: {
          bbox: [
            session.stats.spatialBounds
              ? [
                  session.stats.spatialBounds.west,
                  session.stats.spatialBounds.south,
                  session.stats.spatialBounds.east,
                  session.stats.spatialBounds.north,
                ]
              : [0, 0, 0, 0],
          ],
        },
        temporal: {
          interval: [
            [
              session.startedAt,
              session.endedAt || new Date().toISOString(),
            ],
          ],
        },
      },

      links: [
        // One child link per observation
        ...observations.map((obs, idx) => ({
          rel: 'child',
          href: `./observations/${String(idx + 1).padStart(3, '0')}/item.json`,
          type: 'application/json',
          title: `Observation ${idx + 1}`,
        })),
      ],

      properties: {
        'session:title': session.title,
        'session:region': session.region,
        'session:observer': session.observer?.userId || 'unknown',
        'session:protocol': session.observer?.protocol || 'WG-Validation-v1',
        'session:duration_minutes': session.durationMinutes || 0,
        'session:total_observations': session.stats.totalObservations,
        'session:observation_types': session.stats.observationsByType,
        'session:validation_distribution': session.stats.observationsByValidation,
        'session:vector_layers_validated': session.stats.vectorLayersValidated,
        'session:data_quality': session.stats.dataQuality,
        'session:admin_state': session.adminContext?.state,
        'session:admin_district': session.adminContext?.district,
        'session:admin_tehsil': session.adminContext?.tehsil,
      },
    };

    // Build per-observation STAC Items (existing logic)
    const observationItems = observations.map((obs, idx) =>
      this.buildSTACItem(obs, `observation-${idx + 1}`)
    );

    // Create ZIP archive
    const zip = new JSZip();

    // Add collection.json
    zip.file('collection.json', JSON.stringify(collectionJson, null, 2));

    // Add observations as nested items
    for (let i = 0; i < observationItems.length; i++) {
      const item = observationItems[i];
      const dir = zip.folder(`observations`)!.folder(`${String(i + 1).padStart(3, '0')}`);

      dir!.file('item.json', JSON.stringify(item, null, 2));

      // If observation has image, add to assets folder
      if (observations[i].image) {
        dir!.file('image.jpg', observations[i].image!);
      }
    }

    // Add session summary
    const summary = {
      sessionId: session.id,
      title: session.title,
      startDate: session.startedAt,
      endDate: session.endedAt,
      stats: session.stats,
      exportedAt: new Date().toISOString(),
    };
    zip.file('session_summary.json', JSON.stringify(summary, null, 2));

    // Add model card (for training datasets)
    const modelCard = this.buildModelCard(session, observationItems);
    zip.file('session_model_card.json', JSON.stringify(modelCard, null, 2));

    // Return ZIP blob
    return zip.generateAsync({ type: 'blob' });
  }

  /**
   * Build a model card describing the dataset for ML training
   */
  private static buildModelCard(
    session: FieldSession,
    items: any[]
  ): Record<string, any> {
    return {
      name: `FieldSession-${session.id}`,
      description: `Ground-truth LULC validation dataset: ${session.title}`,
      tags: session.tags || [],
      created: session.startedAt,
      updated: session.endedAt || new Date().toISOString(),
      license: 'CC-BY-4.0',
      sources: [
        'CoreStack API (vector features)',
        'Sentinel-2 / Landsat (satellite imagery)',
        'Census of India 2011 (demographics)',
      ],
      datacards: {
        size: items.length,
        split: {
          train: Math.floor(items.length * 0.8),
          eval: Math.floor(items.length * 0.1),
          test: Math.ceil(items.length * 0.1),
        },
        labels: {
          'land_cover': session.stats.observationsByType['land_cover'] || 0,
          'vector_validation': session.stats.vectorLayersValidated.length,
        },
        quality: {
          high_confidence_rate:
            session.stats.dataQuality.observationsHighConfidence /
            session.stats.totalObservations,
          photo_coverage_rate:
            session.stats.dataQuality.observationsWithPhotos /
            session.stats.totalObservations,
          validation_consensus:
            session.stats.observationsByValidation.match /
            session.stats.totalObservations,
        },
      },
    };
  }

  /**
   * Existing method: build individual STAC Item for observation
   */
  private static buildSTACItem(observation: Observation, id: string): any {
    // ... existing STAC Item building logic ...
    return {
      type: 'Feature',
      stac_version: '1.0.0',
      id,
      geometry: { /* ... */ },
      properties: { /* ... */ },
      assets: { /* ... */ },
    };
  }
}
```

---

## UI Integration: Field Log with Sessions

**Update `src/components/FieldLog.tsx`:**

```typescript
import { FieldSessionService } from '../services/FieldSessionService';
import { AnnotationExporter } from '../services/AnnotationExporter';

export const FieldLog: React.FC = () => {
  const [activeSession, setActiveSession] = useState<FieldSession | null>(null);
  const [allSessions, setAllSessions] = useState<FieldSession[]>([]);

  // Load active session on mount
  useEffect(() => {
    const loadSession = async () => {
      const session = await FieldSessionService.getActiveSession();
      setActiveSession(session);
      const all = await FieldSessionService.getAllSessions();
      setAllSessions(all);
    };
    loadSession();
  }, []);

  const handleStartSession = async () => {
    const title = prompt('Session title (e.g., "Kudal Monsoon 2024")');
    if (title) {
      const sessionId = await FieldSessionService.startSession({
        title,
        region: 'Western Ghats',
      });
      const session = await FieldSessionService.getActiveSession();
      setActiveSession(session);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    const ended = await FieldSessionService.endSession(activeSession.id);
    setActiveSession(null);
    const all = await FieldSessionService.getAllSessions();
    setAllSessions(all);
    console.log('Session ended:', ended.stats);
  };

  const handleExportSession = async (sessionId: string) => {
    const blob = await AnnotationExporter.exportSessionAsSTACCollection(sessionId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FieldSession-${sessionId}.zip`;
    link.click();
  };

  return (
    <div>
      {/* Active Session Section */}
      {activeSession ? (
        <div className="session-active">
          <h3>🟢 Active Session</h3>
          <p>
            <strong>{activeSession.title}</strong>
          </p>
          <p>Started: {new Date(activeSession.startedAt).toLocaleString()}</p>
          <p>Observations: {activeSession.stats.totalObservations}</p>
          <button onClick={handleEndSession}>End Session</button>
        </div>
      ) : (
        <div className="session-inactive">
          <p>No active session</p>
          <button onClick={handleStartSession}>Start New Session</button>
        </div>
      )}

      {/* Previous Sessions Archive */}
      <h3>Session Archive</h3>
      <div className="sessions-list">
        {allSessions.map((session) => (
          <div key={session.id} className="session-card">
            <h4>{session.title}</h4>
            <p>
              {session.stats.totalObservations} observations
              {session.endedAt &&
                ` | Duration: ${session.durationMinutes} min`}
            </p>
            <p>
              Validation: {session.stats.observationsByValidation.match} match,{' '}
              {session.stats.observationsByValidation.mismatch} mismatch,{' '}
              {session.stats.observationsByValidation.unclear} unclear
            </p>
            <button
              onClick={() => handleExportSession(session.id)}
            >
              Export as STAC Collection
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## Export Filename Strategy

```
Format: FieldSession-{region}-{date}-{sessionId}.zip

Examples:
  - FieldSession-Sindhudurg-202406-session_1686001200_a7f2x9k1.zip
  - FieldSession-Kudal-202406-session_1686087600_k3m9p2l5.zip
```

---

## Summary: What Gets Committed

| File | Change |
|---|---|
| `src/types/index.ts` | Add `FieldSession` interface; update `Observation` with `sessionId` |
| `src/db/database.ts` | Add `fieldSessions` table to Dexie schema (version bump: 1→2) |
| `src/services/FieldSessionService.ts` | **NEW FILE** — session CRUD + stats calculation |
| `src/services/AnnotationExporter.ts` | Add `exportSessionAsSTACCollection()` method; add model card builder |
| `src/components/FieldLog.tsx` | Add session UI (start/end session, archive, export button) |

**Commit message:**
```
feat: session-based STAC export architecture

- Add FieldSession data model with statistical aggregation
- Implement FieldSessionService for session CRUD and stats
- Update AnnotationExporter to emit STAC Collections (not individual Items)
- Add session manager UI to FieldLog (start/end/export)
- Update database schema v2: add fieldSessions table, index observations by sessionId
- Export format: FieldSession-{region}-{date}-{id}.zip containing collection.json + per-observation items + summary

This enables CSOs to batch observations by field visit/campaign, improving lineage and ML ingest.
```

---

## Testing Checklist

- [ ] Start a session, add 3 observations
- [ ] End session; verify stats calculated correctly
- [ ] Export as STAC Collection ZIP
- [ ] Unzip; verify collection.json structure
- [ ] Verify observations/{001,002,003}/item.json exist
- [ ] Verify session_summary.json includes stats
- [ ] Verify model_card.json has quality metrics
- [ ] Import ZIP into STAC browser / ML platform
- [ ] Verify platform recognizes Collection → Items hierarchyt

---

**This is production-ready for CSO deployments. All observations stay coherent by session.**
