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
          // v3 — prediction validation, field data, weather
          ...(obs.predictionValidation ? { 'fields:prediction_validation': obs.predictionValidation } : {}),
          ...(obs.fieldData ? { 'fields:field_data': obs.fieldData } : {}),
          ...(obs.weather ? { 'fields:weather': obs.weather } : {}),
          ...(obs.tessera ? { 'fields:tessera': obs.tessera } : {}),
          ...(obs.coreStack ? { 'fields:corestack': obs.coreStack } : {}),
          // Vector feature context (for ground-truthing vector datasets)
          ...(obs.vectorFeatureContext ? {
            'fields:vector_layer_id': obs.vectorFeatureContext.layerId,
            'fields:vector_layer_title': obs.vectorFeatureContext.layerTitle,
            'fields:vector_geometry_type': obs.vectorFeatureContext.geometryType,
            'fields:vector_data_source': obs.vectorFeatureContext.dataSource ?? null,
            'fields:vector_validation_prompt': obs.vectorFeatureContext.validationPrompt ?? null,
            'fields:vector_feature_properties': obs.vectorFeatureContext.featureProperties,
          } : {}),
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
    const vectorLayerCounts: Record<string, number> = {};

    for (const obs of observations) {
      const t = obs.observationType || 'general';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      validationCounts[obs.userValidation] = (validationCounts[obs.userValidation] || 0) + 1;
      obs.enrichmentSources?.forEach(s => sources.add(s));
      if (obs.vectorFeatureContext) {
        const vl = obs.vectorFeatureContext.layerTitle || obs.vectorFeatureContext.layerId;
        vectorLayerCounts[vl] = (vectorLayerCounts[vl] || 0) + 1;
      }
    }

    // Compute bounding box
    const lats = observations.map(o => o.location.lat);
    const lons = observations.map(o => o.location.lon);

    return {
      schema_version: '1.0.0',
      model_details: {
        name: 'Fields Ground-Truth Dataset',
        version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
        description: 'Crowd-sourced ground-truth observations for LULC, species, Tessera, and CoRE Stack validation',
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
        vector_layers_validated: Object.keys(vectorLayerCounts).length > 0 ? vectorLayerCounts : undefined,
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

  // ─── PBR (People's Biodiversity Register) Format Export ──────────

  /**
   * Export species sighting observations in a format aligned with the
   * People's Biodiversity Register (PBR) standard.
   * 
   * PBR structure (per NBA India guidelines):
   * - Species checklist with vernacular names
   * - Habitat & seasonal occurrence
   * - Traditional knowledge (with consent flags)
   * - GPS coordinates & administrative context
   */
  async exportPBR(): Promise<ExportResult> {
    try {
      const ready = await dbReady;
      if (!ready) throw new Error('Database not available');

      const observations = await db.observations
        .where('observationType')
        .equals('species_sighting')
        .toArray();

      if (observations.length === 0) {
        return { success: true, recordCount: 0, error: 'No species sighting observations to export' };
      }

      const zip = new JSZip();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // 1. Species Checklist (PBR Form II format)
      const speciesChecklist = this.buildPBRChecklist(observations);
      zip.file('pbr_species_checklist.json', JSON.stringify(speciesChecklist, null, 2));

      // 2. CSV version for compatibility
      const csv = this.buildPBRChecklistCSV(observations);
      zip.file('pbr_species_checklist.csv', csv);

      // 3. Observation details with GPS
      const geojsonStr = await exportToGeoJSON(observations);
      zip.file('pbr_observations.geojson', geojsonStr);

      // 4. TEK (Traditional Ecological Knowledge) section — only if consent given
      const tekObservations = observations.filter(o =>
        o.speciesData?.isTEK && o.speciesData?.tekConsent === true
      );
      if (tekObservations.length > 0) {
        const tekData = tekObservations.map(o => ({
          species: o.speciesData?.speciesId,
          vernacularName: o.speciesData?.vernacularName,
          language: o.speciesData?.vernacularLanguage,
          habitatType: o.speciesData?.habitatType,
          location: { lat: o.location.lat, lon: o.location.lon },
          region: o.context.region,
          season: o.season,
          recordedAt: o.timestamp,
          consent: true,
        }));
        zip.file('pbr_traditional_knowledge.json', JSON.stringify({
          disclaimer: 'This data contains Traditional Ecological Knowledge shared with explicit consent.',
          license: 'CC-BY-NC-SA-4.0',
          records: tekData,
        }, null, 2));
      }

      // 5. Metadata
      zip.file('pbr_metadata.json', JSON.stringify({
        format: 'People\'s Biodiversity Register (PBR)',
        standard: 'NBA India PBR Guidelines',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        region: 'Western Ghats',
        totalSpecies: (speciesChecklist.species as unknown[]).length,
        totalObservations: observations.length,
        tekRecords: tekObservations.length,
        dataQuality: {
          withPhotos: observations.filter(o => o.image?.blobId).length,
          withGPS: observations.filter(o => o.location.accuracy < 50).length,
          highConfidence: observations.filter(o => (o.confidence || 0) >= 4).length,
        },
      }, null, 2));

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const fileName = `fields_pbr_export_${timestamp}.zip`;

      await logExport({
        exportedAt: Date.now(),
        recordCount: observations.length,
        format: 'pbr_zip',
        fileName,
        sizeBytes: blob.size,
        observationIds: observations.map(o => o.id),
      });

      return { success: true, blob, fileName, recordCount: observations.length, sizeBytes: blob.size };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[AnnotationExporter] PBR export failed:', msg);
      return { success: false, recordCount: 0, error: msg };
    }
  }

  /** Build PBR species checklist (Form II) */
  private buildPBRChecklist(observations: Observation[]): Record<string, unknown> {
    const speciesMap = new Map<string, {
      scientificName: string;
      vernacularNames: { name: string; language: string }[];
      count: number;
      habitats: Set<string>;
      seasons: Set<string>;
      lifeStages: Set<string>;
      lastSeen: string;
      isTEK: boolean;
    }>();

    for (const obs of observations) {
      const speciesId = obs.speciesData?.speciesId || obs.speciesId || 'unknown';
      const existing = speciesMap.get(speciesId);
      if (existing) {
        existing.count++;
        if (obs.speciesData?.habitatType) existing.habitats.add(obs.speciesData.habitatType);
        if (obs.season) existing.seasons.add(obs.season);
        if (obs.speciesData?.lifeStage) existing.lifeStages.add(obs.speciesData.lifeStage);
        if (obs.timestamp > existing.lastSeen) existing.lastSeen = obs.timestamp;
        if (obs.speciesData?.vernacularName) {
          const vn = { name: obs.speciesData.vernacularName, language: obs.speciesData.vernacularLanguage || 'unknown' };
          if (!existing.vernacularNames.some(v => v.name === vn.name)) existing.vernacularNames.push(vn);
        }
        if (obs.speciesData?.isTEK) existing.isTEK = true;
      } else {
        speciesMap.set(speciesId, {
          scientificName: speciesId,
          vernacularNames: obs.speciesData?.vernacularName
            ? [{ name: obs.speciesData.vernacularName, language: obs.speciesData.vernacularLanguage || 'unknown' }]
            : [],
          count: 1,
          habitats: new Set(obs.speciesData?.habitatType ? [obs.speciesData.habitatType] : []),
          seasons: new Set(obs.season ? [obs.season] : []),
          lifeStages: new Set(obs.speciesData?.lifeStage ? [obs.speciesData.lifeStage] : []),
          lastSeen: obs.timestamp,
          isTEK: obs.speciesData?.isTEK || false,
        });
      }
    }

    return {
      format: 'PBR Species Checklist (Form II)',
      region: 'Western Ghats',
      generatedAt: new Date().toISOString(),
      species: Array.from(speciesMap.entries()).map(([id, s]) => ({
        id,
        scientificName: s.scientificName,
        vernacularNames: s.vernacularNames,
        observationCount: s.count,
        habitats: Array.from(s.habitats),
        seasonalPresence: Array.from(s.seasons),
        lifeStagesObserved: Array.from(s.lifeStages),
        lastObserved: s.lastSeen,
        hasTraditionalKnowledge: s.isTEK,
      })),
    };
  }

  /** Build CSV version of the PBR checklist */
  private buildPBRChecklistCSV(observations: Observation[]): string {
    const header = 'Scientific Name,Vernacular Name,Language,Habitat,Season,Life Stage,Count,Confidence,Latitude,Longitude,Date,TEK Consent\n';
    const rows = observations.map(o => {
      const fields = [
        o.speciesData?.speciesId || o.speciesId || '',
        o.speciesData?.vernacularName || '',
        o.speciesData?.vernacularLanguage || '',
        o.speciesData?.habitatType || '',
        o.season || '',
        o.speciesData?.lifeStage || '',
        String(o.speciesData?.count || 1),
        String(o.confidence || ''),
        String(o.location.lat),
        String(o.location.lon),
        o.timestamp,
        o.speciesData?.tekConsent ? 'Yes' : 'No',
      ];
      return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',');
    });
    return header + rows.join('\n');
  }
}

// Singleton export
export const annotationExporter = new AnnotationExporter();
