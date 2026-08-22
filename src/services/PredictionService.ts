/**
 * Unified LULC prediction model used across the UI.
 *
 * The app validates predictions from multiple geospatial models. Today:
 *   - Dynamic World (Google / WRI), 10 m, near-real-time (~5 day latency)
 *   - IndiaSAT (CoRE Stack / IIT Delhi), 30 m, annual hydrological year
 *
 * Both sources emit a class label, a confidence/probability, and a temporal
 * stamp. This shared shape lets the validation UI render any number of model
 * sources with the same component.
 */

import { dynamicWorldService, DW_CLASSES } from '../services/DynamicWorldService';
import {
  indiaSatService,
  INDIASAT_CLASSES,
  LATEST_INDIASAT_YEAR,
  type IndiaSATYear,
} from '../services/IndiaSATService';
import { tesseraService, type TesseraPointContext } from '../services/TesseraService';

export type PredictionSourceId = 'dynamicworld' | 'indiasat';

export interface PredictionSourceMeta {
  id: PredictionSourceId;
  title: string;
  shortTitle: string;
  description: string;
  resolution: string;
  temporal: string;
  citation: string;
  providerUrl: string;
}

export const PREDICTION_SOURCES: Record<PredictionSourceId, PredictionSourceMeta> = {
  dynamicworld: {
    id: 'dynamicworld',
    title: 'Dynamic World v1',
    shortTitle: 'Dynamic World',
    description: 'Near-real-time global LULC from Sentinel-2 (Google + WRI)',
    resolution: '10 m',
    temporal: '~5-day revisit',
    citation: 'Brown et al. (2022). Dynamic World, Near-real-time global 10 m land use land cover mapping.',
    providerUrl: 'https://dynamicworld.app/',
  },
  indiasat: {
    id: 'indiasat',
    title: 'IndiaSAT LULC',
    shortTitle: 'IndiaSAT',
    description: 'Annual 30 m hierarchical LULC for India (CoRE Stack / IIT Delhi)',
    resolution: '30 m',
    temporal: 'Annual (hydrological year)',
    citation: 'Sahasranaman et al. (2024). IndiaSAT LULC pipeline. core-stack.org/lulc/.',
    providerUrl: 'https://core-stack.org/lulc/',
  },
};

export interface PredictionResult {
  source: PredictionSourceId;
  /** Class identifier from the source's native legend. */
  classId: number;
  /** Human-readable class name from the source's native legend. */
  className: string;
  /** Visualisation colour for the class (hex). */
  color: string;
  /** [0..1] model-reported confidence/probability or null if not available. */
  confidence: number | null;
  /** ISO 8601 timestamp of the prediction (image acquisition or year). */
  timestamp: string;
  /** Human-readable temporal label, e.g. "2022 hydrological year" or "2024-05-18". */
  asOf: string;
  /** True if this prediction was produced live from the model backend. */
  live: boolean;
  /** True if this prediction was returned from a pre-bundled offline grid. */
  offline: boolean;
  /** Source-specific extra fields preserved for export. */
  extras?: Record<string, unknown>;
}

export interface PredictionSnapshot {
  lat: number;
  lon: number;
  fetchedAt: string;
  /** Per-source prediction, or null if unavailable (offline/no coverage). */
  results: Partial<Record<PredictionSourceId, PredictionResult | null>>;
  /** Per-source error message when the call failed. */
  errors: Partial<Record<PredictionSourceId, string>>;
  tessera?: TesseraPointContext | null;
}

function dwClassColor(classId: number): string {
  return DW_CLASSES[classId]?.color ?? '#888';
}

function indiasatClassColor(classId: number): string {
  return INDIASAT_CLASSES[classId]?.color ?? '#888';
}

/** Fetch Dynamic World prediction normalised into PredictionResult. */
export async function fetchDynamicWorldPrediction(lat: number, lon: number, date?: string): Promise<PredictionResult | null> {
  const data = await dynamicWorldService.fetchPointData(lat, lon, date);
  if (!data) return null;
  const classId = data.landCoverClassId;
  return {
    source: 'dynamicworld',
    classId,
    className: data.landCoverClass,
    color: dwClassColor(classId),
    confidence: data.confidence ?? null,
    timestamp: data.timestamp,
    asOf: data.timestamp?.slice(0, 10) || 'unknown',
    live: data.source === 'live',
    offline: data.source === 'offline',
    extras: {
      probabilities: data.probabilities,
      resolution: data.resolution,
    },
  };
}

/** Fetch IndiaSAT prediction normalised into PredictionResult. */
export async function fetchIndiaSATPrediction(lat: number, lon: number, year: IndiaSATYear = LATEST_INDIASAT_YEAR): Promise<PredictionResult | null> {
  const data = await indiaSatService.fetchPointData(lat, lon, year);
  if (!data) return null;
  return {
    source: 'indiasat',
    classId: data.classId,
    className: data.landCoverClass,
    color: indiasatClassColor(data.classId),
    confidence: data.confidence,
    timestamp: data.timestamp,
    asOf: `${data.year} hydrological year`,
    live: true,
    offline: false,
    extras: {
      assetId: data.assetId,
      band: data.band,
      year: data.year,
    },
  };
}

/** Fetch predictions from all enabled sources in parallel. */
export async function fetchPredictionSnapshot(lat: number, lon: number, opts?: { indiasatYear?: IndiaSATYear; dwDate?: string }): Promise<PredictionSnapshot> {
  const fetchedAt = new Date().toISOString();
  const results: PredictionSnapshot['results'] = {};
  const errors: PredictionSnapshot['errors'] = {};
  const tasks: Array<Promise<void>> = [];
  tasks.push(
    fetchDynamicWorldPrediction(lat, lon, opts?.dwDate)
      .then(r => { results.dynamicworld = r; })
      .catch(e => { errors.dynamicworld = String(e?.message || e); })
  );
  tasks.push(
    fetchIndiaSATPrediction(lat, lon, opts?.indiasatYear ?? LATEST_INDIASAT_YEAR)
      .then(r => { results.indiasat = r; })
      .catch(e => { errors.indiasat = String(e?.message || e); })
  );
  let tessera: TesseraPointContext | null = null;
  tasks.push(
    tesseraService.fetchPointContext(lat, lon)
      .then(r => { tessera = r; })
      .catch(() => { tessera = null; })
  );
  await Promise.all(tasks);
  return { lat, lon, fetchedAt, results, errors, tessera };
}
