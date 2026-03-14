// Types for the Field Validator App

// ─── Phase 1 v2 Types ─────────────────────────────────────────────

/** 1.2.1 — Sync lifecycle for observations */
export type SyncStatus = 'pending' | 'queued' | 'syncing' | 'synced' | 'failed';

/** 1.2.2 — Observation categories */
export type ObservationType = 'land_cover' | 'species_sighting' | 'water_body' | 'restoration_site' | 'general'
  | 'waterbody_validation' | 'drainage_validation' | 'farm_pond_validation' | 'infrastructure_validation';

/** 1.2.3 — Indian meteorological seasons */
export type Season = 'monsoon' | 'post_monsoon' | 'winter' | 'summer';

/** IUCN Red List categories */
export type IUCNStatus = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD' | 'NE';

// ─── Core Location & Dataset Types ────────────────────────────────

export interface LocationData {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp?: number;
  altitude?: number;
}

/** Schema for a property in a vector dataset layer */
export interface VectorPropertySchema {
  key: string;
  label: string;
  description?: string;
  unit?: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  display: boolean; // whether to show in the UI
  importance?: 'high' | 'medium' | 'low';
  format?: 'percentage' | 'area_ha' | 'area_km2' | 'count' | 'year' | 'text';
}

export interface DatasetLayer {
  id: string;
  title: string;
  type: 'vector' | 'raster' | 'csv' | 'image-overlay';
  source: {
    format: 'geojson' | 'csv' | 'pmtiles' | 'mbtiles' | 'tiff' | 'png' | 'xyz';
    path: string;
  };
  style?: {
    kind: 'categorical' | 'choropleth' | 'point' | 'polygon' | 'image' | 'line';
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
  minZoom?: number;
  maxZoom?: number;
  year?: number;
  description?: string;
  category: 'lulc' | 'dynamicworld' | 'corestack' | 'forest' | 'boundary' | 'built' | 'treecover' | 'hydrology' | 'infrastructure' | 'other';
  enabled: boolean;
  /** Schema describing what each property means — for meaningful display of vector features */
  propertySchema?: VectorPropertySchema[];
  /** Geometry types expected in this layer */
  geometryTypes?: ('Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon')[];
  /** Whether this layer contains features that can be ground-truthed / validated */
  validatable?: boolean;
  /** Validation question prompt (e.g., "Is this drainage channel present on the ground?") */
  validationPrompt?: string;
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

/** 1.2.4 — Enhanced Observation with v2 fields */
export interface Observation {
  id: string;
  timestamp: string;
  location: LocationData;
  context: ObservationContext;
  datasetValues: DatasetValues;
  image?: ImageData;
  userValidation: ValidationStatus;
  notes: string;

  // v2 additions (1.2.4)
  observationType?: ObservationType;
  userId?: string;
  deviceId?: string;
  confidence?: number;            // 1-5 observer confidence
  season?: Season;                // auto-derived from timestamp
  tags?: string[];                // user-defined labels
  protocolId?: string;            // link to field protocol
  speciesId?: string;             // link to species (for sightings)
  speciesData?: SpeciesSightingData;

  /** Vector feature being validated (for vector ground-truthing) */
  vectorFeatureContext?: VectorFeatureContext;

  // v2: sync state (replaces boolean `synced`)
  synced?: boolean;               // kept for backward compat with v1 data
  syncStatus?: SyncStatus;
  syncedAt?: number;
  enrichmentSources?: string[];   // e.g. ['weather', 'dynamicworld', 'corestack']
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

// ─── Phase 1 v2 Interfaces ────────────────────────────────────────

/** Context about a vector feature being validated / ground-truthed */
export interface VectorFeatureContext {
  /** Layer ID the feature belongs to */
  layerId: string;
  /** Layer title for display */
  layerTitle: string;
  /** The feature's properties (key-value) */
  featureProperties: Record<string, unknown>;
  /** Geometry type of the feature */
  geometryType: string;
  /** Specific validation question for this feature type */
  validationPrompt?: string;
  /** Source of the vector data (e.g., 'CoreStack', 'DEM-derived', 'survey') */
  dataSource?: string;
}

/** 1.2.5 — Detailed species sighting data embedded in an Observation */
export interface SpeciesSightingData {
  speciesId: string;
  count?: number;                     // abundance
  lifeStage?: 'seedling' | 'juvenile' | 'adult' | 'flowering' | 'fruiting' | 'dead';
  behaviour?: string;
  habitatType?: string;
  vernacularName?: string;            // user-contributed local name
  vernacularLanguage?: string;        // e.g. 'Kannada', 'Tulu'
  isTEK?: boolean;                    // traditional ecological knowledge flag
  tekConsent?: boolean;               // explicit consent for TEK sharing
}

/** 1.2.6 — Species record (fetched from GBIF/IUCN/IBP, cached in IndexedDB) */
export interface Species {
  id: string;
  scientificName: string;
  commonName: string;
  vernacularNames: VernacularName[];
  family: string;
  order?: string;
  class?: string;
  kingdom: 'Plantae' | 'Animalia' | 'Fungi';
  iucnStatus: IUCNStatus;
  isEndemic: boolean;
  isMedicinal: boolean;
  restorationValue: 'low' | 'medium' | 'high';
  habitat: string[];
  elevationRange?: { min: number; max: number };
  characteristics?: string;
  traditionalUses?: string[];
  imageUrl?: string;
  thumbnailUrl?: string;
  regions: string[];
  // Search indexing
  commonNameTokens?: string[];
  vernacularTokens?: string[];
  // Provenance — all from real APIs, never synthetic
  source: 'gbif' | 'iucn' | 'ibp' | 'inaturalist' | 'col' | 'user_contributed';
  sourceId?: string;                  // e.g. GBIF taxonKey
  fetchedAt?: number;                 // timestamp of last API fetch
}

/** 1.2.6 — Vernacular (local language) name for a species */
export interface VernacularName {
  language: string;
  name: string;
  script?: string;                    // e.g. 'Kannada script'
}

/** 1.2.7 — User-imported geospatial layer stored in IndexedDB */
export interface CustomLayer {
  id: string;
  title: string;
  description?: string;
  category: string;
  format: 'geojson' | 'kml' | 'csv' | 'gpkg';
  originalFilename: string;
  featureCount: number;
  geometryType: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'Mixed';
  bounds: { west: number; south: number; east: number; north: number };
  style: CustomLayerStyle;
  geojsonData: GeoJSON.FeatureCollection;
  properties: string[];               // available property/column names
  createdAt: number;
  sizeBytes: number;
  attribution?: string;
  enabled?: boolean;
}

/** 1.2.7 — Visual styling for a CustomLayer */
export interface CustomLayerStyle {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  labelField?: string;
  symbolSize?: number;                // for point layers
}

/** 1.2.8 — Queued sync job for offline-first enrichment */
export interface SyncQueueItem {
  id?: number;                        // auto-increment
  observationId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  lastAttemptAt?: number;
  error?: string;
  createdAt: number;
}

/** 1.2.9 — Record of a completed export operation */
export interface ExportLogEntry {
  id?: number;                        // auto-increment
  exportedAt: number;
  recordCount: number;
  format: 'geoai_zip' | 'stac' | 'geojson' | 'csv' | 'pbr_zip';
  fileName?: string;
  sizeBytes?: number;
  observationIds?: string[];          // which observations were included
}
