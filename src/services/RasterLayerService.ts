/**
 * RasterLayerService
 * 
 * Manages raster image overlays for the map.
 * Loads the tile manifest and provides layer configuration.
 */

import type { DatasetLayer } from '../types';

export interface RasterLayerManifest {
  version: string;
  generated: string;
  layers: RasterLayerConfig[];
}

export interface RasterLayerConfig {
  id: string;
  title: string;
  category: string;
  year?: number;
  description: string;
  image_path: string;
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}

// Category display configuration
const CATEGORY_CONFIG: Record<string, { label: string; icon: string; order: number }> = {
  lulc: { label: 'Land Use / Land Cover', icon: '🌿', order: 1 },
  forest: { label: 'Forest Classification', icon: '🌳', order: 2 },
  built: { label: 'Built-up Area', icon: '🏘️', order: 3 },
  treecover: { label: 'Tree Cover', icon: '🌲', order: 4 },
  boundary: { label: 'Boundaries', icon: '🗺️', order: 5 },
  other: { label: 'Other Layers', icon: '📊', order: 6 }
};

class RasterLayerService {
  private manifest: RasterLayerManifest | null = null;
  private isLoaded = false;
  
  /**
   * Load the raster layer manifest
   */
  async loadManifest(): Promise<RasterLayerManifest | null> {
    if (this.isLoaded && this.manifest) {
      return this.manifest;
    }
    
    try {
      const response = await fetch('/tiles/images/image-manifest.json');
      if (!response.ok) {
        console.warn('Failed to load raster manifest:', response.status);
        return null;
      }
      
      this.manifest = await response.json();
      this.isLoaded = true;
      console.log(`Loaded ${this.manifest?.layers.length || 0} raster layers`);
      return this.manifest;
    } catch (error) {
      console.error('Error loading raster manifest:', error);
      return null;
    }
  }
  
  /**
   * Get all raster layers as DatasetLayer objects
   */
  async getRasterLayers(): Promise<DatasetLayer[]> {
    const manifest = await this.loadManifest();
    if (!manifest) return [];
    
    return manifest.layers.map(layer => this.configToDatasetLayer(layer));
  }
  
  /**
   * Convert manifest config to DatasetLayer
   */
  private configToDatasetLayer(config: RasterLayerConfig): DatasetLayer {
    return {
      id: `raster_${config.id}`,
      title: config.title,
      type: 'image-overlay',
      source: {
        format: 'png',
        path: config.image_path
      },
      style: {
        kind: 'image',
        opacity: 0.7
      },
      bounds: config.bounds,
      year: config.year,
      description: config.description,
      category: this.mapCategory(config.category),
      enabled: true
    };
  }
  
  /**
   * Map manifest category to DatasetLayer category
   */
  private mapCategory(category: string): DatasetLayer['category'] {
    const validCategories: DatasetLayer['category'][] = ['lulc', 'forest', 'built', 'treecover', 'boundary', 'other'];
    if (validCategories.includes(category as DatasetLayer['category'])) {
      return category as DatasetLayer['category'];
    }
    return 'other';
  }
  
  /**
   * Get layers grouped by category
   */
  async getLayersByCategory(): Promise<Map<string, DatasetLayer[]>> {
    const layers = await this.getRasterLayers();
    const grouped = new Map<string, DatasetLayer[]>();
    
    for (const layer of layers) {
      const category = layer.category;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(layer);
    }
    
    // Sort layers within each category by year (if available)
    for (const [, categoryLayers] of grouped) {
      categoryLayers.sort((a, b) => {
        if (a.year && b.year) return a.year - b.year;
        if (a.year) return -1;
        if (b.year) return 1;
        return a.title.localeCompare(b.title);
      });
    }
    
    return grouped;
  }
  
  /**
   * Get category display info
   */
  getCategoryInfo(category: string): { label: string; icon: string; order: number } {
    return CATEGORY_CONFIG[category] || { label: category, icon: '📁', order: 99 };
  }
  
  /**
   * Get ordered category list
   */
  getOrderedCategories(): string[] {
    return Object.entries(CATEGORY_CONFIG)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key]) => key);
  }
  
  /**
   * Get a specific layer by ID
   */
  async getLayer(layerId: string): Promise<DatasetLayer | null> {
    const layers = await this.getRasterLayers();
    return layers.find(l => l.id === layerId) || null;
  }
  
  /**
   * Check if manifest is loaded
   */
  isManifestLoaded(): boolean {
    return this.isLoaded;
  }
  
  /**
   * Get total layer count
   */
  async getLayerCount(): Promise<number> {
    const manifest = await this.loadManifest();
    return manifest?.layers.length || 0;
  }
}

// Export singleton instance
export const rasterLayerService = new RasterLayerService();
export default rasterLayerService;
