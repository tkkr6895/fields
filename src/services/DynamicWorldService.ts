/**
 * Dynamic World Service
 * 
 * Provides POINT-SPECIFIC access to Dynamic World LULC data.
 * 
 * Data sources (in order of preference):
 * 1. Live GEE proxy - Real-time point queries via Google Earth Engine
 * 2. Pre-bundled grid data - Offline point-specific data at ~100m resolution
 * 
 * NO regional/aggregate statistics are shown - only actual point data.
 */

import { getGeeProxyUrl } from './AppConfig';

// Dynamic World land cover classes with metadata
export const DW_CLASSES: Record<number, { name: string; color: string; description: string }> = {
  0: { name: 'Water', color: '#419BDF', description: 'Open water bodies, rivers, lakes' },
  1: { name: 'Trees', color: '#397D49', description: 'Forest, woodland, dense tree cover' },
  2: { name: 'Grass', color: '#88B053', description: 'Grassland, pasture, low vegetation' },
  3: { name: 'Flooded Vegetation', color: '#7A87C6', description: 'Wetlands, marshes, mangroves' },
  4: { name: 'Crops', color: '#E49635', description: 'Agricultural land, cultivated areas' },
  5: { name: 'Shrub and Scrub', color: '#DFC35A', description: 'Shrubland, sparse vegetation' },
  6: { name: 'Built', color: '#C4281B', description: 'Urban areas, buildings, infrastructure' },
  7: { name: 'Bare', color: '#A59B8F', description: 'Bare soil, rock, sand' },
  8: { name: 'Snow and Ice', color: '#B39FE1', description: 'Permanent snow/ice cover' }
};

// Class name to ID mapping
export const DW_CLASS_NAME_TO_ID: Record<string, number> = {
  'water': 0, 'Water': 0,
  'trees': 1, 'Trees': 1,
  'grass': 2, 'Grass': 2,
  'flooded_vegetation': 3, 'Flooded Vegetation': 3,
  'crops': 4, 'Crops': 4,
  'shrub_and_scrub': 5, 'Shrub and Scrub': 5,
  'built': 6, 'Built': 6,
  'bare': 7, 'Bare': 7,
  'snow_and_ice': 8, 'Snow and Ice': 8
};

export interface DynamicWorldPointData {
  lat: number;
  lon: number;
  timestamp: string;
  landCoverClass: string;
  landCoverClassId: number;
  confidence: number;
  probabilities: Record<string, number>;
  source: 'live' | 'offline';
  resolution?: string;
}

// Pre-bundled grid data format
interface OfflineGridCell {
  lat: number;
  lon: number;
  classId: number;
  confidence: number;
  probs?: number[]; // Array of 9 probabilities in class order
}

interface OfflineGridManifest {
  version: string;
  timestamp: string;
  bounds: { north: number; south: number; east: number; west: number };
  resolution: number; // meters
  cellCount: number;
  year: number;
}

interface DynamicWorldMapIdResponse {
  mapid: string;
  token: string;
  urlFormat: string;
}

class DynamicWorldService {
  private offlineGrid: OfflineGridCell[] = [];
  private offlineManifest: OfflineGridManifest | null = null;
  private offlineLoaded: boolean = false;
  private offlineLoading: Promise<void> | null = null;
  private mapIdCache: Map<string, DynamicWorldMapIdResponse> = new Map();

  private getProxyBaseUrl(): string | null {
    return getGeeProxyUrl();
  }

  /**
   * Load pre-bundled offline grid data
   */
  async loadOfflineData(): Promise<void> {
    if (this.offlineLoaded) return;
    if (this.offlineLoading) return this.offlineLoading;

    this.offlineLoading = this._loadOfflineDataInternal();
    return this.offlineLoading;
  }

  private async _loadOfflineDataInternal(): Promise<void> {
    try {
      // Load manifest first
      const manifestResponse = await fetch('/data/dynamicworld/grid-manifest.json');
      if (!manifestResponse.ok) {
        console.warn('[DynamicWorld] Offline grid manifest not found');
        return;
      }
      this.offlineManifest = await manifestResponse.json();
      console.log('[DynamicWorld] Loaded offline manifest:', this.offlineManifest);

      // Load grid data
      const gridResponse = await fetch('/data/dynamicworld/grid-data.json');
      if (!gridResponse.ok) {
        console.warn('[DynamicWorld] Offline grid data not found');
        return;
      }
      this.offlineGrid = await gridResponse.json();
      this.offlineLoaded = true;
      console.log(`[DynamicWorld] Loaded ${this.offlineGrid.length} offline grid points`);
    } catch (error) {
      console.error('[DynamicWorld] Failed to load offline data:', error);
    }
  }

  /**
   * Check if offline data is available
   */
  hasOfflineData(): boolean {
    return this.offlineLoaded && this.offlineGrid.length > 0;
  }

  /**
   * Check if live GEE proxy is configured
   */
  hasLiveAccess(): boolean {
    return this.getProxyBaseUrl() !== null;
  }

  /**
   * Get point data from offline grid using nearest neighbor
   */
  private getOfflinePointData(lat: number, lon: number): DynamicWorldPointData | null {
    if (!this.offlineLoaded || this.offlineGrid.length === 0) return null;

    // Check if point is within bounds
    if (this.offlineManifest) {
      const { bounds } = this.offlineManifest;
      if (lat < bounds.south || lat > bounds.north || lon < bounds.west || lon > bounds.east) {
        return null; // Point outside coverage area
      }
    }

    // Find nearest grid point (simple linear search - could be optimized with spatial index)
    let nearest: OfflineGridCell | null = null;
    let minDist = Infinity;

    for (const cell of this.offlineGrid) {
      const dlat = cell.lat - lat;
      const dlon = cell.lon - lon;
      const dist = dlat * dlat + dlon * dlon;
      if (dist < minDist) {
        minDist = dist;
        nearest = cell;
      }
    }

    if (!nearest) return null;

    // Check if nearest point is within reasonable distance
    // Use grid resolution from manifest (default 500m), with sqrt(2) factor for diagonal distance
    const maxDistMeters = this.offlineManifest 
      ? this.offlineManifest.resolution * 1.5  // 1.5x grid spacing (covers diagonal)
      : 500;
    const distMeters = Math.sqrt(minDist) * 111000; // rough conversion
    if (distMeters > maxDistMeters) {
      return null; // Too far from any grid point
    }

    const className = DW_CLASSES[nearest.classId]?.name || 'Unknown';
    
    // Build probabilities object
    const probabilities: Record<string, number> = {};
    if (nearest.probs && nearest.probs.length === 9) {
      Object.values(DW_CLASSES).forEach((cls, idx) => {
        probabilities[cls.name] = nearest.probs![idx];
      });
    } else {
      // If no probabilities, set the dominant class to confidence value
      Object.values(DW_CLASSES).forEach((cls, idx) => {
        probabilities[cls.name] = idx === nearest.classId ? nearest.confidence : 0;
      });
    }

    return {
      lat: nearest.lat,
      lon: nearest.lon,
      timestamp: this.offlineManifest?.timestamp || 'Unknown',
      landCoverClass: className,
      landCoverClassId: nearest.classId,
      confidence: nearest.confidence,
      probabilities,
      source: 'offline',
      resolution: this.offlineManifest ? `~${this.offlineManifest.resolution}m grid` : 'Unknown'
    };
  }

  /**
   * Fetch Dynamic World data for a specific point
   * 
   * Tries live GEE proxy first, falls back to offline grid data.
   * Returns NULL if no data available - never shows misleading regional stats.
   */
  async fetchPointData(lat: number, lon: number, date?: string): Promise<DynamicWorldPointData | null> {
    // Try live GEE proxy first
    const base = this.getProxyBaseUrl();
    if (base) {
      try {
        // If base is relative (e.g. '/api/dw'), make it absolute for URL constructor
        const absoluteBase = base.startsWith('http') ? base : `${window.location.origin}${base}`;
        const url = new URL(`${absoluteBase}/dynamicworld/point`);
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lon', String(lon));
        if (date) url.searchParams.set('date', date);

        const response = await fetch(url.toString(), { 
          signal: AbortSignal.timeout(10000) // 10s timeout
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data && typeof data.landCoverClass === 'string') {
            return {
              ...data,
              landCoverClassId: DW_CLASS_NAME_TO_ID[data.landCoverClass] ?? -1,
              source: 'live',
              resolution: '10m (Sentinel-2)'
            };
          }
        }
      } catch (err) {
        console.warn('[DynamicWorld] Live fetch failed, trying offline:', err);
      }
    }

    // Fall back to offline grid data
    await this.loadOfflineData();
    return this.getOfflinePointData(lat, lon);
  }

  /**
   * Check if point-specific data is potentially available
   * (either via live proxy or offline grid)
   */
  isPointDataAvailable(): boolean {
    return this.hasLiveAccess() || this.hasOfflineData();
  }

  /**
   * Get data source status for UI display
   */
  getDataSourceStatus(): {
    mode: 'live' | 'offline' | 'unavailable';
    message: string;
    coverage?: string;
  } {
    if (this.hasLiveAccess()) {
      return {
        mode: 'live',
        message: 'Real-time data via Google Earth Engine',
        coverage: 'Global, 10m resolution'
      };
    }
    
    if (this.hasOfflineData() && this.offlineManifest) {
      const { bounds, resolution, year } = this.offlineManifest;
      return {
        mode: 'offline',
        message: `Pre-bundled ${year} data`,
        coverage: `${bounds.south.toFixed(2)}°-${bounds.north.toFixed(2)}°N, ${bounds.west.toFixed(2)}°-${bounds.east.toFixed(2)}°E, ~${resolution}m grid`
      };
    }

    return {
      mode: 'unavailable',
      message: 'No Dynamic World data available. Configure GEE proxy or generate offline grid.'
    };
  }

  /**
   * Get an XYZ tile template for a live Dynamic World layer.
   * Returned string is a full urlFormat suitable for MapLibre raster tiles.
   */
  async getLiveTileUrlTemplate(date?: string): Promise<string | null> {
    const base = this.getProxyBaseUrl();
    if (!base) return null;

    const cacheKey = date || 'latest';
    const cached = this.mapIdCache.get(cacheKey);
    if (cached?.urlFormat) return cached.urlFormat;

    try {
      const absoluteBase = base.startsWith('http') ? base : `${window.location.origin}${base}`;
      const url = new URL(`${absoluteBase}/dynamicworld/mapid`);
      if (date) url.searchParams.set('date', date);

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Dynamic World proxy error (${response.status}): ${text || response.statusText}`);
      }

      const data = (await response.json()) as DynamicWorldMapIdResponse;
      if (!data?.urlFormat) return null;
      this.mapIdCache.set(cacheKey, data);
      return data.urlFormat;
    } catch (err) {
      console.error('[DynamicWorld] Failed to get tile URL:', err);
      return null;
    }
  }

  /**
   * Get class info by ID
   */
  getClassInfo(classId: number): { name: string; color: string; description: string } | null {
    return DW_CLASSES[classId] || null;
  }

  /**
   * Get class info by name
   */
  getClassInfoByName(className: string): { name: string; color: string; description: string; id: number } | null {
    const id = DW_CLASS_NAME_TO_ID[className];
    if (id === undefined) return null;
    const info = DW_CLASSES[id];
    return info ? { ...info, id } : null;
  }
}

export const dynamicWorldService = new DynamicWorldService();
