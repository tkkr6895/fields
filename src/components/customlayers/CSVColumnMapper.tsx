/**
 * CSVColumnMapper — UI for selecting lat/lon columns when auto-detect fails
 * Task 1.8.5
 */

import React, { useState } from 'react';

interface CSVColumnMapperProps {
  headers: string[];
  onConfirm: (latColumn: string, lonColumn: string) => void;
  onCancel: () => void;
}

const CSVColumnMapper: React.FC<CSVColumnMapperProps> = ({ headers, onConfirm, onCancel }) => {
  const [latColumn, setLatColumn] = useState('');
  const [lonColumn, setLonColumn] = useState('');

  const handleConfirm = () => {
    if (latColumn && lonColumn && latColumn !== lonColumn) {
      onConfirm(latColumn, lonColumn);
    }
  };

  const isValid = latColumn && lonColumn && latColumn !== lonColumn;

  return (
    <div style={{
      background: '#1a1d23',
      borderRadius: 12,
      padding: 20,
      margin: '12px 0',
      border: '1px solid #333',
    }}>
      <h4 style={{ margin: '0 0 8px', color: '#fff', fontSize: 15 }}>
        📍 Select Coordinate Columns
      </h4>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px' }}>
        We couldn't auto-detect latitude/longitude columns. Please select them below.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>
            Latitude Column
          </label>
          <select
            value={latColumn}
            onChange={e => setLatColumn(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#0d0f12',
              border: '1px solid #444',
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
            }}
          >
            <option value="">— Select —</option>
            {headers.map(h => (
              <option key={`lat-${h}`} value={h}>{h}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>
            Longitude Column
          </label>
          <select
            value={lonColumn}
            onChange={e => setLonColumn(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#0d0f12',
              border: '1px solid #444',
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
            }}
          >
            <option value="">— Select —</option>
            {headers.map(h => (
              <option key={`lon-${h}`} value={h}>{h}</option>
            ))}
          </select>
        </div>
      </div>

      {latColumn && lonColumn && latColumn === lonColumn && (
        <p style={{ color: '#ff6b6b', fontSize: 12, marginTop: 8 }}>
          Latitude and longitude must be different columns.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid #555',
            borderRadius: 8,
            color: '#aaa',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!isValid}
          style={{
            padding: '8px 16px',
            background: isValid ? '#3388ff' : '#333',
            border: 'none',
            borderRadius: 8,
            color: isValid ? '#fff' : '#666',
            cursor: isValid ? 'pointer' : 'not-allowed',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Confirm Columns
        </button>
      </div>
    </div>
  );
};

export default CSVColumnMapper;
