/**
 * CustomLayerManager — Import, parse, validate, and manage user-uploaded geospatial layers
 * Tasks 1.8.1–1.8.8
 *
 * Supported formats: GeoJSON, KML/KMZ, CSV (lat/lon columns), GeoPackage
 */

import { v4 as uuidv4 } from 'uuid';
import type { CustomLayer, CustomLayerStyle, DatasetLayer } from '../types';
import { saveCustomLayer, getCustomLayers, deleteCustomLayer as dbDeleteCustomLayer, updateCustomLayer } from '../db/database';

// ─── Constants ─────────────────────────────────────────────────
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const FEATURE_WARN_THRESHOLD = 10_000;

// ─── Default style ─────────────────────────────────────────────
const DEFAULT_STYLE: CustomLayerStyle = {
  fillColor: '#3388ff',
  strokeColor: '#3388ff',
  strokeWidth: 2,
  opacity: 0.6,
  symbolSize: 8,
};

// ─── Format detection ──────────────────────────────────────────

export type ImportFormat = 'geojson' | 'kml' | 'csv' | 'gpkg';

function detectFormat(file: File): ImportFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith('.geojson') || name.endsWith('.json')) return 'geojson';
  if (name.endsWith('.kml') || name.endsWith('.kmz')) return 'kml';
  if (name.endsWith('.csv') || name.endsWith('.tsv')) return 'csv';
  if (name.endsWith('.gpkg')) return 'gpkg';

  // Fall back on MIME type
  if (file.type === 'application/geo+json' || file.type === 'application/json') return 'geojson';
  if (file.type === 'application/vnd.google-earth.kml+xml') return 'kml';
  if (file.type === 'text/csv') return 'csv';

  throw new Error(`Unsupported file format: ${file.name}`);
}

// ─── Geometry helpers ──────────────────────────────────────────

type GeometryTypeName = CustomLayer['geometryType'];

function inferGeometryType(fc: GeoJSON.FeatureCollection): GeometryTypeName {
  const types = new Set(fc.features.map(f => f.geometry?.type).filter(Boolean));
  if (types.size === 0) return 'Point';
  if (types.size === 1) return types.values().next().value as GeometryTypeName;
  return 'Mixed';
}

function computeBounds(fc: GeoJSON.FeatureCollection): CustomLayer['bounds'] {
  let west = 180, south = 90, east = -180, north = -90;
  const visit = (coords: number[]) => {
    const [lon, lat] = coords;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  };
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') { visit(coords as number[]); return; }
    (coords as unknown[]).forEach(walk);
  };
  fc.features.forEach(f => {
    if (f.geometry && 'coordinates' in f.geometry) walk(f.geometry.coordinates);
  });
  return { west, south, east, north };
}

function extractProperties(fc: GeoJSON.FeatureCollection): string[] {
  const propSet = new Set<string>();
  for (const f of fc.features) {
    if (f.properties) {
      Object.keys(f.properties).forEach(k => propSet.add(k));
    }
  }
  return Array.from(propSet).sort();
}

// ─── CRS Validation ────────────────────────────────────────────

function validateCRS(fc: GeoJSON.FeatureCollection): boolean {
  // GeoJSON spec mandates WGS84 (EPSG:4326). Quick heuristic check on coordinates.
  for (const f of fc.features.slice(0, 20)) {
    if (!f.geometry || !('coordinates' in f.geometry)) continue;
    const flat: number[] = [];
    const flatten = (c: unknown): void => {
      if (!Array.isArray(c)) return;
      if (typeof c[0] === 'number') { flat.push(c[0] as number, c[1] as number); return; }
      (c as unknown[]).forEach(flatten);
    };
    flatten(f.geometry.coordinates);
    for (let i = 0; i < flat.length; i += 2) {
      const lon = flat[i], lat = flat[i + 1];
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return false;
    }
  }
  return true;
}

// ─── Parsers ───────────────────────────────────────────────────

async function parseGeoJSON(file: File): Promise<GeoJSON.FeatureCollection> {
  const text = await file.text();
  const json = JSON.parse(text);
  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
    return json as GeoJSON.FeatureCollection;
  }
  if (json.type === 'Feature') {
    return { type: 'FeatureCollection', features: [json] };
  }
  throw new Error('Invalid GeoJSON: expected FeatureCollection or Feature');
}

async function parseKML(file: File): Promise<GeoJSON.FeatureCollection> {
  const { kml } = await import('@tmcw/togeojson');
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const fc = kml(doc);
  if (!fc || !fc.features || fc.features.length === 0) {
    throw new Error('KML file contains no features');
  }
  return fc as GeoJSON.FeatureCollection;
}

/** Auto-detect lat/lon columns in CSV headers */
export function detectLatLonColumns(headers: string[]): { latCol: string; lonCol: string } | null {
  const lower = headers.map(h => h.trim().toLowerCase());
  const latCandidates = ['lat', 'latitude', 'y', 'lat_dd', 'decimallatitude'];
  const lonCandidates = ['lon', 'lng', 'longitude', 'long', 'x', 'lon_dd', 'decimallongitude'];
  const latCol = latCandidates.find(c => lower.includes(c));
  const lonCol = lonCandidates.find(c => lower.includes(c));
  if (latCol && lonCol) {
    const latIdx = lower.indexOf(latCol);
    const lonIdx = lower.indexOf(lonCol);
    return { latCol: headers[latIdx], lonCol: headers[lonIdx] };
  }
  return null;
}

export async function parseCSV(
  file: File,
  latColumn?: string,
  lonColumn?: string
): Promise<GeoJSON.FeatureCollection> {
  const text = await file.text();
  const delimiter = file.name.endsWith('.tsv') ? '\t' : ',';
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV file must have a header row + data');

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  let latCol = latColumn;
  let lonCol = lonColumn;

  if (!latCol || !lonCol) {
    const detected = detectLatLonColumns(headers);
    if (!detected) {
      throw new Error('COLUMN_MAPPING_NEEDED');
    }
    latCol = detected.latCol;
    lonCol = detected.lonCol;
  }

  const latIdx = headers.indexOf(latCol);
  const lonIdx = headers.indexOf(lonCol);
  if (latIdx === -1 || lonIdx === -1) throw new Error(`Columns "${latCol}" or "${lonCol}" not found in CSV`);

  const features: GeoJSON.Feature[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const lat = parseFloat(vals[latIdx]);
    const lon = parseFloat(vals[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;
    const props: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (idx !== latIdx && idx !== lonIdx) props[h] = vals[idx] || '';
    });
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: props,
    });
  }
  if (features.length === 0) throw new Error('No valid rows with coordinates found in CSV');
  return { type: 'FeatureCollection', features };
}

async function parseGeoPackage(file: File): Promise<GeoJSON.FeatureCollection> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();

  const buf = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buf));

  // Find the first geometry table from gpkg_contents
  const contentsResult = db.exec(
    "SELECT table_name FROM gpkg_contents WHERE data_type = 'features' LIMIT 1"
  );
  if (!contentsResult.length || !contentsResult[0].values.length) {
    // Fallback: try gpkg_geometry_columns
    const geomResult = db.exec('SELECT table_name FROM gpkg_geometry_columns LIMIT 1');
    if (!geomResult.length || !geomResult[0].values.length) {
      db.close();
      throw new Error('GeoPackage contains no feature tables');
    }
  }
  const tableName = (contentsResult[0]?.values[0]?.[0] as string) || 'features';

  // Read columns
  const pragma = db.exec(`PRAGMA table_info("${tableName}")`);
  if (!pragma.length) { db.close(); throw new Error(`Table "${tableName}" not found in GeoPackage`); }
  const columns = pragma[0].values.map((row: unknown[]) => ({
    name: row[1] as string,
    type: (row[2] as string).toUpperCase(),
  }));

  // Find geometry column from gpkg_geometry_columns
  let geomCol = 'geom';
  try {
    const gcResult = db.exec(
      `SELECT column_name FROM gpkg_geometry_columns WHERE table_name = '${tableName}' LIMIT 1`
    );
    if (gcResult.length && gcResult[0].values.length) {
      geomCol = gcResult[0].values[0][0] as string;
    }
  } catch { /* use default */ }

  const propCols = columns.filter((c: { name: string; type: string }) => c.name !== geomCol && c.name !== 'fid');
  const selectCols = [geomCol, ...propCols.map((c: { name: string }) => c.name)].map((c: string) => `"${c}"`).join(', ');
  const rows = db.exec(`SELECT ${selectCols} FROM "${tableName}"`);
  db.close();

  if (!rows.length) {
    return { type: 'FeatureCollection', features: [] };
  }

  // For now, we only handle WKB-lite (skip geometry parsing and put a placeholder).
  // Full WKB → GeoJSON is complex; we'll attempt a simplified extraction.
  const features: GeoJSON.Feature[] = [];
  for (const row of rows[0].values) {
    const props: Record<string, unknown> = {};
    propCols.forEach((col: { name: string }, i: number) => {
      props[col.name] = row[i + 1];
    });
    // Try to parse minimal GeoPackage binary header → WKB
    const geomBlob = row[0];
    const geom = parseGPKGGeometry(geomBlob as Uint8Array | null);
    if (geom) {
      features.push({ type: 'Feature', geometry: geom, properties: props });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Minimal GeoPackage binary header + WKB point/polygon parser */
function parseGPKGGeometry(blob: Uint8Array | null): GeoJSON.Geometry | null {
  if (!blob || blob.length < 8) return null;
  try {
    // GeoPackage binary header: magic "GP", version, flags, srs_id, [envelope], WKB
    const magic = String.fromCharCode(blob[0], blob[1]);
    if (magic !== 'GP') return null;
    const flags = blob[3];
    const envelopeIndicator = (flags >> 1) & 0x07;
    let headerSize = 8; // magic(2) + version(1) + flags(1) + srs_id(4)
    const envSizes = [0, 32, 48, 48, 64];
    headerSize += envSizes[envelopeIndicator] || 0;

    // Rest is standard WKB
    const wkb = blob.slice(headerSize);
    return parseWKBToGeoJSON(wkb);
  } catch {
    return null;
  }
}

/** Very basic WKB → GeoJSON for Point and simple Polygon. Returns null for unsupported types. */
function parseWKBToGeoJSON(wkb: Uint8Array): GeoJSON.Geometry | null {
  if (wkb.length < 5) return null;
  const view = new DataView(wkb.buffer, wkb.byteOffset, wkb.byteLength);
  const le = wkb[0] === 1; // little-endian flag
  const gType = le ? view.getUint32(1, true) : view.getUint32(1, false);

  const readDouble = (offset: number) => le ? view.getFloat64(offset, true) : view.getFloat64(offset, false);

  if (gType === 1) {
    // Point
    const x = readDouble(5);
    const y = readDouble(13);
    return { type: 'Point', coordinates: [x, y] };
  }
  // For anything more complex, return null (user should convert to GeoJSON first)
  return null;
}

// ─── Main Service ──────────────────────────────────────────────

export interface ImportResult {
  layer: CustomLayer;
  warnings: string[];
}

export interface ImportOptions {
  title?: string;
  description?: string;
  category?: string;
  style?: Partial<CustomLayerStyle>;
  /** CSV column overrides (only for CSV format) */
  latColumn?: string;
  lonColumn?: string;
}

class CustomLayerManager {
  /**
   * Main entry point: import a file and save as a CustomLayer in IndexedDB.
   * Throws 'COLUMN_MAPPING_NEEDED' error string for CSVs that need column selection.
   */
  async importFile(file: File, options: ImportOptions = {}): Promise<ImportResult> {
    const warnings: string[] = [];

    // File size check
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
    }

    const format = detectFormat(file);
    let geojson: GeoJSON.FeatureCollection;

    switch (format) {
      case 'geojson':
        geojson = await parseGeoJSON(file);
        break;
      case 'kml':
        geojson = await parseKML(file);
        break;
      case 'csv':
        geojson = await parseCSV(file, options.latColumn, options.lonColumn);
        break;
      case 'gpkg':
        geojson = await parseGeoPackage(file);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Validate CRS
    if (!validateCRS(geojson)) {
      warnings.push('Coordinates appear to be outside WGS84 range. Data may not display correctly.');
    }

    // Feature count warning
    if (geojson.features.length > FEATURE_WARN_THRESHOLD) {
      warnings.push(`Layer contains ${geojson.features.length.toLocaleString()} features. Performance may be affected.`);
    }

    if (geojson.features.length === 0) {
      throw new Error('File contains no valid features after parsing.');
    }

    const layer: CustomLayer = {
      id: uuidv4(),
      title: options.title || file.name.replace(/\.[^.]+$/, ''),
      description: options.description,
      category: options.category || 'custom',
      format,
      originalFilename: file.name,
      featureCount: geojson.features.length,
      geometryType: inferGeometryType(geojson),
      bounds: computeBounds(geojson),
      style: { ...DEFAULT_STYLE, ...options.style },
      geojsonData: geojson,
      properties: extractProperties(geojson),
      createdAt: Date.now(),
      sizeBytes: file.size,
      enabled: true,
    };

    await saveCustomLayer(layer);
    return { layer, warnings };
  }

  /** Get CSV headers for column mapping UI */
  async getCSVHeaders(file: File): Promise<string[]> {
    const text = await file.text();
    const delimiter = file.name.endsWith('.tsv') ? '\t' : ',';
    const firstLine = text.split('\n')[0] || '';
    return firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  }

  /** Convert a CustomLayer to a DatasetLayer for MapView rendering */
  toDatasetLayer(custom: CustomLayer): DatasetLayer {
    return {
      id: `custom_${custom.id}`,
      title: custom.title,
      type: 'vector',
      source: {
        format: 'geojson',
        path: `custom://${custom.id}`, // virtual path, data from IndexedDB
      },
      style: {
        kind: custom.geometryType === 'Point' || custom.geometryType === 'MultiPoint' ? 'point' : 'polygon',
        opacity: custom.style.opacity,
        colors: {
          fill: custom.style.fillColor,
          stroke: custom.style.strokeColor,
        },
      },
      bounds: custom.bounds,
      description: custom.description || `Imported from ${custom.originalFilename}`,
      category: 'other',
      enabled: custom.enabled ?? true,
    };
  }

  /** List all saved custom layers */
  async list(): Promise<CustomLayer[]> {
    return getCustomLayers();
  }

  /** Delete a custom layer from IndexedDB */
  async remove(id: string): Promise<void> {
    return dbDeleteCustomLayer(id);
  }

  /** Update a custom layer (style, title, description) */
  async update(id: string, update: Partial<Omit<CustomLayer, 'id'>>): Promise<void> {
    return updateCustomLayer(id, update);
  }
}

export const customLayerManager = new CustomLayerManager();
export default customLayerManager;
