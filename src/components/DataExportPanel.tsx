/**
 * DataExportPanel.tsx
 * 
 * PHASE 1: UI for safe, copy-only export of all observation data.
 * 
 * Provides:
 * - ONE-TAP ZIP EXPORT with share options (email, GDrive, etc.)
 * - Full backup (observations + images)
 * - Quick backup (observations only)
 * - Clear progress feedback
 * - Export location information
 */

import React, { useState, useEffect } from 'react';
import { exportService, ExportProgress, ExportResult, ShareMethod } from '../services/ExportService';
import { annotationExporter } from '../services/AnnotationExporter';
import { db, dbReady } from '../db/database';
import '../styles/DataExportPanel.css';

interface DataExportPanelProps {
  onClose?: () => void;
  compact?: boolean;
}

interface DataStats {
  observations: number;
  images: number;
  loaded: boolean;
}

const DataExportPanel: React.FC<DataExportPanelProps> = ({ onClose, compact = false }) => {
  const [progress, setProgress] = useState<ExportProgress>({
    stage: 'idle',
    current: 0,
    total: 0,
    message: ''
  });
  const [lastResult, setLastResult] = useState<ExportResult | null>(null);
  const [stats, setStats] = useState<DataStats>({ observations: 0, images: 0, loaded: false });
  const isNative = Boolean(
    (globalThis as any)?.Capacitor &&
    typeof (globalThis as any).Capacitor.isNativePlatform === 'function' &&
    (globalThis as any).Capacitor.isNativePlatform()
  );

  // Load data stats on mount
  useEffect(() => {
    const loadStats = async () => {
      const ready = await dbReady;
      if (!ready) {
        setStats({ observations: 0, images: 0, loaded: true });
        return;
      }

      try {
        const obsCount = await db.observations.count();
        const imgCount = await db.images.count();
        setStats({ observations: obsCount, images: imgCount, loaded: true });
      } catch (e) {
        console.error('[DataExportPanel] Failed to load stats:', e);
        setStats({ observations: 0, images: 0, loaded: true });
      }
    };

    loadStats();
  }, [lastResult]); // Reload after export

  // Subscribe to export progress
  useEffect(() => {
    const unsubscribe = exportService.subscribe(setProgress);
    return unsubscribe;
  }, []);

  // ONE-TAP EXPORT - creates ZIP and shares
  const handleOneTapExport = async (method: ShareMethod = 'share') => {
    setLastResult(null);
    if (isNative) {
      const result = await exportService.exportAndShare(method);
      setLastResult(result);
    } else {
      // Web fallback - download ZIP directly
      const result = await exportService.exportAndDownloadWeb();
      setLastResult(result);
    }
  };

  const handleFullExport = async () => {
    setLastResult(null);
    const result = await exportService.exportAllData();
    setLastResult(result);
  };

  const handleQuickExport = async () => {
    setLastResult(null);
    const result = await exportService.exportObservationsOnly();
    setLastResult(result);
  };

  // GeoAI Export (Task 1.5.7)
  const [geoAIExporting, setGeoAIExporting] = useState(false);
  const handleGeoAIExport = async () => {
    setGeoAIExporting(true);
    setLastResult(null);
    try {
      const result = await annotationExporter.exportGeoAI({ includeImages: true, includeSTAC: true, includeCOCO: true, includeModelCard: true });
      if (result.success && result.blob) {
        downloadBlob(result.blob, result.fileName || 'fields_geoai_export.zip');
        setLastResult({ success: true, filesExported: result.recordCount, observationCount: result.recordCount, imageCount: 0, timestamp: new Date().toISOString() });
      } else {
        setLastResult({ success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: result.error || 'No data', timestamp: new Date().toISOString() });
      }
    } catch (e) {
      setLastResult({ success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() });
    }
    setGeoAIExporting(false);
  };

  const handleSTACExport = async () => {
    setGeoAIExporting(true);
    setLastResult(null);
    try {
      const result = await annotationExporter.exportSTACOnly();
      if (result.success && result.blob) {
        downloadBlob(result.blob, result.fileName || 'fields_stac_export.zip');
        setLastResult({ success: true, filesExported: result.recordCount, observationCount: result.recordCount, imageCount: 0, timestamp: new Date().toISOString() });
      } else {
        setLastResult({ success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: result.error || 'No data', timestamp: new Date().toISOString() });
      }
    } catch (e) {
      setLastResult({ success: false, filesExported: 0, observationCount: 0, imageCount: 0, error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() });
    }
    setGeoAIExporting(false);
  };

  /** Helper to trigger browser download of a Blob */
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const isExporting = progress.stage !== 'idle' && progress.stage !== 'complete' && progress.stage !== 'error';
  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  if (compact) {
    return (
      <div className="export-panel-compact">
        {!stats.loaded ? (
          <div className="export-loading">Loading...</div>
        ) : stats.observations === 0 ? (
          <div className="export-empty">No data to export</div>
        ) : (
          <>
            <div className="export-stats-compact">
              📊 {stats.observations} observations, {stats.images} images
            </div>
            {/* ONE-TAP EXPORT BUTTON */}
            <button 
              className="export-one-tap-btn"
              onClick={() => handleOneTapExport('share')}
              disabled={isExporting}
            >
              {isExporting ? '⏳ Creating ZIP...' : '📦 Export & Share ZIP'}
            </button>
            <div className="export-buttons-compact">
              <button 
                className="export-btn-compact full"
                onClick={handleFullExport}
                disabled={isExporting}
              >
                {isExporting ? '⏳' : '💾'} Full Backup
              </button>
              <button 
                className="export-btn-compact quick"
                onClick={handleQuickExport}
                disabled={isExporting}
              >
                📤 Quick
              </button>
            </div>
            {isExporting && (
              <div className="export-progress-compact">
                <div className="export-progress-bar-compact">
                  <div 
                    className="export-progress-fill-compact" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="export-progress-text-compact">{progress.message}</div>
              </div>
            )}
            {lastResult && (
              <div className={`export-result-compact ${lastResult.success ? 'success' : 'error'}`}>
                {lastResult.success ? (
                  <>✅ Exported {lastResult.observationCount} observations</>
                ) : (
                  <>❌ {lastResult.error}</>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="export-panel">
      <div className="export-panel-header">
        <h2>📦 Export Data</h2>
        {onClose && (
          <button className="export-close-btn" onClick={onClose}>×</button>
        )}
      </div>

      <div className="export-panel-content">
        {/* Data Stats */}
        <div className="export-stats-section">
          <h3>Current Data</h3>
          {!stats.loaded ? (
            <div className="export-loading">
              <div className="loading-spinner" />
              Loading database...
            </div>
          ) : (
            <div className="export-stats-grid">
              <div className="export-stat">
                <div className="export-stat-value">{stats.observations}</div>
                <div className="export-stat-label">Observations</div>
              </div>
              <div className="export-stat">
                <div className="export-stat-value">{stats.images}</div>
                <div className="export-stat-label">Images</div>
              </div>
            </div>
          )}
        </div>

        {/* ONE-TAP EXPORT - Primary Action */}
        <div className="export-one-tap-section">
          <h3>⚡ One-Tap Export</h3>
          <p className="export-one-tap-desc">
            Creates a ZIP bundle with all data (JSON, GeoJSON, CSV, images) ready to share
          </p>
          
          <button 
            className="export-one-tap-primary"
            onClick={() => handleOneTapExport('share')}
            disabled={isExporting || stats.observations === 0}
          >
            {isExporting ? (
              <>⏳ Creating ZIP...</>
            ) : (
              <>📦 Export ZIP & Share</>
            )}
          </button>

          <div className="export-share-options">
            <button 
              className="export-share-btn email"
              onClick={() => handleOneTapExport('email')}
              disabled={isExporting || stats.observations === 0}
              title="Share via Email"
            >
              ✉️ Email
            </button>
            <button 
              className="export-share-btn gdrive"
              onClick={() => handleOneTapExport('gdrive')}
              disabled={isExporting || stats.observations === 0}
              title="Share to Google Drive"
            >
              ☁️ Drive
            </button>
            <button 
              className="export-share-btn download"
              onClick={() => handleOneTapExport('download')}
              disabled={isExporting || stats.observations === 0}
              title="Save locally only"
            >
              💾 Save
            </button>
          </div>
        </div>

        {/* Export Options - Secondary */}
        <div className="export-options-section">
          <h3>Other Export Options</h3>
          
          <div className="export-option-card" onClick={!isExporting && !geoAIExporting ? handleGeoAIExport : undefined}>
            <div className="export-option-icon">🤖</div>
            <div className="export-option-info">
              <div className="export-option-title">GeoAI Export</div>
              <div className="export-option-desc">
                ML-ready ZIP: GeoJSON, CSV, STAC, COCO manifest, model card, SHA-256 checksums
              </div>
            </div>
            <button 
              className="export-option-btn"
              disabled={isExporting || geoAIExporting || stats.observations === 0}
            >
              {geoAIExporting ? '⏳' : '→'}
            </button>
          </div>

          <div className="export-option-card" onClick={!isExporting && !geoAIExporting ? handleSTACExport : undefined}>
            <div className="export-option-icon">🛰️</div>
            <div className="export-option-info">
              <div className="export-option-title">STAC Export</div>
              <div className="export-option-desc">
                SpatioTemporal Asset Catalog items (no images, lightweight)
              </div>
            </div>
            <button 
              className="export-option-btn"
              disabled={isExporting || geoAIExporting || stats.observations === 0}
            >
              {geoAIExporting ? '⏳' : '→'}
            </button>
          </div>

          <div className="export-option-card" onClick={!isExporting ? handleFullExport : undefined}>
            <div className="export-option-icon">💾</div>
            <div className="export-option-info">
              <div className="export-option-title">Full Backup (Unzipped)</div>
              <div className="export-option-desc">
                Export as separate files - JSON, GeoJSON, CSV, images
              </div>
            </div>
            <button 
              className="export-option-btn"
              disabled={isExporting || stats.observations === 0}
            >
              {isExporting ? '⏳' : '→'}
            </button>
          </div>

          <div className="export-option-card" onClick={!isExporting ? handleQuickExport : undefined}>
            <div className="export-option-icon">📤</div>
            <div className="export-option-info">
              <div className="export-option-title">Quick Export (No Images)</div>
              <div className="export-option-desc">
                Observations only - faster, smaller file size
              </div>
            </div>
            <button 
              className="export-option-btn"
              disabled={isExporting || stats.observations === 0}
            >
              {isExporting ? '⏳' : '→'}
            </button>
          </div>
        </div>

        {/* Progress Section */}
        {isExporting && (
          <div className="export-progress-section">
            <div className="export-progress-header">
              <span className="export-progress-stage">
                {progress.stage === 'preparing' && '🔧 Preparing'}
                {progress.stage === 'observations' && '📋 Observations'}
                {progress.stage === 'images' && '🖼️ Images'}
                {progress.stage === 'zipping' && '📦 Creating ZIP'}
                {progress.stage === 'finalizing' && '✨ Finalizing'}
              </span>
              {progress.total > 0 && (
                <span className="export-progress-count">
                  {progress.current} / {progress.total}
                </span>
              )}
            </div>
            <div className="export-progress-bar">
              <div 
                className="export-progress-fill" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="export-progress-message">{progress.message}</div>
          </div>
        )}

        {/* Result Section */}
        {lastResult && (
          <div className={`export-result-section ${lastResult.success ? 'success' : 'error'}`}>
            {lastResult.success ? (
              <>
                <div className="export-result-icon">✅</div>
                <div className="export-result-info">
                  <div className="export-result-title">Export Successful!</div>
                  <div className="export-result-details">
                    {lastResult.zipPath && <p>📦 ZIP: <code>{lastResult.zipPath}</code></p>}
                    {lastResult.exportPath && <p>📁 Location: <code>{lastResult.exportPath}</code></p>}
                    <p>📊 {lastResult.observationCount} observations, {lastResult.imageCount} images</p>
                    <p>📄 {lastResult.filesExported} files created</p>
                  </div>
                  {isNative && (
                    <div className="export-result-hint">
                      💡 ZIP file saved and ready to share via email, Google Drive, or other apps
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="export-result-icon">❌</div>
                <div className="export-result-info">
                  <div className="export-result-title">Export Failed</div>
                  <div className="export-result-error">{lastResult.error}</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Info Section */}
        <div className="export-info-section">
          <h3>ℹ️ About Export</h3>
          <ul>
            <li><strong>Safe:</strong> Data is COPIED, not moved or deleted</li>
            <li><strong>Complete:</strong> All observation fields, coordinates, notes, and dataset values</li>
            <li><strong>Multiple formats:</strong> JSON (complete), GeoJSON (for GIS), CSV (for Excel)</li>
            <li><strong>ZIP Bundle:</strong> One file to share via email or cloud storage</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DataExportPanel;
