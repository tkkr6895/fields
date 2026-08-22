/**
 * SyncEngine — Unified offline-first enrichment service (Tasks 1.4.1–1.4.4)
 *
 * Replaces the inline sync logic in FieldLog.tsx and the legacy SyncService.ts.
 * Enriches observations with Weather, IndiaSAT (CoRE Stack), admin names, GBIF, Tessera.
 */

import { db, dbReady, enqueueSyncItem, dequeueSyncItems, updateSyncQueueItem, purgeSyncQueue, getSyncQueueStats } from '../db/database';
import { weatherService } from './WeatherService';
import { indiaSatService, INDIASAT_CLASSES, LATEST_INDIASAT_YEAR } from './IndiaSATService';
import { tesseraService } from './TesseraService';
import { coreStackService } from './CoreStackService';
import { gbifService } from './GBIFService';
import type { SyncQueueItem, DatasetValues } from '../types';

// ─── Public types ──────────────────────────────────────────────────

export interface SyncEngineStatus {
  isRunning: boolean;
  isOnline: boolean;
  queueSize: number;
  processing: number;
  completed: number;
  failed: number;
  lastSyncAt: number | null;
  currentMessage: string;
}

export type SyncEngineListener = (status: SyncEngineStatus) => void;

// ─── Configuration ─────────────────────────────────────────────────

const MAX_CONCURRENT = 5;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 2_000;
const AUTO_SYNC_INTERVAL_MS = 60_000; // 1 minute
const INTER_ITEM_DELAY_MS = 300;

// ─── SyncEngine Class ──────────────────────────────────────────────

class SyncEngine {
  private listeners: Set<SyncEngineListener> = new Set();
  private status: SyncEngineStatus = {
    isRunning: false,
    isOnline: navigator.onLine,
    queueSize: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    lastSyncAt: null,
    currentMessage: '',
  };
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor() {
    window.addEventListener('online', () => { this.status.isOnline = true; this.notify(); });
    window.addEventListener('offline', () => { this.status.isOnline = false; this.notify(); });
  }

  // ─── 1.4.4 Subscription ──────────────────────────────────────────

  /** Subscribe to status changes. Returns unsubscribe function. */
  subscribe(listener: SyncEngineListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try { fn({ ...this.status }); } catch { /* ignore */ }
    }
  }

  private setStatus(patch: Partial<SyncEngineStatus>): void {
    Object.assign(this.status, patch);
    this.notify();
  }

  // ─── Enqueue ──────────────────────────────────────────────────────

  /** Enqueue an observation for background enrichment */
  async enqueue(observationId: string): Promise<void> {
    await enqueueSyncItem(observationId);
    const stats = await getSyncQueueStats();
    this.setStatus({ queueSize: (stats['pending'] || 0) + (stats['processing'] || 0) });
    if (this.status.isOnline) {
      void this.processQueue();
    }
  }

  // ─── 1.4.1 enrichObservation ─────────────────────────────────────

  /**
   * Enrich a single observation with weather, IndiaSAT, CoRE admin, GBIF, Tessera.
   */
  async enrichObservation(observationId: string): Promise<void> {
    const ready = await dbReady;
    if (!ready) throw new Error('Database not available');

    const obs = await db.observations.get(observationId);
    if (!obs) throw new Error(`Observation ${observationId} not found`);

    const { lat, lon } = obs.location;
    const enrichedData: Record<string, unknown> = {};
    const sources: string[] = [];

    // 1. Weather (Open-Meteo)
    try {
      const weather = await weatherService.getWeather(lat, lon);
      if (weather?.current) {
        enrichedData['weather_temp'] = weather.current.temperature;
        enrichedData['weather_humidity'] = weather.current.humidity;
        enrichedData['weather_description'] = weather.current.weatherDescription;
        enrichedData['weather_precip'] = weather.current.precipitation;
        enrichedData['weather_source'] = 'Open-Meteo API';
        enrichedData['weather_timestamp'] = new Date().toISOString();
        sources.push('weather');
      }
    } catch (e) {
      console.warn('[SyncEngine] Weather enrichment failed:', e);
    }

    // 2. IndiaSAT LULC via CoRE Stack GeoServer (no Earth Engine)
    try {
      const pointData = await indiaSatService.fetchPointData(lat, lon, LATEST_INDIASAT_YEAR);
      if (pointData) {
        enrichedData['indiasat_data_type'] = 'POINT';
        enrichedData['indiasat_source'] = 'IndiaSAT / CoRE Stack WMS';
        enrichedData['indiasat_timestamp'] = pointData.timestamp;
        enrichedData['indiasat_class'] = pointData.landCoverClass;
        enrichedData['indiasat_class_id'] = pointData.classId;
        enrichedData['indiasat_year'] = pointData.year;
        enrichedData['indiasat_resolution'] = pointData.resolution;
        sources.push('indiasat');
        const prev = obs.predictionValidation?.perSource.find(s => s.source === 'indiasat');
        await db.observations.update(observationId, {
          predictionValidation: {
            capturedAt: obs.predictionValidation?.capturedAt || pointData.timestamp,
            perSource: [{
              source: 'indiasat',
              classId: pointData.classId,
              className: pointData.landCoverClass,
              classColor: INDIASAT_CLASSES[pointData.classId]?.color ?? '#888',
              confidence: pointData.confidence,
              asOf: String(pointData.year),
              live: true,
              agreement: prev?.agreement ?? 'unrated',
              observerClassId: prev?.observerClassId,
              observerClassName: prev?.observerClassName,
            }],
          },
        });
      } else {
        enrichedData['indiasat_data_type'] = 'UNAVAILABLE';
        enrichedData['indiasat_note'] = 'No IndiaSAT layer for this tehsil yet';
      }
    } catch (e) {
      console.warn('[SyncEngine] IndiaSAT enrichment failed:', e);
      enrichedData['indiasat_data_type'] = 'ERROR';
      enrichedData['indiasat_note'] = e instanceof Error ? e.message : 'Failed to fetch land cover';
    }

    try {
      const nearby = await gbifService.getSuggestionsNearby({ lat, lon, kingdom: 'Plantae', radiusKm: 8, limit: 8 });
      if (nearby.length) {
        enrichedData['gbif_nearby'] = nearby.slice(0, 8).map(s => s.scientificName).join('; ');
        sources.push('gbif');
      }
    } catch (e) {
      console.warn('[SyncEngine] GBIF enrichment failed:', e);
    }

    try {
      const tessera = await tesseraService.fetchPointContext(lat, lon);
      enrichedData['tessera_tile_id'] = tessera.tileId;
      enrichedData['tessera_year'] = tessera.year;
      enrichedData['tessera_coverage'] = tessera.coverage;
      sources.push('tessera');
      if (!obs.tessera) {
        await db.observations.update(observationId, { tessera });
      }
    } catch (e) {
      console.warn('[SyncEngine] Tessera enrichment failed:', e);
    }

    try {
      const core = await coreStackService.loadAtPoint(lat, lon);
      if (core.admin) {
        enrichedData['corestack_state'] = core.admin.state;
        enrichedData['corestack_district'] = core.admin.district;
        enrichedData['corestack_tehsil'] = core.admin.tehsil;
        sources.push('corestack');
        await db.observations.update(observationId, {
          coreStack: {
            state: core.admin.state,
            district: core.admin.district,
            tehsil: core.admin.tehsil,
            block: core.admin.block,
            layerNames: core.layers.map(l => l.name),
          },
        });
      }
    } catch (e) {
      console.warn('[SyncEngine] CoRE Stack enrichment failed:', e);
    }

    // Save enriched data
    enrichedData['sync_timestamp'] = new Date().toISOString();
    enrichedData['sync_status'] = 'enriched';

    const updatedValues: DatasetValues = {
      ...obs.datasetValues,
      sync_data: enrichedData as { [field: string]: unknown },
    };

    await db.observations.update(observationId, {
      datasetValues: updatedValues,
      synced: true,
      syncStatus: 'synced',
      syncedAt: Date.now(),
      enrichmentSources: sources,
    });
  }

  // ─── 1.4.2 processQueue ──────────────────────────────────────────

  /**
   * Drain the sync queue: dequeue up to MAX_CONCURRENT items,
   * process them with retry logic (3 attempts, exponential back-off).
   */
  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    this.setStatus({ isRunning: true, currentMessage: 'Processing sync queue...' });

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (!this.status.isOnline) {
          this.setStatus({ currentMessage: 'Paused — device offline' });
          break;
        }

        const batch = await dequeueSyncItems(MAX_CONCURRENT);
        if (batch.length === 0) {
          this.setStatus({ currentMessage: 'Queue empty' });
          break;
        }

        this.setStatus({
          processing: batch.length,
          currentMessage: `Processing ${batch.length} item(s)...`,
        });

        const promises = batch.map(item => this.processItem(item));
        await Promise.allSettled(promises);

        // Small delay between batches
        await new Promise(r => setTimeout(r, INTER_ITEM_DELAY_MS));

        // Refresh queue stats
        const stats = await getSyncQueueStats();
        this.setStatus({
          queueSize: (stats['pending'] || 0) + (stats['processing'] || 0),
          completed: this.status.completed,
          failed: this.status.failed,
        });
      }

      // Purge completed items
      await purgeSyncQueue();
      this.setStatus({ lastSyncAt: Date.now() });
    } finally {
      this.processing = false;
      this.setStatus({ isRunning: false, processing: 0 });
    }
  }

  private async processItem(item: SyncQueueItem): Promise<void> {
    const id = item.id!;
    await updateSyncQueueItem(id, { status: 'processing', lastAttemptAt: Date.now() });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.enrichObservation(item.observationId);
        await updateSyncQueueItem(id, { status: 'completed', attempts: attempt });
        this.status.completed += 1;
        return;
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        console.warn(`[SyncEngine] Attempt ${attempt}/${MAX_ATTEMPTS} failed for ${item.observationId}: ${err}`);

        if (attempt === MAX_ATTEMPTS) {
          await updateSyncQueueItem(id, { status: 'failed', attempts: attempt, error: err });
          // Also mark the observation
          await db.observations.update(item.observationId, { syncStatus: 'failed' }).catch(() => {});
          this.status.failed += 1;
        } else {
          // Exponential backoff
          const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
  }

  // ─── 1.4.3 startAutoSync ─────────────────────────────────────────

  /** Start auto-sync at a configurable interval. Pauses when offline. */
  startAutoSync(intervalMs = AUTO_SYNC_INTERVAL_MS): void {
    this.stopAutoSync();
    this.autoSyncTimer = setInterval(async () => {
      if (!this.status.isOnline || this.processing) return;
      try {
        await this.processQueue();
      } catch (e) {
        console.warn('[SyncEngine] Auto-sync cycle error:', e);
      }
    }, intervalMs);
    console.log(`[SyncEngine] Auto-sync started (every ${intervalMs / 1000}s)`);
  }

  /** Stop auto-sync */
  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  /** Run a full manual sync — enqueue all unsynced observations, then drain. */
  async syncAll(): Promise<void> {
    const ready = await dbReady;
    if (!ready) return;

    const unsynced = await db.observations
      .filter(obs => !obs.synced && obs.syncStatus !== 'synced')
      .toArray();

    this.setStatus({ currentMessage: `Queuing ${unsynced.length} unsynced observation(s)...` });

    for (const obs of unsynced) {
      await this.enqueue(obs.id);
      await db.observations.update(obs.id, { syncStatus: 'queued' });
    }

    await this.processQueue();
  }

  /** Get current status snapshot (for non-subscribers) */
  getStatus(): SyncEngineStatus {
    return { ...this.status };
  }
}

// Singleton export
export const syncEngine = new SyncEngine();
