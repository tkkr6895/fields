import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MapView, { MapViewRef } from './components/MapView';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import MapControls from './components/MapControls';
import FieldLog from './components/FieldLog';
import SettingsPanel from './components/SettingsPanel';
import PredictionCard from './components/PredictionCard';
import ValidationCapture from './components/ValidationCapture';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { GeoLocationService } from './services/GeoLocationService';
import { syncEngine } from './services/SyncEngine';
import { db } from './db/database';
import { dynamicWorldService, DW_CLASSES } from './services/DynamicWorldService';
import { indiaSatService, INDIASAT_CLASSES, INDIASAT_YEARS, type IndiaSATYear, LATEST_INDIASAT_YEAR } from './services/IndiaSATService';
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

function App() {
  // Map state
  const [center, setCenter] = useState<[number, number]>(WG_DEFAULT_CENTER);
  const [zoom, setZoom] = useState(8);
  const [basemap, setBasemap] = useState<'dark' | 'satellite'>('satellite');
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayId>>(new Set());
  const [indiasatYear, setIndiasatYear] = useState<IndiaSATYear>(LATEST_INDIASAT_YEAR);
  const [indiasatTileUrl, setIndiasatTileUrl] = useState<string | null>(null);
  const [indiasatTileError, setIndiasatTileError] = useState<string | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureSnapshot, setCaptureSnapshot] = useState<PredictionSnapshot | null>(null);

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

  // Layer list MapView consumes
  const layers = useMemo<DatasetLayer[]>(() => {
    const out: DatasetLayer[] = [];
    out.push({
      id: 'dynamicworld_live',
      title: 'Dynamic World (live)',
      type: 'raster',
      source: { format: 'xyz', path: 'dynamicworld://live' },
      style: { kind: 'image', opacity: 0.7 },
      minZoom: 0, maxZoom: 19,
      category: 'dynamicworld',
      enabled: activeOverlays.has('dynamicworld'),
    });
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
    return out;
  }, [activeOverlays, indiasatTileUrl, indiasatYear]);

  const activeLayerIds = useMemo(() => {
    const s = new Set<string>();
    if (activeOverlays.has('dynamicworld')) s.add('dynamicworld_live');
    if (activeOverlays.has('indiasat')) s.add(`indiasat_${indiasatYear}`);
    return s;
  }, [activeOverlays, indiasatYear]);

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

  // Validate from PredictionCard
  const handleLaunchValidate = useCallback((snapshot: PredictionSnapshot) => {
    setCaptureSnapshot(snapshot);
    setCaptureOpen(true);
  }, []);

  const handleCaptureButton = useCallback(async () => {
    let loc = focusLocation;
    if (!loc) {
      const ok = await handleLocateMe();
      if (!ok) {
        alert('Locate yourself first — we need GPS to anchor the validation.');
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
            isOnline={isOnline}
            onToggle={handleOverlayToggle}
            onYearChange={setIndiasatYear}
            onClose={() => setActiveTab('map')}
          />
        )}

        {activeTab === 'log' && (
          <div className="panel-overlay">
            <div className="panel-header">
              <h2>Field log · {totalObs} observation{totalObs === 1 ? '' : 's'}</h2>
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
    </div>
  );
}

// Hint compiler to keep DynamicWorldService side imports tree-shake friendly
void dynamicWorldService;

/** Overlay control surface — toggles each model raster + legend. */
const OverlayPanel: React.FC<{
  activeOverlays: Set<OverlayId>;
  indiasatYear: IndiaSATYear;
  indiasatTileError: string | null;
  isOnline: boolean;
  onToggle: (id: OverlayId) => void;
  onYearChange: (y: IndiaSATYear) => void;
  onClose: () => void;
}> = ({ activeOverlays, indiasatYear, indiasatTileError, isOnline, onToggle, onYearChange, onClose }) => {
  return (
    <div className="panel-overlay">
      <div className="panel-header">
        <h2>LULC overlays</h2>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="overlay-content">
        <section className="overlay-card">
          <header>
            <div>
              <strong>{PREDICTION_SOURCES.dynamicworld.title}</strong>
              <small>{PREDICTION_SOURCES.dynamicworld.description}</small>
              <small>{PREDICTION_SOURCES.dynamicworld.resolution} · {PREDICTION_SOURCES.dynamicworld.temporal}</small>
            </div>
            <label className="switch">
              <input type="checkbox" checked={activeOverlays.has('dynamicworld')} onChange={() => onToggle('dynamicworld')} disabled={!isOnline} />
              <span />
            </label>
          </header>
          {!isOnline && <p className="overlay-warn">Offline — live tiles unavailable.</p>}
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
              <strong>{PREDICTION_SOURCES.indiasat.title}</strong>
              <small>{PREDICTION_SOURCES.indiasat.description}</small>
              <small>{PREDICTION_SOURCES.indiasat.resolution} · {PREDICTION_SOURCES.indiasat.temporal}</small>
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

        <section className="overlay-attribution">
          <small>
            Sources: <a href={PREDICTION_SOURCES.dynamicworld.providerUrl} target="_blank" rel="noreferrer">Dynamic World</a>{' · '}
            <a href={PREDICTION_SOURCES.indiasat.providerUrl} target="_blank" rel="noreferrer">IndiaSAT LULC (CoRE Stack)</a>.
            All live predictions are served via Google Earth Engine through the configured proxy.
          </small>
        </section>
      </div>
    </div>
  );
};

export default App;
