/**
 * ExportService.ts
 * 
 * Safe, copy-only export of all existing observation data.
 * 
 * This service READS existing data from IndexedDB (Dexie) and COPIES it to
 * external storage WITHOUT modifying or deleting the originals.
 * 
 * Features:
 * - ONE-TAP ZIP EXPORT with share options (email, GDrive, etc.)
 * - Full backup (observations + images)
 * - Quick backup (observations only)
 * - Multiple formats: JSON, GeoJSON, CSV
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { db, dbReady, exportToGeoJSON, exportToCSV } from '../db/database';
import { exportTracksToGPX, exportTracksToGeoJSON } from './TrackExport';
import JSZip from 'jszip';

export interface ExportProgress {
  stage: 'idle' | 'preparing' | 'observations' | 'images' | 'zipping' | 'finalizing' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
  exportPath?: string;
  error?: string;
}

export interface ExportResult {
  success: boolean;
  exportPath?: string;
  zipPath?: string;
  filesExported: number;
  observationCount: number;
  imageCount: number;
  error?: string;
  timestamp: string;
}

export type ShareMethod = 'email' | 'gdrive' | 'share' | 'download';

class ExportService {
  private listeners: Set<(progress: ExportProgress) => void> = new Set();
  private isExporting = false;

  /**
   * Subscribe to export progress updates
   */
  subscribe(listener: (progress: ExportProgress) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyProgress(progress: ExportProgress): void {
    for (const listener of this.listeners) {
      listener(progress);
    }
  }

  /**
   * ONE-TAP EXPORT: Creates ZIP bundle and shares via selected method
   */
  async exportAndShare(shareMethod: ShareMethod = 'share'): Promise<ExportResult> {
    if (this.isExporting) {
      return {
        success: false,
        filesExported: 0,
        observationCount: 0,
        imageCount: 0,
        error: 'Export already in progress',
        timestamp: new Date().toISOString()
      };
    }

    this.isExporting = true;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFileName = `wg_field_data_${timestamp}.zip`;

    try {
      this.notifyProgress({ stage: 'preparing', current: 0, total: 0, message: 'Preparing export...' });

      const dbOk = await dbReady;
      if (!dbOk) throw new Error('Database not available');

      const zip = new JSZip();

      // Get observations
      this.notifyProgress({ stage: 'observations', current: 0, total: 3, message: 'Reading observations...' });
      const observations = await db.observations.toArray();
      console.log(`[ExportService] Found ${observations.length} observations for ZIP export`);

      // Add observations.json
      this.notifyProgress({ stage: 'observations', current: 1, total: 3, message: 'Adding observations.json...' });
      zip.file('observations.json', JSON.stringify({
        exportVersion: '1.0',
        exportedAt: new Date().toISOString(),
        appId: 'org.westernghats.fieldvalidator',
        totalObservations: observations.length,
        observations: observations
      }, null, 2));

      // Add GeoJSON
      this.notifyProgress({ stage: 'observations', current: 2, total: 3, message: 'Adding observations.geojson...' });
      const geojson = await exportToGeoJSON(observations);
      zip.file('observations.geojson', geojson);

      // Add CSV
      this.notifyProgress({ stage: 'observations', current: 3, total: 3, message: 'Adding observations.csv...' });
      const csv = await exportToCSV(observations);
      zip.file('observations.csv', csv);

      const tracks = await db.tracks.toArray();
      zip.file('tracks.gpx', exportTracksToGPX(tracks, observations));
      zip.file('tracks.geojson', exportTracksToGeoJSON(tracks));

      // Add images
      const images = await db.images.toArray();
      console.log(`[ExportService] Found ${images.length} images for ZIP export`);

      const imagesFolder = zip.folder('images');
      for (let i = 0; i < images.length; i++) {
        this.notifyProgress({ stage: 'images', current: i + 1, total: images.length, message: `Adding image ${i + 1} of ${images.length}...` });
        try {
          imagesFolder?.file(`${images[i].id}.jpg`, images[i].blob);
        } catch (imgError) {
          console.warn(`[ExportService] Failed to add image ${images[i].id} to ZIP:`, imgError);
        }
      }

      // Add manifest
      const manifest = {
        exportVersion: '1.0',
        exportedAt: new Date().toISOString(),
        appId: 'org.westernghats.fieldvalidator',
        platform: 'hybrid',
        observationCount: observations.length,
        imageCount: images.length,
        files: ['observations.json', 'observations.geojson', 'observations.csv', 'tracks.gpx', 'tracks.geojson', ...images.map(img => `images/${img.id}.jpg`)]
      };
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Generate ZIP
      this.notifyProgress({ stage: 'zipping', current: 0, total: 1, message: 'Generating ZIP file...' });
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

      // Convert to base64 for saving
      const zipBase64 = await this.blobToBase64(zipBlob);

      // Save ZIP to filesystem
      const exportFolder = 'exports';
      await this.ensureDirectory(exportFolder);
      const zipPath = `${exportFolder}/${zipFileName}`;
      await Filesystem.writeFile({ path: zipPath, data: zipBase64, directory: Directory.Documents });
      console.log(`[ExportService] ZIP saved to ${zipPath}`);

      // Share if requested
      this.notifyProgress({ stage: 'finalizing', current: 0, total: 1, message: `Preparing to ${shareMethod === 'download' ? 'save' : 'share'}...` });
      const fullPath = `Documents/${zipPath}`;

      if (shareMethod !== 'download') {
        try {
          const fileUri = await Filesystem.getUri({ path: zipPath, directory: Directory.Documents });
          await Share.share({
            title: 'Fields export',
            text: `Tracks and notes from ${new Date().toLocaleDateString()}`,
            url: fileUri.uri,
            dialogTitle: 'Share Field Data'
          });
        } catch (shareError) {
          console.warn('[ExportService] Share failed, file saved locally:', shareError);
        }
      }

      this.notifyProgress({ stage: 'complete', current: 1, total: 1, message: `Export complete! ${zipFileName}`, exportPath: fullPath });
      this.isExporting = false;

      return {
        success: true,
        exportPath: fullPath,
        zipPath: zipPath,
        filesExported: manifest.files.length + 1,
        observationCount: observations.length,
        imageCount: images.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[ExportService] ZIP export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifyProgress({ stage: 'error', current: 0, total: 0, message: `Export failed: ${errorMessage}`, error: errorMessage });
      this.isExporting = false;
      return { success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: errorMessage, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Quick one-tap export for web (no Capacitor APIs)
   */
  async exportAndDownloadWeb(): Promise<ExportResult> {
    if (this.isExporting) {
      return { success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: 'Export already in progress', timestamp: new Date().toISOString() };
    }

    this.isExporting = true;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFileName = `wg_field_data_${timestamp}.zip`;

    try {
      this.notifyProgress({ stage: 'preparing', current: 0, total: 0, message: 'Preparing export...' });

      const dbOk = await dbReady;
      if (!dbOk) throw new Error('Database not available');

      const zip = new JSZip();
      const observations = await db.observations.toArray();

      this.notifyProgress({ stage: 'observations', current: 1, total: 3, message: 'Adding observations.json...' });
      zip.file('observations.json', JSON.stringify({ exportVersion: '1.0', exportedAt: new Date().toISOString(), totalObservations: observations.length, observations }, null, 2));

      this.notifyProgress({ stage: 'observations', current: 2, total: 3, message: 'Adding observations.geojson...' });
      zip.file('observations.geojson', await exportToGeoJSON(observations));

      this.notifyProgress({ stage: 'observations', current: 3, total: 3, message: 'Adding observations.csv...' });
      zip.file('observations.csv', await exportToCSV(observations));

      const tracks = await db.tracks.toArray();
      zip.file('tracks.gpx', exportTracksToGPX(tracks, observations));
      zip.file('tracks.geojson', exportTracksToGeoJSON(tracks));

      const images = await db.images.toArray();
      const imagesFolder = zip.folder('images');
      for (let i = 0; i < images.length; i++) {
        this.notifyProgress({ stage: 'images', current: i + 1, total: images.length, message: `Adding image ${i + 1}...` });
        imagesFolder?.file(`${images[i].id}.jpg`, images[i].blob);
      }

      zip.file('manifest.json', JSON.stringify({ exportVersion: '1.0', exportedAt: new Date().toISOString(), observationCount: observations.length, imageCount: images.length }, null, 2));

      this.notifyProgress({ stage: 'zipping', current: 0, total: 1, message: 'Generating ZIP...' });
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

      // Trigger download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.notifyProgress({ stage: 'complete', current: 1, total: 1, message: `Downloaded ${zipFileName}` });
      this.isExporting = false;

      return { success: true, filesExported: 3 + images.length, observationCount: observations.length, imageCount: images.length, timestamp: new Date().toISOString() };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifyProgress({ stage: 'error', current: 0, total: 0, message: `Export failed: ${errorMessage}`, error: errorMessage });
      this.isExporting = false;
      return { success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: errorMessage, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Export all data to external storage (COPY only - does not modify source)
   */
  async exportAllData(): Promise<ExportResult> {
    if (this.isExporting) {
      return { success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: 'Export already in progress', timestamp: new Date().toISOString() };
    }

    this.isExporting = true;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportFolder = `exports/wg_backup_${timestamp}`;

    try {
      this.notifyProgress({ stage: 'preparing', current: 0, total: 0, message: 'Preparing export...' });

      const dbOk = await dbReady;
      if (!dbOk) throw new Error('Database not available');

      await this.ensureDirectory(exportFolder);
      await this.ensureDirectory(`${exportFolder}/images`);

      this.notifyProgress({ stage: 'observations', current: 0, total: 3, message: 'Reading observations from database...' });
      const observations = await db.observations.toArray();
      console.log(`[ExportService] Found ${observations.length} observations`);

      this.notifyProgress({ stage: 'observations', current: 1, total: 3, message: 'Exporting observations.json...' });
      await this.writeJsonFile(`${exportFolder}/observations.json`, {
        exportVersion: '1.0',
        exportedAt: new Date().toISOString(),
        appId: 'org.westernghats.fieldvalidator',
        databaseName: 'WGFieldValidator',
        totalObservations: observations.length,
        observations: observations
      });

      this.notifyProgress({ stage: 'observations', current: 2, total: 3, message: 'Exporting observations.geojson...' });
      await this.writeTextFile(`${exportFolder}/observations.geojson`, await exportToGeoJSON(observations));

      this.notifyProgress({ stage: 'observations', current: 3, total: 3, message: 'Exporting observations.csv...' });
      await this.writeTextFile(`${exportFolder}/observations.csv`, await exportToCSV(observations));

      const images = await db.images.toArray();
      console.log(`[ExportService] Found ${images.length} images`);

      for (let i = 0; i < images.length; i++) {
        this.notifyProgress({ stage: 'images', current: i + 1, total: images.length, message: `Exporting image ${i + 1} of ${images.length}...` });
        try {
          await this.writeImageFile(`${exportFolder}/images/${images[i].id}.jpg`, images[i].blob);
        } catch (imgError) {
          console.warn(`[ExportService] Failed to export image ${images[i].id}:`, imgError);
        }
      }

      this.notifyProgress({ stage: 'finalizing', current: 0, total: 1, message: 'Creating manifest...' });
      const manifest = {
        exportVersion: '1.0',
        exportedAt: new Date().toISOString(),
        appId: 'org.westernghats.fieldvalidator',
        platform: 'android',
        observationCount: observations.length,
        imageCount: images.length,
        images: images.map(img => ({ id: img.id, createdAt: img.createdAt, filename: `images/${img.id}.jpg`, size: img.blob.size })),
        files: ['observations.json', 'observations.geojson', 'observations.csv', 'tracks.gpx', 'tracks.geojson', ...images.map(img => `images/${img.id}.jpg`)]
      };
      await this.writeJsonFile(`${exportFolder}/manifest.json`, manifest);

      const fullPath = `Documents/${exportFolder}`;
      this.notifyProgress({ stage: 'complete', current: 1, total: 1, message: `Export complete! Saved to ${fullPath}`, exportPath: fullPath });
      this.isExporting = false;

      return { success: true, exportPath: fullPath, filesExported: manifest.files.length + 1, observationCount: observations.length, imageCount: images.length, timestamp: new Date().toISOString() };

    } catch (error) {
      console.error('[ExportService] Export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifyProgress({ stage: 'error', current: 0, total: 0, message: `Export failed: ${errorMessage}`, error: errorMessage });
      this.isExporting = false;
      return { success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: errorMessage, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Export only observations (no images) for quick backup
   */
  async exportObservationsOnly(): Promise<ExportResult> {
    if (this.isExporting) {
      return { success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: 'Export already in progress', timestamp: new Date().toISOString() };
    }

    this.isExporting = true;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportFolder = `exports/wg_observations_${timestamp}`;

    try {
      this.notifyProgress({ stage: 'preparing', current: 0, total: 0, message: 'Preparing export...' });

      const dbOk = await dbReady;
      if (!dbOk) throw new Error('Database not available');

      await this.ensureDirectory(exportFolder);
      const observations = await db.observations.toArray();

      this.notifyProgress({ stage: 'observations', current: 1, total: 3, message: 'Exporting observations...' });
      await this.writeJsonFile(`${exportFolder}/observations.json`, { exportVersion: '1.0', exportedAt: new Date().toISOString(), totalObservations: observations.length, observations });

      this.notifyProgress({ stage: 'observations', current: 2, total: 3, message: 'Creating GeoJSON...' });
      await this.writeTextFile(`${exportFolder}/observations.geojson`, await exportToGeoJSON(observations));

      this.notifyProgress({ stage: 'observations', current: 3, total: 3, message: 'Creating CSV...' });
      await this.writeTextFile(`${exportFolder}/observations.csv`, await exportToCSV(observations));

      const fullPath = `Documents/${exportFolder}`;
      this.notifyProgress({ stage: 'complete', current: 1, total: 1, message: `Export complete! Saved to ${fullPath}`, exportPath: fullPath });
      this.isExporting = false;

      return { success: true, exportPath: fullPath, filesExported: 3, observationCount: observations.length, imageCount: 0, timestamp: new Date().toISOString() };

    } catch (error) {
      console.error('[ExportService] Quick export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.notifyProgress({ stage: 'error', current: 0, total: 0, message: `Export failed: ${errorMessage}`, error: errorMessage });
      this.isExporting = false;
      return { success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: errorMessage, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Check if export is in progress
   */
  get isExportInProgress(): boolean {
    return this.isExporting;
  }

  // ---- Private helper methods ----

  private async ensureDirectory(path: string): Promise<void> {
    try {
      await Filesystem.mkdir({ path, directory: Directory.Documents, recursive: true });
    } catch (e) {
      console.log(`[ExportService] Directory ${path} may already exist`);
    }
  }

  private async writeJsonFile(path: string, data: unknown): Promise<void> {
    await Filesystem.writeFile({ path, data: JSON.stringify(data, null, 2), directory: Directory.Documents, encoding: Encoding.UTF8 });
    console.log(`[ExportService] Wrote ${path}`);
  }

  private async writeTextFile(path: string, content: string): Promise<void> {
    await Filesystem.writeFile({ path, data: content, directory: Directory.Documents, encoding: Encoding.UTF8 });
    console.log(`[ExportService] Wrote ${path}`);
  }

  private async writeImageFile(path: string, blob: Blob): Promise<void> {
    const base64 = await this.blobToBase64(blob);
    await Filesystem.writeFile({ path, data: base64, directory: Directory.Documents });
    console.log(`[ExportService] Wrote ${path}`);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ─── Task 1.5.8: Delegate to AnnotationExporter ─────────────────

  /**
   * Convenience method: GeoAI export (delegates to AnnotationExporter).
   * Maintained here for backward-compatible import from ExportService.
   */
  async exportGeoAI(options?: import('../services/AnnotationExporter').GeoAIExportOptions): Promise<import('../services/AnnotationExporter').ExportResult> {
    const { annotationExporter } = await import('../services/AnnotationExporter');
    return annotationExporter.exportGeoAI(options);
  }
}

export const exportService = new ExportService();
