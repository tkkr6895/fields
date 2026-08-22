/**
 * CoRE Stack location + layer client.
 * Docs: https://api-doc.core-stack.org  |  key: https://core-stack.org/use-apis/
 */

import { getCoreStackApiBase, getCoreStackApiKey } from './AppConfig';
import { isWesternGhatsCriticalLayer } from '../config/westernGhatsLayers';
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
  url?: string;
  type?: string;
  format?: string;
}

export interface CoreStackLocationBundle {
  admin: CoreStackAdmin | null;
  layers: CoreStackLayerRef[];
  kyl?: Record<string, unknown> | null;
  error?: string;
}

function authHeaders(): HeadersInit {
  const key = getCoreStackApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.toUpperCase()];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function parseAdmin(payload: unknown): CoreStackAdmin | null {
  const rec = asRecord(payload) || asRecord((payload as { data?: unknown })?.data);
  if (!rec) return null;
  const state = pick(rec, ['State', 'state', 'state_name']);
  const district = pick(rec, ['District', 'district', 'district_name']);
  const tehsil = pick(rec, ['Tehsil', 'tehsil', 'block', 'Block', 'taluk']);
  if (!state && !district && !tehsil) return { raw: rec };
  return { state, district, tehsil, block: pick(rec, ['Block', 'block']), raw: rec };
}

function parseLayers(payload: unknown): CoreStackLayerRef[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { layers?: unknown })?.layers)
      ? (payload as { layers: unknown[] }).layers
      : Array.isArray((payload as { data?: unknown })?.data)
        ? (payload as { data: unknown[] }).data
        : [];
  return list.map((item) => {
    if (typeof item === 'string') return { name: item };
    const rec = asRecord(item) || {};
    return {
      name: String(rec.layer_name || rec.name || rec.layer || rec.title || 'layer'),
      url: typeof rec.url === 'string' ? rec.url : typeof rec.wms === 'string' ? rec.wms : undefined,
      type: typeof rec.type === 'string' ? rec.type : undefined,
      format: typeof rec.format === 'string' ? rec.format : undefined,
    };
  }).filter(l => l.name && l.name !== 'layer');
}

function wmsTileUrl(layerName: string): string {
  const encoded = encodeURIComponent(layerName);
  return `https://geoserver.core-stack.org:8443/geoserver/wms?service=WMS&request=GetMap&version=1.1.1&layers=${encoded}&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
}

class CoreStackService {
  hasApiKey(): boolean {
    return Boolean(getCoreStackApiKey());
  }

  private async getJson(path: string): Promise<unknown> {
    const base = getCoreStackApiBase().replace(/\/$/, '');
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      headers: { ...authHeaders(), Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`CoRE Stack ${res.status} ${path}`);
    return res.json();
  }

  async getAdminDetails(lat: number, lon: number): Promise<CoreStackAdmin | null> {
    const attempts = [
      `/admin_detail/${lat}/${lon}`,
      `/get_admin_details_by_latlon/?lat=${lat}&lon=${lon}`,
    ];
    for (const path of attempts) {
      try {
        const admin = parseAdmin(await this.getJson(path));
        if (admin) return admin;
      } catch {
        /* try next shape */
      }
    }
    return null;
  }

  async getLayersForAdmin(admin: CoreStackAdmin): Promise<CoreStackLayerRef[]> {
    if (!admin.state || !admin.district || !admin.tehsil) return [];
    const s = encodeURIComponent(admin.state);
    const d = encodeURIComponent(admin.district);
    const t = encodeURIComponent(admin.tehsil);
    const attempts = [
      `/layers_for_location/${s}/${d}/${t}`,
      `/get_generated_layer_urls/?state=${s}&district=${d}&tehsil=${t}`,
    ];
    for (const path of attempts) {
      try {
        const layers = parseLayers(await this.getJson(path));
        if (layers.length) return layers;
      } catch {
        /* try next */
      }
    }
    return [];
  }

  async getKyl(admin: CoreStackAdmin): Promise<Record<string, unknown> | null> {
    if (!admin.state || !admin.district || !admin.tehsil) return null;
    const s = encodeURIComponent(admin.state);
    const d = encodeURIComponent(admin.district);
    const t = encodeURIComponent(admin.tehsil);
    try {
      const data = await this.getJson(`/mws_kyl_basic/${s}/${d}/${t}`);
      return asRecord(data);
    } catch {
      return null;
    }
  }

  async loadAtPoint(lat: number, lon: number): Promise<CoreStackLocationBundle> {
    if (!this.hasApiKey()) {
      return { admin: null, layers: [], error: 'Add a CoRE Stack API key in Settings.' };
    }
    try {
      const admin = await this.getAdminDetails(lat, lon);
      const layers = admin ? await this.getLayersForAdmin(admin) : [];
      const kyl = admin ? await this.getKyl(admin) : null;
      return { admin, layers, kyl };
    } catch (e) {
      return {
        admin: null,
        layers: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  toDatasetLayers(refs: CoreStackLayerRef[], limit = 12): DatasetLayer[] {
    const preferred = refs.filter(r => isWesternGhatsCriticalLayer(r.name));
    const rest = refs.filter(r => !isWesternGhatsCriticalLayer(r.name));
    const chosen = [...preferred, ...rest].slice(0, limit);
    return chosen.map((ref, i) => ({
      id: `corestack_${i}_${ref.name.replace(/\s+/g, '_').toLowerCase()}`,
      title: ref.name,
      type: 'raster' as const,
      source: {
        format: 'xyz' as const,
        path: ref.url && /\{[xyz]\}/.test(ref.url) ? ref.url : wmsTileUrl(ref.name),
      },
      style: { kind: 'image' as const, opacity: 0.55 },
      minZoom: 8,
      maxZoom: 18,
      category: 'corestack' as const,
      enabled: false,
      description: 'CoRE Stack map layer for this tehsil',
    }));
  }
}

export const coreStackService = new CoreStackService();
