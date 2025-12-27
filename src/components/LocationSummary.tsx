import React from 'react';
import type { LocationData } from '../types';

interface LocationSummaryProps {
  summary: Record<string, unknown>;
  location: LocationData | null;
  onClose: () => void;
}

const LocationSummary: React.FC<LocationSummaryProps> = ({
  summary,
  location,
  onClose
}) => {
  const layers = (summary.layers || {}) as Record<string, { title: string; values: Record<string, unknown> }>;

  return (
    <div className="location-summary">
      <div className="location-summary-header">
        <h4>
          📍 {location ? `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}` : 'Location Summary'}
        </h4>
        <button className="bottom-sheet-close" onClick={onClose} style={{ padding: 0 }}>
          ×
        </button>
      </div>

      {location && location.accuracy > 0 && (
        <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
          Accuracy: ±{Math.round(location.accuracy)}m
        </div>
      )}

      <div className="summary-grid">
        {Object.entries(layers).map(([layerId, layerData]) => {
          // Summarize the values
          const valueStr = summarizeValues(layerData.values);
          if (!valueStr) return null;

          return (
            <div key={layerId} className="summary-item">
              <div className="summary-label">{layerData.title}</div>
              <div className="summary-value">{valueStr}</div>
            </div>
          );
        })}

        {Object.keys(layers).length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#666', padding: '12px' }}>
            No data available at this location
          </div>
        )}
      </div>
    </div>
  );
};

function summarizeValues(values: Record<string, unknown>): string {
  if (!values || Object.keys(values).length === 0) return '';

  // Handle CSV summary format
  if (values._source === 'csv_summary') {
    const year = values._year;
    const count = values._recordCount;
    return year ? `Year: ${year} (${count} records)` : `${count} records`;
  }

  // Handle GeoJSON feature properties
  const entries = Object.entries(values).filter(([k]) => !k.startsWith('_'));
  if (entries.length === 0) return '';

  // Return first 2-3 meaningful values
  const meaningful = entries
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 2);

  return meaningful.map(([k, v]) => `${k}: ${v}`).join(', ');
}

export default LocationSummary;
