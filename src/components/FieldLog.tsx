import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, dbReady, exportToGeoJSON, exportToCSV } from '../db/database';
import { imageService } from '../services/ImageService';
import { syncEngine } from '../services/SyncEngine';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { ObservationDetailModal, ModalObservation } from './ObservationDetailModal';
import DataExportPanel from './DataExportPanel';
import type { ValidationStatus, Observation } from '../types';

interface FieldLogProps {
  onGoToLocation: (lat: number, lon: number) => void;
}

const FieldLog: React.FC<FieldLogProps> = ({ onGoToLocation }) => {
  const [filter, setFilter] = useState<ValidationStatus | 'all'>('all');
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [dbError, setDbError] = useState<string | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<ModalObservation | null>(null);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const syncStatus = useSyncStatus();

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

    const blob = new Blob([content], { type: mimeType });

    // Prefer native share sheet on supported mobile browsers / Capacitor webview.
    try {
      const navAny = navigator as any;
      const file = new File([blob], filename, { type: mimeType });
      if (navAny?.share && navAny?.canShare?.({ files: [file] })) {
        await navAny.share({
          title: 'WG Field Validator Export',
          text: `Exported observations (${format.toUpperCase()})`,
          files: [file]
        });
        return;
      }
    } catch (e) {
      console.warn('Share failed; falling back to download:', e);
    }

    // Download file (more reliable when the anchor is attached to DOM)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Allow the click to initiate download before revoking.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [observations]);

  // Sync via unified SyncEngine (Task 1.4.5)
  const handleSync = useCallback(async () => {
    if (!observations || observations.length === 0) {
      alert('No observations to sync');
      return;
    }
    await syncEngine.syncAll();
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
          {/* Scrollable observation list container */}
          <div className="field-log-list">
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
          </div>

          {/* Export Buttons - Fixed at bottom */}
          <div className="export-buttons">
            <button
              className={`export-btn sync-btn ${syncStatus.isRunning ? 'syncing' : ''}`}
              onClick={handleSync}
              disabled={syncStatus.isRunning}
            >
              {syncStatus.isRunning ? (
                <>
                  <span className="sync-spinner"></span>
                  Syncing...
                </>
              ) : syncStatus.lastSyncAt ? (
                <>✅ Synced</>
              ) : (
                <>🔄 Sync Data</>
              )}
            </button>
            <button
              className="export-btn"
              onClick={() => handleExport('geojson')}
              disabled={syncStatus.isRunning}
            >
              📥 GeoJSON
            </button>
            <button
              className="export-btn"
              onClick={() => handleExport('csv')}
              disabled={syncStatus.isRunning}
            >
              📥 CSV
            </button>
            <button
              className="export-btn backup-btn"
              onClick={() => setShowExportPanel(true)}
              disabled={syncStatus.isRunning}
            >
              💾 Full Backup
            </button>
          </div>

          {/* Sync Progress */}
          {syncStatus.isRunning && syncStatus.currentMessage && (
            <div className={`sync-progress syncing`}>
              <div className="sync-progress-bar">
                <div 
                  className="sync-progress-fill"
                  style={{ width: syncStatus.queueSize > 0 ? `${((syncStatus.completed + syncStatus.failed) / (syncStatus.queueSize + syncStatus.completed + syncStatus.failed)) * 100}%` : '0%' }}
                />
              </div>
              <div className="sync-progress-text">
                {syncStatus.currentMessage}
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

      {/* Full Backup Export Panel Modal */}
      {showExportPanel && (
        <div className="export-modal-overlay" onClick={() => setShowExportPanel(false)}>
          <div className="export-modal-content" onClick={(e) => e.stopPropagation()}>
            <DataExportPanel onClose={() => setShowExportPanel(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldLog;
