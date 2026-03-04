/**
 * CustomLayerImporter — Full import flow: file picker → parsing → preview → metadata → confirm
 * Task 1.8.9
 */

import React, { useState, useRef } from 'react';
import { customLayerManager, type ImportResult } from '../../services/CustomLayerManager';
import CSVColumnMapper from './CSVColumnMapper';
import type { CustomLayer } from '../../types';

interface CustomLayerImporterProps {
  onImported: (layer: CustomLayer) => void;
  onCancel: () => void;
}

type Step = 'pick' | 'csv-columns' | 'metadata' | 'importing' | 'done';

const ACCEPTED_EXTENSIONS = '.geojson,.json,.kml,.kmz,.csv,.tsv,.gpkg';

const CustomLayerImporter: React.FC<CustomLayerImporterProps> = ({ onImported, onCancel }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);

  // Metadata form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('custom');

  // Status
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setTitle(selectedFile.name.replace(/\.[^.]+$/, ''));
    setError(null);

    // Try an initial parse to detect if CSV needs column mapping
    try {
      if (selectedFile.name.match(/\.(csv|tsv)$/i)) {
        const headers = await customLayerManager.getCSVHeaders(selectedFile);
        // Try auto-detect
        const { detectLatLonColumns } = await import('../../services/CustomLayerManager');
        const detected = detectLatLonColumns(headers);
        if (!detected) {
          setCsvHeaders(headers);
          setStep('csv-columns');
          return;
        }
      }
      setStep('metadata');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    }
  };

  const handleCSVColumnsConfirm = (latCol: string, lonCol: string) => {
    setCsvHeaders([latCol, lonCol]); // reuse array to store chosen columns
    setStep('metadata');
  };

  const handleImport = async () => {
    if (!file) return;
    setStep('importing');
    setProgress('Parsing file...');
    setError(null);

    try {
      const options: Parameters<typeof customLayerManager.importFile>[1] = {
        title: title || file.name,
        description,
        category,
      };

      // If CSV columns were manually selected
      if (step === 'importing' && csvHeaders.length === 2 && file.name.match(/\.(csv|tsv)$/i)) {
        options.latColumn = csvHeaders[0];
        options.lonColumn = csvHeaders[1];
      }

      setProgress('Importing and validating...');
      const importResult = await customLayerManager.importFile(file, options);
      setResult(importResult);
      setWarnings(importResult.warnings);
      setStep('done');
    } catch (err) {
      if (err instanceof Error && err.message === 'COLUMN_MAPPING_NEEDED') {
        const headers = await customLayerManager.getCSVHeaders(file);
        setCsvHeaders(headers);
        setStep('csv-columns');
        return;
      }
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('metadata');
    }
  };

  const handleDone = () => {
    if (result) onImported(result.layer);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#13151a',
        borderRadius: 16,
        width: '100%',
        maxWidth: 480,
        maxHeight: '90vh',
        overflow: 'auto',
        padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 18 }}>📥 Import Layer</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Step: Pick file */}
        {step === 'pick' && (
          <div>
            <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
              Supported formats: GeoJSON, KML, CSV (with lat/lon), GeoPackage
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                padding: '32px 16px',
                background: '#1a1d23',
                border: '2px dashed #444',
                borderRadius: 12,
                color: '#ccc',
                cursor: 'pointer',
                fontSize: 15,
                textAlign: 'center',
              }}
            >
              📂 Choose File
              <br />
              <span style={{ fontSize: 12, color: '#888' }}>
                .geojson, .kml, .csv, .tsv, .gpkg (max 50 MB)
              </span>
            </button>
          </div>
        )}

        {/* Step: CSV column mapping */}
        {step === 'csv-columns' && (
          <CSVColumnMapper
            headers={csvHeaders}
            onConfirm={handleCSVColumnsConfirm}
            onCancel={onCancel}
          />
        )}

        {/* Step: Metadata form */}
        {step === 'metadata' && file && (
          <div>
            <div style={{ background: '#1a1d23', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#aaa' }}>
              <strong style={{ color: '#fff' }}>{file.name}</strong>
              <br />
              {(file.size / 1024).toFixed(1)} KB
            </div>

            <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Layer name"
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#0d0f12',
                border: '1px solid #444',
                borderRadius: 8,
                color: '#fff',
                fontSize: 14,
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />

            <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description..."
              rows={2}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#0d0f12',
                border: '1px solid #444',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                marginBottom: 12,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />

            <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#0d0f12',
                border: '1px solid #444',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              <option value="custom">Custom</option>
              <option value="boundary">Boundary</option>
              <option value="forest">Forest</option>
              <option value="lulc">Land Use / Land Cover</option>
              <option value="built">Built-up / Urban</option>
              <option value="treecover">Tree Cover</option>
              <option value="other">Other</option>
            </select>

            {error && (
              <div style={{ background: '#2d1a1a', border: '1px solid #ff6b6b', borderRadius: 8, padding: 10, marginBottom: 12, color: '#ff6b6b', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onCancel} style={{
                padding: '10px 20px', background: 'transparent', border: '1px solid #555', borderRadius: 8,
                color: '#aaa', cursor: 'pointer', fontSize: 13,
              }}>Cancel</button>
              <button onClick={handleImport} style={{
                padding: '10px 20px', background: '#3388ff', border: 'none', borderRadius: 8,
                color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>Import</button>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p style={{ color: '#aaa', fontSize: 14 }}>{progress}</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && result && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <h4 style={{ color: '#fff', margin: '0 0 4px' }}>{result.layer.title}</h4>
              <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>
                {result.layer.featureCount.toLocaleString()} features · {result.layer.geometryType}
              </p>
            </div>

            {warnings.length > 0 && (
              <div style={{ background: '#2d2a1a', border: '1px solid #ffa726', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: '#ffa726' }}>
                {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}

            <button onClick={handleDone} style={{
              width: '100%', padding: '12px', background: '#3388ff', border: 'none', borderRadius: 8,
              color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>
              Add to Map
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomLayerImporter;
