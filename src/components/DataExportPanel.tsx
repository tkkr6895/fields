/**
 * DataExportPanel.tsx
 * 
 * PHASE 1: UI for safe, copy-only export of all observation data.
 * 
 * Provides:
 * - Full backup (observations + images)
 * - Quick backup (observations only)
 * - Clear progress feedback
 * - Export location information
 */

import React, { useState, useEffect } from 'react';
import { exportService, ExportProgress, ExportResult } from '../services/ExportService';
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
            <div className="export-buttons-compact">
              <button 
                className="export-btn-compact full"
                onClick={handleFullExport}
                disabled={isExporting}
              >
                {isExporting ? '⏳ Exporting...' : '💾 Full Backup'}
              </button>
              <button 
                className="export-btn-compact quick"
                onClick={handleQuickExport}
                disabled={isExporting}
              >
                📤 Quick Export
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
                  <>✅ Exported {lastResult.observationCount} observations to {lastResult.exportPath}</>
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

        {/* Export Options */}
        <div className="export-options-section">
          <h3>Export Options</h3>
          
          <div className="export-option-card" onClick={!isExporting ? handleFullExport : undefined}>
            <div className="export-option-icon">💾</div>
            <div className="export-option-info">
              <div className="export-option-title">Full Backup</div>
              <div className="export-option-desc">
                Export all observations + images as JSON, GeoJSON, CSV
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
                Export observations only - faster, smaller file size
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
                    <p>📁 Location: <code>{lastResult.exportPath}</code></p>
                    <p>📊 {lastResult.observationCount} observations, {lastResult.imageCount} images</p>
                    <p>📄 {lastResult.filesExported} files created</p>
                  </div>
                  <div className="export-result-hint">
                    💡 Find the files in your device's file manager under:<br/>
                    <strong>Android/data/org.westernghats.fieldvalidator/files/Documents/</strong>
                  </div>
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
            <li><strong>Location:</strong> Saved to app's external Documents folder</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DataExportPanel;
