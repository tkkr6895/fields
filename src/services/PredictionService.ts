/**
 * Prediction snapshot used after save (background), never on the capture critical path.
 */

import {
  indiaSatService,
  INDIASAT_CLASSES,
  LATEST_INDIASAT_YEAR,
  type IndiaSATYear,
} from './IndiaSATService';
import { tesseraTileForPoint, type TesseraPointContext } from './TesseraService';

export type PredictionSourceId = 'indiasat';

export const PREDICTION_SOURCES: Record<PredictionSourceId, { id: PredictionSourceId; title: string; shortTitle: string; description: string; resolution: string; temporal: string; citation: string; providerUrl: string }> = {
  indiasat: {
    id: 'indiasat',
    title: 'IndiaSAT LULC',
    shortTitle: 'IndiaSAT',
    description: 'Annual 30 m hierarchical LULC for India, served by CoRE Stack GeoServer',
    resolution: '30 m',
    temporal: 'Annual (hydrological year)',
    citation: 'Sahasranaman et al. (2024). IndiaSAT LULC. core-stack.org/lulc/.',
    providerUrl: 'https://core-stack.org/lulc/',
  },
};

export interface PredictionResult {
  source: PredictionSourceId;
  classId: number;
  className: string;
  color: string;
  confidence: number | null;
  timestamp: string;
  asOf: string;
  live: boolean;
  offline: boolean;
  extras?: Record<string, unknown>;
}

export interface PredictionSnapshot {
  lat: number;
  lon: number;
  fetchedAt: string;
  results: Partial<Record<PredictionSourceId, PredictionResult | null>>;
  errors: Partial<Record<PredictionSourceId, string>>;
  tessera?: TesseraPointContext | null;
}

export async function fetchIndiaSATPrediction(lat: number, lon: number, year: IndiaSATYear = LATEST_INDIASAT_YEAR): Promise<PredictionResult | null> {
  const data = await indiaSatService.fetchPointData(lat, lon, year);
  if (!data) return null;
  return {
    source: 'indiasat',
    classId: data.classId,
    className: data.landCoverClass,
    color: INDIASAT_CLASSES[data.classId]?.color ?? '#888',
    confidence: data.confidence,
    timestamp: data.timestamp,
    asOf: `${data.year} hydrological year`,
    live: true,
    offline: false,
    extras: { assetId: data.assetId, year: data.year },
  };
}

export async function fetchPredictionSnapshot(lat: number, lon: number, opts?: { indiasatYear?: IndiaSATYear }): Promise<PredictionSnapshot> {
  const fetchedAt = new Date().toISOString();
  const results: PredictionSnapshot['results'] = {};
  const errors: PredictionSnapshot['errors'] = {};
  try {
    results.indiasat = await fetchIndiaSATPrediction(lat, lon, opts?.indiasatYear ?? LATEST_INDIASAT_YEAR);
  } catch (e: unknown) {
    errors.indiasat = e instanceof Error ? e.message : String(e);
  }
  const tessera: TesseraPointContext = {
    ...tesseraTileForPoint(lat, lon),
    lat,
    lon,
    fetchedAt,
    coverage: 'unknown',
    source: 'grid',
    note: 'Tile id computed on device. Embedding sample is optional.',
  };
  return { lat, lon, fetchedAt, results, errors, tessera };
}
