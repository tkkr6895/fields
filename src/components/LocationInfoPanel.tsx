import React, { useState, useEffect } from 'react';
import type { LocationData } from '../types';
import { DatasetManager } from '../services/DatasetManager';
import { coreStackService } from '../services/CoreStackService';
import { coreStackLayerService } from '../services/CoreStackLayerService';
import { dynamicWorldService } from '../services/DynamicWorldService';
import { weatherService, WeatherData } from '../services/WeatherService';
import { filterMeaningfulProperties, getPropertyLabel, formatPropertyValue } from '../config/westernGhatsLayers';
import type { MapClickInfo } from './MapView';

interface LocationInfoPanelProps {
  location: LocationData;
  isOnline: boolean;
  activeLayerIds: string[];
  mapClickInfo?: MapClickInfo | null;
  onClose: () => void;
}

interface DataSection {
  title: string;
  icon: string;
  status: 'loading' | 'loaded' | 'error' | 'offline';
  data: Record<string, unknown> | null;
}

const datasetManager = new DatasetManager();

const LocationInfoPanel: React.FC<LocationInfoPanelProps> = ({ location, isOnline, activeLayerIds, mapClickInfo, onClose }) => {
  const [sections, setSections] = useState<Record<string, DataSection>>({
    mapFeatures: { title: 'Map Features (Clicked)', icon: '🧩', status: 'loading', data: null },
    local: { title: 'Local Data', icon: '💾', status: 'loading', data: null },
    dynamicWorld: { title: 'Dynamic World (LULC)', icon: '🌍', status: 'loading', data: null },
    corestack: { title: 'CoreStack (Watershed)', icon: '💧', status: 'loading', data: null },
    weather: { title: 'Weather', icon: '🌤️', status: 'loading', data: null },
  });
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['local']));

  // Reset sections when location changes
  useEffect(() => {
    setSections({
      mapFeatures: { title: 'Map Features (Clicked)', icon: '🧩', status: 'loading', data: null },
      local: { title: 'Local Data', icon: '💾', status: 'loading', data: null },
      dynamicWorld: { title: 'Dynamic World (LULC)', icon: '🌍', status: 'loading', data: null },
      corestack: { title: 'CoreStack (Watershed)', icon: '💧', status: 'loading', data: null },
      weather: { title: 'Weather', icon: '🌤️', status: 'loading', data: null },
    });
    setWeatherData(null);
  }, [location.lat, location.lon]);

  useEffect(() => {
    const fetchAllData = async () => {
      // 0. Rendered map features at the clicked point (CoreStack + local vector layers)
      try {
        const features = mapClickInfo?.features || [];
        const data: Record<string, unknown> = {
          '📍 Location': `${location.lat.toFixed(5)}°N, ${location.lon.toFixed(5)}°E`,
          '🧩 Feature count': features.length
        };

        if (features.length === 0) {
          data['ℹ️'] = 'No rendered vector features at this point (or layer hidden)';
        } else {
          features.slice(0, 15).forEach((f, idx) => {
            const label = f.source === 'corestack'
              ? `CoreStack: ${f.coreStackLayerId || f.mapLayerId}`
              : `Layer: ${f.datasetLayerId || f.mapLayerId}`;
            data[`── ${idx + 1}. ${label} ──`] = '';

            const rawProps = f.properties || {};
            // Filter to only show meaningful properties
            const filteredProps = filterMeaningfulProperties(rawProps as Record<string, unknown>);
            const keys = Object.keys(filteredProps).slice(0, 15);
            
            if (keys.length === 0) {
              // Show a few raw props as fallback if filtering was too aggressive
              const fallbackKeys = Object.keys(rawProps).filter(k => 
                !k.startsWith('_') && rawProps[k] !== null && rawProps[k] !== ''
              ).slice(0, 5);
              if (fallbackKeys.length === 0) {
                data['(no properties)'] = '';
              } else {
                fallbackKeys.forEach((k) => {
                  data[getPropertyLabel(k)] = formatPropertyValue(k, rawProps[k]);
                });
              }
            } else {
              keys.forEach((k) => {
                data[getPropertyLabel(k)] = formatPropertyValue(k, filteredProps[k]);
              });
            }
          });
        }

        setSections(prev => ({
          ...prev,
          mapFeatures: { ...prev.mapFeatures, status: 'loaded', data }
        }));
      } catch (err) {
        console.warn('Map features error:', err);
        setSections(prev => ({
          ...prev,
          mapFeatures: { ...prev.mapFeatures, status: 'error', data: null }
        }));
      }

      // 1. Fetch local data (always available)
      try {
        await datasetManager.initialize();
        const localIds = activeLayerIds.filter(id => !!datasetManager.getLayerById(id));
        const layerIdsToQuery = localIds.length > 0 ? localIds : datasetManager.getLayers().map(l => l.id);
        const localData = await datasetManager.getSummaryAtPoint(location.lat, location.lon, layerIdsToQuery);
        
        setSections(prev => ({
          ...prev,
          local: { ...prev.local, status: 'loaded', data: localData }
        }));
      } catch (err) {
        console.error('Local data error:', err);
        setSections(prev => ({
          ...prev,
          local: { ...prev.local, status: 'error', data: null }
        }));
      }

      // 2. Fetch LULC data - Dynamic World (POINT-SPECIFIC only)
      try {
        const locationLabel = `${location.lat.toFixed(5)}°N, ${location.lon.toFixed(5)}°E`;
        const sourceStatus = dynamicWorldService.getDataSourceStatus();

        // Load offline data first (for fallback)
        await dynamicWorldService.loadOfflineData();

        // Try to get point-specific data (live or offline)
        const pointData = await dynamicWorldService.fetchPointData(location.lat, location.lon);
        
        if (pointData) {
          // Format top probabilities
          const topProbs = Object.entries(pointData.probabilities || {})
            .filter(([, v]) => Number(v) > 0.01) // Only show >1%
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 5)
            .reduce<Record<string, unknown>>((acc, [k, v]) => {
              acc[k] = `${(Number(v) * 100).toFixed(1)}%`;
              return acc;
            }, {});

          // Get class color for visual indicator
          const classInfo = dynamicWorldService.getClassInfoByName(pointData.landCoverClass);
          
          setSections(prev => ({
            ...prev,
            dynamicWorld: {
              ...prev.dynamicWorld,
              status: 'loaded',
              data: {
                '📊 Source': pointData.source === 'live' 
                  ? 'Dynamic World (GEE Live)' 
                  : 'Dynamic World (Offline Grid)',
                '📍 Location': locationLabel,
                '📏 Resolution': pointData.resolution || '~10m',
                '🗓️ Timestamp': pointData.timestamp,
                '── Land Cover ──': '',
                '🏷️ Class': pointData.landCoverClass,
                '🎨 Color': classInfo?.color || '#888',
                '📝 Description': classInfo?.description || '',
                '🎯 Confidence': `${(pointData.confidence * 100).toFixed(1)}%`,
                ...(Object.keys(topProbs).length > 0 ? { '── Class Probabilities ──': '', ...topProbs } : {})
              }
            }
          }));
        } else {
          // No point data available
          setSections(prev => ({
            ...prev,
            dynamicWorld: {
              ...prev.dynamicWorld,
              status: sourceStatus.mode === 'unavailable' ? 'offline' : 'error',
              data: {
                '📍 Location': locationLabel,
                '⚠️ Status': sourceStatus.mode === 'unavailable' 
                  ? 'No Dynamic World data available'
                  : 'Location outside coverage area',
                'ℹ️ Mode': sourceStatus.message,
                ...(sourceStatus.coverage ? { '🗺️ Coverage': sourceStatus.coverage } : {}),
                ...(sourceStatus.mode === 'unavailable' ? {
                  '── Setup Options ──': '',
                  '1️⃣ Live': 'Run `npm run dev:dw-proxy` with GEE credentials',
                  '2️⃣ Offline': 'Generate grid data with `python scripts/generate-dw-grid.py`'
                } : {})
              }
            }
          }));
        }
      } catch (err) {
        console.error('LULC data error:', err);
        setSections(prev => ({
          ...prev,
          dynamicWorld: { 
            ...prev.dynamicWorld, 
            status: 'error', 
            data: { 
              '⚠️ Error': err instanceof Error ? err.message : 'Failed to fetch land cover data'
            } 
          }
        }));
      }

      // 3. Fetch CoreStack data (online only)
      if (isOnline && coreStackService.hasApiKey()) {
        try {
          const enrichment = await coreStackService.enrichLocation(location.lat, location.lon);
          if (enrichment && !enrichment.error) {
            // Also try to get available layers for this location
            let layerInfo: Record<string, unknown> = {};
            if (enrichment.admin?.state_name && enrichment.admin?.district_name && enrichment.admin?.tehsil_name) {
              try {
                const layers = await coreStackLayerService.getLayersForLocation(
                  enrichment.admin.state_name,
                  enrichment.admin.district_name,
                  enrichment.admin.tehsil_name
                );
                if (layers.length > 0) {
                  layerInfo['── Available Layers ──'] = '';
                  layers.forEach((layer, idx) => {
                    layerInfo[`🗺️ Layer ${idx + 1}`] = layer.name;
                  });
                  layerInfo['ℹ️ Layer Status'] = `${layers.length} layers loaded on map`;
                }
              } catch {
                // Layers not available for this location
              }
            }
            
            // Format indicators nicely
            const indicatorData: Record<string, unknown> = {};
            if (enrichment.indicators && Array.isArray(enrichment.indicators)) {
              enrichment.indicators.forEach((ind: any) => {
                if (ind.indicator_name && ind.value !== undefined) {
                  indicatorData[ind.indicator_name] = ind.unit ? `${ind.value} ${ind.unit}` : ind.value;
                }
              });
            }
            
            setSections(prev => ({
              ...prev,
              corestack: { 
                ...prev.corestack, 
                status: 'loaded', 
                data: {
                  '── Location ──': '',
                  'State': enrichment.admin?.state_name || 'Unknown',
                  'District': enrichment.admin?.district_name || 'Unknown',
                  'Tehsil': enrichment.admin?.tehsil_name || 'Unknown',
                  'MWS ID': enrichment.mwsId || 'Not available',
                  ...indicatorData,
                  ...layerInfo
                }
              }
            }));
          } else {
            throw new Error(enrichment?.error || 'No data');
          }
        } catch (err) {
          console.error('CoreStack error:', err);
          setSections(prev => ({
            ...prev,
            corestack: { 
              ...prev.corestack, 
              status: coreStackService.hasApiKey() ? 'error' : 'offline', 
              data: { 
                '⚠️ Status': 'Location not in CoreStack coverage',
                'ℹ️ Note': 'CoreStack covers selected blocks in India',
                '🔍 Try': 'Move to a covered tehsil/block'
              }
            }
          }));
        }
      } else {
        setSections(prev => ({
          ...prev,
          corestack: { 
            ...prev.corestack, 
            status: 'offline', 
            data: { 
              '⚠️ Status': isOnline ? 'API key required' : 'Requires internet',
              'ℹ️ Action': isOnline ? 'Configure in settings' : 'Connect to internet'
            }
          }
        }));
      }

      // 4. Fetch weather (online only, no API key needed)
      if (isOnline) {
        try {
          const weather = await weatherService.getWeather(location.lat, location.lon);
          if (weather) {
            setWeatherData(weather);
            setSections(prev => ({
              ...prev,
              weather: { 
                ...prev.weather, 
                status: 'loaded', 
                data: {
                  'Temperature': `${weather.current.temperature}°C`,
                  'Humidity': `${weather.current.humidity}%`,
                  'Conditions': weather.current.weatherDescription,
                  'Wind': `${weather.current.windSpeed} km/h`,
                  'Precipitation': `${weather.current.precipitation} mm`
                }
              }
            }));
          } else {
            throw new Error('No weather data');
          }
        } catch (err) {
          console.error('Weather error:', err);
          setSections(prev => ({
            ...prev,
            weather: { ...prev.weather, status: 'error', data: null }
          }));
        }
      } else {
        setSections(prev => ({
          ...prev,
          weather: { ...prev.weather, status: 'offline', data: null }
        }));
      }
    };

    fetchAllData();
  }, [location, isOnline, activeLayerIds, mapClickInfo]);

  const toggleSection = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderStatus = (status: DataSection['status']) => {
    switch (status) {
      case 'loading': return <span className="status-badge loading">Loading...</span>;
      case 'loaded': return <span className="status-badge success">✓ Available</span>;
      case 'error': return <span className="status-badge error">✗ Error</span>;
      case 'offline': return <span className="status-badge offline">⚡ Online Only</span>;
    }
  };

  // Helper to check if a value is meaningful (not null, undefined, empty, or just a dash)
  const isValueMeaningful = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && (value.trim() === '' || value.trim() === '-')) return false;
    if (typeof value === 'number' && Number.isNaN(value)) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) return false;
    return true;
  };

  const renderData = (data: Record<string, unknown> | null, sectionKey: string) => {
    if (!data) return <p className="no-data">No data available</p>;
    
    // Filter out entries with null/empty values (but keep section headers that start with '──')
    const filterMeaningfulEntries = (entries: [string, unknown][]): [string, unknown][] => {
      return entries.filter(([key, value]) => {
        // Keep section headers
        if (key.startsWith('──') || key.includes('──')) return true;
        // Keep entries with meaningful values
        return isValueMeaningful(value);
      });
    };
    
    // Special rendering for local data (grouped by layer)
    if (sectionKey === 'local') {
      const meaningfulEntries = filterMeaningfulEntries(Object.entries(data));
      if (meaningfulEntries.length === 0) {
        return <p className="no-data">No data available at this location</p>;
      }
      
      return (
        <div className="data-grid local-data">
          {meaningfulEntries.map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              const nestedEntries = filterMeaningfulEntries(Object.entries(value as Record<string, unknown>));
              if (nestedEntries.length === 0) return null;
              
              return (
                <div key={key} className="layer-data">
                  <h4>{formatLayerName(key)}</h4>
                  <div className="layer-values">
                    {nestedEntries.map(([k, v]) => (
                      <div key={k} className="data-row">
                        <span className="data-label">{formatLabel(k)}</span>
                        <span className="data-value">{formatValue(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={key} className="data-row">
                <span className="data-label">{formatLabel(key)}</span>
                <span className="data-value">{formatValue(value)}</span>
              </div>
            );
          })}
        </div>
      );
    }

    const meaningfulEntries = filterMeaningfulEntries(Object.entries(data));
    if (meaningfulEntries.length === 0) {
      return <p className="no-data">No data available at this location</p>;
    }

    return (
      <div className="data-grid">
        {meaningfulEntries.map(([key, value]) => (
          <div key={key} className="data-row">
            <span className="data-label">{formatLabel(key)}</span>
            <span className="data-value">{formatValue(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const formatLayerName = (name: string): string => {
    return name.replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatLabel = (label: string): string => {
    return label.replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      if (Number.isNaN(value)) return '-';
      // Format percentages if value ends in _pct or is a percentage string
      if (value >= 0 && value <= 100) {
        return Number.isInteger(value) ? value.toString() : value.toFixed(1);
      }
      // Large numbers: add thousand separators
      if (Math.abs(value) >= 1000) {
        return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
      }
      return Number.isInteger(value) ? value.toString() : value.toFixed(2);
    }
    if (typeof value === 'string') {
      // Handle empty strings
      if (value.trim() === '') return '-';
      // Capitalize first letter and replace underscores
      return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return '-';
      if (value.length <= 3) {
        return value.map(v => formatValue(v)).join(', ');
      }
      return `${value.slice(0, 3).map(v => formatValue(v)).join(', ')} (+${value.length - 3} more)`;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).filter(k => !k.startsWith('_'));
      if (keys.length === 0) return '-';
      if (keys.length === 1) {
        return formatValue(obj[keys[0]]);
      }
      // For small objects with meaningful keys, show key-value pairs
      if (keys.length <= 3) {
        return keys.map(k => `${formatLabel(k)}: ${formatValue(obj[k])}`).join(' | ');
      }
      // For larger objects, show summary with count
      const preview = keys.slice(0, 2).map(k => `${formatLabel(k)}: ${formatValue(obj[k])}`).join(' | ');
      return `${preview} (+${keys.length - 2} more)`;
    }
    return String(value);
  };

  return (
    <div className="location-info-panel">
      <div className="panel-header">
        <div className="header-content">
          <h2>📍 Location Information</h2>
          <p className="coords">
            {location.lat.toFixed(6)}, {location.lon.toFixed(6)}
            {location.accuracy && ` (±${location.accuracy.toFixed(0)}m)`}
          </p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {/* Scrollable content area */}
      <div className="panel-content">
        {/* Weather Card (if available) */}
        {weatherData && (
          <div className="weather-card">
            <div className="weather-current">
              <span className="weather-icon">
                {weatherService.getWeatherIcon(weatherData.current.weatherCode, weatherData.current.isDay)}
              </span>
              <div className="weather-temp">
                <span className="temp-value">{weatherData.current.temperature}°C</span>
                <span className="temp-desc">{weatherData.current.weatherDescription}</span>
              </div>
            </div>
            <div className="weather-details">
              <span>💧 {weatherData.current.humidity}%</span>
              <span>💨 {weatherData.current.windSpeed} km/h</span>
              <span>🌧️ {weatherData.current.precipitation} mm</span>
            </div>
            {weatherData.forecast.length > 0 && (
              <div className="weather-forecast">
                {weatherData.forecast.slice(0, 3).map((day, i) => (
                  <div key={i} className="forecast-day">
                    <span className="forecast-date">{new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
                    <span className="forecast-icon">{weatherService.getWeatherIcon(day.weatherCode, true)}</span>
                    <span className="forecast-temp">{day.tempMax.toFixed(0)}°/{day.tempMin.toFixed(0)}°</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Data Sections */}
        <div className="data-sections">
          {Object.entries(sections).map(([key, section]) => (
            <div key={key} className={`data-section ${expanded.has(key) ? 'expanded' : ''}`}>
              <button 
                className="section-header" 
                onClick={() => toggleSection(key)}
              >
                <span className="section-icon">{section.icon}</span>
                <span className="section-title">{section.title}</span>
                {renderStatus(section.status)}
                <span className="expand-icon">{expanded.has(key) ? '▼' : '▶'}</span>
              </button>
              {expanded.has(key) && (
                <div className="section-content">
                  {section.status === 'loading' ? (
                    <div className="loading-spinner">Loading data...</div>
                  ) : (
                    renderData(section.data, key)
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="panel-actions">
        {!isOnline && (
          <div className="offline-notice">
            📴 Offline - Some data sources unavailable
          </div>
        )}
        <button className="action-btn primary" onClick={() => {
          const text = `Location: ${location.lat.toFixed(6)}, ${location.lon.toFixed(6)}\n` +
            Object.entries(sections)
              .filter(([_, s]) => s.data)
              .map(([_, s]) => `\n${s.title}:\n${JSON.stringify(s.data, null, 2)}`)
              .join('\n');
          navigator.clipboard.writeText(text);
          alert('Location data copied to clipboard!');
        }}>
          📋 Copy All Data
        </button>
      </div>
    </div>
  );
};

export default LocationInfoPanel;
