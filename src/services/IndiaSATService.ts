/**
 * IndiaSAT LULC Service
 *
 * Point-specific and tile access to the IndiaSAT LULC product hosted on GEE.
 * v4: `projects/corestack-trees/assets/LULC_v4/lulc_v4_<startYear>_<endYear>`
 * v3 fallback: `projects/corestack-datasets/assets/datasets/LULC_v3_river_basin/pan_india_lulc_v3_<startYear>_<endYear>`
 *
 * The product is described at https://core-stack.org/lulc/ and the IndiaSAT
 * paper (Sahasranaman et al. 2024). It provides annual hydrological-year
 * classifications at 30 m for India, covering the years 2017–2024, with a
 * 14-class hierarchical legend that distinguishes built-up, water seasonality,
 * forest, barren, cropping-frequency classes, and orchard plantations (v4).
 *
 * The data is served through the local GEE proxy so the same credential path
 * used for Dynamic World also unlocks IndiaSAT.
 */

import { getGeeProxyUrl } from './AppConfig';

export const INDIASAT_CLASSES: Record<number, { name: string; color: string; description: string; group: 'built' | 'water' | 'crops' | 'trees' | 'barren' | 'shrubs' | 'orchard' | 'other' }> = {
  0:  { name: 'Background',                          color: '#000000', group: 'other',   description: 'No-data / masked' },
  1:  { name: 'Built up',                            color: '#ff0000', group: 'built',   description: 'Settlements, roads, impervious surfaces' },
  2:  { name: 'Kharif water',                        color: '#74ccf4', group: 'water',   description: 'Water present only in the kharif (monsoon) season' },
  3:  { name: 'Kharif and Rabi water',               color: '#1ca3ec', group: 'water',   description: 'Water present in monsoon and winter seasons' },
  4:  { name: 'Kharif and Rabi and Zaid water',      color: '#0f5e9c', group: 'water',   description: 'Perennial water (all three agricultural seasons)' },
  5:  { name: 'Crops',                               color: '#f1c232', group: 'crops',   description: 'Cropland (frequency not resolved)' },
  6:  { name: 'Trees',                               color: '#38761d', group: 'trees',   description: 'Forest, tree cover, plantations' },
  7:  { name: 'Barren land',                         color: '#A9A9A9', group: 'barren',  description: 'Bare rock, wastelands, non-vegetated land' },
  8:  { name: 'Single Kharif Cropping',              color: '#BAD93E', group: 'crops',   description: 'Cultivated once, in the monsoon' },
  9:  { name: 'Single Non-Kharif Cropping',          color: '#f59d22', group: 'crops',   description: 'Cultivated once, outside monsoon (rabi or zaid)' },
  10: { name: 'Double Cropping',                     color: '#FF9371', group: 'crops',   description: 'Cultivated twice in a year' },
  11: { name: 'Triple/Annual/Perennial Cropping',    color: '#b3561d', group: 'crops',   description: 'Cultivated thrice or perennial crops (e.g. sugarcane, orchards)' },
  12: { name: 'Shrubs and Scrubs',                   color: '#a9a9a9', group: 'shrubs',  description: 'Sparse shrubland and scrub vegetation' },
  13: { name: 'Orchard Plantation',                  color: '#75fd71', group: 'orchard', description: 'Cultivated orchards and plantations (v4)' },
};

export const INDIASAT_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023] as const;
export type IndiaSATYear = typeof INDIASAT_YEARS[number];
export const LATEST_INDIASAT_YEAR: IndiaSATYear = 2023;

export interface IndiaSATPointResult {
  lat: number;
  lon: number;
  year: IndiaSATYear;
  classId: number;
  landCoverClass: string;
  confidence: number | null;
  assetId?: string;
  band?: string;
  source: 'live';
  resolution: '30m (IndiaSAT, Sentinel-1/2)';
  timestamp: string;
}

interface IndiaSATMapIdResponse {
  mapid: string;
  token: string;
  urlFormat: string;
  year: number;
  assetId: string;
}

class IndiaSATService {
  private mapIdCache = new Map<number, IndiaSATMapIdResponse>();

  private getProxyBaseUrl(): string | null {
    return getGeeProxyUrl();
  }

  isAvailable(): boolean {
    return this.getProxyBaseUrl() !== null;
  }

  private absBase(): string | null {
    const base = this.getProxyBaseUrl();
    if (!base) return null;
    return base.startsWith('http') ? base : `${window.location.origin}${base}`;
  }

  /** Fetch the classified LULC value at a point for a given hydrological year. */
  async fetchPointData(lat: number, lon: number, year: IndiaSATYear = LATEST_INDIASAT_YEAR): Promise<IndiaSATPointResult | null> {
    const base = this.absBase();
    if (!base) return null;
    try {
      const url = new URL(`${base}/indiasat/point`);
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      url.searchParams.set('year', String(year));
      const r = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
      if (!r.ok) {
        if (r.status === 404) return null;
        const txt = await r.text().catch(() => '');
        console.warn('[IndiaSAT] point query failed', r.status, txt);
        return null;
      }
      const data = await r.json();
      const classId = typeof data.classId === 'number' ? data.classId : Number(data.classId);
      const klass = INDIASAT_CLASSES[classId];
      // Normalize confidence to 0–1. The upstream IndiaSAT confidence band
      // could be 0–1 (fraction), 0–100 (percent), or 0–255 (8-bit scaled).
      // Pick the scale defensively from the raw value so downstream
      // consumers (PredictionCard, exports, agreement scoring) all see a
      // single canonical fraction in [0, 1]. See issue #15.
      const rawConf = data.confidence == null ? null : Number(data.confidence);
      let confidence: number | null = null;
      if (rawConf != null && Number.isFinite(rawConf)) {
        if (rawConf <= 1) confidence = rawConf;
        else if (rawConf <= 100) confidence = rawConf / 100;
        else if (rawConf <= 255) confidence = rawConf / 255;
        else confidence = Math.max(0, Math.min(1, rawConf));
      }
      return {
        lat: data.lat,
        lon: data.lon,
        year: data.year,
        classId,
        landCoverClass: klass?.name ?? data.landCoverClass ?? `Class ${classId}`,
        confidence,
        assetId: data.assetId,
        band: data.band,
        source: 'live',
        resolution: '30m (IndiaSAT, Sentinel-1/2)',
        timestamp: data.timestamp || new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[IndiaSAT] point fetch error:', err);
      return null;
    }
  }

  /** Get an XYZ tile URL template for IndiaSAT LULC for a given year. */
  async getLiveTileUrlTemplate(year: IndiaSATYear = LATEST_INDIASAT_YEAR): Promise<string | null> {
    // 1. Prefer a packed offline tileset if one exists (see
    //    scripts/pack-indiasat-tiles.mjs). The manifest is generated next to
    //    the tiles and lists the public URL template that the dev server +
    //    Capacitor APK can both serve from the bundled `public/` folder.
    const offline = await this.getOfflineTileUrlTemplate(year);
    if (offline) return offline;

    const cached = this.mapIdCache.get(year);
    if (cached?.urlFormat) return cached.urlFormat;
    const base = this.absBase();
    if (!base) return null;
    try {
      const url = new URL(`${base}/indiasat/mapid`);
      url.searchParams.set('year', String(year));
      const r = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
      if (!r.ok) return null;
      const data = (await r.json()) as IndiaSATMapIdResponse;
      if (!data?.urlFormat) return null;
      this.mapIdCache.set(year, data);
      return data.urlFormat;
    } catch (err) {
      console.warn('[IndiaSAT] mapid error:', err);
      return null;
    }
  }

  private offlineManifestCache = new Map<number, string | null>();

  /** Look for a packed tile manifest at `/tiles/indiasat/<year>/manifest.json`. */
  private async getOfflineTileUrlTemplate(year: IndiaSATYear): Promise<string | null> {
    if (this.offlineManifestCache.has(year)) return this.offlineManifestCache.get(year) ?? null;
    try {
      const manifestUrl = `${window.location.origin}/tiles/indiasat/${year}/manifest.json`;
      const r = await fetch(manifestUrl, { signal: AbortSignal.timeout(2000) });
      if (!r.ok) {
        this.offlineManifestCache.set(year, null);
        return null;
      }
      const m = await r.json();
      const tpl = typeof m?.urlTemplate === 'string' ? m.urlTemplate : null;
      this.offlineManifestCache.set(year, tpl);
      if (tpl) console.info(`[IndiaSAT] using offline tile pack for ${year}:`, tpl);
      return tpl;
    } catch {
      this.offlineManifestCache.set(year, null);
      return null;
    }
  }

  getClassInfo(classId: number) {
    return INDIASAT_CLASSES[classId] || null;
  }

  /** All classes in a stable display order for UI pickers. */
  listClasses(): Array<{ id: number; name: string; color: string; group: string; description: string }> {
    return Object.entries(INDIASAT_CLASSES)
      .map(([id, info]) => ({ id: Number(id), ...info }))
      .sort((a, b) => a.id - b.id);
  }
}

export const indiaSatService = new IndiaSATService();
