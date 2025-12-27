import React, { useState, useEffect, useCallback, useRef } from 'react';
import MapView from './components/MapView';
import BottomSheet from './components/BottomSheet';
import LayerPanel from './components/LayerPanel';
import SearchBar from './components/SearchBar';
import LocationSummary from './components/LocationSummary';
import CaptureButton from './components/CaptureButton';
import FieldLog from './components/FieldLog';
import CaptureModal from './components/CaptureModal';
import NetworkIndicator from './components/NetworkIndicator';
import { db } from './db/database';
import { DatasetManager } from './services/DatasetManager';
import { GeoLocationService } from './services/GeoLocationService';
import { syncService, SyncStatus } from './services/SyncService';
import { coreStackService } from './services/CoreStackService';
import { dynamicWorldService } from './services/DynamicWorldService';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import type { DatasetLayer, Observation, LocationData } from './types';

const App: React.FC = () => {
  const [layers, setLayers] = useState<DatasetLayer[]>([]);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showFieldLog, setShowFieldLog] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [locationSummary, setLocationSummary] = useState<Record<string, unknown> | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [basemap, setBasemap] = useState<'dark' | 'satellite'>('dark');
  const [mapCenter, setMapCenter] = useState<[number, number]>([75.5, 13.0]); // Western Ghats center
  const [mapZoom, setMapZoom] = useState(8);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  
  const networkStatus = useNetworkStatus();
  const datasetManagerRef = useRef<DatasetManager | null>(null);
  const geoServiceRef = useRef(new GeoLocationService());

  // Initialize datasets and Dynamic World service
  useEffect(() => {
    const initDatasets = async () => {
      try {
        // Initialize Dataset Manager
        datasetManagerRef.current = new DatasetManager();
        await datasetManagerRef.current.initialize();
        const loadedLayers = datasetManagerRef.current.getLayers();
        setLayers(loadedLayers);
        
        // Load Dynamic World cached data
        await dynamicWorldService.loadCachedData();
        
        // Enable first 2 layers by default
        const defaultActive = new Set(loadedLayers.slice(0, 2).map(l => l.id));
        setActiveLayers(defaultActive);
      } catch (err) {
        console.error('Failed to initialize datasets:', err);
      }
    };
    initDatasets();
  }, []);

  // Initialize sync service
  useEffect(() => {
    // Subscribe to sync status updates
    const unsubscribe = syncService.subscribe(setSyncStatus);
    
    // Start auto-sync when online
    const stopAutoSync = syncService.startAutoSync(60000); // Every minute
    
    return () => {
      unsubscribe();
      stopAutoSync();
    };
  }, []);

  // Toggle layer visibility
  const toggleLayer = useCallback((layerId: string) => {
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

  // Handle locate me
  const handleLocateMe = useCallback(async () => {
    try {
      const location = await geoServiceRef.current.getCurrentPosition();
      setCurrentLocation(location);
      setMapCenter([location.lon, location.lat]);
      setMapZoom(14);
      
      // Get summary for location
      if (datasetManagerRef.current) {
        const summary = await datasetManagerRef.current.getSummaryAtPoint(
          location.lat,
          location.lon,
          Array.from(activeLayers)
        );
        setLocationSummary(summary);
        setShowSummary(true);
      }
    } catch (err) {
      console.error('Location error:', err);
      alert('Could not get location. Please enable GPS.');
    }
  }, [activeLayers]);

  // Handle search
  const handleSearch = useCallback(async (lat: number, lon: number, placeName?: string) => {
    setMapCenter([lon, lat]);
    setMapZoom(14);
    setCurrentLocation({ lat, lon, accuracy: 0 });
    
    // Get summary for location
    if (datasetManagerRef.current) {
      const summary = await datasetManagerRef.current.getSummaryAtPoint(
        lat,
        lon,
        Array.from(activeLayers)
      );
      
      // If online and API key is set, try to enrich with CoreStack data
      if (networkStatus.isOnline && coreStackService.hasApiKey()) {
        try {
          const enrichment = await coreStackService.enrichLocation(lat, lon);
          if (!enrichment.error) {
            Object.assign(summary, {
              admin: enrichment.admin,
              mwsId: enrichment.mwsId,
              indicators: enrichment.indicators
            });
          }
        } catch (e) {
          console.warn('CoreStack enrichment failed:', e);
        }
      }
      
      // Add Dynamic World summary
      const dwSummary = dynamicWorldService.getSummaryForLocation();
      if (dwSummary) {
        Object.assign(summary, { dynamicWorld: dwSummary });
      }
      
      if (placeName) {
        (summary as Record<string, unknown>).placeName = placeName;
      }
      
      setLocationSummary(summary);
      setShowSummary(true);
    }
  }, [activeLayers, networkStatus.isOnline]);

  // Handle capture observation
  const handleCaptureComplete = useCallback(async (observation: Observation) => {
    await db.observations.add(observation);
    setShowCapture(false);
  }, []);

  // Get dataset values at current location for capture
  const getDatasetValuesAtPoint = useCallback(async (lat: number, lon: number) => {
    if (!datasetManagerRef.current) return {};
    return await datasetManagerRef.current.getValuesAtPoint(lat, lon, Array.from(activeLayers));
  }, [activeLayers]);

  return (
    <div className="app-container">
      {/* Main Map */}
      <MapView
        center={mapCenter}
        zoom={mapZoom}
        basemap={basemap}
        layers={layers}
        activeLayers={activeLayers}
        currentLocation={currentLocation}
        onMapMove={(center, zoom) => {
          setMapCenter(center);
          setMapZoom(zoom);
        }}
      />

      {/* Top Controls */}
      <div className="top-controls">
        <SearchBar onSearch={handleSearch} isOnline={networkStatus.isOnline} />
        
        <NetworkIndicator 
          status={networkStatus} 
          pendingSync={syncStatus?.pendingObservations || 0} 
        />
        
        <div className="basemap-toggle">
          <button
            className={basemap === 'dark' ? 'active' : ''}
            onClick={() => setBasemap('dark')}
            title="Map View"
          >
            🗺️
          </button>
          <button
            className={basemap === 'satellite' ? 'active' : ''}
            onClick={() => setBasemap('satellite')}
            title="Satellite View"
          >
            🛰️
          </button>
        </div>
      </div>

      {/* Right Side Controls */}
      <div className="side-controls">
        <button 
          className="control-btn"
          onClick={handleLocateMe}
          title="Locate Me"
        >
          📍
        </button>
        <button 
          className={`control-btn ${showLayerPanel ? 'active' : ''}`}
          onClick={() => setShowLayerPanel(!showLayerPanel)}
          title="Layers"
        >
          ⚙️
        </button>
        <button 
          className={`control-btn ${showFieldLog ? 'active' : ''}`}
          onClick={() => setShowFieldLog(!showFieldLog)}
          title="Field Log"
        >
          📋
        </button>
        <button 
          className="control-btn"
          onClick={() => setShowApiKeyModal(true)}
          title="API Settings"
        >
          🔑
        </button>
      </div>

      {/* Layer Panel - Side Sheet */}
      {showLayerPanel && (
        <LayerPanel
          layers={layers}
          activeLayers={activeLayers}
          onToggle={toggleLayer}
          onClose={() => setShowLayerPanel(false)}
        />
      )}

      {/* Location Summary - Compact Bottom Sheet */}
      {showSummary && locationSummary && (
        <LocationSummary
          summary={locationSummary}
          location={currentLocation}
          onClose={() => setShowSummary(false)}
        />
      )}

      {/* Field Log - Bottom Sheet */}
      {showFieldLog && (
        <BottomSheet
          title="Field Log"
          onClose={() => setShowFieldLog(false)}
        >
          <FieldLog 
            onGoToLocation={(lat, lon) => {
              setMapCenter([lon, lat]);
              setMapZoom(16);
              setShowFieldLog(false);
            }}
          />
        </BottomSheet>
      )}

      {/* Capture Button - Primary Action */}
      <CaptureButton onClick={() => setShowCapture(true)} />

      {/* Capture Modal */}
      {showCapture && (
        <CaptureModal
          currentLocation={currentLocation}
          getDatasetValues={getDatasetValuesAtPoint}
          onCapture={handleCaptureComplete}
          onClose={() => setShowCapture(false)}
        />
      )}

      {/* API Key Settings Modal */}
      {showApiKeyModal && (
        <div className="modal-overlay" onClick={() => setShowApiKeyModal(false)}>
          <div className="modal-content api-key-modal" onClick={e => e.stopPropagation()}>
            <h3>CoreStack API Settings</h3>
            <p className="modal-description">
              Enter your CoreStack API key to enable online data enrichment.
              This allows fetching watershed data, admin details, and more when online.
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const input = form.elements.namedItem('apiKey') as HTMLInputElement;
              if (input.value.trim()) {
                coreStackService.setApiKey(input.value.trim());
                setShowApiKeyModal(false);
              }
            }}>
              <input
                type="password"
                name="apiKey"
                placeholder="Enter API Key..."
                defaultValue={localStorage.getItem('corestack_api_key') || ''}
                autoComplete="off"
              />
              <div className="modal-actions">
                <button type="button" onClick={() => setShowApiKeyModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Save
                </button>
              </div>
            </form>
            <p className="modal-hint">
              {coreStackService.hasApiKey() 
                ? '✅ API key is configured' 
                : '⚠️ No API key set - online enrichment disabled'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
