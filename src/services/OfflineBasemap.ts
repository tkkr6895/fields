/**
 * Basemap styles. The APK does not contain the planet.
 * Tiles are fetched through the `fields://` protocol (cache-first).
 */
import type { StyleSpecification } from 'maplibre-gl';
import { tileCache } from './TileCache';

export const PACKED_CENTER: [number, number] = [75.22, 12.75];
export const PACKED_ZOOM = 11;

export async function prepareOfflineBasemap(): Promise<null> {
  tileCache.registerProtocol();
  // Let the current view paint first; then fill in a cheap globe overview.
  const kick = () => { void tileCache.ensureWorldOverview(); };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(kick, { timeout: 8000 });
  } else {
    setTimeout(kick, 2500);
  }
  return null;
}

export function buildMapStyle(kind: 'dark' | 'satellite'): StyleSpecification {
  if (kind === 'satellite') {
    return {
      version: 8,
      name: 'Satellite',
      sources: {
        s2: {
          type: 'raster',
          tiles: ['fields://s2/{z}/{x}/{y}'],
          tileSize: 256,
          maxzoom: 15,
          attribution: 'Sentinel-2 cloudless © EOX — modified Copernicus Sentinel data',
        },
        esri: {
          type: 'raster',
          tiles: ['fields://esri/{z}/{x}/{y}'],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Tiles © Esri',
        },
      },
      layers: [
        { id: 'canvas', type: 'background', paint: { 'background-color': '#1a2a1a' } },
        { id: 's2', type: 'raster', source: 's2', paint: { 'raster-fade-duration': 0 } },
        { id: 'esri', type: 'raster', source: 'esri', paint: { 'raster-fade-duration': 0 } },
      ],
    };
  }

  return {
    version: 8,
    name: 'Streets',
    sources: {
      carto: {
        type: 'raster',
        tiles: ['fields://carto/{z}/{x}/{y}'],
        tileSize: 256,
        maxzoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'canvas', type: 'background', paint: { 'background-color': '#12161c' } },
      { id: 'carto', type: 'raster', source: 'carto', paint: { 'raster-fade-duration': 0, 'raster-saturation': -0.85, 'raster-brightness-min': 0, 'raster-brightness-max': 0.55 } },
    ],
  };
}
