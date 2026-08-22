import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MapView, { MapViewRef } from './components/MapView';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import MapControls from './components/MapControls';
import FieldLog from './components/FieldLog';
import SettingsPanel from './components/SettingsPanel';
import PredictionCard from './components/PredictionCard';
import ValidationCapture from './components/ValidationCapture';
import Onboarding from './components/Onboarding';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { GeoLocationService } from './services/GeoLocationService';
import { syncEngine } from './services/SyncEngine';
import { db } from './db/database';
import { dynamicWorldService, DW_CLASSES } from './services/DynamicWorldService';
import { indiaSatService, INDIASAT_CLASSES, INDIASAT_YEARS, type IndiaSATYear, LATEST_INDIASAT_YEAR } from './services/IndiaSATService';
import { rasterLayerService } from './services/RasterLayerService';
import { coreStackService } from './services/CoreStackService';
import { tesseraTileForPoint } from './services/TesseraService';
import { isFirstLaunchCompleted } from './services/DeviceService';
import {
  fetchPredictionSnapshot,
  PREDICTION_SOURCES,
  type PredictionSnapshot,
} from './services/PredictionService';
import type { LocationData, Observation, DatasetLayer } from './types';
import './styles/global.css';
import './styles/fields-app.css';

type TabType = 'map' | 'layers' | 'log';
type OverlayId = 'dynamicworld' | 'indiasat';

const WG_DEFAULT_CENTER: [number, number] = [75.5, 13.0];

/** Forest overlay layer definitions (static PNGs from image-manifest). */
const FOREST_LAYERS = [
  { id: 'raster_natural_forest_80', label: 'Natural Forest (≥80%)', color: '#2d6a4f' },
  { id: 'raster_natural_forest_52', label: 'Natural Forest (≥52%)', color: '#52b788' },
  { id: 'raster_plantations', label: 'Plantations', color: '#e9c46a' },
  { id: 'raster_old_growth', label: 'Old Growth', color: '#1b4332' },
  { id: 'raster_forest_typology', label: 'Forest Typology Composite', color: '#8ecae6' },
] as const;

function App() {
  // Map state
  const [center, setCenter] = useState<[number, number]>(WG_DEFAULT_CENTER);
  const [zoom, setZoom] = useState(8);
  const [basemap, setBasemap] = useState<'dark' | 'satellite'>('satellite');
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayId>>(new Set());
  const [indiasatYear, setIndiasatYear] = useState<IndiaSATYear>(LATEST_INDIASAT_YEAR);
  const [indiasatTileUrl, setIndiasatTileUrl] = useState<string | null>(null);
  const [indiasatTileError, setIndiasatTileError] = useState<string | null>(null);
  const [dwTileUrl, setDwTileUrl] = useState<string | null>(null);
  const [dwTileError, setDwTileError] = useState<string | null>(null);

  // Forest overlay layers (static PNGs)
  const [forestLayers, setForestLayers] = useState<DatasetLayer[]>([]);
  const [activeForestLayers, setActiveForestLayers] = useState<Set<string>>(new Set());

  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureSnapshot, setCaptureSnapshot] = useState<PredictionSnapshot | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !isFirstLaunchCompleted());
  const [coreLayers, setCoreLayers] = useState<DatasetLayer[]>([]);
  const [activeCoreLayers, setActiveCoreLayers] = useState<Set<string>>(new Set());
  const [coreStatus, setCoreStatus] = useState<string | null>(null);
  const [corePlace, setCorePlace] = useState<string | null>(null);

  // Location: GPS vs pinned (tapped on map)
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [pinnedLocation, setPinnedLocation] = useState<LocationData | null>(null);
  const focusLocation = pinnedLocation ?? currentLocation;

  // Counts
  const [pendingSync, setPendingSync] = useState(0);
  const [totalObs, setTotalObs] = useState(0);

  // Network
  const { isOnline } = useNetworkStatus();

  // Refs
  const mapRef = useRef<MapViewRef>(null);
  const geoService = useRef(new GeoLocationService());

  // Init
  useEffect(() => {
    syncEngine.startAutoSync();
    geoService.current.watchPosition((loc) => setCurrentLocation(loc));

    // Load forest overlay layers from manifest
    rasterLayerService.getRasterLayers().then(all => {
      const forest = all.filter(l => l.category === 'forest');
      setForestLayers(forest);
    });

    const refreshCounts = async () => {
      try {
        const pending = await db.observations.where('syncStatus').anyOf(['pending', 'queued', 'failed']).count();
        const total = await db.observations.count();
        setPendingSync(pending);
        setTotalObs(total);
      } catch {
        // ignore
      }
    };
    refreshCounts();
    const t = setInterval(refreshCounts, 5000);

    return () => {
      geoService.current.stopWatching();
      clearInterval(t);
    };
  }, []);

  // Resolve IndiaSAT tile URL when year or overlay changes
  useEffect(() => {
    if (!activeOverlays.has('indiasat')) return;
    let cancelled = false;
    setIndiasatTileUrl(null);
    setIndiasatTileError(null);
    indiaSatService.getLiveTileUrlTemplate(indiasatYear).then(url => {
      if (cancelled) return;
      if (!url) setIndiasatTileError('IndiaSAT tiles unavailable — check the GEE proxy.');
      else setIndiasatTileUrl(url);
    });
    return () => { cancelled = true; };
  }, [indiasatYear, activeOverlays]);

  // Resolve Dynamic World tile URL when overlay is enabled
  useEffect(() => {
    if (!activeOverlays.has('dynamicworld')) return;
    let cancelled = false;
    setDwTileUrl(null);
    setDwTileError(null);
    dynamicWorldService.getLiveTileUrlTemplate().then(url => {
      if (cancelled) return;
      if (!url) setDwTileError('Dynamic World tiles unavailable — check the GEE proxy.');
      else setDwTileUrl(url);
    }).catch((err: unknown) => {
      if (cancelled) return;
      setDwTileError(`Dynamic World error: ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => { cancelled = true; };
  }, [activeOverlays]);

  // Layer list MapView consumes
  const layers = useMemo<DatasetLayer[]>(() => {
    const out: DatasetLayer[] = [];
    if (dwTileUrl && activeOverlays.has('dynamicworld')) {
      out.push({
        id: 'dynamicworld_live',
        title: 'Dynamic World (live)',
        type: 'raster',
        source: { format: 'xyz', path: dwTileUrl },
        style: { kind: 'image', opacity: 0.7 },
        minZoom: 0, maxZoom: 19,
        category: 'dynamicworld',
        enabled: true,
      });
    }
    if (indiasatTileUrl && activeOverlays.has('indiasat')) {
      out.push({
        id: `indiasat_${indiasatYear}`,
        title: `IndiaSAT LULC ${indiasatYear}`,
        type: 'raster',
        source: { format: 'xyz', path: indiasatTileUrl },
        style: { kind: 'image', opacity: 0.7 },
        minZoom: 0, maxZoom: 19,
        category: 'lulc',
        year: indiasatYear,
        enabled: true,
      });
    }
    // Include active forest overlay layers
    for (const fl of forestLayers) {
      if (activeForestLayers.has(fl.id)) {
        out.push(fl);
      }
    }
    for (const cl of coreLayers) {
      if (activeCoreLayers.has(cl.id)) out.push({ ...cl, enabled: true });
    }
    return out;
  }, [activeOverlays, indiasatTileUrl, indiasatYear, dwTileUrl, forestLayers, activeForestLayers, coreLayers, activeCoreLayers]);

  const activeLayerIds = useMemo(() => {
    const s = new Set<string>();
    if (dwTileUrl && activeOverlays.has('dynamicworld')) s.add('dynamicworld_live');
    if (indiasatTileUrl && activeOverlays.has('indiasat')) s.add(`indiasat_${indiasatYear}`);
    for (const id of activeForestLayers) s.add(id);
    for (const id of activeCoreLayers) s.add(id);
    return s;
  }, [activeOverlays, indiasatYear, dwTileUrl, indiasatTileUrl, activeForestLayers, activeCoreLayers]);

  // Map interactions
  const handleMapMove = useCallback((newCenter: [number, number], newZoom: number) => {
    setCenter(newCenter); setZoom(newZoom);
  }, []);

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setPinnedLocation({ lat, lon, accuracy: 0 });
  }, []);

  const handleLocateMe = useCallback(async () => {
    try {
      const loc = await geoService.current.getCurrentPosition();
      setCurrentLocation(loc);
      setPinnedLocation(null);
      mapRef.current?.flyTo([loc.lon, loc.lat], 16);
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleResetView = useCallback(() => mapRef.current?.resetView(), []);
  const handleBasemapToggle = useCallback(() => setBasemap(p => p === 'dark' ? 'satellite' : 'dark'), []);

  const handleOverlayToggle = useCallback((id: OverlayId) => {
    setActiveOverlays(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleForestToggle = useCallback((layerId: string) => {
    setActiveForestLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
      return next;
    });
  }, []);

  const handleCoreToggle = useCallback((layerId: string) => {
    setActiveCoreLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!focusLocation || !isOnline) return;
    let cancelled = false;
    setCoreStatus('Looking up CoRE Stack maps for this area…');
    coreStackService.loadAtPoint(focusLocation.lat, focusLocation.lon).then(bundle => {
      if (cancelled) return;
      if (bundle.error) {
        setCoreStatus(bundle.error);
        setCoreLayers([]);
        setCorePlace(null);
        return;
      }
      const layers = coreStackService.toDatasetLayers(bundle.layers);
      setCoreLayers(layers);
      const place = [bundle.admin?.tehsil, bundle.admin?.district, bundle.admin?.state].filter(Boolean).join(', ');
      setCorePlace(place || null);
      setCoreStatus(layers.length ? `${layers.length} maps for ${place || 'this tehsil'}` : (place ? `No map layers listed for ${place}` : 'No CoRE Stack coverage here'));
    });
    return () => { cancelled = true; };
  }, [focusLocation?.lat, focusLocation?.lon, isOnline]);

  // Validate from PredictionCard
  const handleLaunchValidate = useCallback((snapshot: PredictionSnapshot | null) => {
    setCaptureSnapshot(snapshot);
    setCaptureOpen(true);
  }, []);

  const handleCaptureButton = useCallback(async () => {
    let loc = focusLocation;
    if (!loc) {
      const ok = await handleLocateMe();
      if (!ok) {
        alert('Turn on location, or tap the map where you are standing.');
        return;
      }
      loc = currentLocation;
      if (!loc) return;
    }
    const snap = isOnline
      ? await fetchPredictionSnapshot(loc.lat, loc.lon, { indiasatYear })
      : null;
    setCaptureSnapshot(snap);
    setCaptureOpen(true);
  }, [focusLocation, currentLocation, isOnline, indiasatYear, handleLocateMe]);

  const handleObservationSubmit = useCallback(async (obs: Observation) => {
    await db.observations.add(obs);
    await syncEngine.enqueue(obs.id);
    setPendingSync(p => p + 1);
    setTotalObs(p => p + 1);
    setCaptureOpen(false);
    setCaptureSnapshot(null);
  }, []);

  const handleGoToLocation = useCallback((lat: number, lon: number) => {
    mapRef.current?.flyTo([lon, lat], 16);
    setPinnedLocation({ lat, lon, accuracy: 0 });
    setActiveTab('map');
  }, []);

  return (
    <div className="app">
      <Header
        isOnline={isOnline}
        syncStatus={{ pending: pendingSync }}
        onSettingsClick={() => setSettingsOpen(s => !s)}
      />

      <main className="main-content">
        <MapView
          ref={mapRef}
          center={center}
          zoom={zoom}
          basemap={basemap}
          layers={layers}
          activeLayers={activeLayerIds}
          currentLocation={currentLocation}
          onMapMove={handleMapMove}
          onMapClick={handleMapClick}
        />

        <MapControls
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
          onLocateMe={handleLocateMe}
          onResetView={handleResetView}
        />

        <button className="basemap-toggle" onClick={handleBasemapToggle} title={`Switch to ${basemap === 'dark' ? 'satellite' : 'dark'}`}>
          {basemap === 'dark' ? '🛰️' : '🌙'}
        </button>

        {activeTab === 'map' && (
          <div className="fields-prediction-anchor">
            <PredictionCard
              focusLocation={focusLocation}
              isOnline={isOnline}
              onValidate={handleLaunchValidate}
              onYearChange={(y) => setIndiasatYear(y)}
            />
          </div>
        )}

        {pinnedLocation && activeTab === 'map' && (
          <button className="fields-pin-indicator" onClick={() => setPinnedLocation(null)}>
            📌 Pinned · tap to follow GPS
          </button>
        )}

        {activeTab === 'layers' && (
          <OverlayPanel
            activeOverlays={activeOverlays}
            indiasatYear={indiasatYear}
            indiasatTileError={indiasatTileError}
            dwTileError={dwTileError}
            isOnline={isOnline}
            onToggle={handleOverlayToggle}
            onYearChange={setIndiasatYear}
            forestLayers={FOREST_LAYERS}
            activeForestLayers={activeForestLayers}
            onForestToggle={handleForestToggle}
            coreLayers={coreLayers}
            activeCoreLayers={activeCoreLayers}
            onCoreToggle={handleCoreToggle}
            coreStatus={coreStatus}
            corePlace={corePlace}
            tesseraHint={focusLocation ? tesseraTileForPoint(focusLocation.lat, focusLocation.lon).tileId : null}
            onClose={() => setActiveTab('map')}
          />
        )}

        {activeTab === 'log' && (
          <div className="panel-overlay">
            <div className="panel-header">
              <h2>Field log · {totalObs} note{totalObs === 1 ? '' : 's'}</h2>
              <button className="panel-close" onClick={() => setActiveTab('map')}>✕</button>
            </div>
            <FieldLog onGoToLocation={handleGoToLocation} />
          </div>
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={(t) => {
          const tt = t as TabType;
          if (tt === activeTab && tt !== 'map') setActiveTab('map');
          else setActiveTab(tt);
        }}
        onCaptureClick={handleCaptureButton}
        pendingSync={pendingSync}
      />

      {captureOpen && (
        <ValidationCapture
          focusLocation={focusLocation}
          snapshot={captureSnapshot}
          onSubmit={handleObservationSubmit}
          onClose={() => { setCaptureOpen(false); setCaptureSnapshot(null); }}
        />
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
    </div>
  );
}

// Hint compiler to keep DynamicWorldService side imports tree-shake friendly
void dynamicWorldService;

/** Overlay control surface — map layers in plain language. */
const OverlayPanel: React.FC<{
  activeOverlays: Set<OverlayId>;
  indiasatYear: IndiaSATYear;
  indiasatTileError: string | null;
  dwTileError: string | null;
  isOnline: boolean;
  onToggle: (id: OverlayId) => void;
  onYearChange: (y: IndiaSATYear) => void;
  forestLayers: readonly { id: string; label: string; color: string }[];
  activeForestLayers: Set<string>;
  onForestToggle: (id: string) => void;
  coreLayers: DatasetLayer[];
  activeCoreLayers: Set<string>;
  onCoreToggle: (id: string) => void;
  coreStatus: string | null;
  corePlace: string | null;
  tesseraHint: string | null;
  onClose: () => void;
}> = ({
  activeOverlays, indiasatYear, indiasatTileError, dwTileError, isOnline, onToggle, onYearChange,
  forestLayers, activeForestLayers, onForestToggle, coreLayers, activeCoreLayers, onCoreToggle,
  coreStatus, corePlace, tesseraHint, onClose,
}) => {
  return (
    <div className="panel-overlay">
      <div className="panel-header">
        <h2>Map layers</h2>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="overlay-content">
        <p className="overlay-lede">Turn layers on to colour the map. They are satellite guesses — your notes are the ground truth.</p>
        <section className="overlay-card">
          <header>
            <div>
              <strong>Live satellite cover</strong>
              <small>Dynamic World · what Sentinel-2 thinks this pixel is right now</small>
            </div>
            <label className="switch">
              <input type="checkbox" checked={activeOverlays.has('dynamicworld')} onChange={() => onToggle('dynamicworld')} disabled={!isOnline} />
              <span />
            </label>
          </header>
          {!isOnline && <p className="overlay-warn">Offline — live colouring needs a connection.</p>}
          {dwTileError && <p className="overlay-warn">{dwTileError}</p>}
          {activeOverlays.has('dynamicworld') && (
            <ul className="legend">
              {Object.entries(DW_CLASSES).map(([id, info]) => (
                <li key={id}>
                  <span className="legend-swatch" style={{ background: info.color }} />
                  <span>{info.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overlay-card">
          <header>
            <div>
              <strong>India land cover (CoRE Stack)</strong>
              <small>IndiaSAT annual map used across the CoRE Stack</small>
            </div>
            <label className="switch">
              <input type="checkbox" checked={activeOverlays.has('indiasat')} onChange={() => onToggle('indiasat')} disabled={!isOnline} />
              <span />
            </label>
          </header>
          <div className="overlay-controls">
            <label>Year
              <select value={indiasatYear} onChange={(e) => onYearChange(Number(e.target.value) as IndiaSATYear)}>
                {INDIASAT_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          {indiasatTileError && <p className="overlay-warn">{indiasatTileError}</p>}
          {activeOverlays.has('indiasat') && (
            <ul className="legend">
              {Object.entries(INDIASAT_CLASSES).map(([id, info]) => (
                <li key={id}>
                  <span className="legend-swatch" style={{ background: info.color }} />
                  <span>{info.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overlay-card">
          <header>
            <div>
              <strong>Tessera landscape fingerprint</strong>
              <small>Cambridge Tessera embeddings (10 m). Too large to paint the whole globe on a phone — we save the tile id with every note so you can join labels to embeddings on a computer.</small>
              {tesseraHint && <small>This spot → {tesseraHint}</small>}
            </div>
          </header>
        </section>

        <section className="overlay-card">
          <header>
            <div>
              <strong>CoRE Stack maps for this area</strong>
              <small>{corePlace || 'Stand on the map or tap a point first'}</small>
              {coreStatus && <small>{coreStatus}</small>}
            </div>
          </header>
          <div className="forest-layer-list">
            {coreLayers.length === 0 && <p className="overlay-warn">Add your CoRE Stack API key in Settings to load drainage, water, crops, and village maps for the tehsil you are in.</p>}
            {coreLayers.map(cl => (
              <label key={cl.id} className="forest-layer-toggle">
                <input type="checkbox" checked={activeCoreLayers.has(cl.id)} onChange={() => onCoreToggle(cl.id)} />
                <span>{cl.title}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="overlay-card">
          <header>
            <div>
              <strong>Forest vs plantation</strong>
              <small>Google Research Natural Forest 2020 — bundled for the Western Ghats pack</small>
            </div>
          </header>
          <div className="forest-layer-list">
            {forestLayers.map(fl => (
              <label key={fl.id} className="forest-layer-toggle">
                <input type="checkbox" checked={activeForestLayers.has(fl.id)} onChange={() => onForestToggle(fl.id)} />
                <span className="legend-swatch" style={{ background: fl.color }} />
                <span>{fl.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="overlay-attribution">
          <small>
            Sources: <a href={PREDICTION_SOURCES.dynamicworld.providerUrl} target="_blank" rel="noreferrer">Dynamic World</a>{' · '}
            <a href={PREDICTION_SOURCES.indiasat.providerUrl} target="_blank" rel="noreferrer">IndiaSAT / CoRE Stack</a>{' · '}
            <a href="https://github.com/ucam-eo/tessera" target="_blank" rel="noreferrer">Tessera</a>.
          </small>
        </section>
      </div>
    </div>
  );
};

export default App;
