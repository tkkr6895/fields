/**
 * Photo-first tree / land-cover note. Save is local and immediate.
 * IndiaSAT, weather, GBIF, CoRE admin attach later via SyncEngine.
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
  onSubmit: (obs: Observation) => void | Promise<void>;
  onClose: () => void;
}

const QuickCapture: React.FC<QuickCaptureProps> = ({ focusLocation, indiaSatHint, onSubmit, onClose }) => {
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
  const [hints, setHints] = useState<GBIFSpeciesSuggestion[]>([]);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (focusLocation) return;
    const svc = new GeoLocationService();
    svc.getCurrentPosition().then(setLocation).catch(() => undefined);
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
    takePhoto('camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const observation: Observation = {
        id: uuidv4(),
        timestamp: now,
        location: loc,
        context: { region: 'India', areaMode: 'point' },
        datasetValues: {},
        image: imageData || undefined,
        userValidation: 'unclear',
        notes,
        observationType: species.trim() ? 'species_sighting' : 'land_cover',
        confidence: 4,
        season: deriveSeason(now),
        userId: getUserName() || deviceId,
        deviceId,
        synced: false,
        syncStatus: 'pending',
        tags: ['tree-species-mapping'],
        fieldData: {
          dominantSpecies: species.trim() || undefined,
          forest: forestType ? { type: forestType } : undefined,
          qualitativeNotes: notes,
          coverComposition: [{ cover: 'tree', percent: 70 }],
        },
        speciesData: species.trim() ? { speciesId: species.trim(), vernacularName: species.trim() } : undefined,
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
    <div className="vc-overlay" role="dialog" aria-modal="true">
      <div className="vc-modal">
        <header className="vc-header">
          <button className="vc-close" onClick={onClose} aria-label="Close">✕</button>
          <div className="vc-steps">
            <span className="active">Photo · tree note</span>
          </div>
        </header>
        <main className="vc-body">
          <p className="vc-help">Take the photo first. Maps fill in after you save, when you have signal.</p>
          <div className="vc-photo">
            {preview ? <img src={preview} alt="Tree" className="vc-photo__preview" /> : <div className="vc-photo__placeholder">{busy ? 'Opening camera…' : 'No photo yet'}</div>}
            <div className="vc-photo__btns">
              <button className="btn" onClick={() => takePhoto('camera')} disabled={busy}>Camera</button>
              <button className="btn" onClick={() => takePhoto('gallery')} disabled={busy}>Gallery</button>
            </div>
            <small className="vc-loc">
              {location ? `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}` : 'Waiting for GPS…'}
              {' · '}
              <button type="button" className="pred-row__toggle" onClick={async () => {
                try {
                  const loc = await new GeoLocationService().getCurrentPosition();
                  setLocation(loc);
                } catch {
                  setError('Could not get GPS. Tap the map first, then open + again.');
                }
              }}>Use GPS</button>
            </small>
          </div>
          <label className="vc-field-label">What tree is this? (if you know)
            <input value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="Local name or scientific name" autoCapitalize="words" />
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
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything useful: flowering, logged, seedlings…" />
          )}
          {error && <div className="vc-error">{error}</div>}
        </main>
        <footer className="vc-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save & keep walking'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default QuickCapture;
