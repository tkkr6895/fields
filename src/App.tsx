import { useState, useEffect, useRef, useCallback } from 'react';
import MapView, { MapViewRef, CoreStackLayer, MapClickInfo } from './components/MapView';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import MapControls from './components/MapControls';
import SearchBar from './components/SearchBar';
import LayerPanelPro from './components/LayerPanelPro';
import LocationInfoPanel from './components/LocationInfoPanel';
import CaptureModal from './components/CaptureModal';
import FieldLog from './components/FieldLog';
import FieldProtocols from './components/FieldProtocols';
import SpeciesGuide from './components/SpeciesGuide';
import SettingsPanel from './components/SettingsPanel';
import CustomLayerImporter from './components/customlayers/CustomLayerImporter';
import CustomLayerStyleEditor from './components/customlayers/CustomLayerStyleEditor';
import VectorFeatureInspector, { VectorFeatureForInspection } from './components/VectorFeatureInspector';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { DatasetManager } from './services/DatasetManager';
import { rasterLayerService } from './services/RasterLayerService';
import { tileLayerService } from './services/TileLayerService';
import { GeoLocationService } from './services/GeoLocationService';
import { syncEngine } from './services/SyncEngine';
import { db, getCustomLayers, updateCustomLayer as dbUpdateCustomLayer, deleteCustomLayer as dbDeleteCustomLayer } from './db/database';
import type { LocationData, Observation, DatasetLayer, DatasetValues, CustomLayer, CustomLayerStyle, VectorFeatureContext, ValidationStatus, ObservationType } from './types';
import './styles/global.css';

type TabType = 'map' | 'layers' | 'protocols' | 'log';

// Create singleton instance
const datasetManager = new DatasetManager();

function App() {
  // Map state
  const [center, setCenter] = useState<[number, number]>([75.5, 13.0]);
  const [zoom, setZoom] = useState(8);
  const [basemap, setBasemap] = useState<'dark' | 'satellite'>('dark');
  const [layers, setLayers] = useState<DatasetLayer[]>([]);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(() => {
    const initial = new Set<string>(['western_ghats_boundary']);
    if ((import.meta.env.VITE_DW_GEE_PROXY_URL || '').trim().length > 0) {
      initial.add('dynamicworld_live');
    }
    return initial;
  });
  const [coreStackLayers, setCoreStackLayers] = useState<CoreStackLayer[]>([]);
  const [customLayers, setCustomLayers] = useState<CustomLayer[]>([]);
  const [showLayerImporter, setShowLayerImporter] = useState(false);
  const [editingCustomLayer, setEditingCustomLayer] = useState<CustomLayer | null>(null);
  
  // Navigation state
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [showCapture, setShowCapture] = useState(false);
  const [showProtocols, setShowProtocols] = useState(false);
  const [showSpecies, setShowSpecies] = useState(false);
  const [showLocationInfo, setShowLocationInfo] = useState(false);
  const [searchedLocation, setSearchedLocation] = useState<LocationData | null>(null);
  const [lastClickInfo, setLastClickInfo] = useState<MapClickInfo | null>(null);
  const [vectorFeatures, setVectorFeatures] = useState<VectorFeatureForInspection[] | null>(null);
  
  // Location state
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  
  // Data state
  const [pendingSync, setPendingSync] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Map reference for controls
  const mapRef = useRef<MapViewRef>(null);
  
  // Location service
  const geoService = useRef(new GeoLocationService());
  
  // Network status
  const { isOnline } = useNetworkStatus();
  
  // Initialize app
  useEffect(() => {
    // Load layers from dataset manager and raster service
    const loadLayers = async () => {
      try {
        // Load vector/CSV layers
        await datasetManager.initialize();
        const csvLayers = datasetManager.getLayers();
        
        // Load raster image overlay layers
        const rasterLayers = await rasterLayerService.getRasterLayers();

        // Load raster XYZ tile layers (more reliable for large rasters)
        const tileLayers = await tileLayerService.getTileLayers();
        
        // Combine all layers
        const dynamicWorldLiveLayer: DatasetLayer = {
          id: 'dynamicworld_live',
          title: 'Dynamic World (Live GEE)',
          type: 'raster',
          source: { format: 'xyz', path: 'dynamicworld://live' },
          style: { kind: 'image', opacity: 0.75 },
          minZoom: 0,
          maxZoom: 19,
          description: 'Live Dynamic World LULC from Google Earth Engine (requires configured proxy)',
          category: 'dynamicworld',
          enabled: true
        };

        const allLayers = [...csvLayers, ...rasterLayers, ...tileLayers, dynamicWorldLiveLayer];
        setLayers(allLayers);
        
        console.log(`Loaded ${csvLayers.length} dataset layers, ${rasterLayers.length} image overlays, ${tileLayers.length} tile layers`);
      } catch (err) {
        console.error('Failed to load layers:', err);
      }
    };
    loadLayers();
    
    // Count pending observations (v2 uses syncStatus field)
    const countPending = async () => {
      try {
        const pending = await db.observations
          .where('syncStatus')
          .anyOf(['pending', 'queued', 'failed'])
          .count();
        setPendingSync(pending);
      } catch {
        // Fallback: count all observations (no index available)
        const total = await db.observations.count();
        setPendingSync(total);
      }
    };
    countPending();

    // Load custom layers from IndexedDB
    const loadCustomLayers = async () => {
      try {
        const cls = await getCustomLayers();
        setCustomLayers(cls);
      } catch (err) {
        console.error('Failed to load custom layers:', err);
      }
    };
    loadCustomLayers();

    // Start SyncEngine auto-sync (Task 1.4.6)
    syncEngine.startAutoSync();
    
    // Start location watch
    geoService.current.watchPosition((loc) => {
      setCurrentLocation(loc);
    });
    
    return () => {
      geoService.current.stopWatching();
    };
  }, []);

  // Map handlers
  const handleMapMove = useCallback((newCenter: [number, number], newZoom: number) => {
    setCenter(newCenter);
    setZoom(newZoom);
  }, []);

  const handleCoreStackLayersLoaded = useCallback((layers: CoreStackLayer[]) => {
    setCoreStackLayers(layers);
  }, []);

  const handleLoadCoreStackAtPoint = useCallback(async (lat: number, lon: number) => {
    if (!mapRef.current) return;
    await mapRef.current.loadCoreStackAtPoint(lat, lon);
  }, []);

  const handleLoadCoreStackByAdmin = useCallback(async (state: string, district: string, tehsil: string) => {
    if (!mapRef.current) return;
    await mapRef.current.loadCoreStackForAdmin(state, district, tehsil);
  }, []);

  const handleLayerToggle = useCallback((layerId: string) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  }, []);

  // Get dataset values at location
  const getDatasetValues = useCallback(async (lat: number, lon: number): Promise<DatasetValues> => {
    try {
      const activeLayerIds = Array.from(activeLayers);
      const values = await datasetManager.getValuesAtPoint(lat, lon, activeLayerIds);
      return values || {};
    } catch (err) {
      console.error('Failed to query point:', err);
      return {};
    }
  }, [activeLayers]);

  // Handle new observation
  const handleCapture = useCallback(async (observation: Observation) => {
    try {
      await db.observations.add(observation);
      setPendingSync(prev => prev + 1);
      setShowCapture(false);
    } catch (err) {
      console.error('Failed to save observation:', err);
    }
  }, []);

  // Control handlers
  const handleZoomIn = useCallback(() => mapRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => mapRef.current?.zoomOut(), []);
  
  const handleLocateMe = useCallback(async () => {
    if (currentLocation) {
      mapRef.current?.flyTo([currentLocation.lon, currentLocation.lat], 15);
      return true;
    }
    try {
      const loc = await geoService.current.getCurrentPosition();
      setCurrentLocation(loc);
      mapRef.current?.flyTo([loc.lon, loc.lat], 15);
      return true;
    } catch {
      return false;
    }
  }, [currentLocation]);

  const handleResetView = useCallback(() => mapRef.current?.resetView(), []);

  // Handle search result selection
  const handleSearch = useCallback((lat: number, lon: number, placeName?: string) => {
    console.log('Search:', lat, lon, placeName);
    mapRef.current?.flyTo([lon, lat], 14);
    const loc: LocationData = { lat, lon, accuracy: 0 };
    setSearchedLocation(loc);
    // Automatically show location info after search
    setTimeout(() => setShowLocationInfo(true), 500);
  }, []);

  // Handle map click to get info for that location
  const handleMapClick = useCallback((lat: number, lon: number, info?: MapClickInfo) => {
    const loc: LocationData = { lat, lon, accuracy: 0 };
    setSearchedLocation(loc);
    setLastClickInfo(info || null);

    // Extract vector features for the inspector
    const features = info?.features || [];
    if (features.length > 0) {
      const inspectionFeatures: VectorFeatureForInspection[] = features.map(f => {
        const layerId = f.source === 'corestack' ? (f.coreStackLayerId || f.mapLayerId) : (f.datasetLayerId || f.mapLayerId);
        const datasetLayer = layers.find(l => l.id === layerId);
        const coreStackLayer = coreStackLayers.find(l => l.id === layerId);
        const title = datasetLayer?.title || coreStackLayer?.name || layerId;
        // Use geometry type hint from properties or default to 'Polygon'
        const geomType = f.properties?.['_geometry_type'] as string || 'Polygon';
        return {
          layerId,
          layerTitle: title,
          source: f.source as 'corestack' | 'dataset',
          geometryType: geomType,
          properties: f.properties,
          propertySchema: datasetLayer?.propertySchema,
          validatable: datasetLayer?.validatable ?? true,
          validationPrompt: datasetLayer?.validationPrompt,
        };
      });
      setVectorFeatures(inspectionFeatures);
    } else {
      setVectorFeatures(null);
      setShowLocationInfo(true);
    }
  }, [layers, coreStackLayers]);

  const handleGoToLocation = useCallback((lat: number, lon: number) => {
    mapRef.current?.flyTo([lon, lat], 15);
    setActiveTab('map');
  }, []);

  // Handle vector feature validation from the inspector
  const handleValidateVectorFeature = useCallback(async (
    context: VectorFeatureContext,
    validation: ValidationStatus,
    observationType: ObservationType
  ) => {
    if (!searchedLocation) return;
    const { v4: uuidv4 } = await import('uuid');
    const { deriveSeason } = await import('./services/SeasonService');
    const { getDeviceId, getUserName } = await import('./services/DeviceService');
    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    const userId = getUserName() || deviceId;

    const observation: Observation = {
      id: uuidv4(),
      timestamp: now,
      location: { lat: searchedLocation.lat, lon: searchedLocation.lon, accuracy: 0 },
      context: { region: 'Western Ghats', areaMode: 'point' },
      datasetValues: {},
      userValidation: validation,
      notes: `Vector validation: ${context.validationPrompt || 'Feature ground-truth'}`,
      observationType,
      vectorFeatureContext: context,
      confidence: 3,
      season: deriveSeason(now),
      userId,
      deviceId,
      synced: false,
      syncStatus: 'pending',
    };

    try {
      await db.observations.add(observation);
      setPendingSync(prev => prev + 1);
      await syncEngine.enqueue(observation.id);
    } catch (err) {
      console.error('Failed to save vector validation:', err);
    }
  }, [searchedLocation]);

  // Basemap toggle
  const handleBasemapToggle = useCallback(() => {
    setBasemap(prev => prev === 'dark' ? 'satellite' : 'dark');
  }, []);

  // Tab handlers
  const handleTabChange = useCallback((tab: string) => {
    const typedTab = tab as TabType;
    if (typedTab === activeTab && typedTab !== 'map') {
      setActiveTab('map');
    } else {
      setActiveTab(typedTab);
    }
  }, [activeTab]);

  // Fetch and show location info panel
  const handleShowLocationInfo = useCallback(() => {
    if (currentLocation) {
      setSearchedLocation(currentLocation);
      setShowLocationInfo(true);
    }
  }, [currentLocation]);

  // ─── Custom Layer Handlers (Task 1.8.13) ───────────────────
  const handleToggleCustomLayer = useCallback((layerId: string) => {
    setCustomLayers(prev =>
      prev.map(cl =>
        cl.id === layerId ? { ...cl, enabled: !(cl.enabled ?? true) } : cl
      )
    );
    // Persist toggle
    const layer = customLayers.find(l => l.id === layerId);
    if (layer) {
      dbUpdateCustomLayer(layerId, { enabled: !(layer.enabled ?? true) }).catch(console.error);
    }
  }, [customLayers]);

  const handleDeleteCustomLayer = useCallback(async (layerId: string) => {
    if (!confirm('Delete this custom layer?')) return;
    await dbDeleteCustomLayer(layerId);
    setCustomLayers(prev => prev.filter(l => l.id !== layerId));
  }, []);

  const handleCustomLayerStyleSave = useCallback(async (style: CustomLayerStyle) => {
    if (!editingCustomLayer) return;
    await dbUpdateCustomLayer(editingCustomLayer.id, { style });
    setCustomLayers(prev =>
      prev.map(cl => cl.id === editingCustomLayer.id ? { ...cl, style } : cl)
    );
    setEditingCustomLayer(null);
  }, [editingCustomLayer]);

  const handleLayerImported = useCallback((layer: CustomLayer) => {
    setCustomLayers(prev => [layer, ...prev]);
    setShowLayerImporter(false);
  }, []);

  // Render panel content
  const renderPanel = () => {
    switch (activeTab) {
      case 'layers':
        return (
          <LayerPanelPro
            layers={layers}
            activeLayers={activeLayers}
            onToggle={handleLayerToggle}
            onClose={() => setActiveTab('map')}
            coreStackLayers={coreStackLayers}
            mapCenter={{ lat: center[1], lon: center[0] }}
            selectedLocation={searchedLocation ? { lat: searchedLocation.lat, lon: searchedLocation.lon } : undefined}
            onLoadCoreStackAtPoint={handleLoadCoreStackAtPoint}
            onLoadCoreStackByAdmin={handleLoadCoreStackByAdmin}
            customLayers={customLayers}
            onToggleCustomLayer={handleToggleCustomLayer}
            onEditCustomLayerStyle={(layer) => setEditingCustomLayer(layer)}
            onDeleteCustomLayer={handleDeleteCustomLayer}
            onImportLayer={() => setShowLayerImporter(true)}
          />
        );
      case 'protocols':
        return (
          <div className="panel-overlay">
            <div className="panel-header">
              <h2>Field Resources</h2>
              <button className="panel-close" onClick={() => setActiveTab('map')}>✕</button>
            </div>
            <div className="guide-content">
              <button className="guide-btn" onClick={() => setShowProtocols(true)}>
                <span className="guide-icon">📋</span>
                <span>Field Protocols</span>
              </button>
              <button className="guide-btn" onClick={() => setShowSpecies(true)}>
                <span className="guide-icon">🌿</span>
                <span>Species Guide</span>
              </button>
              <button className="guide-btn" onClick={handleShowLocationInfo} disabled={!currentLocation}>
                <span className="guide-icon">📍</span>
                <span>Location Summary</span>
              </button>
            </div>
          </div>
        );
      case 'log':
        return (
          <div className="panel-overlay">
            <div className="panel-header">
              <h2>Field Log</h2>
              <button className="panel-close" onClick={() => setActiveTab('map')}>✕</button>
            </div>
            <FieldLog onGoToLocation={handleGoToLocation} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <Header
        isOnline={isOnline}
        syncStatus={{ pending: pendingSync }}
        onSettingsClick={() => setSettingsOpen(!settingsOpen)}
      />
      
      {/* Search Bar - Always visible on map */}
      <div className="search-container">
        <SearchBar onSearch={handleSearch} isOnline={isOnline} />
      </div>
      
      <main className="main-content">
        {/* Map always visible */}
        <MapView
          ref={mapRef}
          center={center}
          zoom={zoom}
          basemap={basemap}
          layers={layers}
          activeLayers={activeLayers}
          currentLocation={currentLocation}
          onMapMove={handleMapMove}
          onMapClick={handleMapClick}
          onCoreStackLayersLoaded={handleCoreStackLayersLoaded}
        />
        
        {/* Map Controls */}
        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onLocateMe={handleLocateMe}
          onResetView={handleResetView}
        />
        
        {/* Basemap Toggle */}
        <button 
          className="basemap-toggle"
          onClick={handleBasemapToggle}
          title={`Switch to ${basemap === 'dark' ? 'satellite' : 'dark'} view`}
        >
          {basemap === 'dark' ? '🛰️' : '🌙'}
        </button>
        
        {/* Active Layers Indicator */}
        {activeLayers.size > 0 && activeTab === 'map' && (
          <div className="active-layers-indicator" onClick={() => setActiveTab('layers')}>
            {activeLayers.size} layer{activeLayers.size !== 1 ? 's' : ''} active
          </div>
        )}
        
        {/* Overlay Panels */}
        {renderPanel()}
      </main>
      
      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onCaptureClick={() => setShowCapture(true)}
        pendingSync={pendingSync}
      />
      
      {/* Modals */}
      {showCapture && (
        <CaptureModal
          currentLocation={currentLocation}
          getDatasetValues={getDatasetValues}
          onCapture={handleCapture}
          onClose={() => setShowCapture(false)}
        />
      )}
      
      {showProtocols && (
        <FieldProtocols 
          onClose={() => setShowProtocols(false)} 
          onStartProtocol={(id) => {
            console.log('Starting protocol:', id);
            setShowProtocols(false);
          }}
        />
      )}
      
      {showSpecies && (
        <SpeciesGuide 
          onClose={() => setShowSpecies(false)} 
          onRecordSpecies={(id) => {
            console.log('Recording species:', id);
            setShowSpecies(false);
          }}
        />
      )}
      
      {showLocationInfo && searchedLocation && (
        <LocationInfoPanel
          key={`${searchedLocation.lat}-${searchedLocation.lon}`}
          location={searchedLocation}
          isOnline={isOnline}
          activeLayerIds={[...activeLayers]}
          mapClickInfo={lastClickInfo}
          onClose={() => setShowLocationInfo(false)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}

      {/* Custom Layer Modals (Task 1.8) */}
      {showLayerImporter && (
        <CustomLayerImporter
          onImported={handleLayerImported}
          onCancel={() => setShowLayerImporter(false)}
        />
      )}

      {editingCustomLayer && (
        <CustomLayerStyleEditor
          layer={editingCustomLayer}
          onSave={handleCustomLayerStyleSave}
          onCancel={() => setEditingCustomLayer(null)}
        />
      )}

      {/* Vector Feature Inspector — shows when clicking a vector feature on map */}
      {vectorFeatures && vectorFeatures.length > 0 && searchedLocation && (
        <VectorFeatureInspector
          features={vectorFeatures}
          location={{ lat: searchedLocation.lat, lon: searchedLocation.lon }}
          onValidateFeature={handleValidateVectorFeature}
          onClose={() => { setVectorFeatures(null); setShowLocationInfo(true); }}
        />
      )}
    </div>
  );
}

export default App;
