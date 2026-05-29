/**
 * PredictionCard — the persistent "you are here" card that anchors the
 * Pokémon-GO-style validation loop.
 *
 * It listens for the active focus point (live GPS unless the user pins a
 * different location) and shows, side-by-side, what every prediction source
 * believes about that point: class name, colour swatch, confidence, and
 * "as-of" recency. From the card the user can launch a capture, or zoom into
 * a single source.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  PREDICTION_SOURCES,
  fetchPredictionSnapshot,
  type PredictionSnapshot,
  type PredictionResult,
  type PredictionSourceId,
} from '../services/PredictionService';
import { LATEST_INDIASAT_YEAR, INDIASAT_YEARS, type IndiaSATYear } from '../services/IndiaSATService';
import { DW_CLASSES } from '../services/DynamicWorldService';
import type { LocationData } from '../types';

interface PredictionCardProps {
  focusLocation: LocationData | null;
  isOnline: boolean;
  onValidate: (snapshot: PredictionSnapshot) => void;
  /** Optional callback so the user can choose a different IndiaSAT year. */
  onYearChange?: (year: IndiaSATYear) => void;
  /** Hide the heavy raster toggles if the parent owns layer state. */
  className?: string;
}

const formatConfidence = (c: number | null | undefined): string => {
  if (c == null || Number.isNaN(c)) return '—';
  const pct = c <= 1 ? c * 100 : c; // some sources report 0-1, some 0-100
  return `${pct.toFixed(0)}%`;
};

const formatLocation = (loc: LocationData) =>
  `${loc.lat.toFixed(5)}°, ${loc.lon.toFixed(5)}°${loc.accuracy ? ` · ±${Math.round(loc.accuracy)} m` : ''}`;

/** Map a DW class name to its palette colour. */
const dwColorByName = (name: string): string => {
  for (const cls of Object.values(DW_CLASSES)) {
    if (cls.name === name) return cls.color;
  }
  return '#888';
};

const PredictionRow: React.FC<{ source: PredictionSourceId; result: PredictionResult | null | undefined; error?: string }> = ({ source, result, error }) => {
  const meta = PREDICTION_SOURCES[source];
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (error && !result) {
    return (
      <div className="pred-row pred-row--err">
        <div className="pred-row__head">
          <span className="pred-row__title">{meta.shortTitle}</span>
          <span className="pred-row__meta">{meta.resolution}</span>
        </div>
        <div className="pred-row__err">No data: {error}</div>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="pred-row pred-row--empty">
        <div className="pred-row__head">
          <span className="pred-row__title">{meta.shortTitle}</span>
          <span className="pred-row__meta">{meta.resolution}</span>
        </div>
        <div className="pred-row__err">No coverage at this point.</div>
      </div>
    );
  }
  const conf = result.confidence;
  const confPct = conf == null ? 0 : conf <= 1 ? conf * 100 : conf;

  // Extract per-class probabilities for DW
  const probabilities = (source === 'dynamicworld' && result.extras?.probabilities)
    ? Object.entries(result.extras.probabilities as Record<string, number>)
        .sort(([, a], [, b]) => b - a)
    : null;

  return (
    <div className="pred-row" data-source={source}>
      <div className="pred-row__head">
        <span className="pred-row__title">{meta.shortTitle}</span>
        <span className="pred-row__meta">{meta.resolution} · {result.asOf}</span>
      </div>
      <div className="pred-row__class">
        <span className="pred-swatch" style={{ background: result.color }} aria-hidden />
        <span className="pred-row__class-name">{result.className}</span>
        <span className="pred-row__conf" title="Model confidence">{formatConfidence(conf)}</span>
      </div>
      <div className="pred-row__bar" role="progressbar" aria-valuenow={Math.round(confPct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${Math.max(2, Math.min(100, confPct))}%`, background: result.color }} />
      </div>

      {/* DW: Show full class breakdown since it's a probabilistic model */}
      {probabilities && probabilities.length > 1 && (
        <div className="pred-row__expand">
          <button
            className="pred-row__toggle"
            onClick={() => setShowBreakdown(v => !v)}
          >
            {showBreakdown ? 'Hide all classes ▴' : `All ${probabilities.length} classes ▾`}
          </button>
          {showBreakdown && (
            <div className="pred-breakdown">
              {probabilities.map(([name, prob]) => (
                <div key={name} className="pred-breakdown__item">
                  <span className="pred-swatch pred-swatch--sm" style={{ background: dwColorByName(name) }} aria-hidden />
                  <span className="pred-breakdown__name">{name}</span>
                  <div className="pred-breakdown__bar">
                    <span style={{ width: `${Math.max(1, prob * 100)}%`, background: dwColorByName(name) }} />
                  </div>
                  <span className="pred-breakdown__pct">{(prob * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* IndiaSAT: Deterministic — note why there's no breakdown */}
      {source === 'indiasat' && (
        <div className="pred-row__note">
          Deterministic classification (no per-class probabilities)
        </div>
      )}
    </div>
  );
};

const PredictionCard: React.FC<PredictionCardProps> = ({ focusLocation, isOnline, onValidate, onYearChange, className }) => {
  const [snapshot, setSnapshot] = useState<PredictionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [indiasatYear, setIndiasatYear] = useState<IndiaSATYear>(LATEST_INDIASAT_YEAR);
  const [expanded, setExpanded] = useState(true);

  // Round to a few decimals so tiny GPS jitter doesn't trigger refetches.
  const key = useMemo(() => {
    if (!focusLocation) return null;
    return `${focusLocation.lat.toFixed(4)},${focusLocation.lon.toFixed(4)},${indiasatYear}`;
  }, [focusLocation, indiasatYear]);

  useEffect(() => {
    if (!focusLocation || !isOnline) {
      setSnapshot(null);
      return;
    }
    let aborted = false;
    setLoading(true);
    fetchPredictionSnapshot(focusLocation.lat, focusLocation.lon, { indiasatYear })
      .then(s => { if (!aborted) setSnapshot(s); })
      .catch(e => console.warn('[PredictionCard] snapshot error', e))
      .finally(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, [key, focusLocation, indiasatYear, isOnline]);

  const handleYear = useCallback((y: IndiaSATYear) => {
    setIndiasatYear(y);
    onYearChange?.(y);
  }, [onYearChange]);

  const launchValidate = useCallback(() => {
    if (snapshot) onValidate(snapshot);
  }, [snapshot, onValidate]);

  if (!focusLocation) {
    return (
      <div className={`prediction-card prediction-card--empty ${className || ''}`}>
        <div className="prediction-card__lede">
          <strong>Locate yourself to begin</strong>
          <span>Tap <em>Locate me</em> or pick any point on the map to see what the models think.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`prediction-card ${expanded ? '' : 'prediction-card--collapsed'} ${className || ''}`}>
      <div className="prediction-card__header">
        <button className="prediction-card__pulse" onClick={() => setExpanded(e => !e)} aria-label="Toggle prediction card">
          <span className="dot" />
        </button>
        <div className="prediction-card__loc">
          <strong>Here</strong>
          <span>{formatLocation(focusLocation)}</span>
        </div>
        <div className="prediction-card__years">
          <label>IndiaSAT</label>
          <select value={indiasatYear} onChange={(e) => handleYear(Number(e.target.value) as IndiaSATYear)}>
            {INDIASAT_YEARS.map(y => <option key={y} value={y}>{y}–{y + 1}</option>)}
          </select>
        </div>
      </div>

      {expanded && (
        <>
          <div className="prediction-card__rows">
            <PredictionRow source="dynamicworld" result={snapshot?.results.dynamicworld ?? null} error={snapshot?.errors.dynamicworld} />
            <PredictionRow source="indiasat" result={snapshot?.results.indiasat ?? null} error={snapshot?.errors.indiasat} />
          </div>

          <div className="prediction-card__actions">
            <button className="btn btn--primary" disabled={!snapshot || loading} onClick={launchValidate}>
              {loading ? 'Loading predictions…' : 'Validate this spot'}
            </button>
            {!isOnline && <span className="prediction-card__hint">Offline · live predictions paused. Cached data only.</span>}
          </div>

          <div className="prediction-card__footer">
            <small>
              {snapshot ? `Pulled ${new Date(snapshot.fetchedAt).toLocaleTimeString()}` : 'Waiting for predictions…'}
            </small>
          </div>
        </>
      )}
    </div>
  );
};

export default PredictionCard;
