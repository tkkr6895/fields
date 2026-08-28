import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import { db, dbReady, deleteTrack } from '../db/database';
import { exportService } from '../services/ExportService';
import { formatDistance, formatDuration } from '../services/TrackExport';
import { imageService } from '../services/ImageService';
import { ObservationDetailModal, ModalObservation } from './ObservationDetailModal';
import DataExportPanel from './DataExportPanel';
import type { ValidationStatus, Observation } from '../types';

interface FieldLogProps {
  onGoToLocation: (lat: number, lon: number) => void;
}

const FieldLog: React.FC<FieldLogProps> = ({ onGoToLocation }) => {
  const [section, setSection] = useState<'all' | 'notes' | 'tracks'>('all');
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [dbError, setDbError] = useState<string | null>(null);
  const [selectedObservation, setSelectedObservation] = useState<ModalObservation | null>(null);
  const [showExportPanel, setShowExportPanel] = useState(false);

  const tracks = useLiveQuery(async () => {
    const ready = await dbReady;
    if (!ready) return [];
    return await db.tracks.orderBy('startedAt').reverse().toArray();
  }, []) ?? [];

  const observations = useLiveQuery(async () => {
    const ready = await dbReady;
    if (!ready) return [];
    return await db.observations.orderBy('timestamp').reverse().limit(80).toArray();
  }, []) ?? [];

  useEffect(() => {
    dbReady.then((ready) => {
      if (!ready) setDbError('Database unavailable. Try clearing site data.');
    });
  }, []);

  useEffect(() => {
    observations.forEach(async (obs) => {
      if (obs.image?.blobId && !imageUrls[obs.image.blobId]) {
        const url = obs.image.thumbnail || await imageService.getImageUrl(obs.image.blobId);
        if (url) setImageUrls(prev => ({ ...prev, [obs.image!.blobId]: url }));
      }
    });
  }, [observations, imageUrls]);

  const handleShare = useCallback(async () => {
    setSharing(true);
    setShareMsg(null);
    try {
      const result = Capacitor.isNativePlatform()
        ? await exportService.exportAndShare('share')
        : await exportService.exportAndDownloadWeb();
      setShareMsg(result.success
        ? `Pack ready — GPX, field.geojson, CSV, photos.`
        : (result.error || 'Share failed'));
    } catch (e) {
      setShareMsg(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setSharing(false);
    }
  }, []);

  const formatTime = (timestamp: string) => new Date(timestamp).toLocaleString('en-IN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const toModalObservation = (obs: Observation): ModalObservation => ({
    id: obs.id,
    latitude: obs.location.lat,
    longitude: obs.location.lon,
    altitude: obs.location.altitude,
    observation_type: obs.observationType || 'Field note',
    validation_status: obs.userValidation,
    notes: obs.notes,
    dataset_values: obs.datasetValues,
    exif_data: obs.image?.exif ? {
      dateTime: obs.image.exif.dateTime,
      make: obs.image.exif.make,
      model: obs.image.exif.model,
      lat: obs.image.exif.lat,
      lon: obs.image.exif.lon,
    } : undefined,
    image_id: obs.image?.blobId,
    created_at: obs.timestamp,
    updated_at: obs.timestamp,
  });

  const showTracks = section !== 'notes';
  const showNotes = section !== 'tracks';
  const empty = tracks.length === 0 && observations.length === 0;

  return (
    <div className="field-log">
      {dbError && <div className="db-error-banner">{dbError}</div>}

      <div className="field-log-filters">
        {(['all', 'tracks', 'notes'] as const).map((id) => (
          <button key={id} className={`filter-chip ${section === id ? 'active' : ''}`} onClick={() => setSection(id)}>
            {id === 'all' ? 'All' : id === 'tracks' ? 'Tracks' : 'Notes'}
          </button>
        ))}
      </div>

      <div className="export-buttons">
        <button className="export-btn backup-btn" onClick={handleShare} disabled={sharing || empty}>
          {sharing ? 'Preparing…' : 'Share pack'}
        </button>
        <button className="export-btn" onClick={() => setShowExportPanel(true)}>More formats</button>
      </div>
      {shareMsg && <p className="overlay-note" style={{ padding: '0 12px' }}>{shareMsg}</p>}

      {empty && (
        <div className="empty-state">
          <p className="empty-state-text">Start a track or drop a note. Everything stays on this phone until you share.</p>
        </div>
      )}

      <div className="field-log-list">
        {showTracks && tracks.map((track) => {
          const end = track.endedAt ? new Date(track.endedAt).getTime() : Date.now();
          const dur = end - new Date(track.startedAt).getTime();
          const start = track.points[0];
          return (
            <div key={track.id} className="log-entry log-entry--track">
              <div className="log-entry-info">
                <div className="log-entry-time">
                  {track.name}
                  <span className={`log-entry-validation ${track.status === 'finished' ? 'match' : 'unclear'}`}>
                    {track.status === 'finished' ? 'Saved' : track.status}
                  </span>
                </div>
                <div className="log-entry-location">
                  {formatDistance(track.distanceM)} · {formatDuration(dur)} · {track.points.length} GPS fixes
                </div>
                <div className="log-entry-datasets">{formatTime(track.startedAt)} · {track.observationIds.length} notes on trail</div>
                {start && (
                  <button className="go-to-location-btn" onClick={() => onGoToLocation(start.lat, start.lon)}>
                    View on map
                  </button>
                )}
                {track.status === 'finished' && (
                  <button className="go-to-location-btn" onClick={async () => {
                    if (window.confirm('Delete this track from the phone? Notes stay.')) {
                      await deleteTrack(track.id);
                    }
                  }}>Delete track</button>
                )}
              </div>
            </div>
          );
        })}

        {showNotes && (observations || []).map((obs) => (
          <div key={obs.id} className="log-entry" onClick={() => setSelectedObservation(toModalObservation(obs))}>
            <div className="log-entry-thumb">
              {obs.image?.blobId && imageUrls[obs.image.blobId] ? (
                <img src={imageUrls[obs.image.blobId]} alt="" />
              ) : (
                <div className="log-entry-thumb-empty">{obs.tags?.[0] || '·'}</div>
              )}
            </div>
            <div className="log-entry-info">
              <div className="log-entry-time">
                {obs.fieldData?.dominantSpecies || obs.tags?.join(' · ') || obs.observationType || 'Note'}
                <span className={`log-entry-validation ${obs.userValidation}`}>
                  ±{Math.round(obs.location.accuracy || 0)} m
                </span>
              </div>
              <div className="log-entry-location">
                {obs.location.lat.toFixed(5)}, {obs.location.lon.toFixed(5)}
              </div>
              <div className="log-entry-datasets">
                {formatTime(obs.timestamp)}
                {obs.notes ? ` · ${obs.notes.substring(0, 40)}${obs.notes.length > 40 ? '…' : ''}` : ''}
              </div>
              <button
                className="go-to-location-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onGoToLocation(obs.location.lat, obs.location.lon);
                }}
              >
                View on map
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedObservation && (
        <ObservationDetailModal
          observation={selectedObservation}
          onClose={() => setSelectedObservation(null)}
          onUpdate={async (updated) => {
            if (!updated.id) return;
            await db.observations.update(updated.id, {
              notes: updated.notes,
              userValidation: updated.validation_status as ValidationStatus,
            });
            setSelectedObservation(null);
          }}
          onDelete={async (id) => {
            await db.observations.delete(id);
            setSelectedObservation(null);
          }}
        />
      )}

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
