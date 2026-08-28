import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { estimateSave, tileCache, type MapBounds, type PrefetchProgress } from '../services/TileCache';

interface SaveMapsSheetProps {
  bounds: MapBounds | null;
  zoom: number;
  online: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

const SaveMapsSheet: React.FC<SaveMapsSheetProps> = ({ bounds, zoom, online, onClose, onSaved }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PrefetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regionTick, setRegionTick] = useState(0);
  const regions = useMemo(() => tileCache.listRegions(), [regionTick, busy]);

  const maxZ = Math.min(15, Math.max(13, Math.ceil(zoom) + 1));
  const minZ = 8;
  const estimate = useMemo(
    () => (bounds ? estimateSave(bounds, minZ, maxZ) : { tiles: 0, mb: 0 }),
    [bounds, maxZ],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  const save = async () => {
    if (!bounds) return;
    if (!online) {
      setError('Need a connection once to keep this view. Then it works offline.');
      return;
    }
    if (estimate.tiles > 9000) {
      setError('This view is too wide at that zoom. Zoom in to the walk, then save.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const name = `${bounds.south.toFixed(2)}–${bounds.north.toFixed(2)}, ${bounds.west.toFixed(2)}–${bounds.east.toFixed(2)}`;
      await tileCache.saveRegion(name, bounds, minZ, maxZ, setProgress);
      onSaved(`Kept maps for this view (~${estimate.mb.toFixed(0)} MB).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save maps');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="save-maps-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-maps-title"
    >
      <div className="save-maps-sheet">
        <header>
          <h2 id="save-maps-title">Keep this view on the phone</h2>
          <button ref={closeRef} type="button" className="panel-close" aria-label="Close" onClick={() => onCloseRef.current()}>✕</button>
        </header>
        <p>
          The app stays small. Pan anywhere on Earth while you have signal, or save this screen
          before a hike. Offline satellite is Sentinel-2 (~10 m). Sharp Esri imagery needs signal.
        </p>
        <p className="save-maps-est">
          Zoom to the trail first. This screen, zooms {minZ}–{maxZ}: about {estimate.mb.toFixed(1)} MB ({estimate.tiles} tiles).
        </p>
        {progress && (
          <p className="save-maps-est">
            <progress max={progress.total} value={progress.done} /> {progress.done} / {progress.total} tiles
          </p>
        )}
        {error && <p className="overlay-warn">{error}</p>}
        <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={busy || !bounds}>
          {busy ? 'Saving…' : 'Save this view'}
        </button>
        {regions.length > 0 && (
          <ul className="save-maps-list">
            {regions.map((r) => (
              <li key={r.id}>
                <span>{r.name}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    tileCache.deleteRegion(r.id);
                    setRegionTick((n) => n + 1);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default SaveMapsSheet;
