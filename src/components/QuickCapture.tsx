/**
 * Photo / tag note. Save is local and immediate.
 * During a hike, photo is optional so you can drop a waypoint without stopping.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { imageService } from '../services/ImageService';
import { GeoLocationService } from '../services/GeoLocationService';
import { deriveSeason } from '../services/SeasonService';
import { getDeviceId, getUserName } from '../services/DeviceService';
import { tesseraTileForPoint } from '../services/TesseraService';
import { gbifService, type GBIFSpeciesSuggestion } from '../services/GBIFService';
import { indiaSatService, INDIASAT_CLASSES } from '../services/IndiaSATService';
import type { LocationData, Observation, ImageData } from '../types';

interface QuickCaptureProps {
  focusLocation: LocationData | null;
  indiaSatHint?: { name: string; color: string; classId: number } | null;
  autoCamera?: boolean;
  trackId?: string | null;
  onSubmit: (obs: Observation) => void | Promise<void>;
  onClose: () => void;
}

const TAGS = [
  ['tree', 'Tree'],
  ['species', 'Species'],
  ['water', 'Water'],
  ['crop', 'Crop'],
  ['built', 'Built'],
  ['trail', 'Trail'],
] as const;

const QuickCapture: React.FC<QuickCaptureProps> = ({
  focusLocation,
  indiaSatHint,
  autoCamera = true,
  trackId,
  onSubmit,
  onClose,
}) => {
  const [location, setLocation] = useState<LocationData | null>(focusLocation);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [species, setSpecies] = useState('');
  const [stand, setStand] = useState<'native' | 'plantation' | 'mixed' | undefined>();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indiaAgree, setIndiaAgree] = useState<'agree' | 'disagree' | 'unsure' | 'unrated'>('unrated');
  const [observerClassId, setObserverClassId] = useState<number | undefined>();
  const [more, setMore] = useState(false);
  const [tags, setTags] = useState<string[]>(trackId ? ['trail'] : []);
  const [hints, setHints] = useState<GBIFSpeciesSuggestion[]>([]);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (focusLocation) setLocation(focusLocation);
  }, [focusLocation]);

  const takePhoto = useCallback(async (mode: 'camera' | 'gallery') => {
    setBusy(true);
    setError(null);
    try {
      const file = mode === 'camera' ? await imageService.captureFromCamera() : await imageService.selectFromGallery();
      if (!file) return;
      const data = await imageService.processImage(file);
      setImageData(data);
      if (data.exif.lat && data.exif.lon) {
        setLocation({ lat: data.exif.lat, lon: data.exif.lon, accuracy: 0, timestamp: Date.now() });
      }
      setPreview(data.thumbnail || (await imageService.getImageUrl(data.blobId)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Photo failed');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (autoCamera) void takePhoto('camera');
  }, [autoCamera, takePhoto]);

  useEffect(() => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    const q = species.trim();
    if (q.length < 3 || !navigator.onLine) {
      setHints([]);
      return;
    }
    hintTimer.current = setTimeout(() => {
      gbifService.searchSpecies(q, 6).then(setHints).catch(() => setHints([]));
    }, 450);
    return () => { if (hintTimer.current) clearTimeout(hintTimer.current); };
  }, [species]);

  const toggleTag = (id: string) => {
    setTags((prev) => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const save = async () => {
    const loc = location;
    if (!loc) {
      setError('Need a GPS fix or a photo with location. Tap Locate me, then try again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const tile = tesseraTileForPoint(loc.lat, loc.lon);
      const deviceId = getDeviceId();
      const forestType = stand;
      const named = species.trim();
      const observation: Observation = {
        id: uuidv4(),
        timestamp: now,
        location: loc,
        context: { region: 'India', areaMode: 'point' },
        datasetValues: {},
        image: imageData || undefined,
        userValidation: indiaAgree === 'agree' ? 'match' : indiaAgree === 'disagree' ? 'mismatch' : 'unclear',
        notes,
        observationType: named ? 'species_sighting' : (trackId ? 'waypoint' : 'land_cover'),
        confidence: 4,
        season: deriveSeason(now),
        userId: getUserName() || deviceId,
        deviceId,
        synced: false,
        syncStatus: 'pending',
        tags: [...new Set([...tags, ...(trackId ? ['on-track'] : [])])],
        trackId: trackId || undefined,
        fieldData: {
          dominantSpecies: named || undefined,
          forest: forestType ? { type: forestType } : undefined,
          qualitativeNotes: notes,
        },
        speciesData: named ? { speciesId: named, vernacularName: named } : undefined,
        predictionValidation: indiaSatHint ? {
          capturedAt: now,
          perSource: [{
            source: 'indiasat',
            classId: indiaSatHint.classId,
            className: indiaSatHint.name,
            classColor: indiaSatHint.color,
            confidence: null,
            asOf: now,
            live: true,
            agreement: indiaAgree,
            observerClassId: indiaAgree === 'disagree' ? observerClassId : undefined,
            observerClassName: indiaAgree === 'disagree' && observerClassId != null
              ? (INDIASAT_CLASSES[observerClassId]?.name)
              : undefined,
          }],
        } : undefined,
        tessera: {
          year: tile.year,
          tileId: tile.tileId,
          tileLon: tile.tileLon,
          tileLat: tile.tileLat,
          coverage: 'unknown',
          source: 'grid',
          note: 'Computed on device at save. Embedding join later.',
        },
      };
      await onSubmit(observation);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setSaving(false);
    }
  };

  return (
    <div className="vc-overlay" role="dialog" aria-modal="true" aria-labelledby="note-title">
      <div className="vc-modal">
        <header className="vc-header">
          <button className="vc-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="vc-steps">
            <span className="active" id="note-title">{trackId ? 'Mark this spot' : 'Photo · note'}</span>
          </div>
        </header>
        <main className="vc-body">
          <p className="vc-help">
            {trackId
              ? 'Optional photo. A tag and a line of text are enough — GPS is already on the track.'
              : 'Photograph if you can. Species, stand type, and a tag still save without a picture.'}
          </p>
          <div className="vc-photo">
            {preview ? <img src={preview} alt="Field note" className="vc-photo__preview" /> : <div className="vc-photo__placeholder">{busy ? 'Opening camera…' : 'No photo — that is fine'}</div>}
            <div className="vc-photo__btns">
              <button className="btn" onClick={() => takePhoto('camera')} disabled={busy}>Camera</button>
              <button className="btn" onClick={() => takePhoto('gallery')} disabled={busy}>Gallery</button>
            </div>
            <small className="vc-loc">
              {location ? `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)} · ±${Math.round(location.accuracy || 0)} m` : 'Waiting for GPS…'}
              {' · '}
              <button type="button" className="pred-row__toggle" onClick={async () => {
                try {
                  const loc = await new GeoLocationService().getCurrentPosition();
                  setLocation(loc);
                } catch {
                  setError('Could not get GPS. Tap the map first, then try again.');
                }
              }}>Use GPS</button>
            </small>
          </div>
          <div className="vc-gbif-chips" aria-label="Tags">
            {TAGS.map(([id, label]) => (
              <button type="button" key={id} className={`pill ${tags.includes(id) ? 'on' : ''}`} onClick={() => toggleTag(id)}>
                {label}
              </button>
            ))}
          </div>
          <label className="vc-field-label">What is this? (if you know)
            <input value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="Tree name, crop, stream, trail fork…" autoCapitalize="words" />
          </label>
          {hints.length > 0 && (
            <div className="vc-gbif-chips">
              {hints.map(h => (
                <button type="button" key={h.scientificName} className="pill" onClick={() => { setSpecies(h.scientificName); setHints([]); }}>
                  {h.commonName || h.scientificName}
                </button>
              ))}
            </div>
          )}
          {indiaSatHint && (
            <div className="vc-validate">
              <p className="vc-field-label">IndiaSAT says <span className="legend-swatch" style={{ background: indiaSatHint.color }} /> {indiaSatHint.name}. On the ground?</p>
              <div className="vc-category-btns">
                {(['agree', 'disagree', 'unsure'] as const).map(id => (
                  <button key={id} type="button" className={`vc-cat-btn ${indiaAgree === id ? 'vc-cat-btn--on' : ''}`} onClick={() => setIndiaAgree(id)}>
                    <span>{id === 'agree' ? 'Looks right' : id === 'disagree' ? 'Wrong class' : 'Not sure'}</span>
                  </button>
                ))}
              </div>
              {indiaAgree === 'disagree' && (
                <label className="vc-field-label">What is it actually?
                  <select value={observerClassId ?? ''} onChange={(e) => setObserverClassId(Number(e.target.value))}>
                    <option value="">Pick a class</option>
                    {indiaSatService.listClasses().filter(c => c.id !== 0).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          <div className="vc-category-btns">
            {([
              ['native', 'Native forest'],
              ['plantation', 'Plantation'],
              ['mixed', 'Mixed / edge'],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" className={`vc-cat-btn ${stand === id ? 'vc-cat-btn--on' : ''}`} onClick={() => setStand(id)}>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <button className="pred-row__toggle" type="button" onClick={() => setMore(m => !m)}>{more ? 'Hide notes' : 'Add a note'}</button>
          {more && (
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Flowering, logged, seedlings, trail condition…" />
          )}
          {error && <div className="vc-error">{error}</div>}
        </main>
        <footer className="vc-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default QuickCapture;
