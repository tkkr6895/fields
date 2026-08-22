/**
 * CoRE Stack API — X-API-Key, query-string admin + generated GeoServer layers.
 * https://api-doc.core-stack.org/swagger.json
 */

import { getCoreStackApiBase, getCoreStackApiKey } from './AppConfig';
import { maplibreWmsTileUrl } from './wmsTiles';
import type { DatasetLayer } from '../types';

export interface CoreStackAdmin {
  state?: string;
  district?: string;
  tehsil?: string;
  block?: string;
  raw: Record<string, unknown>;
}

export interface CoreStackLayerRef {
  name: string;
  datasetName?: string;
  type?: string;
  url?: string;
  year?: number;
}

export interface CoreStackLocationBundle {
  admin: CoreStackAdmin | null;
  layers: CoreStackLayerRef[];
  lulc?: CoreStackLayerRef | null;
  error?: string;
}

const LAYER_CACHE = new Map<string, { at: number; layers: CoreStackLayerRef[] }>();
const CACHE_MS = 10 * 60 * 1000;

function authHeaders(): HeadersInit {
  const key = getCoreStackApiKey();
  return key ? { 'X-API-Key': key, Accept: 'application/json' } : { Accept: 'application/json' };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.toUpperCase()];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function geoserverWmsBase(): string {
  if (import.meta.env.DEV) return '/api/geoserver/wms';
  return 'https://geoserver.core-stack.org:8443/geoserver/wms';
}

/** workspace:layer from a WFS/WCS URL's typeName or CoverageId. */
export function coverageFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const typeName = u.searchParams.get('typeName') || u.searchParams.get('CoverageId') || u.searchParams.get('layers');
    if (typeName) return typeName;
  } catch {
    /* ignore */
  }
  return null;
}

export function wmsTileTemplate(workspaceLayer: string): string {
  const encoded = encodeURIComponent(workspaceLayer);
  const raw = `${geoserverWmsBase()}?service=WMS&request=GetMap&version=1.1.1&layers=${encoded}&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
  return maplibreWmsTileUrl(raw);
}

export function wmsFeatureInfoUrl(workspaceLayer: string, lat: number, lon: number): string {
  const d = 0.0015;
  const encoded = encodeURIComponent(workspaceLayer);
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  return `${geoserverWmsBase()}?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=${encoded}&query_layers=${encoded}&srs=EPSG:4326&bbox=${bbox}&width=101&height=101&x=50&y=50&info_format=application/json&feature_count=1`;
}

function parseYear(name: string): number | undefined {
  const m = name.match(/LULC_(\d{2})_(\d{2})_/i) || name.match(/_(\d{4})(?:_|$)/);
  if (!m) return undefined;
  if (m[1] && m[1].length === 2) return 2000 + Number(m[1]);
  return Number(m[1]);
}

function parseLayers(payload: unknown): CoreStackLayerRef[] {
  const list = Array.isArray(payload) ? payload : [];
  return list.map((item) => {
    const rec = asRecord(item) || {};
    const name = String(rec.layer_name || rec.name || '');
    const url = typeof rec.layer_url === 'string' ? rec.layer_url : typeof rec.url === 'string' ? rec.url : undefined;
    return {
      name,
      datasetName: typeof rec.dataset_name === 'string' ? rec.dataset_name : undefined,
      type: typeof rec.layer_type === 'string' ? rec.layer_type : undefined,
      url,
      year: parseYear(name),
    };
  }).filter(l => l.name);
}

class CoreStackService {
  hasApiKey(): boolean {
    return Boolean(getCoreStackApiKey());
  }

  private async getJson(path: string, params: Record<string, string | number>): Promise<unknown> {
    const base = getCoreStackApiBase().replace(/\/$/, '');
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => q.set(k, String(v)));
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}?${q.toString()}`;
    const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`CoRE Stack ${res.status}`);
    return res.json();
  }

  async getAdminDetails(lat: number, lon: number): Promise<CoreStackAdmin | null> {
    try {
      const rec = asRecord(await this.getJson('/get_admin_details_by_latlon/', { latitude: lat, longitude: lon }));
      if (!rec) return null;
      return {
        state: pick(rec, ['State', 'state']),
        district: pick(rec, ['District', 'district']),
        tehsil: pick(rec, ['Tehsil', 'tehsil']),
        raw: rec,
      };
    } catch {
      return null;
    }
  }

  async getLayersForAdmin(admin: CoreStackAdmin): Promise<CoreStackLayerRef[]> {
    if (!admin.state || !admin.district || !admin.tehsil) return [];
    const key = `${admin.state}|${admin.district}|${admin.tehsil}`.toUpperCase();
    const hit = LAYER_CACHE.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.layers;
    try {
      const layers = parseLayers(await this.getJson('/get_generated_layer_urls/', {
        state: admin.state,
        district: admin.district,
        tehsil: admin.tehsil,
      }));
      LAYER_CACHE.set(key, { at: Date.now(), layers });
      return layers;
    } catch {
      return [];
    }
  }

  pickLulcLayer(layers: CoreStackLayerRef[], preferYear?: number): CoreStackLayerRef | null {
    const lulc = layers.filter(l =>
      /lulc_level_3/i.test(l.datasetName || '') || /lulc_level_3/i.test(l.name) || /^LULC_\d{2}_\d{2}_.*level_3$/i.test(l.name)
    );
    if (!lulc.length) {
      const any = layers.filter(l => /lulc/i.test(l.datasetName || '') || /lulc/i.test(l.name));
      return any.sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
    }
    if (preferYear) {
      const exact = lulc.find(l => l.year === preferYear);
      if (exact) return exact;
    }
    return lulc.sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
  }

  async loadAtPoint(lat: number, lon: number): Promise<CoreStackLocationBundle> {
    if (!this.hasApiKey()) {
      return { admin: null, layers: [], error: 'Add a CoRE Stack API key in Settings.' };
    }
    const admin = await this.getAdminDetails(lat, lon);
    if (!admin?.state) {
      return { admin, layers: [], error: 'This point is outside CoRE Stack coverage.' };
    }
    const layers = await this.getLayersForAdmin(admin);
    return { admin, layers, lulc: this.pickLulcLayer(layers) };
  }

  toDatasetLayers(layers: CoreStackLayerRef[]): DatasetLayer[] {
    return this.overlayDatasetLayers(layers);
  }

  overlayDatasetLayers(layers: CoreStackLayerRef[]): DatasetLayer[] {
    const want = [
      /lulc_level_3/i,
      /lulc_vector/i,
      /canopy height raster/i,
      /ccd raster/i,
      /drainage$/i,
      /mws$/i,
      /surface water/i,
      /plantation|site suitability/i,
      /admin boundary/i,
    ];
    const picked: CoreStackLayerRef[] = [];
    for (const re of want) {
      const match = layers.find(l => re.test(l.datasetName || '') || re.test(l.name));
      if (match && !picked.includes(match)) picked.push(match);
    }
    // latest level-3 only
    const latestLulc = this.pickLulcLayer(layers);
    const out: DatasetLayer[] = [];
    for (const ref of picked) {
      const use = /lulc_level_3/i.test(ref.datasetName || '') || /lulc_level_3/i.test(ref.name) ? (latestLulc || ref) : ref;
      const coverage = use.url ? coverageFromUrl(use.url) : null;
      if (!coverage || use.type === 'vector' && /wfs/i.test(use.url || '')) {
        // Still paint rasters via WMS using coverage id; skip fat WFS on the phone.
        if (!coverage || /wfs/i.test(use.url || '')) continue;
      }
      if (!coverage) continue;
      if (/wcs|wms/i.test(use.url || '') || /raster/i.test(use.type || '')) {
        out.push({
          id: `core_${use.name}`,
          title: `${use.datasetName || use.name}${use.year ? ` · ${use.year}` : ''}`,
          type: 'raster',
          source: { format: 'xyz', path: wmsTileTemplate(coverage) },
          style: { kind: 'image', opacity: 0.55 },
          minZoom: 8,
          maxZoom: 18,
          category: /lulc/i.test(use.name + (use.datasetName || '')) ? 'lulc' : 'corestack',
          enabled: false,
          year: use.year,
          description: use.datasetName,
        });
      }
    }
    return out;
  }
}

export const coreStackService = new CoreStackService();
