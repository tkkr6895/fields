/**
 * Location Data Service
 * 
 * Centralized service for fetching location-specific data from:
 * 1. Local cached datasets (GeoJSON, CSV, rasters)
 * 2. CoreStack API (admin, watershed, indicators)
 * 3. Dynamic World (LULC) - local cache + GEE API
 * 4. Weather API
 * 
 * CRITICAL: This service ONLY returns authentic data.
 * - Uses point-in-polygon with actual boundary GeoJSONs for admin data
 * - Never estimates or synthesizes data
 * - Clearly marks data sources and indicates when data is unavailable
 */

// @ts-ignore - turf types issue with package.json exports
import * as turf from '@turf/turf';
import { DatasetManager } from './DatasetManager';
import { coreStackService } from './CoreStackService';
import { dynamicWorldService } from './DynamicWorldService';
import { weatherService, WeatherData } from './WeatherService';
import type { DatasetValues } from '../types';

// Boundary data for point-in-polygon checks
interface BoundaryData {
  id: string;
  geojson: GeoJSON.FeatureCollection | null;
  loaded: boolean;
}

export interface LocationEnrichment {
  coordinates: { lat: number; lon: number };
  timestamp: string;
  
  // Administrative data - ONLY from authentic sources
  admin?: {
    state?: string;
    district?: string;
    tehsil?: string;
    village?: string;
    block?: string;
    source: 'boundary_geojson' | 'corestack_api' | 'corestack_local';
    confidence: 'verified' | 'approximate';
  };
  
  // Land cover data - ONLY from authentic sources
  landCover?: {
    // Regional summary data (from local CSV)
    regionalSummary?: {
      dominantClass: string;
      trees: number;
      crops: number;
      built: number;
      water: number;
      shrubAndScrub: number;
      grass: number;
      bare: number;
      year: number;
    };
    // Note: Point-specific LULC requires GEE integration (not available offline)
    pointDataAvailable: boolean;
    source: 'dynamicworld_regional' | 'dynamicworld_point' | 'unavailable';
    note?: string;
  };
  
  // Watershed data
  watershed?: {
    mwsId?: string;
    name?: string;
    indicators?: Record<string, unknown>;
    source: 'corestack_local' | 'corestack_api';
  };
  
  // Weather
  weather?: WeatherData;
  
  // Local datasets
  localData?: DatasetValues;
  
  // Status
  isOnline: boolean;
  errors: string[];
  warnings: string[];
}

class LocationDataService {
  private datasetManager: DatasetManager;
  private initialized = false;
  
  // Cached boundary data for point-in-polygon checks
  private boundaries: Map<string, BoundaryData> = new Map([
    ['dakshina_kannada', { id: 'dakshina_kannada', geojson: null, loaded: false }],
    ['western_ghats', { id: 'western_ghats', geojson: null, loaded: false }]
  ]);
  
  // Local CoreStack data cache
  private localCoreStackData: {
    blocks: Array<{ state: string; district: string; block: string; block_id?: string; raw?: string }>;
    loaded: boolean;
  } = { blocks: [], loaded: false };
  
  constructor() {
    this.datasetManager = new DatasetManager();
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Initialize dataset manager
    await this.datasetManager.initialize();
    
    // Load boundary GeoJSONs for point-in-polygon checks
    await this.loadBoundaries();
    
    // Load local CoreStack data
    await this.loadLocalCoreStackData();
    
    // Load Dynamic World cache
    await dynamicWorldService.loadCachedData();
    
    this.initialized = true;
  }
  
  /**
   * Load boundary GeoJSONs for authentic point-in-polygon admin lookups
   */
  private async loadBoundaries(): Promise<void> {
    const boundaryPaths: Record<string, string> = {
      'dakshina_kannada': '/data/boundaries/dakshina_kannada_boundary.geojson',
      'western_ghats': '/data/boundaries/western_ghats_boundary.geojson'
    };
    
    for (const [id, path] of Object.entries(boundaryPaths)) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const geojson = await response.json();
          this.boundaries.set(id, { id, geojson, loaded: true });
          console.log(`[LocationDataService] Loaded boundary: ${id}`);
        }
      } catch (err) {
        console.warn(`[LocationDataService] Failed to load boundary ${id}:`, err);
      }
    }
  }
  
  /**
   * Load local CoreStack CSV data
   */
  private async loadLocalCoreStackData(): Promise<void> {
    try {
      const response = await fetch('/data/corestack/dakshina_kannada_corestack_blocks.csv');
      if (response.ok) {
        const text = await response.text();
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',');
        
        this.localCoreStackData.blocks = lines.slice(1).map(line => {
          const values = line.split(',');
          const record: Record<string, string> = {};
          headers.forEach((h, i) => {
            record[h.trim()] = values[i]?.trim() || '';
          });
          
          // Parse raw JSON if present to extract block_id
          if (record.raw) {
            try {
              const rawData = JSON.parse(record.raw.replace(/^"|"$/g, '').replace(/""/g, '"'));
              record.block_id = rawData.block_id?.toString();
            } catch {
              // Ignore JSON parse errors
            }
          }
          
          return record as { state: string; district: string; block: string; block_id?: string; raw?: string };
        });
        
        this.localCoreStackData.loaded = true;
        console.log(`[LocationDataService] Loaded ${this.localCoreStackData.blocks.length} CoreStack blocks`);
      }
    } catch (err) {
      console.warn('[LocationDataService] Failed to load CoreStack blocks:', err);
    }
  }
  
  /**
   * Check if a point is inside a boundary using authentic point-in-polygon
   */
  private isPointInBoundary(lat: number, lon: number, boundaryId: string): { inside: boolean; properties?: Record<string, unknown> } {
    const boundary = this.boundaries.get(boundaryId);
    if (!boundary?.geojson || !boundary.loaded) {
      return { inside: false };
    }
    
    const point = turf.point([lon, lat]);
    
    for (const feature of boundary.geojson.features) {
      if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        try {
          if (turf.booleanPointInPolygon(point, feature as turf.Feature<turf.Polygon | turf.MultiPolygon>)) {
            return { inside: true, properties: feature.properties || {} };
          }
        } catch (err) {
          console.warn(`Point-in-polygon check failed for ${boundaryId}:`, err);
        }
      }
    }
    
    return { inside: false };
  }
  
  /**
   * Get comprehensive location data from all available sources
   * ONLY returns authentic data - never estimates or synthesizes
   */
  async enrichLocation(lat: number, lon: number, isOnline: boolean = navigator.onLine): Promise<LocationEnrichment> {
    await this.initialize();
    
    const result: LocationEnrichment = {
      coordinates: { lat, lon },
      timestamp: new Date().toISOString(),
      isOnline,
      errors: [],
      warnings: []
    };
    
    // Fetch all data in parallel
    const [localData, adminData, landCoverData, watershedData, weatherData] = await Promise.allSettled([
      this.getLocalData(lat, lon),
      this.getAdminData(lat, lon, isOnline),
      this.getLandCoverData(lat, lon, isOnline),
      this.getWatershedData(lat, lon, isOnline),
      isOnline ? weatherService.getWeather(lat, lon) : Promise.resolve(null)
    ]);
    
    // Process local data
    if (localData.status === 'fulfilled' && localData.value) {
      result.localData = localData.value;
    } else if (localData.status === 'rejected') {
      result.errors.push(`Local data: ${localData.reason}`);
    }
    
    // Process admin data
    if (adminData.status === 'fulfilled' && adminData.value) {
      result.admin = adminData.value;
    } else if (adminData.status === 'rejected') {
      result.errors.push(`Admin data: ${adminData.reason}`);
    }
    
    // Process land cover data
    if (landCoverData.status === 'fulfilled' && landCoverData.value) {
      result.landCover = landCoverData.value;
    } else if (landCoverData.status === 'rejected') {
      result.errors.push(`Land cover: ${landCoverData.reason}`);
    }
    
    // Process watershed data
    if (watershedData.status === 'fulfilled' && watershedData.value) {
      result.watershed = watershedData.value;
    } else if (watershedData.status === 'rejected') {
      result.errors.push(`Watershed: ${watershedData.reason}`);
    }
    
    // Process weather
    if (weatherData.status === 'fulfilled' && weatherData.value) {
      result.weather = weatherData.value;
    }
    
    return result;
  }
  
  /**
   * Get data from local datasets
   */
  private async getLocalData(lat: number, lon: number): Promise<DatasetValues | null> {
    const layers = this.datasetManager.getLayers();
    const allLayerIds = layers.map(l => l.id);
    return this.datasetManager.getValuesAtPoint(lat, lon, allLayerIds);
  }
  
  /**
   * Get administrative data using AUTHENTIC sources only:
   * 1. CoreStack API (most detailed - state, district, tehsil)
   * 2. Local boundary GeoJSONs (verified point-in-polygon)
   * 3. Local CoreStack blocks CSV
   * 
   * NEVER estimates or uses bounding boxes
   */
  private async getAdminData(lat: number, lon: number, isOnline: boolean): Promise<LocationEnrichment['admin'] | null> {
    // Try CoreStack API first if online (most accurate)
    if (isOnline && coreStackService.hasApiKey()) {
      try {
        const admin = await coreStackService.getAdminDetailsByLatLon(lat, lon);
        if (admin && (admin.state_name || admin.district_name)) {
          return {
            state: admin.state_name,
            district: admin.district_name,
            tehsil: admin.tehsil_name,
            source: 'corestack_api',
            confidence: 'verified'
          };
        }
      } catch (err) {
        console.warn('[LocationDataService] CoreStack API admin fetch failed:', err);
      }
    }
    
    // Fallback to LOCAL boundary GeoJSONs with authentic point-in-polygon
    // Check Dakshina Kannada first (more specific)
    const dkCheck = this.isPointInBoundary(lat, lon, 'dakshina_kannada');
    if (dkCheck.inside && dkCheck.properties) {
      // Extract admin info from boundary properties
      const state = dkCheck.properties.ST_NM as string || dkCheck.properties.state as string;
      const district = dkCheck.properties.DISTRICT as string || dkCheck.properties.district as string;
      
      // Check if we have local CoreStack block data for more detail
      const localBlock = this.getLocalBlockData(district);
      
      return {
        state: state || 'Karnataka',
        district: district || 'Dakshina Kannada',
        block: localBlock?.block,
        source: 'boundary_geojson',
        confidence: 'verified'
      };
    }
    
    // Check Western Ghats boundary
    const wgCheck = this.isPointInBoundary(lat, lon, 'western_ghats');
    if (wgCheck.inside) {
      return {
        state: 'Within Western Ghats',
        source: 'boundary_geojson',
        confidence: 'verified'
      };
    }
    
    // Point is outside all known boundaries - return null (no data available)
    // DO NOT estimate or guess
    return null;
  }
  
  /**
   * Get local CoreStack block data for a district
   */
  private getLocalBlockData(district: string): { block: string; block_id?: string } | null {
    if (!this.localCoreStackData.loaded) return null;
    
    const normalizedDistrict = district.toLowerCase().replace(/\s+/g, ' ').trim();
    const match = this.localCoreStackData.blocks.find(b => 
      b.district.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedDistrict
    );
    
    return match ? { block: match.block, block_id: match.block_id } : null;
  }
  
  /**
   * Get land cover data - ONLY from authentic sources
   * 
   * Available data:
   * - Regional summary from Dynamic World CSV (Western Ghats wide)
   * - Point-specific data requires GEE API (online only, not implemented)
   * 
   * NEVER synthesizes point-specific data from regional stats
   */
  private async getLandCoverData(_lat: number, _lon: number, _isOnline: boolean): Promise<LocationEnrichment['landCover'] | null> {
    try {
      await dynamicWorldService.loadCachedData();
      const latestStats = dynamicWorldService.getRegionalStats();
      
      if (latestStats) {
        // Calculate percentages from area data
        const total = latestStats.water + latestStats.trees + latestStats.grass + 
                     latestStats.floodedVegetation + latestStats.crops + 
                     latestStats.shrubAndScrub + latestStats.built + 
                     latestStats.bare + latestStats.snowAndIce;
        
        if (total > 0) {
          const classes: Record<string, number> = {
            'Water': (latestStats.water / total) * 100,
            'Trees': (latestStats.trees / total) * 100,
            'Grass': (latestStats.grass / total) * 100,
            'Flooded Vegetation': (latestStats.floodedVegetation / total) * 100,
            'Crops': (latestStats.crops / total) * 100,
            'Shrub and Scrub': (latestStats.shrubAndScrub / total) * 100,
            'Built': (latestStats.built / total) * 100,
            'Bare': (latestStats.bare / total) * 100
          };
          
          // Find dominant class
          let dominantClass = 'Trees';
          let maxPct = 0;
          for (const [cls, pct] of Object.entries(classes)) {
            if (pct > maxPct) {
              maxPct = pct;
              dominantClass = cls;
            }
          }
          
          return {
            regionalSummary: {
              dominantClass,
              trees: classes['Trees'],
              crops: classes['Crops'],
              built: classes['Built'],
              water: classes['Water'],
              shrubAndScrub: classes['Shrub and Scrub'],
              grass: classes['Grass'],
              bare: classes['Bare'],
              year: latestStats.year
            },
            pointDataAvailable: false,
            source: 'dynamicworld_regional',
            note: 'Regional average for Western Ghats. Point-specific LULC requires Google Earth Engine API integration.'
          };
        }
      }
    } catch (err) {
      console.warn('[LocationDataService] Dynamic World data fetch failed:', err);
    }
    
    return {
      pointDataAvailable: false,
      source: 'unavailable',
      note: 'No LULC data available for this location'
    };
  }
  
  /**
   * Get watershed data from CoreStack API
   * Local watershed data not available - requires API
   */
  private async getWatershedData(lat: number, lon: number, isOnline: boolean): Promise<LocationEnrichment['watershed'] | null> {
    if (!isOnline || !coreStackService.hasApiKey()) {
      return null;
    }
    
    try {
      const mwsResult = await coreStackService.getMWSIdByLatLon(lat, lon);
      if (mwsResult && mwsResult.mws_id) {
        const indicators = await coreStackService.getMWSKYLIndicators(mwsResult.mws_id).catch(() => []);
        
        const indicatorMap: Record<string, unknown> = {};
        for (const ind of indicators) {
          indicatorMap[ind.indicator_name] = ind.value;
        }
        
        return {
          mwsId: mwsResult.mws_id,
          indicators: indicatorMap,
          source: 'corestack_api'
        };
      }
    } catch (err) {
      console.warn('[LocationDataService] Watershed data fetch failed:', err);
    }
    
    return null;
  }
  
  /**
   * Get formatted data for display in UI
   * Clearly indicates data sources and availability
   */
  formatForDisplay(enrichment: LocationEnrichment): Record<string, Record<string, string | number>> {
    const formatted: Record<string, Record<string, string | number>> = {};
    
    // Location
    formatted['📍 Location'] = {
      'Coordinates': `${enrichment.coordinates.lat.toFixed(6)}, ${enrichment.coordinates.lon.toFixed(6)}`,
      'Queried': new Date(enrichment.timestamp).toLocaleString('en-IN')
    };
    
    // Administrative - clearly show source
    if (enrichment.admin) {
      formatted['🏛️ Administrative'] = {};
      if (enrichment.admin.state) formatted['🏛️ Administrative']['State'] = enrichment.admin.state;
      if (enrichment.admin.district) formatted['🏛️ Administrative']['District'] = enrichment.admin.district;
      if (enrichment.admin.tehsil) formatted['🏛️ Administrative']['Tehsil'] = enrichment.admin.tehsil;
      if (enrichment.admin.block) formatted['🏛️ Administrative']['Block'] = enrichment.admin.block;
      
      // Show source clearly
      const sourceLabel = enrichment.admin.source === 'corestack_api' ? 'CoreStack API' :
                         enrichment.admin.source === 'boundary_geojson' ? 'Local Boundary Data' :
                         'Local CoreStack Data';
      formatted['🏛️ Administrative']['Source'] = sourceLabel;
      formatted['🏛️ Administrative']['Confidence'] = enrichment.admin.confidence === 'verified' ? '✓ Verified' : '~ Approximate';
    } else {
      formatted['🏛️ Administrative'] = {
        'Status': 'No data available for this location'
      };
    }
    
    // Land Cover - clearly distinguish regional vs point data
    if (enrichment.landCover) {
      if (enrichment.landCover.regionalSummary) {
        formatted['🌍 Land Cover (Dynamic World)'] = {
          '⚠️ Data Type': 'REGIONAL AVERAGE (Western Ghats)',
          'Year': enrichment.landCover.regionalSummary.year,
          '🌳 Trees': `${enrichment.landCover.regionalSummary.trees.toFixed(1)}%`,
          '🌾 Crops': `${enrichment.landCover.regionalSummary.crops.toFixed(1)}%`,
          '🏘️ Built': `${enrichment.landCover.regionalSummary.built.toFixed(1)}%`,
          '🌿 Shrub & Scrub': `${enrichment.landCover.regionalSummary.shrubAndScrub.toFixed(1)}%`,
          '💧 Water': `${enrichment.landCover.regionalSummary.water.toFixed(1)}%`,
          '🌱 Grass': `${enrichment.landCover.regionalSummary.grass.toFixed(1)}%`
        };
        if (enrichment.landCover.note) {
          formatted['🌍 Land Cover (Dynamic World)']['ℹ️ Note'] = enrichment.landCover.note;
        }
      } else if (enrichment.landCover.note) {
        formatted['🌍 Land Cover (Dynamic World)'] = {
          'Status': enrichment.landCover.note
        };
      }
    }
    
    // Watershed
    if (enrichment.watershed) {
      formatted['💧 Watershed (CoreStack)'] = {
        'MWS ID': enrichment.watershed.mwsId || '-',
        'Source': 'CoreStack API'
      };
      if (enrichment.watershed.indicators) {
        for (const [key, value] of Object.entries(enrichment.watershed.indicators)) {
          formatted['💧 Watershed (CoreStack)'][key] = value as string | number;
        }
      }
    }
    
    // Weather
    if (enrichment.weather) {
      formatted['🌤️ Weather'] = {
        'Temperature': `${enrichment.weather.current.temperature}°C`,
        'Humidity': `${enrichment.weather.current.humidity}%`,
        'Conditions': enrichment.weather.current.weatherDescription,
        'Wind': `${enrichment.weather.current.windSpeed} km/h`,
        'Precipitation': `${enrichment.weather.current.precipitation} mm`,
        'Source': 'Open-Meteo API'
      };
    }
    
    // Warnings
    if (enrichment.warnings && enrichment.warnings.length > 0) {
      formatted['⚠️ Warnings'] = {};
      enrichment.warnings.forEach((w, i) => {
        formatted['⚠️ Warnings'][`Warning ${i + 1}`] = w;
      });
    }
    
    return formatted;
  }
}

export const locationDataService = new LocationDataService();
