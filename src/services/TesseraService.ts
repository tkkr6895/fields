/**
 * Tessera foundation-model context for a field point.
 *
 * Tessera embeddings are 128-d, 10 m annual representations of Sentinel-1/2
 * (Feng et al.; https://github.com/ucam-eo/tessera). Full tiles are ~0.1° and
 * far too large to stream onto a phone. This service:
 *
 * 1. Always records the Tessera tile id so labels can be joined to embeddings later.
 * 2. Paints a 3-band RGB fingerprint (bands 30/60/90) for the current 0.1° tile only.
 * 3. Optionally samples a short embedding preview via a lab proxy.
 *
 * See: https://blog.forestmap.ai/geospatial-foundation-models-a-new-era-for-forest-species-mapping-from-space/
 */

import { getTesseraProxyUrl } from './AppConfig';

export const TESSERA_YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017] as const;
export type TesseraYear = (typeof TESSERA_YEARS)[number];
export const LATEST_TESSERA_YEAR: TesseraYear = 2024;

export interface TesseraTileRef {
  year: TesseraYear;
  tileLon: number;
  tileLat: number;
  tileId: string;
  bounds: { west: number; south: number; east: number; north: number };
}

export interface TesseraPointContext extends TesseraTileRef {
  lat: number;
  lon: number;
  fetchedAt: string;
  coverage: 'sampled' | 'tile_known' | 'missing' | 'unknown';
  source: 'proxy' | 'grid';
  embeddingDim?: number;
  /** First 16 dims only — enough for a fingerprint without a 128-float payload. */
  embeddingPreview?: number[];
  pcaRgb?: [number, number, number];
  note?: string;
}

/** Lightweight RGB fingerprint of one Tessera tile (not the 128-d tensor). */
export interface TesseraPreview {
  tileId: string;
  year: number;
  bounds: TesseraTileRef['bounds'];
  path: string;
  source: 'preload' | 'proxy';
  representation: string;
}

export interface TesseraPreviewManifest {
  year: number;
  representation: string;
  note?: string;
  tiles: Array<{
    tileId: string;
    year: number;
    bounds: TesseraTileRef['bounds'];
    path: string;
  }>;
}

let previewManifest: TesseraPreviewManifest | null | undefined;
const previewCache = new Map<string, TesseraPreview | null>();

export async function loadTesseraPreviewManifest(): Promise<TesseraPreviewManifest | null> {
  if (previewManifest !== undefined) return previewManifest;
  try {
    const res = await fetch('/data/tessera/manifest.json', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      previewManifest = null;
      return null;
    }
    previewManifest = await res.json() as TesseraPreviewManifest;
    return previewManifest;
  } catch {
    previewManifest = null;
    return null;
  }
}

/**
 * One 0.1° RGB overlay for the tile under the user.
 * Prefers a packed AOI preview (offline). Falls back to the Tessera proxy when online.
 */
export async function resolveTesseraPreview(
  lat: number,
  lon: number,
  year: TesseraYear = LATEST_TESSERA_YEAR,
): Promise<TesseraPreview | null> {
  const tile = tesseraTileForPoint(lat, lon, year);
  const key = `${tile.tileId}_${year}`;
  if (previewCache.has(key)) return previewCache.get(key) ?? null;

  const manifest = await loadTesseraPreviewManifest();
  const packed = manifest?.tiles.find(t => t.tileId === tile.tileId && t.year === year);
  if (packed) {
    const preview: TesseraPreview = {
      tileId: packed.tileId,
      year: packed.year,
      bounds: packed.bounds,
      path: packed.path,
      source: 'preload',
      representation: manifest?.representation || 'embedding RGB fingerprint',
    };
    previewCache.set(key, preview);
    return preview;
  }

  const base = getTesseraProxyUrl();
  if (base) {
    try {
      const url = new URL(`${base}/preview`);
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      url.searchParams.set('year', String(year));
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const blob = await res.blob();
        const path = URL.createObjectURL(blob);
        const preview: TesseraPreview = {
          tileId: tile.tileId,
          year,
          bounds: tile.bounds,
          path,
          source: 'proxy',
          representation: res.headers.get('X-Tessera-Representation') || 'embedding RGB fingerprint',
        };
        previewCache.set(key, preview);
        return preview;
      }
    } catch (err) {
      console.warn('[Tessera] Preview fetch failed:', err);
    }
  }

  previewCache.set(key, null);
  return null;
}

/** Snap a coordinate onto the Tessera 0.1° tile-center grid (*.05). */
export function tesseraTileCenter(coord: number): number {
  return Math.floor(coord * 10) / 10 + 0.05;
}

export function tesseraTileForPoint(lat: number, lon: number, year: TesseraYear = LATEST_TESSERA_YEAR): TesseraTileRef {
  const tileLon = Number(tesseraTileCenter(lon).toFixed(2));
  const tileLat = Number(tesseraTileCenter(lat).toFixed(2));
  return {
    year,
    tileLon,
    tileLat,
    tileId: `grid_${tileLon.toFixed(2)}_${tileLat.toFixed(2)}`,
    bounds: {
      west: tileLon - 0.05,
      east: tileLon + 0.05,
      south: tileLat - 0.05,
      north: tileLat + 0.05,
    },
  };
}

class TesseraService {
  async fetchPointContext(lat: number, lon: number, year: TesseraYear = LATEST_TESSERA_YEAR): Promise<TesseraPointContext> {
    const tile = tesseraTileForPoint(lat, lon, year);
    const base = getTesseraProxyUrl();
    if (base) {
      try {
        const url = new URL(`${base}/point`);
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lon', String(lon));
        url.searchParams.set('year', String(year));
        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          return {
            ...tile,
            lat,
            lon,
            fetchedAt: new Date().toISOString(),
            coverage: data.coverage === 'missing' ? 'missing' : (data.embeddingPreview ? 'sampled' : 'tile_known'),
            source: 'proxy',
            embeddingDim: data.embeddingDim,
            embeddingPreview: Array.isArray(data.embeddingPreview) ? data.embeddingPreview.slice(0, 16) : undefined,
            pcaRgb: Array.isArray(data.pcaRgb) ? [data.pcaRgb[0], data.pcaRgb[1], data.pcaRgb[2]] : undefined,
            note: data.note,
            tileId: data.tileId || tile.tileId,
            tileLon: data.tileLon ?? tile.tileLon,
            tileLat: data.tileLat ?? tile.tileLat,
          };
        }
      } catch (err) {
        console.warn('[Tessera] Proxy sample failed, recording tile id only:', err);
      }
    }

    return {
      ...tile,
      lat,
      lon,
      fetchedAt: new Date().toISOString(),
      coverage: 'unknown',
      source: 'grid',
      note: base
        ? 'Tessera proxy did not return a sample. Tile id is still recorded for later join.'
        : 'No Tessera proxy configured. Tile id is recorded so this label can join Tessera embeddings later.',
    };
  }
}

export const tesseraService = new TesseraService();
