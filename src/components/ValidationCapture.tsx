/**
 * Ground-first capture: what you see, then optional map agreement.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { imageService } from '../services/ImageService';
import { GeoLocationService } from '../services/GeoLocationService';
import { weatherService } from '../services/WeatherService';
import { deriveSeason } from '../services/SeasonService';
import { getDeviceId, getUserName } from '../services/DeviceService';
import { gbifService, type GBIFSpeciesSuggestion } from '../services/GBIFService';
import {
  type PredictionSnapshot,
  type PredictionResult,
  type PredictionSourceId,
} from '../services/PredictionService';
import { INDIASAT_CLASSES } from '../services/IndiaSATService';
import type {
  LocationData,
  Observation,
  ImageData,
  PredictionValidationRecord,
  LulcFieldData,
  WeatherSnapshot,
} from '../types';

interface ValidationCaptureProps {
  focusLocation: LocationData | null;
  snapshot: PredictionSnapshot | null;
  onSubmit: (obs: Observation) => void | Promise<void>;
  onClose: () => void;
}

type AgreementValue = 'agree' | 'disagree' | 'unsure' | 'unrated';
interface PerSourceState {
  agreement: AgreementValue;
  observerClassId?: number;
  observerClassName?: string;
}

const listClasses = (_source: PredictionSourceId): Array<{ id: number; name: string; color: string }> => {
  return Object.entries(INDIASAT_CLASSES).map(([id, info]) => ({ id: Number(id), name: info.name, color: info.color }));
};

const CROP_STAGES: NonNullable<NonNullable<LulcFieldData['crop']>['stage']>[] = [
  'pre-sowing', 'sowing', 'vegetative', 'flowering', 'fruiting', 'mature', 'harvested', 'fallow'
];

const COVER_LABELS: Record<string, string> = {
  tree: 'Trees', shrub: 'Shrubs', grass: 'Grass', crop: 'Crops',
  water: 'Water', built: 'Buildings / roads', bare: 'Bare ground', other: 'Other',
};

type AbundanceLevel = 'absent' | 'trace' | 'minor' | 'present' | 'major' | 'dominant';
const ABUNDANCE_LEVELS: { key: AbundanceLevel; label: string; percent: number }[] = [
  { key: 'absent', label: 'None', percent: 0 },
  { key: 'trace', label: 'A little', percent: 5 },
  { key: 'minor', label: 'Some', percent: 15 },
  { key: 'present', label: 'A lot', percent: 30 },
  { key: 'major', label: 'Mostly', percent: 50 },
  { key: 'dominant', label: 'Almost all', percent: 70 },
];

const ValidationCapture: React.FC<ValidationCaptureProps> = ({ focusLocation, snapshot, onSubmit, onClose }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const sources = useMemo<PredictionSourceId[]>(() => ['indiasat'], []);
  const [perSource, setPerSource] = useState<Record<PredictionSourceId, PerSourceState>>({
    indiasat: { agreement: 'unrated' },
  });
  const [location, setLocation] = useState<LocationData | null>(focusLocation);
  const [locationSource, setLocationSource] = useState<'gps' | 'exif' | 'pinned' | null>(focusLocation ? 'pinned' : null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [field, setField] = useState<LulcFieldData>({});
  const [fieldConfidence, setFieldConfidence] = useState<number>(0.7);
  const [qualNotes, setQualNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gbif, setGbif] = useState<GBIFSpeciesSuggestion[]>([]);

  useEffect(() => {
    if (!focusLocation) {
      const svc = new GeoLocationService();
      svc.getCurrentPosition().then(loc => {
        setLocation(loc);
        setLocationSource('gps');
      }).catch(() => {/* leave null */});
    }
  }, [focusLocation]);

  useEffect(() => {
    if (!location) return;
    gbifService.getSuggestionsNearby({ lat: location.lat, lon: location.lon, kingdom: 'Plantae', radiusKm: 10, limit: 8 })
      .then(setGbif)
      .catch(() => setGbif([]));
  }, [location?.lat, location?.lon]);

  const handleAgree = useCallback((source: PredictionSourceId, value: AgreementValue) => {
    setPerSource(prev => ({
      ...prev,
      [source]: {
        ...prev[source],
        agreement: value,
        ...(value !== 'disagree' ? { observerClassId: undefined, observerClassName: undefined } : {}),
      },
    }));
  }, []);

  const handleObserverClass = useCallback((source: PredictionSourceId, classId: number) => {
    const klass = listClasses(source).find(c => c.id === classId);
    setPerSource(prev => ({
      ...prev,
      [source]: { ...prev[source], observerClassId: classId, observerClassName: klass?.name },
    }));
  }, []);

  const handlePhoto = useCallback(async (mode: 'camera' | 'gallery') => {
    setCapturing(true);
    setError(null);
    try {
      const file = mode === 'camera' ? await imageService.captureFromCamera() : await imageService.selectFromGallery();
      if (!file) return;
      const data = await imageService.processImage(file);
      setImageData(data);
      if (data.exif.lat && data.exif.lon) {
        setLocation({ lat: data.exif.lat, lon: data.exif.lon, accuracy: 0, timestamp: Date.now() });
        setLocationSource('exif');
      }
      if (data.thumbnail) setImagePreview(data.thumbnail);
      else setImagePreview(await imageService.getImageUrl(data.blobId));
    } catch (e: any) {
      setError(`Photo failed: ${e?.message || e}`);
    } finally {
      setCapturing(false);
    }
  }, []);

  const getAbundanceLevel = (cover: string): AbundanceLevel => {
    const pct = field.coverComposition?.find(c => c.cover === cover)?.percent ?? 0;
    if (pct === 0) return 'absent';
    if (pct <= 5) return 'trace';
    if (pct <= 15) return 'minor';
    if (pct <= 30) return 'present';
    if (pct <= 50) return 'major';
    return 'dominant';
  };

  const setCoverLevel = (cover: 'tree' | 'shrub' | 'grass' | 'crop' | 'water' | 'built' | 'bare' | 'other', level: AbundanceLevel) => {
    const pct = ABUNDANCE_LEVELS.find(l => l.key === level)?.percent ?? 0;
    setField(prev => {
      const existing = prev.coverComposition || [];
      const next = existing.filter(e => e.cover !== cover);
      if (pct > 0) next.push({ cover, percent: pct });
      return { ...prev, coverComposition: next.sort((a, b) => b.percent - a.percent) };
    });
  };

  const coverTotal = (field.coverComposition || []).reduce((s, c) => s + c.percent, 0);
  const showTrees = (field.coverComposition || []).some(c => c.cover === 'tree' && c.percent > 0);
  const showCrop = (field.coverComposition || []).some(c => c.cover === 'crop' && c.percent > 0);
  const showWater = (field.coverComposition || []).some(c => c.cover === 'water' && c.percent > 0);
  const showBuilt = (field.coverComposition || []).some(c => c.cover === 'built' && c.percent > 0);

  const canSave = !!location && (coverTotal > 0 || !!qualNotes.trim() || !!imageData);

  const handleSubmit = async () => {
    if (!canSave || !location) {
      setError('Add a location, then tap what you see, write a note, or take a photo.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const capturedAt = new Date().toISOString();
      const validationRecord: PredictionValidationRecord = {
        capturedAt,
        perSource: sources.map(src => {
          const s = perSource[src];
          const r: PredictionResult | null = snapshot?.results[src] ?? null;
          return {
            source: src,
            classId: r?.classId ?? -1,
            className: r?.className ?? 'unknown',
            classColor: r?.color ?? '#888',
            confidence: r?.confidence ?? null,
            asOf: r?.asOf ?? 'unknown',
            live: r?.live ?? false,
            agreement: s.agreement,
            observerClassId: s.observerClassId,
            observerClassName: s.observerClassName,
            extras: r?.extras,
          };
        }),
      };

      let weather: WeatherSnapshot | undefined;
      try {
        const w = await weatherService.getWeather(location.lat, location.lon);
        if (w) {
          weather = {
            fetchedAt: w.fetchedAt,
            source: 'open-meteo',
            temperatureC: w.current.temperature,
            humidityPercent: w.current.humidity,
            precipitationMm: w.current.precipitation,
            windSpeedKph: w.current.windSpeed,
            windDirectionDeg: w.current.windDirection,
            weatherCode: w.current.weatherCode,
            description: w.current.weatherDescription,
            isDay: w.current.isDay,
          };
        }
      } catch {
        /* optional */
      }

      const agreements = sources.map(src => perSource[src].agreement);
      const userValidation: Observation['userValidation'] =
        agreements.every(a => a === 'unrated') ? 'unclear'
        : agreements.every(a => a === 'agree' || a === 'unrated') && agreements.some(a => a === 'agree') ? 'match'
        : agreements.some(a => a === 'disagree') ? 'mismatch'
        : 'unclear';

      const deviceId = getDeviceId();
      const tessera = snapshot?.tessera;
      const observation: Observation = {
        id: uuidv4(),
        timestamp: capturedAt,
        location,
        context: { region: 'India', areaMode: 'point' },
        datasetValues: {},
        image: imageData || undefined,
        userValidation,
        notes: qualNotes,
        observationType: showTrees && field.dominantSpecies ? 'species_sighting' : 'land_cover',
        confidence: Math.round(fieldConfidence * 5),
        season: deriveSeason(capturedAt),
        userId: getUserName() || deviceId,
        deviceId,
        synced: false,
        syncStatus: 'pending',
        enrichmentSources: [
          ...(snapshot?.results.indiasat ? ['indiasat'] : []),
          ...(tessera ? ['tessera'] : []),
          ...(weather ? ['weather'] : []),
        ],
        predictionValidation: validationRecord,
        fieldData: { ...field, fieldConfidence, qualitativeNotes: qualNotes },
        weather,
        tessera: tessera ? {
          year: tessera.year,
          tileId: tessera.tileId,
          tileLon: tessera.tileLon,
          tileLat: tessera.tileLat,
          coverage: tessera.coverage,
          source: tessera.source,
          embeddingDim: tessera.embeddingDim,
          embeddingPreview: tessera.embeddingPreview,
          pcaRgb: tessera.pcaRgb,
          note: tessera.note,
        } : undefined,
        speciesData: field.dominantSpecies ? {
          speciesId: field.dominantSpecies,
          vernacularName: field.dominantSpecies,
        } : undefined,
      };

      await onSubmit(observation);
    } catch (e: any) {
      setError(`Could not save: ${e?.message || e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="vc-overlay" role="dialog" aria-modal="true">
      <div className="vc-modal">
        <header className="vc-header">
          <button className="vc-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="vc-steps">
            <span className={step >= 1 ? 'active' : ''}>1 · What you see</span>
            <span className={step >= 2 ? 'active' : ''}>2 · Maps (optional)</span>
          </div>
        </header>

        <main className="vc-body">
          {step === 1 && (
            <section className="vc-section">
              <h3>What is on the ground here?</h3>
              <p className="vc-help">Tap how much of each you see. A photo helps later — it is not required.</p>
              <small className="vc-loc">
                {location ? `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)} · ${locationSource || 'gps'}` : 'Waiting for GPS… tap Locate me on the map first if this stays empty.'}
              </small>

              <div className="vc-cover-chips">
                {(['tree', 'shrub', 'grass', 'crop', 'water', 'built', 'bare', 'other'] as const).map(c => {
                  const level = getAbundanceLevel(c);
                  return (
                    <div key={c} className="vc-cover-chip-row">
                      <span className="vc-cover-chip-label">{COVER_LABELS[c]}</span>
                      <div className="vc-cover-chip-levels">
                        {ABUNDANCE_LEVELS.map(al => (
                          <button
                            key={al.key}
                            className={`vc-chip ${level === al.key ? 'vc-chip--on' : ''} ${al.key === 'absent' ? 'vc-chip--absent' : ''}`}
                            onClick={() => setCoverLevel(c, al.key)}
                            type="button"
                          >
                            {al.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {showTrees && (
                <div className="vc-field-block">
                  <h4>Trees</h4>
                  <div className="vc-category-btns">
                    {([
                      { value: 'native' as const, label: 'Native forest' },
                      { value: 'plantation' as const, label: 'Plantation' },
                      { value: 'mixed' as const, label: 'Mixed' },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`vc-cat-btn ${field.forest?.type === opt.value ? 'vc-cat-btn--on' : ''}`}
                        onClick={() => setField(f => ({ ...f, forest: { ...f.forest, type: opt.value } }))}
                      >
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  <label className="vc-field-label">Tree / crop name
                    <input
                      type="text"
                      placeholder="Name you know, or scientific name"
                      value={field.dominantSpecies ?? ''}
                      onChange={(e) => setField(f => ({ ...f, dominantSpecies: e.target.value || undefined }))}
                    />
                  </label>
                  {gbif.length > 0 && (
                    <div className="vc-gbif">
                      <small>Nearby plants (GBIF) — tap to fill the name</small>
                      <div className="vc-gbif-chips">
                        {gbif.slice(0, 8).map(s => (
                          <button
                            key={s.scientificName}
                            type="button"
                            className="vc-chip"
                            onClick={() => setField(f => ({ ...f, dominantSpecies: s.commonName || s.scientificName }))}
                          >
                            {s.commonName || s.scientificName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <label className="vc-field-label">Canopy
                    <div className="vc-category-btns">
                      {([
                        { value: 15, label: 'Open' },
                        { value: 40, label: 'Patchy' },
                        { value: 65, label: 'Dense' },
                        { value: 90, label: 'Closed' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`vc-cat-btn ${field.canopyCoverPercent === opt.value ? 'vc-cat-btn--on' : ''}`}
                          onClick={() => setField(f => ({ ...f, canopyCoverPercent: opt.value }))}
                        >
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
              )}

              {showCrop && (
                <div className="vc-field-block">
                  <h4>Crops</h4>
                  <label className="vc-field-label">What is growing?
                    <input type="text" placeholder="paddy, ragi, tea…" value={field.crop?.type ?? ''} onChange={(e) => setField(f => ({ ...f, crop: { ...f.crop, type: e.target.value || undefined } }))} />
                  </label>
                  <label className="vc-field-label">Stage
                    <select value={field.crop?.stage ?? ''} onChange={(e) => setField(f => ({ ...f, crop: { ...f.crop, stage: (e.target.value || undefined) as typeof CROP_STAGES[number] } }))}>
                      <option value="">Skip</option>
                      {CROP_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
              )}

              {showWater && (
                <div className="vc-field-block">
                  <h4>Water</h4>
                  <select value={field.water?.permanence ?? ''} onChange={(e) => setField(f => ({ ...f, water: { ...f.water, permanence: (e.target.value || undefined) as NonNullable<LulcFieldData['water']>['permanence'] } }))}>
                    <option value="">Is it always here?</option>
                    <option value="permanent">Always</option>
                    <option value="seasonal">Seasonal</option>
                    <option value="ephemeral">After rain only</option>
                    <option value="dry">Dry today</option>
                  </select>
                </div>
              )}

              {showBuilt && (
                <div className="vc-field-block">
                  <h4>Buildings / roads</h4>
                  <select value={field.built?.use ?? ''} onChange={(e) => setField(f => ({ ...f, built: { ...f.built, use: (e.target.value || undefined) as NonNullable<LulcFieldData['built']>['use'] } }))}>
                    <option value="">What is it used for?</option>
                    <option value="residential">Homes</option>
                    <option value="commercial">Shops</option>
                    <option value="industrial">Industry</option>
                    <option value="road">Road</option>
                    <option value="mixed">Mixed</option>
                    <option value="unknown">Not sure</option>
                  </select>
                </div>
              )}

              <div className="vc-photo">
                {imagePreview ? <img src={imagePreview} alt="Ground photo" className="vc-photo__preview" /> : <div className="vc-photo__placeholder">Photo optional</div>}
                <div className="vc-photo__btns">
                  <button className="btn" onClick={() => handlePhoto('camera')} disabled={capturing}>Camera</button>
                  <button className="btn" onClick={() => handlePhoto('gallery')} disabled={capturing}>Gallery</button>
                </div>
              </div>

              <label className="vc-field-label">Notes
                <textarea rows={3} value={qualNotes} placeholder="Anything a later map-maker should know" onChange={(e) => setQualNotes(e.target.value)} />
              </label>
              <div className="vc-confidence-btns">
                {([
                  { value: 0.4, label: 'Not sure' },
                  { value: 0.7, label: 'Fairly sure' },
                  { value: 0.95, label: 'Very sure' },
                ] as const).map(opt => (
                  <button key={opt.value} type="button" className={`vc-cat-btn ${fieldConfidence === opt.value ? 'vc-cat-btn--on' : ''}`} onClick={() => setFieldConfidence(opt.value)}>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
              {error && <div className="vc-error">{error}</div>}
            </section>
          )}

          {step === 2 && (
            <section className="vc-section">
              <h3>Do the maps match?</h3>
              <p className="vc-help">Skip this if you just want to save what you saw. Matching maps is extra signal for model training.</p>
              {snapshot?.tessera && (
                <div className="vc-source">
                  <div className="vc-source__title">
                    <strong>Tessera</strong>
                    <small>foundation model tile {snapshot.tessera.tileId}</small>
                  </div>
                  <p className="vc-help" style={{ marginBottom: 0 }}>
                    {snapshot.tessera.coverage === 'sampled' ? 'Embedding sampled for this point.' : 'Tile recorded so this label can join Tessera embeddings later.'}
                  </p>
                </div>
              )}
              {sources.map(src => {
                const r = snapshot?.results[src];
                const s = perSource[src];
                return (
                  <div key={src} className="vc-source">
                    <div className="vc-source__title">
                      <strong>India land cover (CoRE)</strong>
                      <small>{r?.asOf ?? '—'}</small>
                    </div>
                    <div className="vc-source__pred">
                      {r ? (
                        <>
                          <span className="pred-swatch" style={{ background: r.color }} />
                          <span>{r.className}</span>
                        </>
                      ) : <em>No map at this spot (offline or no coverage)</em>}
                    </div>
                    <div className="vc-agree">
                      <button className={`pill ${s.agreement === 'agree' ? 'on' : ''}`} onClick={() => handleAgree(src, 'agree')} disabled={!r}>Looks right</button>
                      <button className={`pill pill--no ${s.agreement === 'disagree' ? 'on' : ''}`} onClick={() => handleAgree(src, 'disagree')} disabled={!r}>Looks wrong</button>
                      <button className={`pill pill--maybe ${s.agreement === 'unsure' ? 'on' : ''}`} onClick={() => handleAgree(src, 'unsure')} disabled={!r}>Not sure</button>
                    </div>
                    {s.agreement === 'disagree' && (
                      <div className="vc-obsclass">
                        <label>It is actually</label>
                        <select value={s.observerClassId ?? ''} onChange={(e) => handleObserverClass(src, Number(e.target.value))}>
                          <option value="" disabled>Pick a class…</option>
                          {listClasses(src).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
              {error && <div className="vc-error">{error}</div>}
            </section>
          )}
        </main>

        <footer className="vc-footer">
          {step === 1 ? (
            <>
              <button className="btn" onClick={onClose}>Cancel</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" disabled={!canSave || submitting} onClick={() => setStep(2)}>Check maps</button>
                <button className="btn btn--primary" disabled={!canSave || submitting} onClick={handleSubmit}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn--primary" disabled={!canSave || submitting} onClick={handleSubmit}>
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};

export default ValidationCapture;
