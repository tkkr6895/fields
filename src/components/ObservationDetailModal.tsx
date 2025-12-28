import React, { useState, useEffect } from 'react';
import { locationDataService, LocationEnrichment } from '../services/LocationDataService';
import { imageService } from '../services/ImageService';
import '../styles/ObservationDetailModal.css';

// Observation interface for the modal
export interface ModalObservation {
  id?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  observation_type?: string;
  validation_status?: string;
  notes?: string;
  dataset_values?: Record<string, unknown>;
  exif_data?: {
    dateTime?: string;
    make?: string;
    model?: string;
    lat?: number;
    lon?: number;
  };
  image_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface ObservationDetailModalProps {
  observation: ModalObservation | null;
  onClose: () => void;
  onUpdate: (updated: ModalObservation) => void;
  onDelete: (id: string) => void;
}

export const ObservationDetailModal: React.FC<ObservationDetailModalProps> = ({
  observation,
  onClose,
  onUpdate,
  onDelete
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedValidation, setSelectedValidation] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [enrichment, setEnrichment] = useState<LocationEnrichment | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'data' | 'photo'>('details');

  useEffect(() => {
    if (!observation) return;
    
    setNotes(observation.notes || '');
    setSelectedValidation(observation.validation_status || 'pending');
    
    // Load image
    loadImage();
    
    // Fetch enrichment data
    fetchEnrichment();
  }, [observation]);

  const loadImage = async () => {
    if (!observation?.image_id) return;
    try {
      const blob = await imageService.getImageBlob(observation.image_id);
      if (blob) {
        setImageUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      console.error('Failed to load image:', err);
    }
  };

  const fetchEnrichment = async () => {
    if (!observation) return;
    setLoading(true);
    try {
      const data = await locationDataService.enrichLocation(
        observation.latitude,
        observation.longitude,
        navigator.onLine
      );
      setEnrichment(data);
    } catch (err) {
      console.error('Failed to enrich location:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!observation) return;
    onUpdate({
      ...observation,
      notes,
      validation_status: selectedValidation,
      updated_at: new Date().toISOString()
    });
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (!observation?.id) return;
    if (confirm('Are you sure you want to delete this observation?')) {
      onDelete(observation.id);
      onClose();
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      return value.toLocaleString('en-IN', { maximumFractionDigits: 4 });
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  if (!observation) return null;

  return (
    <div className="obs-detail-overlay" onClick={onClose}>
      <div className="obs-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="obs-detail-header">
          <div className="obs-detail-title">
            <span className="obs-type-badge">{observation.observation_type || 'Field Observation'}</span>
            <span className="obs-date">{formatDate(observation.created_at)}</span>
          </div>
          <button className="obs-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="obs-detail-tabs">
          <button 
            className={`obs-tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            📋 Details
          </button>
          <button 
            className={`obs-tab ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            📊 Data
          </button>
          <button 
            className={`obs-tab ${activeTab === 'photo' ? 'active' : ''}`}
            onClick={() => setActiveTab('photo')}
          >
            📷 Photo
          </button>
        </div>

        {/* Content */}
        <div className="obs-detail-content">
          {activeTab === 'details' && (
            <div className="obs-details-tab">
              {/* Location */}
              <div className="obs-section">
                <h4>📍 Location</h4>
                <div className="obs-field-grid">
                  <div className="obs-field">
                    <label>Latitude</label>
                    <span>{observation.latitude?.toFixed(6)}</span>
                  </div>
                  <div className="obs-field">
                    <label>Longitude</label>
                    <span>{observation.longitude?.toFixed(6)}</span>
                  </div>
                </div>
                {observation.altitude && (
                  <div className="obs-field">
                    <label>Altitude</label>
                    <span>{observation.altitude.toFixed(0)} m</span>
                  </div>
                )}
              </div>

              {/* Validation Status */}
              <div className="obs-section">
                <h4>✓ Validation</h4>
                {isEditing ? (
                  <div className="obs-validation-options">
                    {['pending', 'confirmed', 'disputed', 'needs-review'].map(status => (
                      <label key={status} className={`validation-option ${selectedValidation === status ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="validation"
                          value={status}
                          checked={selectedValidation === status}
                          onChange={e => setSelectedValidation(e.target.value)}
                        />
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </label>
                    ))}
                  </div>
                ) : (
                  <span className={`validation-badge ${observation.validation_status}`}>
                    {observation.validation_status || 'Pending'}
                  </span>
                )}
              </div>

              {/* Notes */}
              <div className="obs-section">
                <h4>📝 Notes</h4>
                {isEditing ? (
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add observation notes..."
                    rows={4}
                    className="obs-notes-input"
                  />
                ) : (
                  <p className="obs-notes">{observation.notes || 'No notes added'}</p>
                )}
              </div>

              {/* Dataset Values */}
              {observation.dataset_values && Object.keys(observation.dataset_values).length > 0 && (
                <div className="obs-section">
                  <h4>📦 Dataset Values (At Capture)</h4>
                  <div className="obs-dataset-values">
                    {Object.entries(observation.dataset_values).map(([key, value]) => (
                      <div key={key} className="obs-dataset-item">
                        <span className="dataset-key">{key}</span>
                        <span className="dataset-value">{formatValue(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'data' && (
            <div className="obs-data-tab">
              {loading ? (
                <div className="obs-loading">
                  <span className="spinner"></span>
                  <p>Fetching location data...</p>
                </div>
              ) : enrichment ? (
                <div className="obs-enrichment">
                  {/* Admin */}
                  {enrichment.admin && (
                    <div className="obs-section">
                      <h4>🏛️ Administrative</h4>
                      <div className="data-grid">
                        {enrichment.admin.state && <div className="data-row"><span>State</span><span>{enrichment.admin.state}</span></div>}
                        {enrichment.admin.district && <div className="data-row"><span>District</span><span>{enrichment.admin.district}</span></div>}
                        {enrichment.admin.tehsil && <div className="data-row"><span>Tehsil</span><span>{enrichment.admin.tehsil}</span></div>}
                        <div className="data-row source"><span>Source</span><span>{enrichment.admin.source}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Land Cover */}
                  {enrichment.landCover && (
                    <div className="obs-section">
                      <h4>🌍 Land Cover (Dynamic World)</h4>
                      <div className="land-cover-grid">
                        <div className="dominant-class">
                          <span className="lc-label">Dominant</span>
                          <span className="lc-value">{enrichment.landCover.dominantClass}</span>
                        </div>
                        <div className="lc-bars">
                          {enrichment.landCover.trees !== undefined && (
                            <div className="lc-bar-row">
                              <span>🌳 Trees</span>
                              <div className="lc-bar-bg">
                                <div className="lc-bar trees" style={{width: `${enrichment.landCover.trees}%`}}></div>
                              </div>
                              <span>{enrichment.landCover.trees.toFixed(1)}%</span>
                            </div>
                          )}
                          {enrichment.landCover.crops !== undefined && (
                            <div className="lc-bar-row">
                              <span>🌾 Crops</span>
                              <div className="lc-bar-bg">
                                <div className="lc-bar crops" style={{width: `${enrichment.landCover.crops}%`}}></div>
                              </div>
                              <span>{enrichment.landCover.crops.toFixed(1)}%</span>
                            </div>
                          )}
                          {enrichment.landCover.built !== undefined && (
                            <div className="lc-bar-row">
                              <span>🏘️ Built</span>
                              <div className="lc-bar-bg">
                                <div className="lc-bar built" style={{width: `${enrichment.landCover.built}%`}}></div>
                              </div>
                              <span>{enrichment.landCover.built.toFixed(1)}%</span>
                            </div>
                          )}
                          {enrichment.landCover.shrubAndScrub !== undefined && (
                            <div className="lc-bar-row">
                              <span>🌿 Shrub</span>
                              <div className="lc-bar-bg">
                                <div className="lc-bar shrub" style={{width: `${enrichment.landCover.shrubAndScrub}%`}}></div>
                              </div>
                              <span>{enrichment.landCover.shrubAndScrub.toFixed(1)}%</span>
                            </div>
                          )}
                          {enrichment.landCover.grass !== undefined && (
                            <div className="lc-bar-row">
                              <span>🌱 Grass</span>
                              <div className="lc-bar-bg">
                                <div className="lc-bar grass" style={{width: `${enrichment.landCover.grass}%`}}></div>
                              </div>
                              <span>{enrichment.landCover.grass.toFixed(1)}%</span>
                            </div>
                          )}
                        </div>
                        <div className="data-row source">
                          <span>Source</span>
                          <span>{enrichment.landCover.source} ({enrichment.landCover.year})</span>
                        </div>
                        {enrichment.landCover.source === 'estimated' && (
                          <p className="source-note">⚠️ Regional average - actual land cover may vary at this location</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Watershed */}
                  {enrichment.watershed && (
                    <div className="obs-section">
                      <h4>💧 Watershed (CoreStack)</h4>
                      <div className="data-grid">
                        <div className="data-row"><span>MWS ID</span><span>{enrichment.watershed.mwsId}</span></div>
                        {enrichment.watershed.indicators && Object.entries(enrichment.watershed.indicators).map(([key, val]) => (
                          <div key={key} className="data-row"><span>{key}</span><span>{formatValue(val)}</span></div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Weather */}
                  {enrichment.weather && (
                    <div className="obs-section">
                      <h4>🌤️ Current Weather</h4>
                      <div className="weather-display">
                        <div className="weather-main">
                          <span className="temp">{enrichment.weather.current.temperature}°C</span>
                          <span className="desc">{enrichment.weather.current.weatherDescription}</span>
                        </div>
                        <div className="weather-details">
                          <span>💧 {enrichment.weather.current.humidity}%</span>
                          <span>💨 {enrichment.weather.current.windSpeed} km/h</span>
                          <span>🌧️ {enrichment.weather.current.precipitation} mm</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {enrichment.errors.length > 0 && (
                    <div className="obs-errors">
                      <h4>⚠️ Data Fetch Issues</h4>
                      {enrichment.errors.map((err, i) => (
                        <p key={i} className="error-msg">{err}</p>
                      ))}
                    </div>
                  )}

                  <button className="refresh-data-btn" onClick={fetchEnrichment}>
                    🔄 Refresh Data
                  </button>
                </div>
              ) : (
                <div className="obs-no-data">
                  <p>No enrichment data available</p>
                  <button onClick={fetchEnrichment}>Fetch Data</button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'photo' && (
            <div className="obs-photo-tab">
              {imageUrl ? (
                <div className="obs-photo-container">
                  <img src={imageUrl} alt="Observation" className="obs-full-photo" />
                  {observation.exif_data && (
                    <div className="obs-exif-data">
                      <h4>📷 Photo Metadata</h4>
                      <div className="data-grid">
                        {observation.exif_data.dateTime && (
                          <div className="data-row"><span>Taken</span><span>{observation.exif_data.dateTime}</span></div>
                        )}
                        {observation.exif_data.make && (
                          <div className="data-row"><span>Camera</span><span>{observation.exif_data.make} {observation.exif_data.model}</span></div>
                        )}
                        {observation.exif_data.lat && (
                          <div className="data-row"><span>GPS (EXIF)</span><span>{observation.exif_data.lat?.toFixed(6)}, {observation.exif_data.lon?.toFixed(6)}</span></div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="obs-no-photo">
                  <span className="no-photo-icon">📷</span>
                  <p>No photo attached to this observation</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="obs-detail-actions">
          {isEditing ? (
            <>
              <button className="obs-btn cancel" onClick={() => setIsEditing(false)}>Cancel</button>
              <button className="obs-btn save" onClick={handleSave}>Save Changes</button>
            </>
          ) : (
            <>
              <button className="obs-btn delete" onClick={handleDelete}>🗑️ Delete</button>
              <button className="obs-btn edit" onClick={() => setIsEditing(true)}>✏️ Edit</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ObservationDetailModal;
