/**
 * TileLayerService
 *
 * Loads XYZ raster tile layers from the offline tile manifest.
 */

import type { DatasetLayer } from '../types';

interface TileLayerManifest {
  version: string;
  generated: string;
  bounds: {
    min_lon: number;
    max_lon: number;
    min_lat: number;
    max_lat: number;
  };
  zoom_range: [number, number];
  layers: Array<{
    id: string;
    title: string;
    category: string;
    year?: number;
    description?: string;
    color_scheme?: string;
    tile_path: string;
    min_zoom?: number;
    max_zoom?: number;
  }>;
}

class TileLayerService {
  private manifest: TileLayerManifest | null = null;
  private isLoaded = false;

  async loadManifest(): Promise<TileLayerManifest | null> {
    if (this.isLoaded && this.manifest) return this.manifest;

    try {
      const response = await fetch('/tiles/tile-manifest.json');
      if (!response.ok) {
        console.warn('Failed to load tile manifest:', response.status);
        return null;
      }

      this.manifest = (await response.json()) as TileLayerManifest;
      this.isLoaded = true;
      console.log(`Loaded ${this.manifest.layers.length} tile layers`);
      return this.manifest;
    } catch (error) {
      console.error('Error loading tile manifest:', error);
      return null;
    }
  }

  async getTileLayers(): Promise<DatasetLayer[]> {
    const manifest = await this.loadManifest();
    if (!manifest) return [];

    return manifest.layers.map((layer) => {
      const minZoom = layer.min_zoom ?? manifest.zoom_range?.[0] ?? 0;
      const maxZoom = layer.max_zoom ?? manifest.zoom_range?.[1] ?? 24;

      return {
        id: `tile_${layer.id}`,
        title: layer.title,
        type: 'raster',
        source: {
          format: 'xyz',
          path: layer.tile_path
        },
        style: {
          kind: 'image',
          opacity: 0.8
        },
        minZoom,
        maxZoom,
        year: layer.year,
        description: layer.description,
        category: this.mapCategory(layer.category),
        enabled: true
      } as DatasetLayer;
    });
  }

  private mapCategory(category: string): DatasetLayer['category'] {
    const valid: DatasetLayer['category'][] = ['lulc', 'corestack', 'forest', 'boundary', 'built', 'treecover', 'other'];
    return valid.includes(category as DatasetLayer['category']) ? (category as DatasetLayer['category']) : 'other';
  }
}

export const tileLayerService = new TileLayerService();
export default tileLayerService;
