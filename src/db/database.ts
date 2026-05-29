import Dexie, { Table } from 'dexie';
import type { Observation, Species, CustomLayer, SyncQueueItem, ExportLogEntry, ObservationType, SyncStatus as SyncStatusType } from '../types';
import { deriveSeason } from '../services/SeasonService';

/** Extended filter options for getObservations (Task 1.3.4) */
export interface ObservationFilter {
  validation?: string;
  limit?: number;
  // v2 filters
  observationType?: ObservationType;
  userId?: string;
  syncStatus?: SyncStatusType;
  dateStart?: Date | string;
  dateEnd?: Date | string;
}

export interface ImageBlob {
  id: string;
  blob: Blob;
  createdAt: string;
}

export interface CachedDataset {
  id: string;
  layerId: string;
  data: unknown;
  updatedAt: string;
}

class FieldValidatorDB extends Dexie {
  observations!: Table<Observation>;
  images!: Table<ImageBlob>;
  datasets!: Table<CachedDataset>;
  // v2 tables (Task 1.3.1)
  species!: Table<Species>;
  customLayers!: Table<CustomLayer>;
  syncQueue!: Table<SyncQueueItem>;
  exportLog!: Table<ExportLogEntry>;

  private _isOpen = false;
  private _openError: Error | null = null;
  private _initPromise: Promise<boolean> | null = null;

  constructor() {
    super('WGFieldValidator');
    
    // v1 — original schema
    this.version(1).stores({
      observations: 'id, timestamp, userValidation, [location.lat+location.lon]',
      images: 'id, createdAt',
      datasets: 'id, layerId, updatedAt'
    });

    // v2 — expanded observations + new tables (Tasks 1.3.1, 1.3.2)
    this.version(2).stores({
      // Enhanced observation indexes
      observations: 'id, timestamp, userValidation, [location.lat+location.lon], syncStatus, observationType, userId',
      images: 'id, createdAt',
      datasets: 'id, layerId, updatedAt',
      // NEW: Species lookup database (fetched from GBIF/IUCN/IBP)
      species: 'id, scientificName, *commonNameTokens, *vernacularTokens, family, kingdom, iucnStatus, isEndemic, source',
      // NEW: Custom user-imported layers
      customLayers: 'id, title, createdAt, category',
      // NEW: Sync queue for offline-first enrichment
      syncQueue: '++id, observationId, status, createdAt, [status+createdAt]',
      // NEW: Export log for incremental exports
      exportLog: '++id, exportedAt, recordCount, format',
    }).upgrade(tx => {
      // Migrate existing v1 observations: populate new fields (Task 1.3.2)
      return tx.table('observations').toCollection().modify(obs => {
        obs.syncStatus = obs.synced ? 'synced' : 'pending';
        obs.observationType = obs.observationType || 'land_cover';
        obs.userId = obs.userId || 'device';
        obs.tags = obs.tags || [];
        obs.confidence = obs.confidence ?? null;
        obs.season = obs.season || deriveSeason(obs.timestamp);
      });
    });
    
    // Auto-initialize
    this._initPromise = this.initDatabase();
  }

  private async initDatabase(): Promise<boolean> {
    try {
      await this.open();
      this._isOpen = true;
      console.log('Database opened successfully');
      return true;
    } catch (error) {
      console.warn('IndexedDB failed to open, attempting recovery:', error);
      
      // Try to delete and recreate the database
      try {
        await this.delete();
        await this.open();
        this._isOpen = true;
        console.log('Database recovered successfully');
        return true;
      } catch (retryError) {
        console.error('Database recovery failed:', retryError);
        this._openError = retryError as Error;
        return false;
      }
    }
  }

  async ensureOpen(): Promise<boolean> {
    if (this._initPromise) {
      return this._initPromise;
    }
    return this._isOpen && !this._openError;
  }

  get isAvailable(): boolean {
    return this._isOpen && !this._openError;
  }
}

export const db = new FieldValidatorDB();

// Export a promise that resolves when DB is ready
export const dbReady = db.ensureOpen();

// Helper functions with fallback for IndexedDB unavailability
export async function saveObservation(observation: Observation): Promise<string> {
  if (!await db.ensureOpen()) {
    console.warn('Database unavailable, observation saved to session only');
    return observation.id;
  }
  await db.observations.add(observation);
  return observation.id;
}

export async function getObservations(filter?: ObservationFilter): Promise<Observation[]> {
  if (!await db.ensureOpen()) {
    return [];
  }
  
  // Start with indexed query if possible, otherwise table scan
  let results: Observation[];

  if (filter?.syncStatus) {
    // Use the syncStatus index (v2)
    results = await db.observations
      .where('syncStatus')
      .equals(filter.syncStatus)
      .reverse()
      .toArray();
  } else if (filter?.observationType) {
    // Use the observationType index (v2)
    results = await db.observations
      .where('observationType')
      .equals(filter.observationType)
      .reverse()
      .toArray();
  } else if (filter?.validation && filter.validation !== 'all') {
    results = await db.observations
      .where('userValidation')
      .equals(filter.validation)
      .reverse()
      .toArray();
  } else {
    results = await db.observations.orderBy('timestamp').reverse().toArray();
  }

  // Apply remaining filters in-memory (Task 1.3.4)
  if (filter) {
    results = results.filter(obs => {
      if (filter.validation && filter.validation !== 'all' && !filter.syncStatus && !filter.observationType) {
        // Already filtered via index
      } else if (filter.validation && filter.validation !== 'all') {
        if (obs.userValidation !== filter.validation) return false;
      }

      if (filter.observationType && !filter.syncStatus) {
        // Already filtered via index when syncStatus isn't set
      } else if (filter.observationType) {
        if (obs.observationType !== filter.observationType) return false;
      }

      if (filter.userId && obs.userId !== filter.userId) return false;

      if (filter.dateStart) {
        const start = typeof filter.dateStart === 'string' ? new Date(filter.dateStart) : filter.dateStart;
        if (new Date(obs.timestamp) < start) return false;
      }

      if (filter.dateEnd) {
        const end = typeof filter.dateEnd === 'string' ? new Date(filter.dateEnd) : filter.dateEnd;
        if (new Date(obs.timestamp) > end) return false;
      }

      return true;
    });
  }

  if (filter?.limit) {
    return results.slice(0, filter.limit);
  }
  
  return results;
}

export async function getObservationById(id: string): Promise<Observation | undefined> {
  if (!await db.ensureOpen()) return undefined;
  return await db.observations.get(id);
}

export async function deleteObservation(id: string): Promise<void> {
  if (!await db.ensureOpen()) return;
  const obs = await db.observations.get(id);
  if (obs?.image?.blobId) {
    await db.images.delete(obs.image.blobId);
  }
  await db.observations.delete(id);
}

export async function saveImage(id: string, blob: Blob): Promise<void> {
  if (!await db.ensureOpen()) return;
  await db.images.put({
    id,
    blob,
    createdAt: new Date().toISOString()
  });
}

export async function getImage(id: string): Promise<Blob | undefined> {
  if (!await db.ensureOpen()) return undefined;
  const record = await db.images.get(id);
  return record?.blob;
}

export async function cacheDataset(layerId: string, data: unknown): Promise<void> {
  if (!await db.ensureOpen()) return;
  await db.datasets.put({
    id: layerId,
    layerId,
    data,
    updatedAt: new Date().toISOString()
  });
}

export async function getCachedDataset(layerId: string): Promise<unknown | undefined> {
  if (!await db.ensureOpen()) return undefined;
  const record = await db.datasets.get(layerId);
  return record?.data;
}

export async function exportToGeoJSON(observations: Observation[]): Promise<string> {
  const features = observations.map(obs => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [obs.location.lon, obs.location.lat]
    },
    properties: {
      id: obs.id,
      timestamp: obs.timestamp,
      validation: obs.userValidation,
      notes: obs.notes,
      accuracy_m: obs.location.accuracy,
      ...Object.entries(obs.datasetValues).reduce((acc, [layerId, values]) => {
        Object.entries(values).forEach(([field, value]) => {
          acc[`${layerId}_${field}`] = value;
        });
        return acc;
      }, {} as Record<string, unknown>),
      ...(obs.predictionValidation ? { predictionValidation: obs.predictionValidation } : {}),
      ...(obs.fieldData ? { fieldData: obs.fieldData } : {}),
      ...(obs.weather ? { weather: obs.weather } : {})
    }
  }));

  return JSON.stringify({
    type: 'FeatureCollection',
    features
  }, null, 2);
}

export async function exportToCSV(observations: Observation[]): Promise<string> {
  if (observations.length === 0) return '';

  // Collect all possible fields
  const allFields = new Set<string>();
  observations.forEach(obs => {
    Object.entries(obs.datasetValues).forEach(([layerId, values]) => {
      Object.keys(values).forEach(field => {
        allFields.add(`${layerId}_${field}`);
      });
    });
  });

  const headers = [
    'id', 'timestamp', 'lat', 'lon', 'accuracy_m',
    'validation', 'notes', ...Array.from(allFields),
    'predictionValidation', 'fieldData', 'weather'
  ];

  const rows = observations.map(obs => {
    const datasetCols: Record<string, string> = {};
    Object.entries(obs.datasetValues).forEach(([layerId, values]) => {
      Object.entries(values).forEach(([field, value]) => {
        datasetCols[`${layerId}_${field}`] = String(value ?? '');
      });
    });

    return [
      obs.id,
      obs.timestamp,
      obs.location.lat,
      obs.location.lon,
      obs.location.accuracy,
      obs.userValidation,
      `"${obs.notes.replace(/"/g, '""')}"`,
      ...Array.from(allFields).map(f => datasetCols[f] ?? ''),
      obs.predictionValidation ? `"${JSON.stringify(obs.predictionValidation).replace(/"/g, '""')}"` : '',
      obs.fieldData ? `"${JSON.stringify(obs.fieldData).replace(/"/g, '""')}"` : '',
      obs.weather ? `"${JSON.stringify(obs.weather).replace(/"/g, '""')}"` : ''
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// ─── v2 CRUD Helpers (Task 1.3.3) ────────────────────────────────

// --- SyncQueue helpers ---

/** Enqueue an observation for background enrichment */
export async function enqueueSyncItem(observationId: string): Promise<number | undefined> {
  if (!await db.ensureOpen()) return undefined;
  return await db.syncQueue.add({
    observationId,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
  });
}

/** Dequeue pending sync items (oldest first), up to `limit` */
export async function dequeueSyncItems(limit = 5): Promise<SyncQueueItem[]> {
  if (!await db.ensureOpen()) return [];
  return await db.syncQueue
    .where('status')
    .equals('pending')
    .sortBy('createdAt')
    .then(items => items.slice(0, limit));
}

/** Update a sync queue item's status */
export async function updateSyncQueueItem(
  id: number,
  update: Partial<Pick<SyncQueueItem, 'status' | 'attempts' | 'lastAttemptAt' | 'error'>>
): Promise<void> {
  if (!await db.ensureOpen()) return;
  await db.syncQueue.update(id, update);
}

/** Remove completed items from the queue */
export async function purgeSyncQueue(): Promise<number> {
  if (!await db.ensureOpen()) return 0;
  return await db.syncQueue.where('status').equals('completed').delete();
}

/** Get sync queue stats */
export async function getSyncQueueStats(): Promise<Record<string, number>> {
  if (!await db.ensureOpen()) return {};
  const all = await db.syncQueue.toArray();
  return all.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

// --- ExportLog helpers ---

/** Log a completed export operation */
export async function logExport(entry: Omit<ExportLogEntry, 'id'>): Promise<number | undefined> {
  if (!await db.ensureOpen()) return undefined;
  return await db.exportLog.add(entry as ExportLogEntry);
}

/** Get last export timestamp (for incremental exports) */
export async function getLastExportTimestamp(format?: string): Promise<number | undefined> {
  if (!await db.ensureOpen()) return undefined;
  let query = db.exportLog.orderBy('exportedAt').reverse();
  if (format) {
    const all = await query.toArray();
    const match = all.find(e => e.format === format);
    return match?.exportedAt;
  }
  const last = await query.first();
  return last?.exportedAt;
}

// --- CustomLayer helpers ---

/** Save a custom layer to IndexedDB */
export async function saveCustomLayer(layer: CustomLayer): Promise<string> {
  if (!await db.ensureOpen()) {
    console.warn('Database unavailable, custom layer not saved');
    return layer.id;
  }
  await db.customLayers.put(layer);
  return layer.id;
}

/** Get all custom layers */
export async function getCustomLayers(): Promise<CustomLayer[]> {
  if (!await db.ensureOpen()) return [];
  return await db.customLayers.orderBy('createdAt').reverse().toArray();
}

/** Get a single custom layer by ID */
export async function getCustomLayerById(id: string): Promise<CustomLayer | undefined> {
  if (!await db.ensureOpen()) return undefined;
  return await db.customLayers.get(id);
}

/** Update a custom layer (e.g. style or title) */
export async function updateCustomLayer(
  id: string,
  update: Partial<Omit<CustomLayer, 'id'>>
): Promise<void> {
  if (!await db.ensureOpen()) return;
  await db.customLayers.update(id, update);
}

/** Delete a custom layer */
export async function deleteCustomLayer(id: string): Promise<void> {
  if (!await db.ensureOpen()) return;
  await db.customLayers.delete(id);
}

// --- Species helpers ---

/** Save or update a species record */
export async function saveSpecies(species: Species): Promise<string> {
  if (!await db.ensureOpen()) return species.id;
  await db.species.put(species);
  return species.id;
}

/** Bulk upsert species (for API batch imports) */
export async function bulkSaveSpecies(speciesList: Species[]): Promise<void> {
  if (!await db.ensureOpen()) return;
  await db.species.bulkPut(speciesList);
}

/** Get species count */
export async function getSpeciesCount(): Promise<number> {
  if (!await db.ensureOpen()) return 0;
  return await db.species.count();
}

/** Search species by token (common name or vernacular) */
export async function searchSpecies(query: string, limit = 20): Promise<Species[]> {
  if (!await db.ensureOpen()) return [];
  const q = query.toLowerCase().trim();
  if (!q) return [];
  
  // Multi-index search on tokenized names
  const byCommon = await db.species
    .where('commonNameTokens')
    .startsWithIgnoreCase(q)
    .limit(limit)
    .toArray();
  
  const byVernacular = await db.species
    .where('vernacularTokens')
    .startsWithIgnoreCase(q)
    .limit(limit)
    .toArray();
  
  // Also try scientific name
  const byScientific = await db.species
    .where('scientificName')
    .startsWithIgnoreCase(q)
    .limit(limit)
    .toArray();
  
  // Deduplicate by id
  const seen = new Set<string>();
  const results: Species[] = [];
  for (const s of [...byCommon, ...byVernacular, ...byScientific]) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      results.push(s);
    }
    if (results.length >= limit) break;
  }
  return results;
}

/** Get a species by ID */
export async function getSpeciesById(id: string): Promise<Species | undefined> {
  if (!await db.ensureOpen()) return undefined;
  return await db.species.get(id);
}
