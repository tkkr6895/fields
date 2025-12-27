// @ts-ignore - turf types issue with package.json exports
import * as turf from '@turf/turf';
import Papa from 'papaparse';
import type { DatasetLayer, DatasetManifest, DatasetValues } from '../types';
import { getCachedDataset, cacheDataset } from '../db/database';

// Default manifest with layers discovered from workspace
const DEFAULT_MANIFEST: DatasetManifest = {
  region: 'Western Ghats',
  generated: new Date().toISOString(),
  version: '1.0.0',
  layers: [
    // Western Ghats Boundary
    {
      id: 'western_ghats_boundary',
      title: 'Western Ghats Boundary',
      type: 'vector',
      source: { format: 'geojson', path: '/data/boundaries/western_ghats_boundary.geojson' },
      style: { kind: 'polygon', colors: { default: '#4a9eff33' } },
      query: { mode: 'feature_at_point', fields: ['REC_NUM', 'DATA_VALUE'] },
      category: 'boundary',
      enabled: true
    },
    // Dakshina Kannada Boundary
    {
      id: 'dakshina_kannada_boundary',
      title: 'Dakshina Kannada District',
      type: 'vector',
      source: { format: 'geojson', path: '/data/boundaries/dakshina_kannada_boundary.geojson' },
      style: { kind: 'polygon', colors: { default: '#ff9800aa' } },
      query: { mode: 'feature_at_point', fields: [] },
      category: 'boundary',
      enabled: true
    },
    // LULC Composition Data
    {
      id: 'lulc_glc_composition',
      title: 'LULC Composition (GLC 1987-2010)',
      type: 'csv',
      source: { format: 'csv', path: '/data/lulc/dakshina_kannada_lulc_glc_composition.csv' },
      style: { kind: 'categorical', field: 'class_name' },
      query: { mode: 'summary', fields: ['year', 'class_code', 'class_name', 'area_km2', 'percent'] },
      category: 'lulc',
      enabled: true
    },
    // Tree Cover Data
    {
      id: 'tree_cover_glc',
      title: 'Tree Cover (GLC)',
      type: 'csv',
      source: { format: 'csv', path: '/data/lulc/dakshina_kannada_tree_cover_glc.csv' },
      style: { kind: 'choropleth', field: 'tree_cover_pct' },
      query: { mode: 'summary', fields: ['year', 'tree_cover_km2', 'tree_cover_pct'] },
      category: 'lulc',
      enabled: true
    },
    // Built Area Data  
    {
      id: 'built_area_glc',
      title: 'Built Area (GLC)',
      type: 'csv',
      source: { format: 'csv', path: '/data/lulc/dakshina_kannada_built_glc.csv' },
      style: { kind: 'choropleth', field: 'built_pct' },
      query: { mode: 'summary', fields: ['year', 'built_km2', 'built_pct'] },
      category: 'lulc',
      enabled: true
    },
    // Built Area Dynamic World
    {
      id: 'built_area_dw',
      title: 'Built Area (Dynamic World 2018-2025)',
      type: 'csv',
      source: { format: 'csv', path: '/data/lulc/dakshina_kannada_built_dynamic_world.csv' },
      style: { kind: 'choropleth', field: 'built_pct' },
      query: { mode: 'summary', fields: ['year', 'built_km2', 'built_pct'] },
      category: 'lulc',
      enabled: true
    },
    // Forest Typology
    {
      id: 'forest_typology',
      title: 'Forest Typology',
      type: 'csv',
      source: { format: 'csv', path: '/data/forest/dakshina_kannada_forest_typology.csv' },
      style: { kind: 'categorical', field: 'forest_type' },
      query: { mode: 'summary', fields: ['forest_type', 'area_km2', 'percent'] },
      category: 'forest',
      enabled: true
    },
    // CoreStack Blocks
    {
      id: 'corestack_blocks',
      title: 'CoreStack Blocks',
      type: 'csv',
      source: { format: 'csv', path: '/data/corestack/dakshina_kannada_corestack_blocks.csv' },
      style: { kind: 'point' },
      query: { mode: 'feature_at_point', fields: ['block_id', 'block_name', 'district'] },
      category: 'corestack',
      enabled: true
    },
    // Cropping Intensity
    {
      id: 'cropping_intensity',
      title: 'Cropping Intensity Analysis',
      type: 'csv',
      source: { format: 'csv', path: '/data/corestack/cropping_intensity_analysis.csv' },
      style: { kind: 'choropleth', field: 'cropping_intensity_avg' },
      query: { mode: 'summary', fields: ['grid_id', 'mws_id', 'district', 'cropping_intensity_avg', 'cropping_intensity_trend'] },
      category: 'corestack',
      enabled: true
    },
    // Water Balance
    {
      id: 'water_balance',
      title: 'Water Balance Summary',
      type: 'csv',
      source: { format: 'csv', path: '/data/corestack/water_balance_summary.csv' },
      style: { kind: 'choropleth', field: 'balance' },
      query: { mode: 'summary', fields: ['watershed_id', 'precipitation', 'runoff', 'balance'] },
      category: 'corestack',
      enabled: true
    },
    // District Coverage
    {
      id: 'district_coverage',
      title: 'WG District Coverage (CoreStack)',
      type: 'csv',
      source: { format: 'csv', path: '/data/coverage/wg_district_coverage.csv' },
      style: { kind: 'categorical', field: 'corestack_covered' },
      query: { mode: 'summary', fields: ['state', 'district', 'corestack_covered'] },
      category: 'corestack',
      enabled: true
    },
    // District Urbanization
    {
      id: 'district_urbanization',
      title: 'District Urbanization Analysis',
      type: 'csv',
      source: { format: 'csv', path: '/data/analysis/district_urbanization_analysis.csv' },
      style: { kind: 'choropleth', field: 'urbanization_rate' },
      query: { mode: 'summary', fields: ['district', 'state', 'urbanization_rate', 'change_pct'] },
      category: 'other',
      enabled: true
    },
    // Regional Forest Comparison
    {
      id: 'regional_forest_comparison',
      title: 'Regional Forest Comparison',
      type: 'csv',
      source: { format: 'csv', path: '/data/forest/regional_forest_comparison.csv' },
      style: { kind: 'choropleth', field: 'forest_cover_pct' },
      query: { mode: 'summary', fields: ['region', 'forest_cover_pct', 'change_pct'] },
      category: 'forest',
      enabled: true
    }
  ],
  basemaps: [
    {
      id: 'dark',
      type: 'vector',
      title: 'Dark Map',
      offline: true,
      source: 'dark_style'
    },
    {
      id: 'satellite',
      type: 'raster',
      title: 'Satellite',
      offline: false, // Would need tile cache
      source: 'satellite_style'
    }
  ]
};

export class DatasetManager {
  private manifest: DatasetManifest;
  private loadedData: Map<string, unknown> = new Map();
  private geojsonLayers: Map<string, GeoJSON.FeatureCollection> = new Map();

  constructor() {
    this.manifest = DEFAULT_MANIFEST;
  }

  async initialize(): Promise<void> {
    // Try to load custom manifest
    try {
      const response = await fetch('/data/dataset-manifest.json');
      if (response.ok) {
        this.manifest = await response.json();
      }
    } catch {
      console.log('Using default manifest');
    }

    // Preload all enabled layers
    await this.preloadLayers();
  }

  private async preloadLayers(): Promise<void> {
    const enabledLayers = this.manifest.layers.filter(l => l.enabled);
    
    await Promise.all(enabledLayers.map(async (layer) => {
      try {
        // Check cache first
        const cached = await getCachedDataset(layer.id);
        if (cached) {
          this.loadedData.set(layer.id, cached);
          if (layer.source.format === 'geojson') {
            this.geojsonLayers.set(layer.id, cached as GeoJSON.FeatureCollection);
          }
          return;
        }

        // Load from source
        const data = await this.loadLayer(layer);
        if (data) {
          this.loadedData.set(layer.id, data);
          await cacheDataset(layer.id, data);
          
          if (layer.source.format === 'geojson') {
            this.geojsonLayers.set(layer.id, data as GeoJSON.FeatureCollection);
          }
        }
      } catch (error) {
        console.warn(`Failed to load layer ${layer.id}:`, error);
      }
    }));
  }

  private async loadLayer(layer: DatasetLayer): Promise<unknown> {
    const response = await fetch(layer.source.path);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${layer.source.path}`);
    }

    switch (layer.source.format) {
      case 'geojson':
        return await response.json();
      
      case 'csv':
        const text = await response.text();
        const parsed = Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true
        });
        return parsed.data;
      
      default:
        return await response.json();
    }
  }

  getLayers(): DatasetLayer[] {
    return this.manifest.layers;
  }

  getEnabledLayers(): DatasetLayer[] {
    return this.manifest.layers.filter(l => l.enabled);
  }

  getLayerById(id: string): DatasetLayer | undefined {
    return this.manifest.layers.find(l => l.id === id);
  }

  getLayerData(layerId: string): unknown {
    return this.loadedData.get(layerId);
  }

  getGeoJSONLayer(layerId: string): GeoJSON.FeatureCollection | undefined {
    return this.geojsonLayers.get(layerId);
  }

  async getValuesAtPoint(
    lat: number, 
    lon: number, 
    activeLayerIds: string[]
  ): Promise<DatasetValues> {
    const values: DatasetValues = {};
    const point = turf.point([lon, lat]);

    for (const layerId of activeLayerIds) {
      const layer = this.getLayerById(layerId);
      if (!layer) continue;

      const data = this.loadedData.get(layerId);
      if (!data) continue;

      values[layerId] = {};

      // Handle GeoJSON layers - spatial query
      if (layer.source.format === 'geojson' && this.geojsonLayers.has(layerId)) {
        const geojson = this.geojsonLayers.get(layerId)!;
        
        for (const feature of geojson.features) {
          if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
            if (turf.booleanPointInPolygon(point, feature as turf.Feature<turf.Polygon | turf.MultiPolygon>)) {
              // Extract requested fields
              if (layer.query?.fields) {
                for (const field of layer.query.fields) {
                  values[layerId][field] = feature.properties?.[field];
                }
              } else {
                values[layerId] = { ...feature.properties };
              }
              break;
            }
          }
        }
      }
      
      // Handle CSV layers - return latest/summary data
      if (layer.source.format === 'csv' && Array.isArray(data)) {
        // For CSV data, return the most recent year's data as summary
        const records = data as Record<string, unknown>[];
        if (records.length > 0) {
          // Get unique years if available and return latest
          const yearsSet = new Set(records.map(r => r.year).filter(y => y !== undefined));
          const years = Array.from(yearsSet).sort((a, b) => (b as number) - (a as number));
          
          if (years.length > 0) {
            const latestYear = years[0];
            const latestRecords = records.filter(r => r.year === latestYear);
            values[layerId] = {
              _source: 'csv_summary',
              _year: latestYear,
              _recordCount: latestRecords.length,
              _sample: latestRecords.slice(0, 3)
            };
          } else {
            values[layerId] = {
              _source: 'csv_summary',
              _recordCount: records.length,
              _sample: records.slice(0, 3)
            };
          }
        }
      }
    }

    return values;
  }

  async getSummaryAtPoint(
    lat: number, 
    lon: number, 
    activeLayerIds: string[]
  ): Promise<Record<string, unknown>> {
    const summary: Record<string, unknown> = {
      coordinates: { lat, lon },
      layers: {}
    };

    const values = await this.getValuesAtPoint(lat, lon, activeLayerIds);
    
    for (const [layerId, layerValues] of Object.entries(values)) {
      const layer = this.getLayerById(layerId);
      if (layer) {
        (summary.layers as Record<string, unknown>)[layerId] = {
          title: layer.title,
          values: layerValues
        };
      }
    }

    // Add location context
    summary.context = {
      region: this.manifest.region,
      queriedAt: new Date().toISOString()
    };

    return summary;
  }

  // Get summary statistics for a layer
  getLayerStats(layerId: string): Record<string, unknown> | null {
    const data = this.loadedData.get(layerId);
    if (!data || !Array.isArray(data)) return null;

    const records = data as Record<string, unknown>[];
    if (records.length === 0) return null;

    // Get column names
    const columns = Object.keys(records[0]);
    
    // Calculate basic stats
    const stats: Record<string, unknown> = {
      recordCount: records.length,
      columns: columns
    };

    // Get unique years if present
    if ('year' in records[0]) {
      const years = [...new Set(records.map(r => r.year))].sort();
      stats.years = years;
      stats.yearRange = { min: years[0], max: years[years.length - 1] };
    }

    return stats;
  }
}
