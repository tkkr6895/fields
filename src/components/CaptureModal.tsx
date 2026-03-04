import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { imageService } from '../services/ImageService';
import { GeoLocationService } from '../services/GeoLocationService';
import { locationDataService, LocationEnrichment } from '../services/LocationDataService';
import { syncEngine } from '../services/SyncEngine';
import { deriveSeason } from '../services/SeasonService';
import { getDeviceId, getUserName } from '../services/DeviceService';
import type { LocationData, Observation, ValidationStatus, DatasetValues, ImageData, ObservationType } from '../types';

interface CaptureModalProps {
  currentLocation: LocationData | null;
  getDatasetValues: (lat: number, lon: number) => Promise<DatasetValues>;
  onCapture: (observation: Observation) => void;
  onClose: () => void;
}

const CaptureModal: React.FC<CaptureModalProps> = ({
  currentLocation,
  getDatasetValues,
  onCapture,
  onClose
}) => {
  const [location, setLocation] = useState<LocationData | null>(currentLocation);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [datasetValues, setDatasetValues] = useState<DatasetValues>({});
  const [validation, setValidation] = useState<ValidationStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationSource, setLocationSource] = useState<'gps' | 'exif' | 'device' | null>(null);
  const [adminData, setAdminData] = useState<LocationEnrichment['admin'] | null>(null);

  // v2 fields (Tasks 1.7.1–1.7.5)
  const [observationType, setObservationType] = useState<ObservationType>('land_cover');
  const [confidence, setConfidence] = useState<number>(3);
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // Get current location if not provided
  useEffect(() => {
    if (!location) {
      setGettingLocation(true);
      setLocationSource(null);
      const geoService = new GeoLocationService();
      geoService.getCurrentPosition()
        .then(loc => {
          setLocation(loc);
          setLocationSource('device');
        })
        .catch(console.error)
        .finally(() => setGettingLocation(false));
    } else if (!locationSource) {
      setLocationSource('gps');
    }
  }, [location, locationSource]);

  // Fetch dataset values and admin data when location changes
  useEffect(() => {
    if (location) {
      // Fetch dataset values
      getDatasetValues(location.lat, location.lon)
        .then(setDatasetValues)
        .catch(console.error);
      
      // Fetch admin data from authentic sources
      locationDataService.enrichLocation(location.lat, location.lon, navigator.onLine)
        .then(enrichment => {
          if (enrichment.admin) {
            setAdminData(enrichment.admin);
          }
        })
        .catch(console.error);
    }
  }, [location, getDatasetValues]);

  // Handle image capture
  const handleCapture = useCallback(async () => {
    setLoading(true);
    try {
      const file = await imageService.captureFromCamera();
      if (file) {
        const data = await imageService.processImage(file);
        console.log('[CaptureModal] Image EXIF data:', data.exif);
        setImageData(data);
        
        // Use image GPS if available
        if (data.exif.lat && data.exif.lon) {
          console.log('[CaptureModal] Using EXIF location:', data.exif.lat, data.exif.lon);
          setLocation({
            lat: data.exif.lat,
            lon: data.exif.lon,
            accuracy: 0,
            timestamp: Date.now()
          });
          setLocationSource('exif');
        }
        
        // Generate preview
        if (data.thumbnail) {
          setImagePreview(data.thumbnail);
        } else {
          const url = await imageService.getImageUrl(data.blobId);
          setImagePreview(url);
        }
      }
    } catch (err) {
      console.error('Capture failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle image from gallery
  const handleGallery = useCallback(async () => {
    setLoading(true);
    try {
      const file = await imageService.selectFromGallery();
      if (file) {
        const data = await imageService.processImage(file);
        console.log('[CaptureModal] Gallery image EXIF data:', data.exif);
        setImageData(data);
        
        // Use image GPS if available
        if (data.exif.lat && data.exif.lon) {
          console.log('[CaptureModal] Using EXIF location from gallery image:', data.exif.lat, data.exif.lon);
          setLocation({
            lat: data.exif.lat,
            lon: data.exif.lon,
            accuracy: 0,
            timestamp: Date.now()
          });
          setLocationSource('exif');
        } else {
          console.log('[CaptureModal] No GPS data in image, using current location');
        }
        
        // Generate preview
        if (data.thumbnail) {
          setImagePreview(data.thumbnail);
        } else {
          const url = await imageService.getImageUrl(data.blobId);
          setImagePreview(url);
        }
      }
    } catch (err) {
      console.error('Gallery selection failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Submit observation
  const handleSubmit = useCallback(async () => {
    if (!validation || !location) return;

    // Build region string from authentic admin data
    let regionString = 'Unknown Location';
    if (adminData) {
      const parts: string[] = [];
      if (adminData.district) parts.push(adminData.district);
      if (adminData.state) parts.push(adminData.state);
      regionString = parts.length > 0 ? parts.join(', ') : 'Western Ghats';
    }

    const now = new Date().toISOString();
    const deviceId = getDeviceId();
    const userId = getUserName() || deviceId;

    const observation: Observation = {
      id: uuidv4(),
      timestamp: now,
      location: location,
      context: {
        region: regionString,
        areaMode: 'point',
        adminData: adminData ? {
          state: adminData.state,
          district: adminData.district,
          tehsil: adminData.tehsil,
          block: adminData.block,
          source: adminData.source,
          confidence: adminData.confidence
        } : undefined
      },
      datasetValues: datasetValues,
      image: imageData || undefined,
      userValidation: validation,
      notes: notes,
      // v2 fields (Tasks 1.7.1–1.7.6)
      observationType,
      confidence,
      tags: tags.length > 0 ? tags : undefined,
      season: deriveSeason(now),
      userId,
      deviceId,
      synced: false,
      syncStatus: 'pending',
    };

    onCapture(observation);

    // Enqueue for background enrichment (Task 1.7.6)
    try {
      await syncEngine.enqueue(observation.id);
    } catch (e) {
      console.warn('[CaptureModal] Failed to enqueue for sync:', e);
    }
  }, [validation, location, datasetValues, imageData, notes, onCapture, adminData, observationType, confidence, tags]);

  return (
    <div className="capture-modal">
      <div className="capture-modal-header">
        <h3>📷 Capture Observation</h3>
        <button className="bottom-sheet-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="capture-modal-content">
        {/* Photo Preview */}
        <div 
          className="photo-preview"
          onClick={imagePreview ? undefined : handleCapture}
        >
          {loading ? (
            <div className="loading">
              <div className="loading-spinner" />
            </div>
          ) : imagePreview ? (
            <img src={imagePreview} alt="Captured" />
          ) : (
            <div className="photo-preview-placeholder">
              <span>📷</span>
              <p>Tap to capture photo</p>
            </div>
          )}
        </div>

        {/* Photo Actions */}
        {!imagePreview && !loading && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button 
              onClick={handleCapture}
              style={{
                flex: 1,
                padding: '10px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              📷 Camera
            </button>
            <button 
              onClick={handleGallery}
              style={{
                flex: 1,
                padding: '10px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
            >
              🖼️ Gallery
            </button>
          </div>
        )}

        {/* Location Info */}
        <div style={{ marginBottom: '16px' }}>
          <div className="dataset-values-title">Location</div>
          {gettingLocation ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Getting location...
            </div>
          ) : location ? (
            <>
              <div className="dataset-value-row">
                <span className="dataset-value-layer">Coordinates</span>
                <span className="dataset-value-data">
                  {location.lat.toFixed(6)}, {location.lon.toFixed(6)}
                  {location.accuracy > 0 && ` (±${Math.round(location.accuracy)}m)`}
                </span>
              </div>
              <div className="dataset-value-row" style={{ marginTop: '4px' }}>
                <span className="dataset-value-layer">Source</span>
                <span className="dataset-value-data" style={{ 
                  color: locationSource === 'exif' ? 'var(--success)' : 'var(--text-secondary)'
                }}>
                  {locationSource === 'exif' ? '📷 From Photo EXIF' : 
                   locationSource === 'device' ? '📍 Device GPS' : 
                   '🗺️ Map Location'}
                </span>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--error)', fontSize: '13px' }}>
              Location unavailable
            </div>
          )}
        </div>

        {/* Dataset Values */}
        <div className="dataset-values">
          <div className="dataset-values-title">Dataset Values at Location</div>
          {Object.keys(datasetValues).length > 0 ? (
            Object.entries(datasetValues).map(([layerId, values]) => (
              <div key={layerId} className="dataset-value-row">
                <span className="dataset-value-layer">{layerId}</span>
                <span className="dataset-value-data">
                  {summarizeValues(values)}
                </span>
              </div>
            ))
          ) : (
            <div style={{ 
              color: 'var(--text-muted)', 
              fontSize: '13px', 
              padding: '12px',
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <p style={{ margin: '0 0 8px 0' }}>📊 No dataset layers active</p>
              <p style={{ margin: 0, fontSize: '11px', opacity: 0.8 }}>
                Activate layers from the Layers tab to see values at this location
              </p>
            </div>
          )}
        </div>

        {/* Observation Type (Task 1.7.1) */}
        <div style={{ marginBottom: '16px' }}>
          <div className="dataset-values-title">Observation Type</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {([
              ['land_cover', '🌿 Land Cover'],
              ['species_sighting', '🦎 Species'],
              ['water_body', '💧 Water Body'],
              ['restoration_site', '🌱 Restoration'],
              ['general', '📋 General'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setObservationType(val)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '16px',
                  border: observationType === val ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: observationType === val ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: observationType === val ? 'white' : 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Confidence Slider (Task 1.7.2) */}
        <div style={{ marginBottom: '16px' }}>
          <div className="dataset-values-title">
            Confidence: {confidence}/5
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={confidence}
            onChange={e => setConfidence(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
            <span>Low</span><span>Medium</span><span>High</span>
          </div>
        </div>

        {/* Tags Input (Task 1.7.3) */}
        <div style={{ marginBottom: '16px' }}>
          <div className="dataset-values-title">Tags</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: tags.length > 0 ? '6px' : 0 }}>
            {tags.map((tag, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', padding: '4px 10px',
                background: 'var(--bg-tertiary)', borderRadius: '12px', fontSize: '12px',
                color: 'var(--text-secondary)', border: '1px solid var(--border)'
              }}>
                {tag}
                <span
                  onClick={() => setTags(tags.filter((_, idx) => idx !== i))}
                  style={{ marginLeft: '6px', cursor: 'pointer', color: 'var(--error)' }}
                >×</span>
              </span>
            ))}
          </div>
          <input
            type="text"
            placeholder="Type and press Enter to add tag..."
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const t = tagsInput.trim().replace(/,$/,'');
                if (t && !tags.includes(t)) setTags([...tags, t]);
                setTagsInput('');
              }
            }}
            style={{
              width: '100%', padding: '8px 12px', background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)', borderRadius: '8px',
              color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Validation Buttons */}
        <div className="dataset-values-title" style={{ marginTop: '16px', marginBottom: '8px' }}>
          Validation
        </div>
        <div className="validation-buttons">
          <button
            className={`validation-btn match ${validation === 'match' ? 'selected' : ''}`}
            onClick={() => setValidation('match')}
          >
            <span>✅</span>
            Match
          </button>
          <button
            className={`validation-btn mismatch ${validation === 'mismatch' ? 'selected' : ''}`}
            onClick={() => setValidation('mismatch')}
          >
            <span>⚠️</span>
            Mismatch
          </button>
          <button
            className={`validation-btn unclear ${validation === 'unclear' ? 'selected' : ''}`}
            onClick={() => setValidation('unclear')}
          >
            <span>❓</span>
            Unclear
          </button>
        </div>

        {/* Notes */}
        <div className="notes-section">
          <div 
            className="notes-toggle"
            onClick={() => setShowNotes(!showNotes)}
          >
            📝 {showNotes ? 'Hide notes' : 'Add notes (optional)'}
          </div>
          {showNotes && (
            <textarea
              className="notes-input"
              placeholder="Add observation notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </div>

        {/* Submit */}
        <button
          className="submit-btn"
          disabled={!validation || !location}
          onClick={handleSubmit}
        >
          Save Observation
        </button>
      </div>
    </div>
  );
};

function summarizeValues(values: Record<string, unknown>): string {
  if (!values || Object.keys(values).length === 0) return 'No data';

  if (values._source === 'csv_summary') {
    const year = values._year;
    const count = values._recordCount;
    return year ? `${year} (${count} records)` : `${count} records`;
  }

  const entries = Object.entries(values).filter(([k]) => !k.startsWith('_'));
  if (entries.length === 0) return 'No data';

  return entries.slice(0, 2).map(([, v]) => String(v)).join(', ');
}

export default CaptureModal;
