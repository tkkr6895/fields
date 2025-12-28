/**
 * Location Data Service
 * 
 * Centralized service for fetching location-specific data from:
 * 1. Local cached datasets (GeoJSON, CSV, rasters)
 * 2. CoreStack API (admin, watershed, indicators)
 * 3. Dynamic World (LULC) - local cache + GEE API
 * 4. Weather API
 * 
 * Prioritizes local data and falls back to API when needed.
 */

import { DatasetManager } from './DatasetManager';
import { coreStackService } from './CoreStackService';
import { dynamicWorldService } from './DynamicWorldService';
import { weatherService, WeatherData } from './WeatherService';
import type { DatasetValues } from '../types';

export interface LocationEnrichment {
  coordinates: { lat: number; lon: number };
  timestamp: string;
  
  // Administrative data
  admin?: {
    state?: string;
    district?: string;
    tehsil?: string;
    village?: string;
    source: 'local' | 'corestack';
  };
  
  // Land cover data
  landCover?: {
    dominantClass?: string;
    trees?: number;
    crops?: number;
    built?: number;
    water?: number;
    shrubAndScrub?: number;
    grass?: number;
    bare?: number;
    year?: number;
    source: 'local' | 'dynamicworld' | 'estimated';
  };
  
  // Watershed data
  watershed?: {
    mwsId?: string;
    name?: string;
    indicators?: Record<string, unknown>;
    source: 'local' | 'corestack';
  };
  
  // Weather
  weather?: WeatherData;
  
  // Local datasets
  localData?: DatasetValues;
  
  // Status
  isOnline: boolean;
  errors: string[];
}

class LocationDataService {
  private datasetManager: DatasetManager;
  private initialized = false;
  
  constructor() {
    this.datasetManager = new DatasetManager();
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.datasetManager.initialize();
    await dynamicWorldService.loadCachedData();
    this.initialized = true;
  }
  
  /**
   * Get comprehensive location data from all available sources
   */
  async enrichLocation(lat: number, lon: number, isOnline: boolean = navigator.onLine): Promise<LocationEnrichment> {
    await this.initialize();
    
    const result: LocationEnrichment = {
      coordinates: { lat, lon },
      timestamp: new Date().toISOString(),
      isOnline,
      errors: []
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
   * Get administrative data - prefer CoreStack API, fallback to local
   */
  private async getAdminData(lat: number, lon: number, isOnline: boolean): Promise<LocationEnrichment['admin'] | null> {
    // Try CoreStack API first if online
    if (isOnline && coreStackService.hasApiKey()) {
      try {
        const admin = await coreStackService.getAdminDetailsByLatLon(lat, lon);
        if (admin && (admin.state_name || admin.district_name)) {
          return {
            state: admin.state_name,
            district: admin.district_name,
            tehsil: admin.tehsil_name,
            source: 'corestack'
          };
        }
      } catch (err) {
        console.warn('CoreStack admin fetch failed:', err);
      }
    }
    
    // Fallback to local data - check boundaries
    // For now, just indicate the location is in Western Ghats region
    // Full boundary checks would require @turf/turf for point-in-polygon
    try {
      // Simplified boundary check using approximate bounding box
      // Western Ghats approximate bounds: 8°N-21°N, 73°E-78°E
      const isInWesternGhats = lat >= 8 && lat <= 21 && lon >= 73 && lon <= 78;
      
      if (isInWesternGhats) {
        // More specific: Dakshina Kannada district approx bounds
        const isInDK = lat >= 12.5 && lat <= 13.5 && lon >= 74.5 && lon <= 75.8;
        
        if (isInDK) {
          return {
            state: 'Karnataka',
            district: 'Dakshina Kannada (estimated)',
            source: 'local'
          };
        }
        
        return {
          state: 'Western Ghats Region',
          source: 'local'
        };
      }
    } catch (err) {
      console.warn('Local admin check failed:', err);
    }
    
    return null;
  }
  
  /**
   * Get land cover data for a specific point
   */
  private async getLandCoverData(_lat: number, _lon: number, _isOnline: boolean): Promise<LocationEnrichment['landCover'] | null> {
    // First, try to get point-specific data from Dynamic World
    // The current implementation only has regional stats, so we estimate
    // TODO: Implement point-specific LULC query when GEE integration is available
    
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
            dominantClass,
            trees: classes['Trees'],
            crops: classes['Crops'],
            built: classes['Built'],
            water: classes['Water'],
            shrubAndScrub: classes['Shrub and Scrub'],
            grass: classes['Grass'],
            bare: classes['Bare'],
            year: latestStats.year,
            source: 'estimated'  // Regional estimate, not point-specific
          };
        }
      }
    } catch (err) {
      console.warn('Dynamic World data fetch failed:', err);
    }
    
    return null;
  }
  
  /**
   * Get watershed data from CoreStack
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
          source: 'corestack'
        };
      }
    } catch (err) {
      console.warn('Watershed data fetch failed:', err);
    }
    
    return null;
  }
  
  /**
   * Get formatted data for display in UI
   */
  formatForDisplay(enrichment: LocationEnrichment): Record<string, Record<string, string | number>> {
    const formatted: Record<string, Record<string, string | number>> = {};
    
    // Location
    formatted['📍 Location'] = {
      'Coordinates': `${enrichment.coordinates.lat.toFixed(6)}, ${enrichment.coordinates.lon.toFixed(6)}`,
      'Queried': new Date(enrichment.timestamp).toLocaleString('en-IN')
    };
    
    // Administrative
    if (enrichment.admin) {
      formatted['🏛️ Administrative'] = {};
      if (enrichment.admin.state) formatted['🏛️ Administrative']['State'] = enrichment.admin.state;
      if (enrichment.admin.district) formatted['🏛️ Administrative']['District'] = enrichment.admin.district;
      if (enrichment.admin.tehsil) formatted['🏛️ Administrative']['Tehsil'] = enrichment.admin.tehsil;
      formatted['🏛️ Administrative']['Source'] = enrichment.admin.source;
    }
    
    // Land Cover
    if (enrichment.landCover) {
      formatted['🌍 Land Cover (Dynamic World)'] = {
        'Dominant Class': enrichment.landCover.dominantClass || '-',
        'Trees': `${(enrichment.landCover.trees || 0).toFixed(1)}%`,
        'Crops': `${(enrichment.landCover.crops || 0).toFixed(1)}%`,
        'Built': `${(enrichment.landCover.built || 0).toFixed(1)}%`,
        'Shrub & Scrub': `${(enrichment.landCover.shrubAndScrub || 0).toFixed(1)}%`,
        'Year': enrichment.landCover.year || '-',
        'Note': enrichment.landCover.source === 'estimated' ? 'Regional average - actual may vary' : 'Point-specific data'
      };
    }
    
    // Watershed
    if (enrichment.watershed) {
      formatted['💧 Watershed (CoreStack)'] = {
        'MWS ID': enrichment.watershed.mwsId || '-'
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
        'Precipitation': `${enrichment.weather.current.precipitation} mm`
      };
    }
    
    return formatted;
  }
}

export const locationDataService = new LocationDataService();
