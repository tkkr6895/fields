/**
 * AnnotationExporter — GeoAI / STAC / COCO-lite annotation export (Tasks 1.5.1–1.5.6)
 *
 * Creates ML-ready export bundles containing:
 * - GeoJSON FeatureCollection
 * - CSV
 * - STAC Item Collection
 * - COCO-lite training manifest
 * - Model card with provenance
 * - SHA-256 image checksums (Web Crypto API)
 * - Incremental export via exportLog
 */

import JSZip from 'jszip';
import { db, dbReady, logExport, getLastExportTimestamp, exportToGeoJSON, exportToCSV } from '../db/database';
import type { Observation } from '../types';

declare const __APP_VERSION__: string;

// ─── Public types ──────────────────────────────────────────────────

export interface GeoAIExportOptions {
  /** Only include observations since last export of same format */
  incremental?: boolean;
  /** Only include specific observation types */
  observationTypes?: string[];
  /** Include images in ZIP */
  includeImages?: boolean;
  /** Include STAC items */
  includeSTAC?: boolean;
  /** Include COCO-lite manifest */
  includeCOCO?: boolean;
  /** Include model card */
  includeModelCard?: boolean;
}

export interface ExportResult {
  success: boolean;
  blob?: Blob;
  fileName?: string;
  recordCount: number;
  sizeBytes?: number;
  error?: string;
}

// ─── SHA-256 helper (Task 1.5.5) ──────────────────────────────────

async function sha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── AnnotationExporter Class ──────────────────────────────────────

class AnnotationExporter {

  // ─── 1.5.1 exportGeoAI ──────────────────────────────────────────

  /**
   * Build a GeoAI-ready ZIP with GeoJSON, CSV, optional images, STAC,
   * COCO manifest, and model card.
   */
  async exportGeoAI(options: GeoAIExportOptions = {}): Promise<ExportResult> {
    const {
      incremental = false,
      includeImages = true,
      includeSTAC = true,
      includeCOCO = true,
      includeModelCard = true,
    } = options;

    try {
      const ready = await dbReady;
      if (!ready) throw new Error('Database not available');

      // Get observations (optionally incremental)
      let observations = await db.observations.orderBy('timestamp').toArray();

      if (incremental) {
        const lastTs = await getLastExportTimestamp('geoai_zip');
        if (lastTs) {
          observations = observations.filter(o => new Date(o.timestamp).getTime() > lastTs);
        }
      }

      if (options.observationTypes?.length) {
        observations = observations.filter(o =>
          options.observationTypes!.includes(o.observationType || 'general')
        );
      }

      if (observations.length === 0) {
        return { success: true, recordCount: 0, error: 'No observations to export' };
      }

      const zip = new JSZip();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // 1. GeoJSON
      const geojsonStr = await exportToGeoJSON(observations);
      zip.file('observations.geojson', geojsonStr);

      // 2. CSV
      const csvStr = await exportToCSV(observations);
      zip.file('observations.csv', csvStr);

      // 3. Images + checksums
      const imageChecksums: Record<string, string> = {};
      if (includeImages) {
        const imgFolder = zip.folder('images')!;
        for (const obs of observations) {
          if (obs.image?.blobId) {
            const imgRecord = await db.images.get(obs.image.blobId);
            if (imgRecord) {
              const filename = `${obs.image.blobId}.jpg`;
              imgFolder.file(filename, imgRecord.blob);
              imageChecksums[filename] = await sha256(imgRecord.blob);
            }
          }
        }
      }

      // 4. STAC Item Collection (Task 1.5.2)
      if (includeSTAC) {
        const stac = this.buildSTACCollection(observations, imageChecksums);
        zip.file('stac_items.json', JSON.stringify(stac, null, 2));
      }

      // 5. COCO-lite manifest (Task 1.5.3)
      if (includeCOCO) {
        const coco = this.buildCOCOManifest(observations, imageChecksums);
        zip.file('manifest.json', JSON.stringify(coco, null, 2));
      }

      // 6. Model card (Task 1.5.4)
      if (includeModelCard) {
        const card = this.buildModelCard(observations);
        zip.file('model_card.json', JSON.stringify(card, null, 2));
      }

      // 7. Checksums file
      if (Object.keys(imageChecksums).length > 0) {
        zip.file('checksums_sha256.json', JSON.stringify(imageChecksums, null, 2));
      }

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const fileName = `fields_geoai_export_${timestamp}.zip`;

      // Log export (Task 1.5.6)
      await logExport({
        exportedAt: Date.now(),
        recordCount: observations.length,
        format: 'geoai_zip',
        fileName,
        sizeBytes: blob.size,
        observationIds: observations.map(o => o.id),
      });

      return {
        success: true,
        blob,
        fileName,
        recordCount: observations.length,
        sizeBytes: blob.size,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[AnnotationExporter] Export failed:', msg);
      return { success: false, recordCount: 0, error: msg };
    }
  }

  // ─── 1.5.2 STAC Item Collection ──────────────────────────────────

  private buildSTACCollection(
    observations: Observation[],
    checksums: Record<string, string>
  ): Record<string, unknown> {
    const items = observations.map(obs => {
      const item: Record<string, unknown> = {
        type: 'Feature',
        stac_version: '1.0.0',
        stac_extensions: [],
        id: obs.id,
        geometry: {
          type: 'Point',
          coordinates: [obs.location.lon, obs.location.lat],
        },
        bbox: [obs.location.lon, obs.location.lat, obs.location.lon, obs.location.lat],
        properties: {
          datetime: obs.timestamp,
          'fields:observation_type': obs.observationType || 'general',
          'fields:validation': obs.userValidation,
          'fields:confidence': obs.confidence ?? null,
          'fields:season': obs.season ?? null,
          'fields:sync_status': obs.syncStatus ?? 'pending',
        },
        links: [],
        assets: {} as Record<string, unknown>,
      };

      if (obs.image?.blobId) {
        const filename = `${obs.image.blobId}.jpg`;
        (item.assets as Record<string, unknown>)['image'] = {
          href: `images/${filename}`,
          type: 'image/jpeg',
          roles: ['data'],
          'file:checksum': checksums[filename] ? `sha256:${checksums[filename]}` : undefined,
        };
      }

      return item;
    });

    return {
      type: 'FeatureCollection',
      stac_version: '1.0.0',
      description: 'Fields ground-truth observations for LULC validation',
      features: items,
    };
  }

  // ─── 1.5.3 COCO-lite training manifest ───────────────────────────

  private buildCOCOManifest(
    observations: Observation[],
    checksums: Record<string, string>
  ): Record<string, unknown> {
    const images = observations
      .filter(o => o.image?.blobId)
      .map((obs, idx) => ({
        id: idx,
        file_name: `images/${obs.image!.blobId}.jpg`,
        width: null, // Not available without decoding
        height: null,
        date_captured: obs.timestamp,
        sha256: checksums[`${obs.image!.blobId}.jpg`] ?? null,
        geo: {
          lat: obs.location.lat,
          lon: obs.location.lon,
          accuracy_m: obs.location.accuracy,
        },
      }));

    const annotations = observations
      .filter(o => o.image?.blobId)
      .map((obs, idx) => ({
        id: idx,
        image_id: idx,
        category_name: obs.observationType || 'general',
        validation: obs.userValidation,
        confidence: obs.confidence ?? null,
        attributes: {
          season: obs.season ?? null,
          tags: obs.tags ?? [],
          notes: obs.notes,
        },
      }));

    // Collect unique categories
    const categorySet = new Set(annotations.map(a => a.category_name));
    const categories = Array.from(categorySet).map((name, idx) => ({
      id: idx,
      name,
      supercategory: 'observation',
    }));

    return {
      info: {
        description: 'Fields ground-truth annotations',
        version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
        year: new Date().getFullYear(),
        contributor: 'Fields App Observers',
        date_created: new Date().toISOString(),
      },
      images,
      annotations,
      categories,
    };
  }

  // ─── 1.5.4 Model card ────────────────────────────────────────────

  private buildModelCard(observations: Observation[]): Record<string, unknown> {
    const typeCounts: Record<string, number> = {};
    const validationCounts: Record<string, number> = {};
    const sources = new Set<string>();

    for (const obs of observations) {
      const t = obs.observationType || 'general';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      validationCounts[obs.userValidation] = (validationCounts[obs.userValidation] || 0) + 1;
      obs.enrichmentSources?.forEach(s => sources.add(s));
    }

    // Compute bounding box
    const lats = observations.map(o => o.location.lat);
    const lons = observations.map(o => o.location.lon);

    return {
      schema_version: '1.0.0',
      model_details: {
        name: 'Fields Ground-Truth Dataset',
        version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
        description: 'Crowd-sourced ground-truth observations for LULC validation in the Western Ghats',
        license: 'CC-BY-4.0',
      },
      dataset: {
        total_observations: observations.length,
        date_range: {
          earliest: observations.length > 0 ? observations[0].timestamp : null,
          latest: observations.length > 0 ? observations[observations.length - 1].timestamp : null,
        },
        bounding_box: observations.length > 0 ? {
          west: Math.min(...lons),
          south: Math.min(...lats),
          east: Math.max(...lons),
          north: Math.max(...lats),
        } : null,
        observation_types: typeCounts,
        validation_distribution: validationCounts,
      },
      provenance: {
        enrichment_sources: Array.from(sources),
        collection_tool: 'Fields App',
        collection_method: 'Mobile field survey with GPS',
      },
      intended_use: {
        primary: 'LULC classification model training and validation',
        out_of_scope: 'Not suitable for real-time decision making without ground verification',
      },
      ethical_considerations: {
        privacy: 'Observations are anonymous; location data is included for spatial analysis',
        traditional_knowledge: 'TEK data is only included with explicit user consent',
      },
      exported_at: new Date().toISOString(),
    };
  }

  // ─── Convenience: STAC-only export ───────────────────────────────

  async exportSTACOnly(): Promise<ExportResult> {
    return this.exportGeoAI({
      includeImages: false,
      includeSTAC: true,
      includeCOCO: false,
      includeModelCard: false,
    });
  }
}

// Singleton export
export const annotationExporter = new AnnotationExporter();
