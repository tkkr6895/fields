/**
 * IndiaSAT LULC Service
 *
 * Point-specific and tile access to the IndiaSAT LULC product hosted on GEE
 * at `projects/ee-indiasat/assets/LULC_CombinedOutputs_WithConfidence/`.
 *
 * The product is described at https://core-stack.org/lulc/ and the IndiaSAT
 * paper (Sahasranaman et al. 2024). It provides annual hydrological-year
 * classifications at 30 m for India, covering the years 2017–2022, with a
 * 13-class hierarchical legend that distinguishes built-up, water seasonality,
 * forest, barren, and cropping-frequency classes.
 *
 * The data is served through the local GEE proxy so the same credential path
 * used for Dynamic World also unlocks IndiaSAT.
 */

export const INDIASAT_CLASSES: Record<number, { name: string; color: string; description: string; group: 'built' | 'water' | 'crops' | 'trees' | 'barren' | 'shrubs' | 'other' }> = {
  0:  { name: 'Background',                  color: '#000000', group: 'other',  description: 'No-data / masked' },
  1:  { name: 'Built up',                    color: '#C4281B', group: 'built',  description: 'Settlements, roads, impervious surfaces' },
  2:  { name: 'Kharif water',                color: '#5DADE2', group: 'water',  description: 'Water present only in the kharif (monsoon) season' },
  3:  { name: 'Kharif + Rabi water',         color: '#2E86C1', group: 'water',  description: 'Water present in monsoon and winter seasons' },
  4:  { name: 'Kharif + Rabi + Zaid water',  color: '#1B4F72', group: 'water',  description: 'Perennial water (all three agricultural seasons)' },
  5:  { name: 'Crops',                       color: '#E49635', group: 'crops',  description: 'Cropland (frequency not resolved)' },
  6:  { name: 'Trees / Forest',              color: '#1E6E2E', group: 'trees',  description: 'Forest, tree cover, plantations' },
  7:  { name: 'Barren land',                 color: '#A59B8F', group: 'barren', description: 'Bare rock, wastelands, non-vegetated land' },
  8:  { name: 'Single Kharif cropping',      color: '#F4D03F', group: 'crops',  description: 'Cultivated once, in the monsoon' },
  9:  { name: 'Single Non-Kharif cropping',  color: '#F1C40F', group: 'crops',  description: 'Cultivated once, outside monsoon (rabi or zaid)' },
  10: { name: 'Double cropping',             color: '#D68910', group: 'crops',  description: 'Cultivated twice in a year' },
  11: { name: 'Triple / Perennial cropping', color: '#7E5109', group: 'crops',  description: 'Cultivated thrice or perennial crops (e.g. sugarcane, orchards)' },
  12: { name: 'Shrubs / Scrubs',             color: '#DFC35A', group: 'shrubs', description: 'Sparse shrubland and scrub vegetation' },
};

export const INDIASAT_YEARS = [2017, 2018, 2019, 2020, 2021, 2022] as const;
export type IndiaSATYear = typeof INDIASAT_YEARS[number];
export const LATEST_INDIASAT_YEAR: IndiaSATYear = 2022;

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
    const v = (import.meta.env.VITE_DW_GEE_PROXY_URL || '').trim();
    if (v.length > 0) return v;
    if (import.meta.env.DEV) return '/api/dw';
    return null;
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
      return {
        lat: data.lat,
        lon: data.lon,
        year: data.year,
        classId,
        landCoverClass: klass?.name ?? data.landCoverClass ?? `Class ${classId}`,
        confidence: data.confidence == null ? null : Number(data.confidence),
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
