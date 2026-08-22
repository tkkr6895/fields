/**
 * Tessera foundation-model context for a field point.
 *
 * Tessera embeddings are 128-d, 10 m annual representations of Sentinel-1/2
 * (Feng et al.; https://github.com/ucam-eo/tessera). Full tiles are ~0.1° and
 * far too large to stream onto a phone. This service:
 *
 * 1. Always records the Tessera tile id so labels can be joined to embeddings later.
 * 2. Optionally samples the 128-d vector + a PCA colour via a lab proxy.
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
