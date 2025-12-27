import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, exportToGeoJSON, exportToCSV } from '../db/database';
import { imageService } from '../services/ImageService';
import type { ValidationStatus } from '../types';

interface FieldLogProps {
  onGoToLocation: (lat: number, lon: number) => void;
}

const FieldLog: React.FC<FieldLogProps> = ({ onGoToLocation }) => {
  const [filter, setFilter] = useState<ValidationStatus | 'all'>('all');
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Live query observations
  const observations = useLiveQuery(async () => {
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

  return (
    <div className="field-log">
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
              onClick={() => onGoToLocation(obs.location.lat, obs.location.lon)}
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
              </div>
            </div>
          ))}

          {/* Export Buttons */}
          <div className="export-buttons">
            <button
              className="export-btn"
              onClick={() => handleExport('geojson')}
            >
              📥 Export GeoJSON
            </button>
            <button
              className="export-btn"
              onClick={() => handleExport('csv')}
            >
              📥 Export CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default FieldLog;
