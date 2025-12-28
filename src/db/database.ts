import Dexie, { Table } from 'dexie';
import type { Observation } from '../types';

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
  private _isOpen = false;
  private _openError: Error | null = null;
  private _initPromise: Promise<boolean> | null = null;

  constructor() {
    super('WGFieldValidator');
    
    this.version(1).stores({
      observations: 'id, timestamp, userValidation, [location.lat+location.lon]',
      images: 'id, createdAt',
      datasets: 'id, layerId, updatedAt'
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

export async function getObservations(filter?: {
  validation?: string;
  limit?: number;
}): Promise<Observation[]> {
  if (!await db.ensureOpen()) {
    return [];
  }
  
  let query = db.observations.orderBy('timestamp').reverse();
  
  if (filter?.validation && filter.validation !== 'all') {
    query = db.observations
      .where('userValidation')
      .equals(filter.validation)
      .reverse();
  }
  
  if (filter?.limit) {
    return await query.limit(filter.limit).toArray();
  }
  
  return await query.toArray();
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
      }, {} as Record<string, unknown>)
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
    'validation', 'notes', ...Array.from(allFields)
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
      ...Array.from(allFields).map(f => datasetCols[f] ?? '')
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
