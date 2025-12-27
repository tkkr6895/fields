import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { imageService } from '../services/ImageService';
import { GeoLocationService } from '../services/GeoLocationService';
import type { LocationData, Observation, ValidationStatus, DatasetValues, ImageData } from '../types';

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

  // Get current location if not provided
  useEffect(() => {
    if (!location) {
      setGettingLocation(true);
      const geoService = new GeoLocationService();
      geoService.getCurrentPosition()
        .then(loc => setLocation(loc))
        .catch(console.error)
        .finally(() => setGettingLocation(false));
    }
  }, [location]);

  // Fetch dataset values when location changes
  useEffect(() => {
    if (location) {
      getDatasetValues(location.lat, location.lon)
        .then(setDatasetValues)
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
        setImageData(data);
        
        // Use image GPS if available
        if (data.exif.lat && data.exif.lon) {
          setLocation({
            lat: data.exif.lat,
            lon: data.exif.lon,
            accuracy: 0,
            timestamp: Date.now()
          });
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
        setImageData(data);
        
        // Use image GPS if available
        if (data.exif.lat && data.exif.lon) {
          setLocation({
            lat: data.exif.lat,
            lon: data.exif.lon,
            accuracy: 0,
            timestamp: Date.now()
          });
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
  const handleSubmit = useCallback(() => {
    if (!validation || !location) return;

    const observation: Observation = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      location: location,
      context: {
        region: 'Western Ghats',
        areaMode: 'point'
      },
      datasetValues: datasetValues,
      image: imageData || undefined,
      userValidation: validation,
      notes: notes,
      synced: false
    };

    onCapture(observation);
  }, [validation, location, datasetValues, imageData, notes, onCapture]);

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
            <div className="dataset-value-row">
              <span className="dataset-value-layer">Coordinates</span>
              <span className="dataset-value-data">
                {location.lat.toFixed(6)}, {location.lon.toFixed(6)}
                {location.accuracy > 0 && ` (±${Math.round(location.accuracy)}m)`}
              </span>
            </div>
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
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>
              No active layers or data at this location
            </div>
          )}
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
