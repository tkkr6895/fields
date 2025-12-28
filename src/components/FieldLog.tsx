import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, dbReady, exportToGeoJSON, exportToCSV } from '../db/database';
import { imageService } from '../services/ImageService';
import { weatherService } from '../services/WeatherService';
import { dynamicWorldService } from '../services/DynamicWorldService';
import { coreStackService } from '../services/CoreStackService';
import { ObservationDetailModal, ModalObservation } from './ObservationDetailModal';
import type { ValidationStatus, DatasetValues, Observation } from '../types';

interface FieldLogProps {
  onGoToLocation: (lat: number, lon: number) => void;
}

interface SyncProgress {
  current: number;
  total: number;
  status: 'idle' | 'syncing' | 'complete' | 'error';
  message: string;
}

const FieldLog: React.FC<FieldLogProps> = ({ onGoToLocation }) => {
  const [filter, setFilter] = useState<ValidationStatus | 'all'>('all');
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [dbError, setDbError] = useState<string | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<ModalObservation | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    current: 0,
    total: 0,
    status: 'idle',
    message: ''
  });

  // Check database availability
  useEffect(() => {
    dbReady.then((ready) => {
      if (!ready) {
        setDbError('Database unavailable. Try clearing browser data or using incognito mode.');
      }
    });
  }, []);

  // Live query observations
  const observations = useLiveQuery(async () => {
    // Wait for DB to be ready
    const ready = await dbReady;
    if (!ready) return [];
    
    let query = db.observations.orderBy('timestamp').reverse();
    
    if (filter !== 'all') {
      query = db.observations
        .where('userValidation')
        .equals(filter)
        .reverse();
    }
    
    return await query.limit(50).toArray();
  }, [filter]);

  // Load image thumbnails
  useEffect(() => {
    if (!observations) return;

    observations.forEach(async (obs) => {
      if (obs.image?.blobId && !imageUrls[obs.image.blobId]) {
        const url = obs.image.thumbnail || await imageService.getImageUrl(obs.image.blobId);
        if (url) {
          setImageUrls(prev => ({ ...prev, [obs.image!.blobId]: url }));
        }
      }
    });
  }, [observations, imageUrls]);

  // Handle export
  const handleExport = useCallback(async (format: 'geojson' | 'csv') => {
    if (!observations || observations.length === 0) {
      alert('No observations to export');
      return;
    }

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'geojson') {
      content = await exportToGeoJSON(observations);
      filename = `wg_observations_${new Date().toISOString().split('T')[0]}.geojson`;
      mimeType = 'application/json';
    } else {
      content = await exportToCSV(observations);
      filename = `wg_observations_${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    }

    // Download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [observations]);

  // Sync observations with external services
  const handleSync = useCallback(async () => {
    if (!observations || observations.length === 0) {
      alert('No observations to sync');
      return;
    }

    setSyncProgress({
      current: 0,
      total: observations.length,
      status: 'syncing',
      message: 'Starting sync...'
    });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i];
      const lat = obs.location.lat;
      const lon = obs.location.lon;

      setSyncProgress(prev => ({
        ...prev,
        current: i + 1,
        message: `Enriching observation ${i + 1} of ${observations.length}...`
      }));

      try {
        const enrichedData: Record<string, unknown> = { ...obs.datasetValues };

        // Fetch weather data (authentic - from Open-Meteo API)
        try {
          setSyncProgress(prev => ({ ...prev, message: `[${i + 1}/${observations.length}] Fetching weather...` }));
          const weatherData = await weatherService.getWeather(lat, lon);
          if (weatherData && weatherData.current) {
            enrichedData['weather_temp'] = weatherData.current.temperature;
            enrichedData['weather_humidity'] = weatherData.current.humidity;
            enrichedData['weather_description'] = weatherData.current.weatherDescription;
            enrichedData['weather_precip'] = weatherData.current.precipitation;
            enrichedData['weather_source'] = 'Open-Meteo API';
            enrichedData['weather_timestamp'] = new Date().toISOString();
          }
        } catch (e) {
          console.warn('Weather fetch failed:', e);
        }

        // Dynamic World LULC - only regional data available
        // Point-specific data requires GEE API integration
        try {
          setSyncProgress(prev => ({ ...prev, message: `[${i + 1}/${observations.length}] Fetching land cover...` }));
          // Note: Point data is NOT available - fetchPointData returns null
          // We can only provide regional statistics
          const regionalStats = dynamicWorldService.getRegionalStats();
          if (regionalStats) {
            enrichedData['dw_data_type'] = 'REGIONAL_AVERAGE';
            enrichedData['dw_region'] = 'Western Ghats';
            enrichedData['dw_year'] = regionalStats.year;
            enrichedData['dw_trees_regional_pct'] = regionalStats.trees;
            enrichedData['dw_crops_regional_pct'] = regionalStats.crops;
            enrichedData['dw_built_regional_pct'] = regionalStats.built;
            enrichedData['dw_note'] = 'Regional average - point-specific data requires GEE API integration';
          }
        } catch (e) {
          console.warn('Dynamic World fetch failed:', e);
        }

        // Fetch CoreStack data if available (authentic - from CoreStack API)
        try {
          if (coreStackService.isAvailable()) {
            setSyncProgress(prev => ({ ...prev, message: `[${i + 1}/${observations.length}] Fetching CoreStack...` }));
            const coreData = await coreStackService.enrichLocation(lat, lon);
            if (coreData && coreData.admin) {
              enrichedData['corestack_state'] = coreData.admin.state_name;
              enrichedData['corestack_district'] = coreData.admin.district_name;
              enrichedData['corestack_tehsil'] = coreData.admin.tehsil_name;
              enrichedData['corestack_mws_id'] = coreData.mwsId;
              enrichedData['corestack_source'] = 'CoreStack API';
            }
            if (coreData && coreData.indicators) {
              coreData.indicators.forEach(ind => {
                enrichedData[`corestack_${ind.indicator_name.toLowerCase().replace(/\s+/g, '_')}`] = ind.value;
              });
            }
          }
        } catch (e) {
          console.warn('CoreStack fetch failed:', e);
        }

        // Record sync metadata
        enrichedData['sync_timestamp'] = new Date().toISOString();
        enrichedData['sync_status'] = 'enriched';

        // Update observation in database with enriched data
        // Store enriched data in a sync_data layer
        const updatedValues: DatasetValues = {
          ...obs.datasetValues,
          sync_data: enrichedData as { [field: string]: unknown }
        };
        
        await db.observations.update(obs.id!, {
          datasetValues: updatedValues,
          synced: true
        });

        successCount++;
      } catch (error) {
        console.error(`Failed to sync observation ${obs.id}:`, error);
        errorCount++;
      }

      // Small delay to avoid overwhelming APIs
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setSyncProgress({
      current: observations.length,
      total: observations.length,
      status: 'complete',
      message: `Sync complete! ${successCount} enriched, ${errorCount} errors`
    });

    // Reset status after 3 seconds
    setTimeout(() => {
      setSyncProgress({ current: 0, total: 0, status: 'idle', message: '' });
    }, 3000);
  }, [observations]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getValidationLabel = (status: ValidationStatus) => {
    switch (status) {
      case 'match': return '✅ Match';
      case 'mismatch': return '⚠️ Mismatch';
      case 'unclear': return '❓ Unclear';
    }
  };

  // Convert DB observation to modal format
  const toModalObservation = (obs: Observation): ModalObservation => ({
    id: obs.id,
    latitude: obs.location.lat,
    longitude: obs.location.lon,
    altitude: obs.location.altitude,
    observation_type: 'Field Observation',
    validation_status: obs.userValidation,
    notes: obs.notes,
    dataset_values: obs.datasetValues,
    exif_data: obs.image?.exif ? {
      dateTime: obs.image.exif.dateTime,
      make: obs.image.exif.make,
      model: obs.image.exif.model,
      lat: obs.image.exif.lat,
      lon: obs.image.exif.lon
    } : undefined,
    image_id: obs.image?.blobId,
    created_at: obs.timestamp,
    updated_at: obs.timestamp
  });

  // Handle observation click - open detail modal
  const handleObservationClick = (obs: Observation) => {
    setSelectedObservation(toModalObservation(obs));
  };

  // Handle observation update from modal
  const handleObservationUpdate = async (updated: ModalObservation) => {
    if (!updated.id) return;
    
    await db.observations.update(updated.id, {
      notes: updated.notes,
      userValidation: updated.validation_status as ValidationStatus
    });
    
    setSelectedObservation(null);
  };

  // Handle observation delete
  const handleObservationDelete = async (id: string) => {
    await db.observations.delete(id);
    setSelectedObservation(null);
  };

  return (
    <div className="field-log">
      {/* Database Error */}
      {dbError && (
        <div className="db-error-banner" style={{ 
          background: '#ff6b6b22', 
          border: '1px solid #ff6b6b', 
          borderRadius: '8px', 
          padding: '12px', 
          margin: '8px',
          color: '#ff6b6b',
          fontSize: '13px'
        }}>
          ⚠️ {dbError}
        </div>
      )}

      {/* Filters */}
      <div className="field-log-filters">
        <button
          className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`filter-chip ${filter === 'match' ? 'active' : ''}`}
          onClick={() => setFilter('match')}
        >
          ✅ Match
        </button>
        <button
          className={`filter-chip ${filter === 'mismatch' ? 'active' : ''}`}
          onClick={() => setFilter('mismatch')}
        >
          ⚠️ Mismatch
        </button>
        <button
          className={`filter-chip ${filter === 'unclear' ? 'active' : ''}`}
          onClick={() => setFilter('unclear')}
        >
          ❓ Unclear
        </button>
      </div>

      {/* Observation List */}
      {!observations ? (
        <div className="loading">
          <div className="loading-spinner" />
        </div>
      ) : observations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <p className="empty-state-text">
            No observations yet. Use the capture button to add field observations.
          </p>
        </div>
      ) : (
        <>
          {observations.map(obs => (
            <div
              key={obs.id}
              className="log-entry"
              onClick={() => handleObservationClick(obs)}
            >
              <div className="log-entry-thumb">
                {obs.image?.blobId && imageUrls[obs.image.blobId] ? (
                  <img src={imageUrls[obs.image.blobId]} alt="Observation" />
                ) : (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: '100%',
                    fontSize: '24px',
                    color: 'var(--text-muted)'
                  }}>
                    📷
                  </div>
                )}
              </div>
              <div className="log-entry-info">
                <div className="log-entry-time">
                  {formatTime(obs.timestamp)}
                  <span className={`log-entry-validation ${obs.userValidation}`}>
                    {getValidationLabel(obs.userValidation)}
                  </span>
                </div>
                <div className="log-entry-location">
                  📍 {obs.location.lat.toFixed(5)}, {obs.location.lon.toFixed(5)}
                </div>
                <div className="log-entry-datasets">
                  {Object.keys(obs.datasetValues).length} layers queried
                  {obs.notes && ` • ${obs.notes.substring(0, 30)}${obs.notes.length > 30 ? '...' : ''}`}
                </div>
                <button 
                  className="go-to-location-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGoToLocation(obs.location.lat, obs.location.lon);
                  }}
                >
                  🗺️ View on Map
                </button>
              </div>
            </div>
          ))}

          {/* Export Buttons */}
          <div className="export-buttons">
            <button
              className={`export-btn sync-btn ${syncProgress.status === 'syncing' ? 'syncing' : ''}`}
              onClick={handleSync}
              disabled={syncProgress.status === 'syncing'}
            >
              {syncProgress.status === 'syncing' ? (
                <>
                  <span className="sync-spinner"></span>
                  Syncing...
                </>
              ) : syncProgress.status === 'complete' ? (
                <>✅ Synced</>
              ) : (
                <>🔄 Sync Data</>
              )}
            </button>
            <button
              className="export-btn"
              onClick={() => handleExport('geojson')}
              disabled={syncProgress.status === 'syncing'}
            >
              📥 GeoJSON
            </button>
            <button
              className="export-btn"
              onClick={() => handleExport('csv')}
              disabled={syncProgress.status === 'syncing'}
            >
              📥 CSV
            </button>
          </div>

          {/* Sync Progress */}
          {syncProgress.status !== 'idle' && (
            <div className={`sync-progress ${syncProgress.status}`}>
              <div className="sync-progress-bar">
                <div 
                  className="sync-progress-fill"
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                />
              </div>
              <div className="sync-progress-text">
                {syncProgress.message}
              </div>
            </div>
          )}
        </>
      )}

      {/* Observation Detail Modal */}
      {selectedObservation && (
        <ObservationDetailModal
          observation={selectedObservation}
          onClose={() => setSelectedObservation(null)}
          onUpdate={handleObservationUpdate}
          onDelete={handleObservationDelete}
        />
      )}
    </div>
  );
};

export default FieldLog;
