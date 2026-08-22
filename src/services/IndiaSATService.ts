/**
 * IndiaSAT LULC via CoRE Stack GeoServer (no Earth Engine).
 * Point class = WMS GetFeatureInfo GRAY_INDEX on LULC_level_3.
 * Map colouring = WMS tiles for the tehsil coverage.
 */

import { coreStackService, coverageFromUrl, wmsFeatureInfoUrl, wmsTileTemplate, type CoreStackLayerRef } from './CoreStackService';

export const INDIASAT_CLASSES: Record<number, { name: string; color: string; description: string; group: 'built' | 'water' | 'crops' | 'trees' | 'barren' | 'shrubs' | 'orchard' | 'other' }> = {
  0:  { name: 'Background',                          color: '#000000', group: 'other',   description: 'No-data / masked' },
  1:  { name: 'Built up',                            color: '#ff0000', group: 'built',   description: 'Settlements, roads, impervious surfaces' },
  2:  { name: 'Kharif water',                        color: '#74ccf4', group: 'water',   description: 'Water present only in the kharif (monsoon) season' },
  3:  { name: 'Kharif and Rabi water',               color: '#1ca3ec', group: 'water',   description: 'Water present in monsoon and winter seasons' },
  4:  { name: 'Kharif and Rabi and Zaid water',      color: '#0f5e9c', group: 'water',   description: 'Perennial water' },
  5:  { name: 'Crops',                               color: '#f1c232', group: 'crops',   description: 'Cropland' },
  6:  { name: 'Trees',                               color: '#38761d', group: 'trees',   description: 'Forest, tree cover, plantations' },
  7:  { name: 'Barren land',                         color: '#A9A9A9', group: 'barren',  description: 'Bare rock, wastelands' },
  8:  { name: 'Single Kharif Cropping',              color: '#BAD93E', group: 'crops',   description: 'Cultivated once, monsoon' },
  9:  { name: 'Single Non-Kharif Cropping',          color: '#f59d22', group: 'crops',   description: 'Cultivated once, outside monsoon' },
  10: { name: 'Double Cropping',                     color: '#FF9371', group: 'crops',   description: 'Cultivated twice in a year' },
  11: { name: 'Triple/Annual/Perennial Cropping',    color: '#b3561d', group: 'crops',   description: 'Thrice or perennial' },
  12: { name: 'Shrubs and Scrubs',                   color: '#a9a9a9', group: 'shrubs',  description: 'Sparse shrubland' },
  13: { name: 'Orchard Plantation',                  color: '#75fd71', group: 'orchard', description: 'Cultivated orchards and plantations' },
};

export const INDIASAT_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024] as const;
export type IndiaSATYear = (typeof INDIASAT_YEARS)[number];
export const LATEST_INDIASAT_YEAR: IndiaSATYear = 2024;

export interface IndiaSATPointResult {
  lat: number;
  lon: number;
  year: number;
  classId: number;
  landCoverClass: string;
  confidence: number | null;
  assetId?: string;
  source: 'corestack';
  resolution: '30m (IndiaSAT / CoRE Stack)';
  timestamp: string;
}

class IndiaSATService {
  async resolveLayer(lat: number, lon: number, year?: number): Promise<CoreStackLayerRef | null> {
    const bundle = await coreStackService.loadAtPoint(lat, lon);
    if (!bundle.layers.length) return null;
    return coreStackService.pickLulcLayer(bundle.layers, year) || bundle.lulc || null;
  }

  async getLiveTileUrlTemplate(lat: number, lon: number, year?: number): Promise<string | null> {
    const layer = await this.resolveLayer(lat, lon, year);
    const coverage = layer?.url ? coverageFromUrl(layer.url) : null;
    if (!coverage) return null;
    return wmsTileTemplate(coverage);
  }

  async fetchPointData(lat: number, lon: number, year?: number): Promise<IndiaSATPointResult | null> {
    const layer = await this.resolveLayer(lat, lon, year);
    const coverage = layer?.url ? coverageFromUrl(layer.url) : null;
    if (!coverage) return null;
    try {
      const res = await fetch(wmsFeatureInfoUrl(coverage, lat, lon), { signal: AbortSignal.timeout(12000) });
      if (!res.ok) return null;
      const data = await res.json();
      const props = data?.features?.[0]?.properties || {};
      const raw = props.GRAY_INDEX ?? props.gray_index ?? props.DN ?? props.class ?? props.predicted_label;
      const classId = Number(raw);
      if (!Number.isFinite(classId)) return null;
      const klass = INDIASAT_CLASSES[classId];
      return {
        lat,
        lon,
        year: layer?.year || year || LATEST_INDIASAT_YEAR,
        classId,
        landCoverClass: klass?.name ?? `Class ${classId}`,
        confidence: null,
        assetId: coverage,
        source: 'corestack',
        resolution: '30m (IndiaSAT / CoRE Stack)',
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[IndiaSAT] CoRE GetFeatureInfo failed', err);
      return null;
    }
  }

  getClassInfo(classId: number) {
    return INDIASAT_CLASSES[classId] || null;
  }

  listClasses() {
    return Object.entries(INDIASAT_CLASSES)
      .map(([id, info]) => ({ id: Number(id), ...info }))
      .sort((a, b) => a.id - b.id);
  }
}

export const indiaSatService = new IndiaSATService();
