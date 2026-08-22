import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MapView, { MapViewRef } from './components/MapView';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import MapControls from './components/MapControls';
import FieldLog from './components/FieldLog';
import SettingsPanel from './components/SettingsPanel';
import SpotBar from './components/SpotBar';
import QuickCapture from './components/QuickCapture';
import Onboarding from './components/Onboarding';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { GeoLocationService } from './services/GeoLocationService';
import { syncEngine } from './services/SyncEngine';
import { db } from './db/database';
import { indiaSatService, INDIASAT_CLASSES, INDIASAT_YEARS, type IndiaSATYear, LATEST_INDIASAT_YEAR } from './services/IndiaSATService';
import { rasterLayerService } from './services/RasterLayerService';
import { coreStackService } from './services/CoreStackService';
import { tesseraTileForPoint } from './services/TesseraService';
import { customLayerManager } from './services/CustomLayerManager';
import { isFirstLaunchCompleted } from './services/DeviceService';
import { PREDICTION_SOURCES } from './services/PredictionService';
import type { CustomLayer, LocationData, Observation, DatasetLayer } from './types';
import './styles/global.css';
import './styles/fields-app.css';

type TabType = 'map' | 'layers' | 'log';

const WG_DEFAULT_CENTER: [number, number] = [75.5, 13.0];

const FOREST_LAYERS = [
  { id: 'raster_natural_forest_80', label: 'Natural Forest (≥80%)', color: '#2d6a4f' },
  { id: 'raster_natural_forest_52', label: 'Natural Forest (≥52%)', color: '#52b788' },
  { id: 'raster_plantations', label: 'Plantations', color: '#e9c46a' },
  { id: 'raster_old_growth', label: 'Old Growth', color: '#1b4332' },
  { id: 'raster_forest_typology', label: 'Forest Typology Composite', color: '#8ecae6' },
] as const;

function parseStoredCenter(): [number, number] {
  const raw = localStorage.getItem('fields_default_center') || '';
  const [lon, lat] = raw.split(',').map(s => Number(s.trim()));
  if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat];
  return WG_DEFAULT_CENTER;
}

function App() {
  const [center, setCenter] = useState<[number, number]>(parseStoredCenter);
  const [zoom, setZoom] = useState(() => parseInt(localStorage.getItem('fields_default_zoom') || '8', 10) || 8);
  const [basemap, setBasemap] = useState<'dark' | 'satellite'>(
    (localStorage.getItem('fields_default_basemap') as 'dark' | 'satellite') || 'satellite'
  );
  const [indiaSatOn, setIndiaSatOn] = useState(false);
  const [indiasatYear, setIndiasatYear] = useState<IndiaSATYear>(LATEST_INDIASAT_YEAR);
  const [indiasatTileUrl, setIndiasatTileUrl] = useState<string | null>(null);
  const [indiasatTileError, setIndiasatTileError] = useState<string | null>(null);

  const [forestLayers, setForestLayers] = useState<DatasetLayer[]>([]);
  const [activeForestLayers, setActiveForestLayers] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !isFirstLaunchCompleted());
  const [coreLayers, setCoreLayers] = useState<DatasetLayer[]>([]);
  const [activeCoreLayers, setActiveCoreLayers] = useState<Set<string>>(new Set());
  const [coreStatus, setCoreStatus] = useState<string | null>(null);
  const [corePlace, setCorePlace] = useState<string | null>(null);
  const [aoiLayers, setAoiLayers] = useState<CustomLayer[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [noteMarkers, setNoteMarkers] = useState<Array<{ id: string; lat: number; lon: number }>>([]);

  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [pinnedLocation, setPinnedLocation] = useState<LocationData | null>(null);
  const focusLocation = pinnedLocation ?? currentLocation;

  const [pendingSync, setPendingSync] = useState(0);
  const [totalObs, setTotalObs] = useState(0);

  const { isOnline } = useNetworkStatus();
  const mapRef = useRef<MapViewRef>(null);
  const geoService = useRef(new GeoLocationService());

  const refreshAois = useCallback(async () => {
    try {
      setAoiLayers(await customLayerManager.list());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    syncEngine.startAutoSync();
    geoService.current.watchPosition((loc) => setCurrentLocation(loc));
    rasterLayerService.getRasterLayers().then(all => {
      setForestLayers(all.filter(l => l.category === 'forest'));
    });
    void refreshAois();

    const refreshCounts = async () => {
      try {
        const pending = await db.observations.where('syncStatus').anyOf(['pending', 'queued', 'failed']).count();
        const total = await db.observations.count();
        setPendingSync(pending);
        setTotalObs(total);
        const recent = await db.observations.orderBy('timestamp').reverse().limit(80).toArray();
        setNoteMarkers(recent.map(o => ({ id: o.id, lat: o.location.lat, lon: o.location.lon })));
      } catch {
        /* ignore */
      }
    };
    refreshCounts();
    const t = setInterval(refreshCounts, 5000);
    return () => {
      geoService.current.stopWatching();
      clearInterval(t);
    };
  }, [refreshAois]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!indiaSatOn || !focusLocation || !isOnline) return;
    let cancelled = false;
    setIndiasatTileError(null);
    indiaSatService.getLiveTileUrlTemplate(focusLocation.lat, focusLocation.lon, indiasatYear).then(url => {
      if (cancelled) return;
      if (!url) setIndiasatTileError('No IndiaSAT map for this tehsil yet. Your notes still save.');
      else setIndiasatTileUrl(url);
    }).catch(() => {
      if (!cancelled) setIndiasatTileError('IndiaSAT tiles could not load.');
    });
    return () => { cancelled = true; };
  }, [indiasatYear, indiaSatOn, focusLocation?.lat, focusLocation?.lon, isOnline]);

  const layers = useMemo<DatasetLayer[]>(() => {
    const out: DatasetLayer[] = [];
    if (indiasatTileUrl && indiaSatOn) {
      out.push({
        id: `indiasat_${indiasatYear}`,
        title: `IndiaSAT LULC ${indiasatYear}`,
        type: 'raster',
        source: { format: 'xyz', path: indiasatTileUrl },
        style: { kind: 'image', opacity: 0.65 },
        minZoom: 8, maxZoom: 18,
        category: 'lulc',
        year: indiasatYear,
        enabled: true,
      });
    }
    for (const fl of forestLayers) {
      if (activeForestLayers.has(fl.id)) out.push(fl);
    }
    for (const cl of coreLayers) {
      if (activeCoreLayers.has(cl.id)) out.push({ ...cl, enabled: true });
    }
    return out;
  }, [indiaSatOn, indiasatTileUrl, indiasatYear, forestLayers, activeForestLayers, coreLayers, activeCoreLayers]);

  const activeLayerIds = useMemo(() => {
    const s = new Set<string>();
    if (indiasatTileUrl && indiaSatOn) s.add(`indiasat_${indiasatYear}`);
    for (const id of activeForestLayers) s.add(id);
    for (const id of activeCoreLayers) s.add(id);
    return s;
  }, [indiaSatOn, indiasatYear, indiasatTileUrl, activeForestLayers, activeCoreLayers]);

  const handleMapMove = useCallback((newCenter: [number, number], newZoom: number) => {
    setCenter(newCenter); setZoom(newZoom);
  }, []);

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setPinnedLocation({ lat, lon, accuracy: 0, timestamp: Date.now() });
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
    const handle = window.setTimeout(() => {
      setCoreStatus('Looking up CoRE Stack maps…');
      coreStackService.loadAtPoint(focusLocation.lat, focusLocation.lon).then(bundle => {
        if (bundle.error) {
          setCoreStatus(bundle.error);
          setCoreLayers([]);
          setCorePlace(null);
          return;
        }
        const next = coreStackService.toDatasetLayers(bundle.layers);
        setCoreLayers(next);
        const place = [bundle.admin?.tehsil, bundle.admin?.district, bundle.admin?.state].filter(Boolean).join(', ');
        setCorePlace(place || null);
        setCoreStatus(next.length ? `${next.length} maps for ${place || 'this tehsil'}` : (place ? `No extra maps listed for ${place}` : 'No CoRE Stack coverage here'));
      });
    }, 700);
    return () => window.clearTimeout(handle);
  }, [focusLocation?.lat, focusLocation?.lon, isOnline]);

  const handleCaptureButton = useCallback(async () => {
    if (!focusLocation) {
      const ok = await handleLocateMe();
      if (!ok && !currentLocation) {
        setToast('Turn on location, or tap the map where the tree is.');
      }
    }
    setCaptureOpen(true);
  }, [focusLocation, currentLocation, handleLocateMe]);

  const handleObservationSubmit = useCallback(async (obs: Observation) => {
    await db.observations.add(obs);
    await syncEngine.enqueue(obs.id);
    setPendingSync(p => p + 1);
    setTotalObs(p => p + 1);
    setNoteMarkers(prev => [{ id: obs.id, lat: obs.location.lat, lon: obs.location.lon }, ...prev].slice(0, 80));
    setCaptureOpen(false);
    setToast(isOnline ? 'Saved. Filling IndiaSAT, weather, and place names in the background.' : 'Saved on this phone. Will fill maps when you have signal.');
  }, [isOnline]);

  const handleGoToLocation = useCallback((lat: number, lon: number) => {
    mapRef.current?.flyTo([lon, lat], 16);
    setPinnedLocation({ lat, lon, accuracy: 0, timestamp: Date.now() });
    setActiveTab('map');
  }, []);

  const handleFlyTo = useCallback((lon: number, lat: number, z = 13) => {
    setCenter([lon, lat]);
    setZoom(z);
    mapRef.current?.flyTo([lon, lat], z);
    setSettingsOpen(false);
    setActiveTab('map');
  }, []);

  const handleAoiImported = useCallback(async () => {
    const list = await customLayerManager.list();
    setAoiLayers(list);
    const latest = list[0];
    if (latest?.bounds) {
      mapRef.current?.fitBounds(latest.bounds);
      setSettingsOpen(false);
      setActiveTab('map');
      setToast(`Loaded ${latest.title} (${latest.featureCount} shapes).`);
    }
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
          aoiLayers={aoiLayers}
          noteMarkers={noteMarkers}
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
            <SpotBar focusLocation={focusLocation} placeLabel={corePlace} pendingEnrichment={pendingSync} />
          </div>
        )}

        {pinnedLocation && activeTab === 'map' && (
          <button className="fields-pin-indicator" onClick={() => setPinnedLocation(null)}>
            Pinned to map tap · follow GPS
          </button>
        )}

        {toast && <div className="fields-toast" role="status">{toast}</div>}

        {activeTab === 'layers' && (
          <OverlayPanel
            indiaSatOn={indiaSatOn}
            indiasatYear={indiasatYear}
            indiasatTileError={indiasatTileError}
            isOnline={isOnline}
            onToggleIndiaSat={() => setIndiaSatOn(v => !v)}
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
            aoiCount={aoiLayers.length}
            onOpenSettings={() => { setActiveTab('map'); setSettingsOpen(true); }}
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
        <QuickCapture
          focusLocation={focusLocation}
          onSubmit={handleObservationSubmit}
          onClose={() => setCaptureOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onFlyTo={handleFlyTo}
          onAoiImported={handleAoiImported}
        />
      )}
      {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
    </div>
  );
}

const OverlayPanel: React.FC<{
  indiaSatOn: boolean;
  indiasatYear: IndiaSATYear;
  indiasatTileError: string | null;
  isOnline: boolean;
  onToggleIndiaSat: () => void;
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
  aoiCount: number;
  onOpenSettings: () => void;
  onClose: () => void;
}> = ({
  indiaSatOn, indiasatYear, indiasatTileError, isOnline, onToggleIndiaSat, onYearChange,
  forestLayers, activeForestLayers, onForestToggle, coreLayers, activeCoreLayers, onCoreToggle,
  coreStatus, corePlace, tesseraHint, aoiCount, onOpenSettings, onClose,
}) => {
  return (
    <div className="panel-overlay">
      <div className="panel-header">
        <h2>Map layers</h2>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="overlay-content">
        <p className="overlay-lede">Colour the map if you want a hint. Your photo is the record — maps can wait until you have signal.</p>
        <section className="overlay-card">
          <header>
            <div>
              <strong>Your areas</strong>
              <small>{aoiCount ? `${aoiCount} imported file${aoiCount === 1 ? '' : 's'} on the map` : 'Load GeoJSON / KML / CSV before you go out'}</small>
            </div>
          </header>
          <button className="btn" type="button" onClick={onOpenSettings}>Import or go to a place</button>
        </section>
        <section className="overlay-card">
          <header>
            <div>
              <strong>IndiaSAT land cover</strong>
              <small>Annual CoRE Stack map for this tehsil — what the model thinks this pixel is</small>
            </div>
            <label className="switch">
              <input type="checkbox" checked={indiaSatOn} onChange={onToggleIndiaSat} disabled={!isOnline} />
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
          {indiaSatOn && (
            <ul className="legend">
              {Object.entries(INDIASAT_CLASSES).filter(([id]) => id !== '0').map(([id, info]) => (
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
              <small>Saved with every photo as a tile id so you can join embeddings on a computer later.</small>
              {tesseraHint && <small>This spot → {tesseraHint}</small>}
            </div>
          </header>
        </section>

        <section className="overlay-card">
          <header>
            <div>
              <strong>More CoRE Stack maps</strong>
              <small>{corePlace || 'Stand on the map or tap a point first'}</small>
              {coreStatus && <small>{coreStatus}</small>}
            </div>
          </header>
          <div className="forest-layer-list">
            {coreLayers.length === 0 && <p className="overlay-warn">CoRE Stack key is in Settings. Drainage, water, and crop maps appear when this tehsil has them.</p>}
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
              <small>Bundled Western Ghats rasters — works offline</small>
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
            Sources: <a href={PREDICTION_SOURCES.indiasat.providerUrl} target="_blank" rel="noreferrer">IndiaSAT / CoRE Stack</a>
            {' · '}
            <a href="https://github.com/ucam-eo/tessera" target="_blank" rel="noreferrer">Tessera</a>.
          </small>
        </section>
      </div>
    </div>
  );
};

export default App;
