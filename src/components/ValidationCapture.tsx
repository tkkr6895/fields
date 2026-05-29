/**
 * ValidationCapture — researcher-grade capture flow for an LULC observation.
 *
 * Drives the user through three lightweight steps:
 *
 *   1. Agreement: for each prediction source, tap Agree / Disagree / Unsure.
 *      When Disagree is chosen, the user picks the class they believe is
 *      correct from the source's native legend.
 *   2. Photo + ground variables: a geotagged photo is mandatory; LULC-relevant
 *      quantitative variables are surfaced contextually (e.g. crop fields if
 *      either source says "crops" or the user asserts "crops").
 *   3. Notes + submit: qualitative notes, observer confidence, review summary.
 *
 * Weather is captured automatically from Open-Meteo at submission time.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { imageService } from '../services/ImageService';
import { GeoLocationService } from '../services/GeoLocationService';
import { weatherService } from '../services/WeatherService';
import { deriveSeason } from '../services/SeasonService';
import { getDeviceId, getUserName } from '../services/DeviceService';
import {
  PREDICTION_SOURCES,
  type PredictionSnapshot,
  type PredictionResult,
  type PredictionSourceId,
} from '../services/PredictionService';
import { DW_CLASSES } from '../services/DynamicWorldService';
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
  notes?: string;
}

const listClasses = (source: PredictionSourceId): Array<{ id: number; name: string; color: string }> => {
  if (source === 'dynamicworld') {
    return Object.entries(DW_CLASSES).map(([id, info]) => ({ id: Number(id), name: info.name, color: info.color }));
  }
  return Object.entries(INDIASAT_CLASSES).map(([id, info]) => ({ id: Number(id), name: info.name, color: info.color }));
};

const CROP_STAGES: NonNullable<NonNullable<LulcFieldData['crop']>['stage']>[] = [
  'pre-sowing', 'sowing', 'vegetative', 'flowering', 'fruiting', 'mature', 'harvested', 'fallow'
];

const ValidationCapture: React.FC<ValidationCaptureProps> = ({ focusLocation, snapshot, onSubmit, onClose }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — agreement
  const sources = useMemo<PredictionSourceId[]>(() => ['dynamicworld', 'indiasat'], []);
  const [perSource, setPerSource] = useState<Record<PredictionSourceId, PerSourceState>>({
    dynamicworld: { agreement: 'unrated' },
    indiasat: { agreement: 'unrated' },
  });

  // Step 2 — capture
  const [location, setLocation] = useState<LocationData | null>(focusLocation);
  const [locationSource, setLocationSource] = useState<'gps' | 'exif' | 'pinned' | null>(focusLocation ? 'pinned' : null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Field variables
  const [field, setField] = useState<LulcFieldData>({});

  // Step 3 — notes & confidence
  const [fieldConfidence, setFieldConfidence] = useState<number>(0.7);
  const [qualNotes, setQualNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh GPS in the background
  useEffect(() => {
    if (!focusLocation) {
      const svc = new GeoLocationService();
      svc.getCurrentPosition().then(loc => {
        setLocation(loc);
        setLocationSource('gps');
      }).catch(() => {/* leave null */});
    }
  }, [focusLocation]);

  const handleAgree = useCallback((source: PredictionSourceId, value: AgreementValue) => {
    setPerSource(prev => ({
      ...prev,
      [source]: {
        ...prev[source],
        agreement: value,
        // Clear observer class when not disagreeing
        ...(value !== 'disagree' ? { observerClassId: undefined, observerClassName: undefined } : {}),
      },
    }));
  }, []);

  const handleObserverClass = useCallback((source: PredictionSourceId, classId: number) => {
    const klass = listClasses(source).find(c => c.id === classId);
    setPerSource(prev => ({
      ...prev,
      [source]: {
        ...prev[source],
        observerClassId: classId,
        observerClassName: klass?.name,
      },
    }));
  }, []);

  // Photo handlers
  const handlePhoto = useCallback(async (mode: 'camera' | 'gallery') => {
    setCapturing(true);
    setError(null);
    try {
      const file = mode === 'camera' ? await imageService.captureFromCamera() : await imageService.selectFromGallery();
      if (!file) return;
      const data = await imageService.processImage(file);
      setImageData(data);
      // Prefer EXIF GPS if available — closer to the moment of capture.
      if (data.exif.lat && data.exif.lon) {
        setLocation({ lat: data.exif.lat, lon: data.exif.lon, accuracy: 0, timestamp: Date.now() });
        setLocationSource('exif');
      }
      if (data.thumbnail) {
        setImagePreview(data.thumbnail);
      } else {
        const url = await imageService.getImageUrl(data.blobId);
        setImagePreview(url);
      }
    } catch (e: any) {
      setError(`Photo capture failed: ${e?.message || e}`);
    } finally {
      setCapturing(false);
    }
  }, []);

  // Decide which contextual field blocks to show, driven by:
  //  - the model predictions, and
  //  - the observer-asserted class (if disagreed)
  const surfacedTopics = useMemo(() => {
    const topics = new Set<'crop' | 'water' | 'built' | 'forest'>();
    const considerClass = (source: PredictionSourceId, classId: number | undefined) => {
      if (classId == null) return;
      if (source === 'dynamicworld') {
        if (classId === 1) topics.add('forest');
        if (classId === 4) topics.add('crop');
        if (classId === 6) topics.add('built');
        if (classId === 0 || classId === 3) topics.add('water');
      } else {
        if (classId === 1) topics.add('built');
        if (classId >= 2 && classId <= 4) topics.add('water');
        if (classId === 5 || (classId >= 8 && classId <= 11)) topics.add('crop');
        if (classId === 6) topics.add('forest');
      }
    };
    sources.forEach(src => {
      considerClass(src, snapshot?.results[src]?.classId);
      considerClass(src, perSource[src].observerClassId);
    });
    return topics;
  }, [snapshot, perSource, sources]);

  // Helpers for cover composition — tappable abundance levels
  type AbundanceLevel = 'absent' | 'trace' | 'minor' | 'present' | 'major' | 'dominant';
  const ABUNDANCE_LEVELS: { key: AbundanceLevel; label: string; percent: number }[] = [
    { key: 'absent',   label: '—',        percent: 0 },
    { key: 'trace',    label: 'Trace',     percent: 5 },
    { key: 'minor',    label: 'Minor',     percent: 15 },
    { key: 'present',  label: 'Some',      percent: 30 },
    { key: 'major',    label: 'Major',     percent: 50 },
    { key: 'dominant', label: 'Dominant',  percent: 70 },
  ];
  const COVER_LABELS: Record<string, string> = {
    tree: '🌳 Tree', shrub: '🌿 Shrub', grass: '🌾 Grass', crop: '🌾 Crop',
    water: '💧 Water', built: '🏘 Built', bare: '🪨 Bare', other: '❓ Other',
  };

  const getAbundanceLevel = (cover: string): AbundanceLevel => {
    const pct = field.coverComposition?.find(c => c.cover === cover)?.percent ?? 0;
    if (pct === 0) return 'absent';
    if (pct <= 5) return 'trace';
    if (pct <= 15) return 'minor';
    if (pct <= 30) return 'present';
    if (pct <= 50) return 'major';
    return 'dominant';
  };

  const setCoverLevel = (cover: string, level: AbundanceLevel) => {
    const pct = ABUNDANCE_LEVELS.find(l => l.key === level)?.percent ?? 0;
    setField(prev => {
      const existing = prev.coverComposition || [];
      const next = existing.filter(e => e.cover !== cover);
      if (pct > 0) next.push({ cover: cover as any, percent: pct });
      return { ...prev, coverComposition: next.sort((a, b) => b.percent - a.percent) };
    });
  };

  const coverTotal = (field.coverComposition || []).reduce((s, c) => s + c.percent, 0);

  // Step 1 validation
  const step1Valid = sources.every(src => {
    const s = perSource[src];
    if (s.agreement === 'unrated') return false;
    if (s.agreement === 'disagree' && s.observerClassId == null) return false;
    return true;
  });
  const step2Valid = !!imageData && !!location;

  const handleSubmit = async () => {
    if (!step1Valid || !step2Valid || !location) {
      setError('Please complete required steps before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const capturedAt = new Date().toISOString();

      // Build per-source validation record.
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

      // Capture weather (best-effort).
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
      } catch (e) {
        console.warn('[ValidationCapture] weather fetch failed', e);
      }

      // Derive a primary validation status from the union of agreements.
      const agreements = sources.map(src => perSource[src].agreement);
      const userValidation: Observation['userValidation'] =
        agreements.every(a => a === 'agree') ? 'match'
        : agreements.some(a => a === 'disagree') ? 'mismatch'
        : 'unclear';

      const now = capturedAt;
      const deviceId = getDeviceId();
      const userId = getUserName() || deviceId;

      const observation: Observation = {
        id: uuidv4(),
        timestamp: now,
        location,
        context: {
          region: 'India',
          areaMode: 'point',
        },
        datasetValues: {},
        image: imageData!,
        userValidation,
        notes: qualNotes,
        observationType: 'land_cover',
        confidence: Math.round(fieldConfidence * 5),
        season: deriveSeason(now),
        userId,
        deviceId,
        synced: false,
        syncStatus: 'pending',
        enrichmentSources: [
          ...(snapshot?.results.dynamicworld ? ['dynamicworld'] : []),
          ...(snapshot?.results.indiasat ? ['indiasat'] : []),
          ...(weather ? ['weather'] : []),
        ],
        predictionValidation: validationRecord,
        fieldData: { ...field, fieldConfidence, qualitativeNotes: qualNotes },
        weather,
      };

      await onSubmit(observation);
    } catch (e: any) {
      setError(`Submission failed: ${e?.message || e}`);
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
            <span className={step >= 1 ? 'active' : ''}>1 · Agreement</span>
            <span className={step >= 2 ? 'active' : ''}>2 · Photo &amp; ground</span>
            <span className={step >= 3 ? 'active' : ''}>3 · Notes</span>
          </div>
          {snapshot && (
            <div className="vc-enrichment-badge">
              {snapshot.results.dynamicworld && <span title="Dynamic World prediction attached">🌍 DW</span>}
              {snapshot.results.indiasat && <span title="IndiaSAT prediction attached">🛰 IndiaSAT</span>}
              <small>auto-attached</small>
            </div>
          )}
        </header>

        <main className="vc-body">
          {step === 1 && (
            <section className="vc-section">
              <h3>Does each model match the ground?</h3>
              <p className="vc-help">Tap your judgement for each prediction. If you disagree, pick what you actually see.</p>
              {sources.map(src => {
                const meta = PREDICTION_SOURCES[src];
                const r = snapshot?.results[src];
                const s = perSource[src];
                return (
                  <div key={src} className="vc-source">
                    <div className="vc-source__title">
                      <strong>{meta.shortTitle}</strong>
                      <small>{meta.resolution} · {r?.asOf ?? '—'}</small>
                    </div>
                    <div className="vc-source__pred">
                      {r ? (
                        <>
                          <span className="pred-swatch" style={{ background: r.color }} />
                          <span>{r.className}</span>
                          <small>{r.confidence != null ? `${Math.round((r.confidence <= 1 ? r.confidence * 100 : r.confidence))}%` : '—'}</small>
                        </>
                      ) : <em>No prediction available</em>}
                    </div>
                    <div className="vc-agree">
                      <button className={`pill ${s.agreement === 'agree' ? 'on' : ''}`} onClick={() => handleAgree(src, 'agree')} disabled={!r}>Agree</button>
                      <button className={`pill pill--no ${s.agreement === 'disagree' ? 'on' : ''}`} onClick={() => handleAgree(src, 'disagree')} disabled={!r}>Disagree</button>
                      <button className={`pill pill--maybe ${s.agreement === 'unsure' ? 'on' : ''}`} onClick={() => handleAgree(src, 'unsure')} disabled={!r}>Unsure</button>
                    </div>
                    {s.agreement === 'disagree' && (
                      <div className="vc-obsclass">
                        <label>I think it's actually:</label>
                        <select value={s.observerClassId ?? ''} onChange={(e) => handleObserverClass(src, Number(e.target.value))}>
                          <option value="" disabled>Select class…</option>
                          {listClasses(src).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {step === 2 && (
            <section className="vc-section">
              <h3>Photo &amp; ground variables</h3>
              <p className="vc-help">A geotagged photo is required. Fill what you can verify on the ground.</p>

              <div className="vc-photo">
                {imagePreview ? (
                  <img src={imagePreview} alt="Ground photo" className="vc-photo__preview" />
                ) : (
                  <div className="vc-photo__placeholder">No photo yet</div>
                )}
                <div className="vc-photo__btns">
                  <button className="btn" onClick={() => handlePhoto('camera')} disabled={capturing}>📷 Camera</button>
                  <button className="btn" onClick={() => handlePhoto('gallery')} disabled={capturing}>🖼 Gallery</button>
                </div>
                <small className="vc-loc">
                  {location ? `Location: ${location.lat.toFixed(5)}, ${location.lon.toFixed(5)} · source: ${locationSource}` : 'No location yet'}
                </small>
              </div>

              <div className="vc-field-block">
                <h4>What cover types do you see?</h4>
                <p className="vc-help">Tap each cover type to set its abundance. These are rough estimates — don't worry about exact percentages.</p>
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
                <div className={`vc-cover-total ${coverTotal > 0 ? 'ok' : ''}`}>
                  {coverTotal > 0 ? `~${coverTotal}% accounted for` : 'No cover types selected yet'}
                </div>
              </div>

              {surfacedTopics.has('forest') && (
                <div className="vc-field-block">
                  <h4>🌳 Trees / Forest</h4>
                  <label className="vc-field-label">Canopy cover
                    <div className="vc-category-btns">
                      {([
                        { value: 15,  label: 'Open', desc: '<25%' },
                        { value: 40,  label: 'Moderate', desc: '25–50%' },
                        { value: 65,  label: 'Dense', desc: '50–75%' },
                        { value: 90,  label: 'Closed', desc: '>75%' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`vc-cat-btn ${field.canopyCoverPercent === opt.value ? 'vc-cat-btn--on' : ''}`}
                          onClick={() => setField(f => ({ ...f, canopyCoverPercent: f.canopyCoverPercent === opt.value ? undefined : opt.value }))}
                        >
                          <span>{opt.label}</span>
                          <small>{opt.desc}</small>
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="vc-field-label">Forest type
                    <select value={field.forest?.type ?? ''} onChange={(e) => setField(f => ({ ...f, forest: { ...f.forest, type: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option><option value="native">Native</option><option value="plantation">Plantation</option><option value="mixed">Mixed</option>
                    </select>
                  </label>
                  <label className="vc-field-label">Height class
                    <select value={field.forest?.heightClass ?? ''} onChange={(e) => setField(f => ({ ...f, forest: { ...f.forest, heightClass: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option><option value="<5m">&lt;5 m</option><option value="5-15m">5–15 m</option><option value="15-30m">15–30 m</option><option value=">30m">&gt;30 m</option>
                    </select>
                  </label>
                  <label className="vc-field-label">Disturbance
                    <select value={field.forest?.disturbance ?? ''} onChange={(e) => setField(f => ({ ...f, forest: { ...f.forest, disturbance: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option><option value="none">None visible</option><option value="logged">Logged</option><option value="burned">Burned</option><option value="grazed">Grazed</option>
                    </select>
                  </label>
                </div>
              )}

              {surfacedTopics.has('crop') && (
                <div className="vc-field-block">
                  <h4>🌾 Cropland</h4>
                  <label className="vc-field-label">Crop type
                    <input type="text" placeholder="e.g. paddy, ragi, sugarcane" value={field.crop?.type ?? ''} onChange={(e) => setField(f => ({ ...f, crop: { ...f.crop, type: e.target.value || undefined } }))} />
                  </label>
                  <label className="vc-field-label">Growth stage
                    <select value={field.crop?.stage ?? ''} onChange={(e) => setField(f => ({ ...f, crop: { ...f.crop, stage: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option>
                      {CROP_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="vc-field-label">Irrigation
                    <select value={field.crop?.irrigation ?? ''} onChange={(e) => setField(f => ({ ...f, crop: { ...f.crop, irrigation: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option><option value="rainfed">Rainfed</option><option value="irrigated_canal">Canal</option><option value="irrigated_borewell">Borewell</option><option value="irrigated_other">Other irrigated</option><option value="unknown">Unknown</option>
                    </select>
                  </label>
                  <label className="vc-field-label">Season
                    <select value={field.crop?.season ?? ''} onChange={(e) => setField(f => ({ ...f, crop: { ...f.crop, season: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option><option value="kharif">Kharif</option><option value="rabi">Rabi</option><option value="zaid">Zaid</option>
                    </select>
                  </label>
                </div>
              )}

              {surfacedTopics.has('water') && (
                <div className="vc-field-block">
                  <h4>💧 Water body</h4>
                  <label className="vc-field-label">Permanence
                    <select value={field.water?.permanence ?? ''} onChange={(e) => setField(f => ({ ...f, water: { ...f.water, permanence: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option><option value="permanent">Permanent</option><option value="seasonal">Seasonal</option><option value="ephemeral">Ephemeral</option><option value="dry">Dry today</option>
                    </select>
                  </label>
                  <label className="vc-field-label">Extent vs typical
                    <select value={field.water?.extentChange ?? ''} onChange={(e) => setField(f => ({ ...f, water: { ...f.water, extentChange: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option><option value="shrunk">Shrunk</option><option value="stable">Stable</option><option value="expanded">Expanded</option>
                    </select>
                  </label>
                </div>
              )}

              {surfacedTopics.has('built') && (
                <div className="vc-field-block">
                  <h4>🏘 Built-up</h4>
                  <label className="vc-field-label">Density
                    <select value={field.built?.density ?? ''} onChange={(e) => setField(f => ({ ...f, built: { ...f.built, density: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option><option value="sparse">Sparse</option><option value="moderate">Moderate</option><option value="dense">Dense</option>
                    </select>
                  </label>
                  <label className="vc-field-label">Use
                    <select value={field.built?.use ?? ''} onChange={(e) => setField(f => ({ ...f, built: { ...f.built, use: (e.target.value || undefined) as any } }))}>
                      <option value="">Select…</option><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="industrial">Industrial</option><option value="road">Road/transport</option><option value="mixed">Mixed</option><option value="unknown">Unknown</option>
                    </select>
                  </label>
                </div>
              )}

              <div className="vc-field-block">
                <h4>Dominant species (optional)</h4>
                <input type="text" placeholder="e.g. Tectona grandis, Areca catechu" value={field.dominantSpecies ?? ''} onChange={(e) => setField(f => ({ ...f, dominantSpecies: e.target.value || undefined }))} />
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="vc-section">
              <h3>Final notes</h3>
              <label className="vc-field-label">Qualitative notes
                <textarea rows={4} value={qualNotes} placeholder="Anything else that helps a remote analyst — landmarks, unusual conditions, recent changes…" onChange={(e) => setQualNotes(e.target.value)} />
              </label>
              <div className="vc-field-block">
                <h4>How confident are you?</h4>
                <p className="vc-help">Rate your overall confidence in this observation.</p>
                <div className="vc-confidence-btns">
                  {([
                    { value: 0.4, label: 'Low', desc: 'Unsure / obstructed view' },
                    { value: 0.7, label: 'Medium', desc: 'Fairly confident' },
                    { value: 0.95, label: 'High', desc: 'Very clear on the ground' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`vc-cat-btn ${fieldConfidence === opt.value ? 'vc-cat-btn--on' : ''}`}
                      onClick={() => setFieldConfidence(opt.value)}
                    >
                      <span>{opt.label}</span>
                      <small>{opt.desc}</small>
                    </button>
                  ))}
                </div>
              </div>

              <details className="vc-review" open>
                <summary>Review</summary>
                <ul>
                  {sources.map(src => {
                    const s = perSource[src];
                    const r = snapshot?.results[src];
                    return (
                      <li key={src}>
                        <strong>{PREDICTION_SOURCES[src].shortTitle}</strong>:{' '}
                        {r ? r.className : '—'} → <em>{s.agreement}</em>
                        {s.agreement === 'disagree' && s.observerClassName ? ` (you: ${s.observerClassName})` : ''}
                      </li>
                    );
                  })}
                  <li>Cover composition total: {coverTotal}%</li>
                  <li>Photo: {imageData ? '✓ attached' : '✗ missing'}</li>
                  <li>Location: {location ? `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}` : '—'}</li>
                </ul>
              </details>

              {error && <div className="vc-error">{error}</div>}
            </section>
          )}
        </main>

        <footer className="vc-footer">
          <button className="btn" onClick={() => setStep(s => (s > 1 ? (s - 1) as 1 | 2 | 3 : 1))} disabled={step === 1}>Back</button>
          {step < 3 && (
            <button
              className="btn btn--primary"
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              onClick={() => setStep(s => (s < 3 ? (s + 1) as 1 | 2 | 3 : 3))}
            >
              Next
            </button>
          )}
          {step === 3 && (
            <button className="btn btn--primary" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Saving…' : 'Save observation'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default ValidationCapture;
