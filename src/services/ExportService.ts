/**
 * ExportService.ts
 * 
 * PHASE 1: Safe, copy-only export of all existing observation data.
 * 
 * This service READS existing data from IndexedDB (Dexie) and COPIES it to
 * external storage WITHOUT modifying or deleting the originals.
 * 
 * Data exported:
 * - All observations as JSON
 * - All observations as GeoJSON (for GIS tools)
 * - All observations as CSV (for spreadsheet tools)
 * - All image blobs
 * - Raw database dump
 * 
 * Export location: /storage/emulated/0/Android/data/org.westernghats.fieldvalidator/files/Documents/exports/
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { db, dbReady, exportToGeoJSON, exportToCSV } from '../db/database';

export interface ExportProgress {
  stage: 'idle' | 'preparing' | 'observations' | 'images' | 'finalizing' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
  exportPath?: string;
  error?: string;
}

export interface ExportResult {
  success: boolean;
  exportPath?: string;
  filesExported: number;
  observationCount: number;
  imageCount: number;
  error?: string;
  timestamp: string;
}

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
   * Export all data to external storage (COPY only - does not modify source)
   */
  async exportAllData(): Promise<ExportResult> {
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
    const exportFolder = `exports/wg_backup_${timestamp}`;

    try {
      // Stage 1: Prepare
      this.notifyProgress({
        stage: 'preparing',
        current: 0,
        total: 0,
        message: 'Preparing export...'
      });

      // Ensure database is ready
      const dbOk = await dbReady;
      if (!dbOk) {
        throw new Error('Database not available');
      }

      // Create export directory
      await this.ensureDirectory(exportFolder);
      await this.ensureDirectory(`${exportFolder}/images`);

      // Stage 2: Export observations
      this.notifyProgress({
        stage: 'observations',
        current: 0,
        total: 3,
        message: 'Reading observations from database...'
      });

      const observations = await db.observations.toArray();
      console.log(`[ExportService] Found ${observations.length} observations`);

      // Export as JSON (raw format - complete data)
      this.notifyProgress({
        stage: 'observations',
        current: 1,
        total: 3,
        message: 'Exporting observations.json...'
      });
      await this.writeJsonFile(
        `${exportFolder}/observations.json`,
        {
          exportVersion: '1.0',
          exportedAt: new Date().toISOString(),
          appId: 'org.westernghats.fieldvalidator',
          databaseName: 'WGFieldValidator',
          totalObservations: observations.length,
          observations: observations
        }
      );

      // Export as GeoJSON
      this.notifyProgress({
        stage: 'observations',
        current: 2,
        total: 3,
        message: 'Exporting observations.geojson...'
      });
      const geojson = await exportToGeoJSON(observations);
      await this.writeTextFile(`${exportFolder}/observations.geojson`, geojson);

      // Export as CSV
      this.notifyProgress({
        stage: 'observations',
        current: 3,
        total: 3,
        message: 'Exporting observations.csv...'
      });
      const csv = await exportToCSV(observations);
      await this.writeTextFile(`${exportFolder}/observations.csv`, csv);

      // Stage 3: Export images
      const images = await db.images.toArray();
      console.log(`[ExportService] Found ${images.length} images`);

      for (let i = 0; i < images.length; i++) {
        this.notifyProgress({
          stage: 'images',
          current: i + 1,
          total: images.length,
          message: `Exporting image ${i + 1} of ${images.length}...`
        });

        try {
          await this.writeImageFile(
            `${exportFolder}/images/${images[i].id}.jpg`,
            images[i].blob
          );
        } catch (imgError) {
          console.warn(`[ExportService] Failed to export image ${images[i].id}:`, imgError);
          // Continue with other images - don't fail entire export
        }
      }

      // Stage 4: Create image manifest
      this.notifyProgress({
        stage: 'finalizing',
        current: 0,
        total: 1,
        message: 'Creating manifest...'
      });

      const manifest = {
        exportVersion: '1.0',
        exportedAt: new Date().toISOString(),
        appId: 'org.westernghats.fieldvalidator',
        platform: 'android',
        observationCount: observations.length,
        imageCount: images.length,
        images: images.map(img => ({
          id: img.id,
          createdAt: img.createdAt,
          filename: `images/${img.id}.jpg`,
          size: img.blob.size
        })),
        files: [
          'observations.json',
          'observations.geojson', 
          'observations.csv',
          ...images.map(img => `images/${img.id}.jpg`)
        ]
      };
      await this.writeJsonFile(`${exportFolder}/manifest.json`, manifest);

      // Stage 5: Complete
      const fullPath = `Documents/${exportFolder}`;
      this.notifyProgress({
        stage: 'complete',
        current: 1,
        total: 1,
        message: `Export complete! Saved to ${fullPath}`,
        exportPath: fullPath
      });

      this.isExporting = false;

      return {
        success: true,
        exportPath: fullPath,
        filesExported: manifest.files.length + 1, // +1 for manifest
        observationCount: observations.length,
        imageCount: images.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[ExportService] Export failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.notifyProgress({
        stage: 'error',
        current: 0,
        total: 0,
        message: `Export failed: ${errorMessage}`,
        error: errorMessage
      });

      this.isExporting = false;

      return {
        success: false,
        filesExported: 0,
        observationCount: 0,
        imageCount: 0,
        error: errorMessage,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Export only observations (no images) for quick backup
   */
  async exportObservationsOnly(): Promise<ExportResult> {
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
    const exportFolder = `exports/wg_observations_${timestamp}`;

    try {
      this.notifyProgress({
        stage: 'preparing',
        current: 0,
        total: 0,
        message: 'Preparing export...'
      });

      const dbOk = await dbReady;
      if (!dbOk) {
        throw new Error('Database not available');
      }

      await this.ensureDirectory(exportFolder);

      const observations = await db.observations.toArray();

      this.notifyProgress({
        stage: 'observations',
        current: 1,
        total: 3,
        message: 'Exporting observations...'
      });

      // Export all formats
      await this.writeJsonFile(`${exportFolder}/observations.json`, {
        exportVersion: '1.0',
        exportedAt: new Date().toISOString(),
        totalObservations: observations.length,
        observations
      });

      this.notifyProgress({ stage: 'observations', current: 2, total: 3, message: 'Creating GeoJSON...' });
      await this.writeTextFile(`${exportFolder}/observations.geojson`, await exportToGeoJSON(observations));

      this.notifyProgress({ stage: 'observations', current: 3, total: 3, message: 'Creating CSV...' });
      await this.writeTextFile(`${exportFolder}/observations.csv`, await exportToCSV(observations));

      const fullPath = `Documents/${exportFolder}`;
      this.notifyProgress({
        stage: 'complete',
        current: 1,
        total: 1,
        message: `Export complete! Saved to ${fullPath}`,
        exportPath: fullPath
      });

      this.isExporting = false;

      return {
        success: true,
        exportPath: fullPath,
        filesExported: 3,
        observationCount: observations.length,
        imageCount: 0,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[ExportService] Quick export failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.notifyProgress({
        stage: 'error',
        current: 0,
        total: 0,
        message: `Export failed: ${errorMessage}`,
        error: errorMessage
      });

      this.isExporting = false;

      return {
        success: false,
        filesExported: 0,
        observationCount: 0,
        imageCount: 0,
        error: errorMessage,
        timestamp: new Date().toISOString()
      };
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
      await Filesystem.mkdir({
        path,
        directory: Directory.Documents,
        recursive: true
      });
    } catch (e) {
      // Directory might already exist - that's OK
      console.log(`[ExportService] Directory ${path} may already exist`);
    }
  }

  private async writeJsonFile(path: string, data: unknown): Promise<void> {
    await Filesystem.writeFile({
      path,
      data: JSON.stringify(data, null, 2),
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    });
    console.log(`[ExportService] Wrote ${path}`);
  }

  private async writeTextFile(path: string, content: string): Promise<void> {
    await Filesystem.writeFile({
      path,
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    });
    console.log(`[ExportService] Wrote ${path}`);
  }

  private async writeImageFile(path: string, blob: Blob): Promise<void> {
    // Convert Blob to base64
    const base64 = await this.blobToBase64(blob);
    
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Documents
      // No encoding = binary/base64
    });
    console.log(`[ExportService] Wrote ${path}`);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const exportService = new ExportService();
