import React, { useState, useEffect } from 'react';
import { dynamicWorldService } from '../services/DynamicWorldService';
import { db } from '../db/database';
import {
  getDeviceId,
  getUserName,
  setUserName,
  getUserAffiliation,
  setUserAffiliation,
  isFirstLaunchCompleted,
  completeFirstLaunch,
} from '../services/DeviceService';

// Injected by Vite at build time via define config
declare const __APP_VERSION__: string;

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const [dwStatus, setDwStatus] = useState<{ mode: string; message: string; coverage?: string }>({ mode: 'loading', message: 'Checking...' });

  // User Identity (Task 1.9.2)
  const [displayName, setDisplayName] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [identitySaved, setIdentitySaved] = useState(false);
  const [showFirstLaunch, setShowFirstLaunch] = useState(false);
  const deviceId = getDeviceId();

  // Storage stats (Task 1.10.1)
  const [storageStats, setStorageStats] = useState<{
    observations: number;
    images: number;
    customLayers: number;
    species: number;
    estimatedSizeMB: string;
  } | null>(null);

  // Data management (Task 1.10.2)
  const [clearingData, setClearingData] = useState(false);

  // Map preferences (Task 1.10.4)
  const [defaultBasemap, setDefaultBasemap] = useState<string>(
    localStorage.getItem('fields_default_basemap') || 'dark'
  );
  const [defaultCenterStr, setDefaultCenterStr] = useState(
    localStorage.getItem('fields_default_center') || '75.5, 13.0'
  );
  const [defaultZoom, setDefaultZoom] = useState(
    parseInt(localStorage.getItem('fields_default_zoom') || '8')
  );
  const [mapPrefsSaved, setMapPrefsSaved] = useState(false);

  useEffect(() => {
    // Check DW status
    const checkDwStatus = async () => {
      await dynamicWorldService.loadOfflineData();
      setDwStatus(dynamicWorldService.getDataSourceStatus());
    };
    checkDwStatus();

    // Load user identity
    setDisplayName(getUserName() || '');
    setAffiliation(getUserAffiliation() || '');

    // Show first-launch prompt if not completed
    if (!isFirstLaunchCompleted()) {
      setShowFirstLaunch(true);
    }

    // Load storage stats (Task 1.10.1)
    const loadStorageStats = async () => {
      try {
        const obsCount = await db.observations.count();
        const imgCount = await db.images.count();
        const clCount = await db.customLayers.count();
        const spCount = await db.species.count();
        // Estimate storage from navigator
        let estimatedSizeMB = '—';
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          if (est.usage) {
            estimatedSizeMB = (est.usage / (1024 * 1024)).toFixed(1);
          }
        }
        setStorageStats({ observations: obsCount, images: imgCount, customLayers: clCount, species: spCount, estimatedSizeMB });
      } catch (err) {
        console.error('Failed to load storage stats:', err);
      }
    };
    loadStorageStats();
  }, []);

  const handleSaveIdentity = () => {
    if (displayName.trim()) setUserName(displayName.trim());
    if (affiliation.trim()) setUserAffiliation(affiliation.trim());
    setIdentitySaved(true);
    setTimeout(() => setIdentitySaved(false), 2000);
    // Mark first launch complete
    if (showFirstLaunch) {
      completeFirstLaunch();
      setShowFirstLaunch(false);
    }
  };

  // Clear all data (Task 1.10.2)
  const handleClearAllData = async () => {
    if (!confirm('⚠️ This will permanently delete ALL observations, images, custom layers, and cached data. This cannot be undone.\n\nContinue?')) {
      return;
    }
    setClearingData(true);
    try {
      await db.observations.clear();
      await db.images.clear();
      await db.customLayers.clear();
      await db.syncQueue.clear();
      await db.exportLog.clear();
      await db.datasets.clear();
      // Refresh storage stats
      setStorageStats({ observations: 0, images: 0, customLayers: 0, species: storageStats?.species || 0, estimatedSizeMB: '—' });
      alert('All data cleared successfully.');
    } catch (err) {
      console.error('Failed to clear data:', err);
      alert('Error clearing data. See console for details.');
    } finally {
      setClearingData(false);
    }
  };

  // Import backup (Task 1.10.3)
  const handleImportBackup = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        // Look for observations.json
        const obsFile = zip.file('observations.json') || zip.file('geojson/observations.geojson');
        if (obsFile) {
          const text = await obsFile.async('text');
          const data = JSON.parse(text);
          const observations = data.type === 'FeatureCollection'
            ? data.features.map((f: any) => f.properties)
            : Array.isArray(data) ? data : [data];
          let count = 0;
          for (const obs of observations) {
            if (obs.id && obs.timestamp) {
              await db.observations.put(obs);
              count++;
            }
          }
          alert(`Imported ${count} observations from backup.`);
        } else {
          alert('No observations found in ZIP file. Expected observations.json or observations.geojson.');
        }
      } catch (err) {
        console.error('Import failed:', err);
        alert('Failed to import backup. See console for details.');
      }
    };
    input.click();
  };

  // Save map preferences (Task 1.10.4)
  const handleSaveMapPrefs = () => {
    localStorage.setItem('fields_default_basemap', defaultBasemap);
    localStorage.setItem('fields_default_center', defaultCenterStr);
    localStorage.setItem('fields_default_zoom', String(defaultZoom));
    setMapPrefsSaved(true);
    setTimeout(() => setMapPrefsSaved(false), 2000);
  };

  // First-launch overlay prompt
  if (showFirstLaunch) {
    return (
      <div className="settings-panel-overlay">
        <div className="settings-panel" style={{ maxWidth: 420 }}>
          <div className="settings-header">
            <h2>👋 Welcome to Fields</h2>
          </div>
          <div className="settings-content">
            <div className="settings-section">
              <p className="settings-description" style={{ marginTop: 0 }}>
                Help us identify your observations. This info is stored only on your device.
              </p>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>
                Display Name *
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name or alias"
                className="settings-input"
                style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
              />
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>
                Affiliation (optional)
              </label>
              <input
                type="text"
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                placeholder="Organisation, university, community..."
                className="settings-input"
                style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
              />
              <p style={{ color: '#666', fontSize: 11, margin: '0 0 16px' }}>
                Device ID: <code style={{ fontSize: 10 }}>{deviceId.slice(0, 8)}…</code>
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { completeFirstLaunch(); setShowFirstLaunch(false); }}
                  className="settings-btn"
                >
                  Skip
                </button>
                <button
                  onClick={handleSaveIdentity}
                  className="settings-btn primary"
                  disabled={!displayName.trim()}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-panel-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>⚙️ Settings</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          {/* User Identity (Task 1.9.2) */}
          <div className="settings-section">
            <h3>👤 Observer Identity</h3>
            <p className="settings-description">
              Stored locally on your device. Used to sign observations.
            </p>
            <div className="settings-input-group" style={{ flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="settings-input"
              />
              <input
                type="text"
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                placeholder="Affiliation (optional)"
                className="settings-input"
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={handleSaveIdentity} className="settings-btn primary">
                  Save
                </button>
                {identitySaved && <span className="settings-saved">✓ Saved</span>}
              </div>
            </div>
            <div className="settings-status" style={{ marginTop: 8 }}>
              <span className="status-dot active"></span>
              Device ID: <code style={{ fontSize: 10 }}>{deviceId.slice(0, 8)}…</code>
            </div>
          </div>

          {/* Dynamic World Status */}
          <div className="settings-section">
            <h3>🗺️ Dynamic World Land Cover</h3>
            <p className="settings-description">
              Point-specific land cover data from Google Earth Engine.
            </p>
            <div className="settings-status-box">
              <div className="status-row">
                <span className="status-label">Mode:</span>
                <span className={`status-value ${dwStatus.mode}`}>
                  {dwStatus.mode === 'live' && '🟢 Live (GEE Proxy)'}
                  {dwStatus.mode === 'offline' && '🟡 Offline Grid'}
                  {dwStatus.mode === 'unavailable' && '🔴 Not Available'}
                  {dwStatus.mode === 'loading' && '⏳ Loading...'}
                </span>
              </div>
              <div className="status-row">
                <span className="status-label">Info:</span>
                <span className="status-value">{dwStatus.message}</span>
              </div>
              {dwStatus.coverage && (
                <div className="status-row">
                  <span className="status-label">Coverage:</span>
                  <span className="status-value">{dwStatus.coverage}</span>
                </div>
              )}
            </div>
            <div className="settings-help">
              <strong>Setup options:</strong>
              <ol>
                <li><strong>Live mode:</strong> Run <code>npm run dev:dw-proxy</code> with GEE credentials</li>
                <li><strong>Offline mode:</strong> Generate grid with <code>python scripts/generate-dw-grid.py</code></li>
              </ol>
            </div>
          </div>

          {/* Storage Usage (Task 1.10.1) */}
          <div className="settings-section">
            <h3>💾 Storage Usage</h3>
            {storageStats ? (
              <div className="settings-status-box">
                <div className="status-row">
                  <span className="status-label">Observations:</span>
                  <span className="status-value">{storageStats.observations}</span>
                </div>
                <div className="status-row">
                  <span className="status-label">Images:</span>
                  <span className="status-value">{storageStats.images}</span>
                </div>
                <div className="status-row">
                  <span className="status-label">Custom Layers:</span>
                  <span className="status-value">{storageStats.customLayers}</span>
                </div>
                <div className="status-row">
                  <span className="status-label">Species:</span>
                  <span className="status-value">{storageStats.species}</span>
                </div>
                <div className="status-row">
                  <span className="status-label">Total Storage:</span>
                  <span className="status-value">~{storageStats.estimatedSizeMB} MB</span>
                </div>
              </div>
            ) : (
              <p style={{ color: '#888', fontSize: 13 }}>Loading...</p>
            )}
          </div>

          {/* Data Management (Task 1.10.2-1.10.3) */}
          <div className="settings-section">
            <h3>🗄️ Data Management</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleImportBackup}
                className="settings-btn primary"
                style={{ flex: 1 }}
              >
                📥 Import Backup
              </button>
              <button
                onClick={handleClearAllData}
                className="settings-btn"
                disabled={clearingData}
                style={{ flex: 1, color: '#ff6b6b', borderColor: '#ff6b6b40' }}
              >
                {clearingData ? '⏳ Clearing...' : '🗑️ Clear All Data'}
              </button>
            </div>
            <p className="settings-description" style={{ fontSize: 11, marginTop: 8, color: '#666' }}>
              Import: restore from a previously exported ZIP backup. Clear: removes all local data permanently.
            </p>
          </div>

          {/* Map Preferences (Task 1.10.4) */}
          <div className="settings-section">
            <h3>🗺️ Map Preferences</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>Default Basemap</label>
                <select
                  value={defaultBasemap}
                  onChange={(e) => setDefaultBasemap(e.target.value)}
                  className="settings-input"
                  style={{ width: '100%' }}
                >
                  <option value="dark">Dark</option>
                  <option value="satellite">Satellite</option>
                </select>
              </div>
              <div>
                <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Default Center (lon, lat)
                </label>
                <input
                  type="text"
                  value={defaultCenterStr}
                  onChange={(e) => setDefaultCenterStr(e.target.value)}
                  placeholder="75.5, 13.0"
                  className="settings-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ color: '#aaa', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                  Default Zoom <span>{defaultZoom}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={18}
                  value={defaultZoom}
                  onChange={(e) => setDefaultZoom(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={handleSaveMapPrefs} className="settings-btn primary">
                  Save
                </button>
                {mapPrefsSaved && <span className="settings-saved">✓ Saved</span>}
              </div>
            </div>
          </div>

          {/* App Info */}
          <div className="settings-section">
            <h3>ℹ️ About</h3>
            <div className="settings-info">
              <p><strong>WG Field Validator</strong></p>
              <p>Western Ghats landscape intelligence & field data collection tool.</p>
              <p className="settings-version">Version {__APP_VERSION__}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
