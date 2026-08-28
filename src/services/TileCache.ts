/**
 * On-device tile cache so any place on Earth can work offline
 * without shipping the planet in the APK.
 *
 * Online: sharp Esri imagery (not stored — their terms forbid redistributing
 * tiles) plus OpenStreetMap streets.
 * Offline: whatever this device already fetched — OSM streets and
 * Sentinel-2 cloudless (EOX / Copernicus, CC BY), including areas you
 * explicitly saved.
 *
 * First launch also keeps a small world overview (z0–z3, a few MB) so
 * zooming out is never a blank globe.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import maplibregl from 'maplibre-gl';

export type TileKind = 'carto' | 's2' | 'esri';

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SavedRegion {
  id: string;
  name: string;
  bounds: MapBounds;
  minZ: number;
  maxZ: number;
  tiles: number;
  savedAt: string;
}

export interface PrefetchProgress {
  done: number;
  total: number;
  failed: number;
}

const CACHE_NAME = 'fields-tiles-v2';
const REGIONS_KEY = 'fields_map_regions';
const WORLD_KEY = 'fields_world_overview_v1';
const UA = 'Fields/1.4 (https://github.com/tkkr6895/fields)';

/** 1×1 transparent PNG so MapLibre does not error on a miss. */
const EMPTY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function lat2tile(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

export function tilesForBounds(b: MapBounds, z: number): Array<{ z: number; x: number; y: number }> {
  const max = 2 ** z - 1;
  const x0 = Math.max(0, lon2tile(b.west, z));
  const x1 = Math.min(max, lon2tile(b.east, z));
  const y0 = Math.max(0, lat2tile(b.north, z));
  const y1 = Math.min(max, lat2tile(b.south, z));
  const out: Array<{ z: number; x: number; y: number }> = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}

export function estimateSave(b: MapBounds, minZ: number, maxZ: number): { tiles: number; mb: number } {
  let tiles = 0;
  for (let z = minZ; z <= maxZ; z++) tiles += tilesForBounds(b, z).length * 2; // streets + satellite
  return { tiles, mb: Math.max(0.1, (tiles * 18) / 1024) };
}

function s2Url(z: number, x: number, y: number): string {
  if (import.meta.env.DEV && !Capacitor.isNativePlatform()) {
    return `/api/s2/${z}/${y}/${x}.jpg`;
  }
  return `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${z}/${y}/${x}.jpg`;
}

function remoteUrl(kind: TileKind, z: number, x: number, y: number): string {
  if (kind === 'carto') return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  if (kind === 's2') return s2Url(z, x, y);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

function emptyTile(): ArrayBuffer {
  return EMPTY_PNG.buffer.slice(EMPTY_PNG.byteOffset, EMPTY_PNG.byteOffset + EMPTY_PNG.byteLength) as ArrayBuffer;
}

function cacheable(kind: TileKind): boolean {
  return kind === 'carto' || kind === 's2';
}

function parseFieldsUrl(url: string): { kind: TileKind; z: number; x: number; y: number } | null {
  const path = url.replace(/^fields:\/\//, '').replace(/^fields:/, '');
  const parts = path.split('/');
  const kind = parts[0] as TileKind;
  const z = Number(parts[1]);
  const x = Number(parts[2]);
  const y = Number(parts[3]);
  if (!['carto', 's2', 'esri'].includes(kind) || ![z, x, y].every(Number.isFinite)) return null;
  return { kind, z, x, y };
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function coerceBuffer(data: unknown): Promise<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.arrayBuffer();
  if (typeof data === 'string') {
    const bin = atob(data.includes(',') ? data.split(',')[1] : data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  throw new Error('unknown tile payload');
}

async function fetchBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
      headers: { 'User-Agent': UA },
      responseType: 'arraybuffer',
      connectTimeout: 20000,
      readTimeout: 20000,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    return await coerceBuffer(res.data);
  }
  const res = await fetch(url, { signal, headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

class TileCache {
  private protocolAdded = false;

  registerProtocol(): void {
    if (this.protocolAdded) return;
    maplibregl.addProtocol('fields', async (params, abortController) => {
      const buf = await this.resolve(params.url, abortController?.signal);
      return { data: buf };
    });
    this.protocolAdded = true;
  }

  async resolve(fieldsUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    const parsed = parseFieldsUrl(fieldsUrl);
    if (!parsed) return emptyTile();
    const { kind, z, x, y } = parsed;
    const url = remoteUrl(kind, z, x, y);
    const cacheKey = `https://fields.local/${kind}/${z}/${x}/${y}`;
    const cache = cacheable(kind) ? await openCache() : null;

    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit.arrayBuffer();
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return emptyTile();
    }

    try {
      const bytes = await fetchBytes(url, signal);
      if (cache && cacheable(kind)) {
        try {
          await cache.put(cacheKey, new Response(bytes, { headers: { 'Content-Type': kind === 's2' ? 'image/jpeg' : 'image/png' } }));
        } catch {
          /* quota */
        }
      }
      return bytes;
    } catch {
      return emptyTile();
    }
  }

  listRegions(): SavedRegion[] {
    try {
      const raw = localStorage.getItem(REGIONS_KEY);
      return raw ? JSON.parse(raw) as SavedRegion[] : [];
    } catch {
      return [];
    }
  }

  private writeRegions(regions: SavedRegion[]): void {
    localStorage.setItem(REGIONS_KEY, JSON.stringify(regions));
  }

  async prefetch(
    bounds: MapBounds,
    minZ: number,
    maxZ: number,
    onProgress?: (p: PrefetchProgress) => void,
  ): Promise<PrefetchProgress> {
    const jobs: Array<{ kind: TileKind; z: number; x: number; y: number }> = [];
    for (let z = minZ; z <= maxZ; z++) {
      for (const t of tilesForBounds(bounds, z)) {
        jobs.push({ kind: 'carto', ...t });
        jobs.push({ kind: 's2', ...t });
      }
    }
    const progress: PrefetchProgress = { done: 0, total: jobs.length, failed: 0 };
    const queue = [...jobs];
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const job = queue.shift();
        if (!job) break;
        try {
          await this.resolve(`fields://${job.kind}/${job.z}/${job.x}/${job.y}`);
        } catch {
          progress.failed += 1;
        }
        progress.done += 1;
        onProgress?.({ ...progress });
      }
    });
    await Promise.all(workers);
    return progress;
  }

  async saveRegion(name: string, bounds: MapBounds, minZ: number, maxZ: number, onProgress?: (p: PrefetchProgress) => void): Promise<SavedRegion> {
    const result = await this.prefetch(bounds, minZ, maxZ, onProgress);
    const region: SavedRegion = {
      id: crypto.randomUUID(),
      name,
      bounds,
      minZ,
      maxZ,
      tiles: result.done - result.failed,
      savedAt: new Date().toISOString(),
    };
    const next = [region, ...this.listRegions()].slice(0, 40);
    this.writeRegions(next);
    return region;
  }

  deleteRegion(id: string): void {
    this.writeRegions(this.listRegions().filter((r) => r.id !== id));
  }

  async ensureWorldOverview(): Promise<void> {
    if (localStorage.getItem(WORLD_KEY) === '1') return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const world: MapBounds = { west: -180, south: -85, east: 180, north: 85 };
    await this.prefetch(world, 0, 3);
    localStorage.setItem(WORLD_KEY, '1');
  }
}

export const tileCache = new TileCache();
export { EMPTY_PNG };
