import React from 'react';
import type { LocationData } from '../types';

interface LocationSummaryEnhancedProps {
  summary: Record<string, unknown>;
  location: LocationData | null;
  placeName?: string;
  onClose: () => void;
  onViewDetails?: () => void;
}

interface LayerData {
  title: string;
  values: Record<string, unknown>;
}

const LocationSummaryEnhanced: React.FC<LocationSummaryEnhancedProps> = ({
  summary,
  location,
  onClose,
  onViewDetails
}) => {
  const layers = (summary.layers || {}) as Record<string, LayerData>;
  const placeName = summary.placeName as string | undefined;
  const dynamicWorld = summary.dynamicWorld as Record<string, unknown> | undefined;
  const admin = summary.admin as Record<string, string> | undefined;
  const indicators = summary.indicators as Record<string, unknown> | undefined;

  // Extract key metrics for the summary cards
  const keyMetrics = extractKeyMetrics(layers, dynamicWorld, indicators);

  return (
    <div className="location-summary-enhanced">
      <div className="summary-header">
        <div className="summary-location">
          <div className="location-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
          <div className="location-info">
            {placeName && <h3 className="place-name">{placeName}</h3>}
            <p className="coordinates">
              {location ? `${location.lat.toFixed(5)}°N, ${location.lon.toFixed(5)}°E` : 'Unknown location'}
            </p>
            {admin && (
              <p className="admin-info">
                {[admin.village, admin.taluk, admin.district, admin.state].filter(Boolean).join(' → ')}
              </p>
            )}
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {location && location.accuracy > 0 && (
        <div className="accuracy-badge">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
          </svg>
          ±{Math.round(location.accuracy)}m accuracy
        </div>
      )}

      {/* Key Metrics Cards */}
      {keyMetrics.length > 0 && (
        <div className="metrics-grid">
          {keyMetrics.map((metric, idx) => (
            <div key={idx} className="metric-card" style={{ borderLeftColor: metric.color }}>
              <div className="metric-icon">{metric.icon}</div>
              <div className="metric-content">
                <span className="metric-value">{metric.value}</span>
                <span className="metric-label">{metric.label}</span>
              </div>
              {metric.trend && (
                <div className={`metric-trend ${metric.trend.direction}`}>
                  {metric.trend.direction === 'up' ? '↑' : '↓'} {metric.trend.value}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dynamic World Summary */}
      {dynamicWorld && (
        <div className="dw-summary">
          <h4>
            <span className="section-icon">🌍</span>
            Dynamic World Land Cover
          </h4>
          <div className="dw-bars">
            {['trees', 'crops', 'built', 'shrub_scrub', 'grass', 'water'].map(key => {
              const value = Number(dynamicWorld[key] || 0);
              if (value < 1) return null;
              const colors: Record<string, string> = {
                trees: '#2e7d32',
                crops: '#fdd835',
                built: '#e53935',
                shrub_scrub: '#8bc34a',
                grass: '#c8e6c9',
                water: '#1e88e5'
              };
              const labels: Record<string, string> = {
                trees: 'Trees',
                crops: 'Crops',
                built: 'Built',
                shrub_scrub: 'Shrub',
                grass: 'Grass',
                water: 'Water'
              };
              return (
                <div key={key} className="dw-bar-row">
                  <span className="dw-label">{labels[key]}</span>
                  <div className="dw-bar-container">
                    <div 
                      className="dw-bar-fill" 
                      style={{ width: `${Math.min(value, 100)}%`, background: colors[key] }}
                    />
                  </div>
                  <span className="dw-value">{value.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Layer Data Sections */}
      {Object.keys(layers).length > 0 && (
        <div className="layers-data">
          <h4>
            <span className="section-icon">📊</span>
            Layer Data
          </h4>
          <div className="layers-list">
            {Object.entries(layers).slice(0, 5).map(([layerId, layerData]) => {
              const valueStr = summarizeValues(layerData.values);
              if (!valueStr) return null;
              return (
                <div key={layerId} className="layer-data-item">
                  <span className="layer-data-title">{layerData.title}</span>
                  <span className="layer-data-value">{valueStr}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CoreStack Indicators */}
      {indicators && Object.keys(indicators).length > 0 && (
        <div className="indicators-section">
          <h4>
            <span className="section-icon">💧</span>
            Watershed Indicators
          </h4>
          <div className="indicators-grid">
            {Object.entries(indicators).slice(0, 6).map(([key, value]) => (
              <div key={key} className="indicator-item">
                <span className="indicator-key">{formatIndicatorKey(key)}</span>
                <span className="indicator-value">{formatIndicatorValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="summary-actions">
        <button className="action-btn primary" onClick={onViewDetails}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
          </svg>
          View Details
        </button>
        <button className="action-btn secondary">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
          </svg>
          Share
        </button>
      </div>
    </div>
  );
};

// Extract key metrics for display cards
function extractKeyMetrics(
  _layers: Record<string, LayerData>, 
  dynamicWorld?: Record<string, unknown>,
  indicators?: Record<string, unknown>
): Array<{
  icon: string;
  label: string;
  value: string;
  color: string;
  trend?: { direction: 'up' | 'down'; value: string };
}> {
  const metrics: Array<{
    icon: string;
    label: string;
    value: string;
    color: string;
    trend?: { direction: 'up' | 'down'; value: string };
  }> = [];

  // Tree cover from Dynamic World
  if (dynamicWorld?.trees) {
    metrics.push({
      icon: '🌳',
      label: 'Tree Cover',
      value: `${Number(dynamicWorld.trees).toFixed(1)}%`,
      color: '#2e7d32'
    });
  }

  // Built area
  if (dynamicWorld?.built) {
    metrics.push({
      icon: '🏘️',
      label: 'Built Area',
      value: `${Number(dynamicWorld.built).toFixed(1)}%`,
      color: '#e53935'
    });
  }

  // Cropland
  if (dynamicWorld?.crops) {
    metrics.push({
      icon: '🌾',
      label: 'Cropland',
      value: `${Number(dynamicWorld.crops).toFixed(1)}%`,
      color: '#fdd835'
    });
  }

  // Water balance from indicators
  if (indicators?.water_balance) {
    metrics.push({
      icon: '💧',
      label: 'Water Balance',
      value: String(indicators.water_balance),
      color: '#1e88e5'
    });
  }

  return metrics.slice(0, 4);
}

function summarizeValues(values: Record<string, unknown>): string {
  if (!values || Object.keys(values).length === 0) return '';

  if (values._source === 'csv_summary') {
    const year = values._year;
    const count = values._recordCount;
    return year ? `Year: ${year} (${count} records)` : `${count} records`;
  }

  const entries = Object.entries(values).filter(([k]) => !k.startsWith('_'));
  if (entries.length === 0) return '';

  const meaningful = entries
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 2);

  return meaningful.map(([k, v]) => `${formatKey(k)}: ${v}`).join(', ');
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatIndicatorKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatIndicatorValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  return String(value);
}

export default LocationSummaryEnhanced;
