/**
 * Sync Service
 * 
 * Manages synchronization between offline data and online APIs.
 * Handles queuing observations for upload and enriching with CoreStack data.
 */

import { db } from '../db/database';
import type { Observation } from '../types';
import { coreStackService } from './CoreStackService';

export interface SyncStatus {
  pendingObservations: number;
  pendingImages: number;
  lastSync: Date | null;
  isSyncing: boolean;
  errors: string[];
}

export interface EnrichmentResult {
  observationId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

class SyncService {
  private syncStatus: SyncStatus = {
    pendingObservations: 0,
    pendingImages: 0,
    lastSync: null,
    isSyncing: false,
    errors: []
  };

  private listeners: Set<(status: SyncStatus) => void> = new Set();

  /**
   * Subscribe to sync status updates
   */
  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.syncStatus);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.syncStatus);
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Update pending counts
   */
  async updatePendingCounts(): Promise<void> {
    const pendingObservations = await db.observations
      .filter(obs => !obs.synced)
      .count();
    
    const pendingImages = await db.images.count();

    this.syncStatus.pendingObservations = pendingObservations;
    this.syncStatus.pendingImages = pendingImages;
    this.notifyListeners();
  }

  /**
   * Enrich a single observation with CoreStack data
   */
  async enrichObservation(observationId: string): Promise<EnrichmentResult> {
    const observation = await db.observations.get(observationId);
    
    if (!observation) {
      return {
        observationId,
        success: false,
        error: 'Observation not found'
      };
    }

    if (!coreStackService.isAvailable()) {
      return {
        observationId,
        success: false,
        error: 'CoreStack API not available'
      };
    }

    try {
      const enrichment = await coreStackService.enrichLocation(
        observation.location.lat,
        observation.location.lon
      );

      if (enrichment.error) {
        return {
          observationId,
          success: false,
          error: enrichment.error
        };
      }

      // Merge enrichment data with existing observation dataset values
      const updatedDatasetValues = {
        ...observation.datasetValues,
        corestack: {
          admin: enrichment.admin,
          mwsId: enrichment.mwsId,
          indicators: enrichment.indicators,
          enrichedAt: new Date().toISOString()
        }
      };

      await db.observations.update(observationId, {
        datasetValues: updatedDatasetValues,
        synced: true
      });

      return {
        observationId,
        success: true,
        data: updatedDatasetValues
      };
    } catch (error) {
      return {
        observationId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Enrich all pending observations
   */
  async enrichPendingObservations(): Promise<EnrichmentResult[]> {
    if (this.syncStatus.isSyncing) {
      return [];
    }

    this.syncStatus.isSyncing = true;
    this.syncStatus.errors = [];
    this.notifyListeners();

    const results: EnrichmentResult[] = [];

    try {
      const pendingObservations = await db.observations
        .filter(obs => !obs.synced)
        .toArray();

      for (const observation of pendingObservations) {
        const result = await this.enrichObservation(observation.id);
        results.push(result);

        if (!result.success && result.error) {
          this.syncStatus.errors.push(`Observation ${observation.id}: ${result.error}`);
        }
      }

      this.syncStatus.lastSync = new Date();
    } finally {
      this.syncStatus.isSyncing = false;
      await this.updatePendingCounts();
    }

    return results;
  }

  /**
   * Auto-sync when online
   */
  startAutoSync(intervalMs: number = 60000): () => void {
    const sync = async () => {
      if (navigator.onLine && !this.syncStatus.isSyncing) {
        await this.enrichPendingObservations();
      }
    };

    // Initial sync
    sync();

    // Periodic sync
    const intervalId = setInterval(sync, intervalMs);

    // Sync when coming online
    const handleOnline = () => sync();
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
    };
  }

  /**
   * Export observations with enrichment data
   */
  async exportEnrichedGeoJSON(): Promise<GeoJSON.FeatureCollection> {
    const observations = await db.observations.toArray();

    const features: GeoJSON.Feature[] = observations.map((obs: Observation) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [obs.location.lon, obs.location.lat]
      },
      properties: {
        id: obs.id,
        timestamp: obs.timestamp,
        userValidation: obs.userValidation,
        notes: obs.notes,
        synced: obs.synced,
        ...obs.datasetValues
      }
    }));

    return {
      type: 'FeatureCollection',
      features
    };
  }
}

export const syncService = new SyncService();
