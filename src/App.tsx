import { useState, useEffect, useRef, useCallback } from 'react';
import MapView, { MapViewRef } from './components/MapView';
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
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { DatasetManager } from './services/DatasetManager';
import { rasterLayerService } from './services/RasterLayerService';
import { GeoLocationService } from './services/GeoLocationService';
import { db } from './db/database';
import type { LocationData, Observation, DatasetLayer, DatasetValues } from './types';
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
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['western_ghats_boundary']));
  
  // Navigation state
  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [showCapture, setShowCapture] = useState(false);
  const [showProtocols, setShowProtocols] = useState(false);
  const [showSpecies, setShowSpecies] = useState(false);
  const [showLocationInfo, setShowLocationInfo] = useState(false);
  const [searchedLocation, setSearchedLocation] = useState<LocationData | null>(null);
  
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
        
        // Combine all layers
        const allLayers = [...csvLayers, ...rasterLayers];
        setLayers(allLayers);
        
        console.log(`Loaded ${csvLayers.length} CSV layers, ${rasterLayers.length} raster layers`);
      } catch (err) {
        console.error('Failed to load layers:', err);
      }
    };
    loadLayers();
    
    // Count pending observations
    const countPending = async () => {
      const pending = await db.observations.where('synced').equals(0).count();
      setPendingSync(pending);
    };
    countPending();
    
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
  const handleMapClick = useCallback((lat: number, lon: number) => {
    const loc: LocationData = { lat, lon, accuracy: 0 };
    setSearchedLocation(loc);
    setShowLocationInfo(true);
  }, []);

  const handleGoToLocation = useCallback((lat: number, lon: number) => {
    mapRef.current?.flyTo([lon, lat], 15);
    setActiveTab('map');
  }, []);

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
          onClose={() => setShowLocationInfo(false)}
        />
      )}
    </div>
  );
}

export default App;
