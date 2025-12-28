// Types for the Field Validator App

export interface LocationData {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp?: number;
  altitude?: number;
}

export interface DatasetLayer {
  id: string;
  title: string;
  type: 'vector' | 'raster' | 'csv' | 'image-overlay';
  source: {
    format: 'geojson' | 'csv' | 'pmtiles' | 'mbtiles' | 'tiff' | 'png';
    path: string;
  };
  style?: {
    kind: 'categorical' | 'choropleth' | 'point' | 'polygon' | 'image';
    field?: string;
    colors?: Record<string, string>;
    opacity?: number;
  };
  query?: {
    mode: 'feature_at_point' | 'summary' | 'buffer';
    fields: string[];
  };
  bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  year?: number;
  description?: string;
  category: 'lulc' | 'corestack' | 'forest' | 'boundary' | 'built' | 'treecover' | 'other';
  enabled: boolean;
}

export interface DatasetManifest {
  region: string;
  generated: string;
  version: string;
  layers: DatasetLayer[];
  basemaps: BasemapConfig[];
}

export interface BasemapConfig {
  id: string;
  type: 'vector' | 'raster';
  title: string;
  offline: boolean;
  source: string;
}

export interface ExifData {
  timestamp?: string;
  dateTime?: string;
  lat?: number;
  lon?: number;
  orientation?: number;
  camera?: string;
  make?: string;
  model?: string;
}

export interface ImageData {
  blobId: string;
  exif: ExifData;
  thumbnail?: string;
}

export interface DatasetValues {
  [layerId: string]: {
    [field: string]: unknown;
  };
}

export interface ObservationContext {
  region: string;
  areaMode: 'point' | 'buffer' | 'watershed';
  bufferM?: number;
  watershedId?: string;
  // Authentic admin data from boundary GeoJSON or CoreStack API
  adminData?: {
    state?: string;
    district?: string;
    tehsil?: string;
    block?: string;
    source?: 'boundary_geojson' | 'corestack_api' | 'corestack_local';
    confidence?: 'verified' | 'approximate';
  };
}

export type ValidationStatus = 'match' | 'mismatch' | 'unclear';

export interface Observation {
  id: string;
  timestamp: string;
  location: LocationData;
  context: ObservationContext;
  datasetValues: DatasetValues;
  image?: ImageData;
  userValidation: ValidationStatus;
  notes: string;
  synced?: boolean;
}

export interface FilterState {
  validation: ValidationStatus | 'all';
  layer: string | 'all';
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface LocationSummaryData {
  coordinates: {
    lat: number;
    lon: number;
  };
  layers: {
    [layerId: string]: {
      title: string;
      values: Record<string, unknown>;
    };
  };
}
