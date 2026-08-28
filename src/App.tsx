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
import TrackHud from './components/TrackHud';
import SaveMapsSheet from './components/SaveMapsSheet';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { GeoLocationService } from './services/GeoLocationService';
import { trackRecorder } from './services/TrackRecorder';
import { syncEngine } from './services/SyncEngine';
import { db } from './db/database';
import { indiaSatService, INDIASAT_CLASSES, INDIASAT_YEARS, type IndiaSATYear, LATEST_INDIASAT_YEAR } from './services/IndiaSATService';
import { rasterLayerService } from './services/RasterLayerService';
import { coreStackService, type CoreStackFact } from './services/CoreStackService';
import { tesseraTileForPoint, resolveTesseraPreview, type TesseraPreview } from './services/TesseraService';
import { customLayerManager } from './services/CustomLayerManager';
import { PACKED_CENTER, PACKED_ZOOM } from './services/OfflineBasemap';
import { isFirstLaunchCompleted } from './services/DeviceService';
import { PREDICTION_SOURCES } from './services/PredictionService';
import type { CustomLayer, FieldTrack, LocationData, Observation, DatasetLayer } from './types';
import './styles/global.css';
import './styles/fields-app.css';

type TabType = 'map' | 'layers' | 'log';

const WG_DEFAULT_CENTER: [number, number] = PACKED_CENTER;

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
  const [zoom, setZoom] = useState(() => parseInt(localStorage.getItem('fields_default_zoom') || String(PACKED_ZOOM), 10) || PACKED_ZOOM);
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
  const [coreFacts, setCoreFacts] = useState<CoreStackFact[]>([]);
  const [coreMwsId, setCoreMwsId] = useState<string | null>(null);
  const [aoiLayers, setAoiLayers] = useState<CustomLayer[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [noteMarkers, setNoteMarkers] = useState<Array<{ id: string; lat: number; lon: number }>>([]);
  const [tesseraOn, setTesseraOn] = useState(false);
  const [tesseraPreview, setTesseraPreview] = useState<TesseraPreview | null>(null);
  const [tesseraPreviewNote, setTesseraPreviewNote] = useState<string | null>(null);
  const [indiaSatClass, setIndiaSatClass] = useState<{ name: string; color: string; classId: number } | null>(null);
  const [activeTrack, setActiveTrack] = useState<FieldTrack | null>(null);

  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [pinnedLocation, setPinnedLocation] = useState<LocationData | null>(null);
  const focusLocation = pinnedLocation ?? currentLocation;

  const [saveMapsOpen, setSaveMapsOpen] = useState(false);
  const [saveMapBounds, setSaveMapBounds] = useState<{ west: number; south: number; east: number; north: number } | null>(null);
  const [pendingSync, setPendingSync] = useState(0);

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
    const unsub = trackRecorder.subscribe(setActiveTrack);
    void trackRecorder.restore();
    rasterLayerService.getRasterLayers().then(all => {
      setForestLayers(all.filter(l => l.category === 'forest'));
    });
    void refreshAois();

    const refreshCounts = async () => {
      try {
        const pending = await db.observations.where('syncStatus').anyOf(['pending', 'queued', 'failed']).count();
        setPendingSync(pending);
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
      unsub();
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
    if (tesseraOn && tesseraPreview) {
      out.push({
        id: `tessera_${tesseraPreview.tileId}_${tesseraPreview.year}`,
        title: `Tessera ${tesseraPreview.tileId}`,
        type: 'image-overlay',
        source: { format: 'png', path: tesseraPreview.path },
        bounds: tesseraPreview.bounds,
        style: { kind: 'image', opacity: 0.72 },
        minZoom: 8,
        maxZoom: 18,
        category: 'other',
        enabled: true,
        year: tesseraPreview.year,
        description: tesseraPreview.representation,
      });
    }
    for (const cl of coreLayers) {
      if (activeCoreLayers.has(cl.id)) out.push({ ...cl, enabled: true });
    }
    return out;
  }, [indiaSatOn, indiasatTileUrl, indiasatYear, forestLayers, activeForestLayers, coreLayers, activeCoreLayers, tesseraOn, tesseraPreview]);

  const activeLayerIds = useMemo(() => {
    const s = new Set<string>();
    if (indiasatTileUrl && indiaSatOn) s.add(`indiasat_${indiasatYear}`);
    if (tesseraOn && tesseraPreview) s.add(`tessera_${tesseraPreview.tileId}_${tesseraPreview.year}`);
    for (const id of activeForestLayers) s.add(id);
    for (const id of activeCoreLayers) s.add(id);
    return s;
  }, [indiaSatOn, indiasatYear, indiasatTileUrl, tesseraOn, tesseraPreview, activeForestLayers, activeCoreLayers]);

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

  const handleResetView = useCallback(() => {
    mapRef.current?.flyTo(PACKED_CENTER, PACKED_ZOOM);
  }, []);
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
      if (next.has(layerId)) {
        next.delete(layerId);
        return next;
      }
      if (next.size >= 2) {
        const first = next.values().next().value as string | undefined;
        if (first) next.delete(first);
      }
      next.add(layerId);
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
          setCoreFacts([]);
          setCoreMwsId(null);
          return;
        }
        const next = coreStackService.toDatasetLayers(bundle.layers);
        setCoreLayers(next);
        const place = [bundle.admin?.tehsil, bundle.admin?.district, bundle.admin?.state].filter(Boolean).join(', ');
        setCorePlace(place || null);
        setCoreStatus(next.length ? `${next.length} maps for ${place || 'this tehsil'}` : (place ? `No extra maps listed for ${place}` : 'No CoRE Stack coverage here'));
        if (bundle.admin) {
          coreStackService.enrichFieldBrief(bundle.admin, focusLocation.lat, focusLocation.lon).then(extra => {
            setCoreFacts(extra.facts || []);
            setCoreMwsId(extra.mwsId || null);
          });
        }
      });
    }, 700);
    return () => window.clearTimeout(handle);
  }, [focusLocation?.lat, focusLocation?.lon, isOnline]);

  useEffect(() => {
    if (!tesseraOn || !focusLocation) {
      if (!tesseraOn) {
        setTesseraPreview(null);
        setTesseraPreviewNote(null);
      }
      return;
    }
    let cancelled = false;
    setTesseraPreviewNote('Loading landscape colour for this Tessera tile…');
    resolveTesseraPreview(focusLocation.lat, focusLocation.lon).then(preview => {
      if (cancelled) return;
      setTesseraPreview(preview);
      if (preview) {
        setTesseraPreviewNote(
          preview.source === 'preload'
            ? 'Packed for the Sulya trial landscape — one 0.1° tile, not the 128-d tensor.'
            : 'Downloaded this tile only. Similar colour means similar landscape.',
        );
      } else {
        setTesseraPreviewNote('No fingerprint for this tile yet. Import the Sulya AOI (preloaded) or set a Tessera proxy in Settings when you have signal.');
      }
    });
    return () => { cancelled = true; };
  }, [tesseraOn, focusLocation?.lat, focusLocation?.lon]);

  useEffect(() => {
    if (!focusLocation || !isOnline) {
      setIndiaSatClass(null);
      return;
    }
    const handle = window.setTimeout(() => {
      indiaSatService.fetchPointData(focusLocation.lat, focusLocation.lon, indiasatYear).then(pt => {
        if (!pt) {
          setIndiaSatClass(null);
          return;
        }
        const info = indiaSatService.getClassInfo(pt.classId);
        setIndiaSatClass({ name: pt.landCoverClass, color: info?.color || '#888', classId: pt.classId });
      }).catch(() => setIndiaSatClass(null));
    }, 800);
    return () => window.clearTimeout(handle);
  }, [focusLocation?.lat, focusLocation?.lon, indiasatYear, isOnline]);

  const handleCaptureButton = useCallback(() => {
    setCaptureOpen(true);
    if (!focusLocation) void handleLocateMe();
  }, [focusLocation, handleLocateMe]);

  const handleObservationSubmit = useCallback(async (obs: Observation) => {
    await db.observations.add(obs);
    await syncEngine.enqueue(obs.id);
    if (obs.trackId) await trackRecorder.attachObservation(obs.id);
    setPendingSync(p => p + 1);
    setNoteMarkers(prev => [{ id: obs.id, lat: obs.location.lat, lon: obs.location.lon }, ...prev].slice(0, 80));
    setCaptureOpen(false);
    setToast(isOnline ? 'Saved. Maps fill in when they can.' : 'Saved on this phone.');
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
        recording={activeTrack?.status === 'recording'}
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
          trackPoints={activeTrack?.points ?? []}
          onMapMove={handleMapMove}
          onMapClick={handleMapClick}
        />

        <MapControls
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
          onLocateMe={handleLocateMe}
          onResetView={handleResetView}
        />

        <button
          className="basemap-toggle"
          onClick={handleBasemapToggle}
          aria-label={basemap === 'dark' ? 'Switch to satellite' : 'Switch to streets'}
          title={basemap === 'dark' ? 'Satellite — Esri when online, Sentinel-2 kept on the phone' : 'Streets — OpenStreetMap, kept as you pan'}
        >
          {basemap === 'dark' ? '🛰️' : '🗺️'}
        </button>

        {activeTab === 'map' && (
          <div className="fields-prediction-anchor">
            <TrackHud
              track={activeTrack}
              location={currentLocation}
              onStart={async () => {
                try {
                  await trackRecorder.start();
                } catch {
                  setToast('Could not start GPS. Allow location for Fields, then try again.');
                  return;
                }
                void handleLocateMe();
              }}
              onPause={() => { void trackRecorder.pause(); }}
              onResume={() => { void trackRecorder.resume(); }}
              onStop={async () => {
                const done = await trackRecorder.stop();
                setToast(done ? `Saved ${done.name}` : 'Track saved');
              }}
            />
            <SpotBar
              focusLocation={focusLocation}
              placeLabel={corePlace}
              pendingEnrichment={pendingSync}
              indiaSatClass={indiaSatClass}
              showTessera={tesseraOn}
              recording={Boolean(activeTrack)}
            />
          </div>
        )}

        {pinnedLocation && activeTab === 'map' && (
          <button className="fields-pin-indicator" onClick={() => setPinnedLocation(null)}>
            Pinned to map tap · follow GPS
          </button>
        )}

        {activeTab === 'map' && (
          <button
            type="button"
            className="save-maps-btn"
            onClick={() => {
              setSaveMapBounds(mapRef.current?.getBounds() ?? null);
              setSaveMapsOpen(true);
            }}
            title="Keep this view on the phone"
          >
            Save maps
          </button>
        )}

        {saveMapsOpen && (
          <SaveMapsSheet
            bounds={saveMapBounds}
            zoom={zoom}
            online={isOnline}
            onClose={() => setSaveMapsOpen(false)}
            onSaved={(msg) => { setToast(msg); setSaveMapsOpen(false); }}
          />
        )}

        {toast && <div className="fields-toast" role="status">{toast}</div>}

        {!isOnline && (
          <div className="fields-offline-banner" role="status">
            Offline. Streets and Sentinel-2 show for places you already viewed or saved. GPS, notes, and photos still work.
          </div>
        )}

        {activeTab === 'layers' && (
          <OverlayPanel
            indiaSatOn={indiaSatOn}
            indiasatYear={indiasatYear}
            indiasatTileError={indiasatTileError}
            isOnline={isOnline}
            onToggleIndiaSat={() => {
              setIndiaSatOn(v => {
                const next = !v;
                if (next) setTesseraOn(false);
                return next;
              });
            }}
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
            tesseraOn={tesseraOn}
            tesseraPreviewNote={tesseraPreviewNote}
            tesseraHasPreview={Boolean(tesseraPreview)}
            onToggleTessera={() => {
              setTesseraOn(v => {
                const next = !v;
                if (next) setIndiaSatOn(false);
                return next;
              });
            }}
            coreFacts={coreFacts}
            coreMwsId={coreMwsId}
            aoiCount={aoiLayers.length}
            onOpenSettings={() => { setActiveTab('map'); setSettingsOpen(true); }}
            onClose={() => setActiveTab('map')}
          />
        )}

        {activeTab === 'log' && (
          <div className="panel-overlay">
            <div className="panel-header">
              <h2>Journal</h2>
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
        recording={activeTrack?.status === 'recording'}
        pendingSync={pendingSync}
      />

      {captureOpen && (
        <QuickCapture
          focusLocation={focusLocation ?? { lat: center[1], lon: center[0], accuracy: 0, timestamp: Date.now() }}
          indiaSatHint={indiaSatClass}
          autoCamera={!activeTrack}
          trackId={activeTrack?.id ?? null}
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
  tesseraOn: boolean;
  tesseraPreviewNote: string | null;
  tesseraHasPreview: boolean;
  onToggleTessera: () => void;
  coreFacts: CoreStackFact[];
  coreMwsId: string | null;
  aoiCount: number;
  onOpenSettings: () => void;
  onClose: () => void;
}> = ({
  indiaSatOn, indiasatYear, indiasatTileError, isOnline, onToggleIndiaSat, onYearChange,
  forestLayers, activeForestLayers, onForestToggle, coreLayers, activeCoreLayers, onCoreToggle,
  coreStatus, corePlace, tesseraHint, tesseraOn, tesseraPreviewNote, tesseraHasPreview, onToggleTessera,
  coreFacts, coreMwsId, aoiCount, onOpenSettings, onClose,
}) => {
  return (
    <div className="panel-overlay">
      <div className="panel-header">
        <h2>Map layers</h2>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="overlay-content">
        <p className="overlay-lede">Optional colouring. Streets and satellite for any place are saved on this phone as you go (or via Save maps). IndiaSAT needs signal.{!isOnline ? ' You are offline: saved maps, forest rasters, GPS, and notes still work.' : ''}</p>
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
              <small>Annual CoRE Stack map for this tehsil — class colours (trees, orchard, crop, water, built-up). Turns off Tessera colour so the two rasters are not mixed.</small>
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
              <strong>Tessera landscape colour</strong>
              <small>RGB fingerprint of this 0.1° tile (embedding bands 30 · 60 · 90). Similar colour ≈ similar landscape — not IndiaSAT classes. Turns off land-cover colour while on.</small>
              {tesseraHint && <small>This spot → {tesseraHint}</small>}
            </div>
            <label className="switch">
              <input type="checkbox" checked={tesseraOn} onChange={onToggleTessera} />
              <span />
            </label>
          </header>
          {tesseraOn && tesseraPreviewNote && <p className={tesseraHasPreview ? 'overlay-note' : 'overlay-warn'}>{tesseraPreviewNote}</p>}
        </section>

        <section className="overlay-card">
          <header>
            <div>
              <strong>CoRE Stack · this taluk</strong>
              <small>{corePlace || 'Stand on the map or tap a point first'}</small>
              {coreMwsId && <small>Micro-watershed {coreMwsId}</small>}
              {coreStatus && <small>{coreStatus}</small>}
            </div>
          </header>
          {coreFacts.length > 0 && (
            <ul className="core-facts">
              {coreFacts.map(f => (
                <li key={f.label}>
                  <strong>{f.label}</strong>
                  <span>{f.value}</span>
                  {f.validate && <em>{f.validate}</em>}
                </li>
              ))}
            </ul>
          )}
          <div className="forest-layer-list">
            {coreLayers.length === 0 && <p className="overlay-warn">Paste a CoRE Stack key in Settings. Extra rasters (water, canopy, crops) appear when this tehsil has them — at most two at once so the phone stays calm.</p>}
            {coreLayers.map(cl => (
              <label key={cl.id} className="forest-layer-toggle">
                <input type="checkbox" checked={activeCoreLayers.has(cl.id)} onChange={() => onCoreToggle(cl.id)} />
                <span>
                  {cl.title}
                  {cl.description && <small>{cl.description}</small>}
                </span>
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
