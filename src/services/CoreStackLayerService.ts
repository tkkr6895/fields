/**
 * CoreStack Layer Service
 * 
 * Fetches dynamic vector layers from CoreStack GeoServer and provides them for map display.
 * This is the core integration that enables CoreStack data visualization on the map.
 */

import { coreStackService } from './CoreStackService';

// Use Vite proxy in development to avoid CORS issues
const isDev = import.meta.env.DEV;
const CORESTACK_API_BASE = isDev ? '/api/corestack' : 'https://api-doc.core-stack.org/api/v1';

export interface CoreStackLayer {
  id: string;
  name: string;
  type: 'vector' | 'raster';
  url: string;
  styleUrl?: string;
  geeAssetPath?: string;
  version: string;
  category: 'corestack';
  // Admin context
  state: string;
  district: string;
  tehsil: string;
}

export interface CoreStackGeoJSON {
  type: 'FeatureCollection';
  features: GeoJSON.Feature[];
  crs?: {
    type: string;
    properties: { name: string };
  };
}

// Cache for loaded layers
const layerCache = new Map<string, CoreStackLayer[]>();
const geoJSONCache = new Map<string, CoreStackGeoJSON>();

class CoreStackLayerService {
  private isLoading = false;
  private loadError: string | null = null;

  /**
   * Get layers for a specific location (state/district/tehsil)
   */
  async getLayersForLocation(
    state: string,
    district: string,
    tehsil: string
  ): Promise<CoreStackLayer[]> {
    const cacheKey = `${state}|${district}|${tehsil}`.toLowerCase();
    
    // Check cache first
    if (layerCache.has(cacheKey)) {
      return layerCache.get(cacheKey)!;
    }

    if (!coreStackService.isAvailable()) {
      console.warn('[CoreStackLayer] Service not available (offline or no API key)');
      return [];
    }

    this.isLoading = true;
    this.loadError = null;

    try {
      console.log(`[CoreStackLayer] Fetching layers for ${state}/${district}/${tehsil}`);
      
      // Call the API via proxy (to bypass CORS)
      const response = await fetch(
        `${CORESTACK_API_BASE}/get_generated_layer_urls/?state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}&tehsil=${encodeURIComponent(tehsil)}`,
        {
          headers: {
            'Accept': 'application/json',
            'X-API-Key': coreStackService['apiKey'] || 'x0bXxURa.B9Qgfxd0aKxxJ8GIDHA5FCSIAc52hFgg'
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[CoreStackLayer] No layers found for ${state}/${district}/${tehsil}`);
          layerCache.set(cacheKey, []);
          return [];
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[CoreStackLayer] API response:', data);

      // Transform API response to our layer format
      const layers: CoreStackLayer[] = Array.isArray(data) ? data.map((item: any, index: number) => ({
        id: `corestack_${state}_${district}_${tehsil}_${item.layer_name || index}`.toLowerCase().replace(/\s+/g, '_'),
        name: item.layer_name || `Layer ${index + 1}`,
        type: (item.layer_type || 'vector').toLowerCase() as 'vector' | 'raster',
        url: item.layer_url || '',
        styleUrl: item.style_url,
        geeAssetPath: item.gee_asset_path,
        version: item.layer_version || '1.0',
        category: 'corestack',
        state,
        district,
        tehsil
      })) : [];

      layerCache.set(cacheKey, layers);
      console.log(`[CoreStackLayer] Loaded ${layers.length} layers`);
      
      return layers;
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : 'Unknown error';
      console.error('[CoreStackLayer] Failed to fetch layers:', err);
      return [];
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get layers by lat/lon (first determines admin area)
   */
  async getLayersAtPoint(lat: number, lon: number): Promise<CoreStackLayer[]> {
    if (!coreStackService.isAvailable()) {
      return [];
    }

    try {
      // First get admin details for this location
      const adminDetails = await coreStackService.getAdminDetailsByLatLon(lat, lon);
      
      if (!adminDetails.state_name || !adminDetails.district_name || !adminDetails.tehsil_name) {
        console.log('[CoreStackLayer] Location not covered by CoreStack');
        return [];
      }

      return this.getLayersForLocation(
        adminDetails.state_name,
        adminDetails.district_name,
        adminDetails.tehsil_name
      );
    } catch (err) {
      console.error('[CoreStackLayer] Failed to get layers at point:', err);
      return [];
    }
  }

  /**
   * Fetch GeoJSON data from a layer URL
   */
  async fetchLayerGeoJSON(layer: CoreStackLayer): Promise<CoreStackGeoJSON | null> {
    // Check cache
    if (geoJSONCache.has(layer.id)) {
      return geoJSONCache.get(layer.id)!;
    }

    if (!layer.url) {
      console.warn(`[CoreStackLayer] Layer ${layer.name} has no URL`);
      return null;
    }

    try {
      console.log(`[CoreStackLayer] Fetching GeoJSON for ${layer.name} from ${layer.url}`);
      
      const response = await fetch(layer.url, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const geojson = await response.json();
      
      // Validate it's a feature collection
      if (geojson.type !== 'FeatureCollection') {
        console.warn(`[CoreStackLayer] Unexpected GeoJSON type: ${geojson.type}`);
      }

      geoJSONCache.set(layer.id, geojson);
      console.log(`[CoreStackLayer] Loaded ${geojson.features?.length || 0} features for ${layer.name}`);
      
      return geojson;
    } catch (err) {
      console.error(`[CoreStackLayer] Failed to fetch GeoJSON for ${layer.name}:`, err);
      return null;
    }
  }

  /**
   * Get known Western Ghats locations with CoreStack coverage
   * VERIFIED: These locations are confirmed active in CoreStack API as of Jan 2025
   */
  getKnownLocations(): Array<{ state: string; district: string; tehsil: string; bounds?: [number, number, number, number] }> {
    // ACTUAL CoreStack coverage in Western Ghats region (verified via API)
    return [
      // Maharashtra - Western Ghats (CONFIRMED ACTIVE)
      { 
        state: 'Maharashtra', 
        district: 'Sindhudurg', 
        tehsil: 'Kudal',
        bounds: [73.53, 15.85, 74.0, 16.25] // Approximate bounding box
      },
      { 
        state: 'Maharashtra', 
        district: 'Pune', 
        tehsil: 'Mawal',
        bounds: [73.3, 18.6, 73.8, 19.0]
      },
      { 
        state: 'Maharashtra', 
        district: 'Pune', 
        tehsil: 'Khed',
        bounds: [73.3, 18.8, 73.9, 19.3]
      },
      { 
        state: 'Maharashtra', 
        district: 'Pune', 
        tehsil: 'Haveli',
        bounds: [73.7, 18.3, 74.1, 18.7]
      },
      { 
        state: 'Maharashtra', 
        district: 'Satara', 
        tehsil: 'Mahabaleshwar',
        bounds: [73.5, 17.8, 73.8, 18.1]
      },
      // Rajasthan - Aravalli range edge (also in API)
      { 
        state: 'Rajasthan', 
        district: 'Sirohi', 
        tehsil: 'Abu Road',
        bounds: [72.6, 24.4, 73.0, 24.8]
      },
      { 
        state: 'Rajasthan', 
        district: 'Udaipur', 
        tehsil: 'Girwa',
        bounds: [73.5, 24.4, 73.9, 24.8]
      },
    ];
  }

  /**
   * Check if a coordinate falls within any known CoreStack coverage area
   */
  isPointInCoverage(lat: number, lon: number): { covered: boolean; location?: { state: string; district: string; tehsil: string } } {
    const locations = this.getKnownLocations();
    
    for (const loc of locations) {
      if (loc.bounds) {
        const [minLon, minLat, maxLon, maxLat] = loc.bounds;
        if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
          return { covered: true, location: loc };
        }
      }
    }
    
    return { covered: false };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    layerCache.clear();
    geoJSONCache.clear();
  }

  /**
   * Get loading status
   */
  getStatus(): { isLoading: boolean; error: string | null } {
    return {
      isLoading: this.isLoading,
      error: this.loadError
    };
  }
}

export const coreStackLayerService = new CoreStackLayerService();
