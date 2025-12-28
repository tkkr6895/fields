import React, { useState, useEffect } from 'react';
import type { LocationData } from '../types';
import { DatasetManager } from '../services/DatasetManager';
import { coreStackService } from '../services/CoreStackService';
import { dynamicWorldService } from '../services/DynamicWorldService';
import { weatherService, WeatherData } from '../services/WeatherService';

interface LocationInfoPanelProps {
  location: LocationData;
  isOnline: boolean;
  onClose: () => void;
}

interface DataSection {
  title: string;
  icon: string;
  status: 'loading' | 'loaded' | 'error' | 'offline';
  data: Record<string, unknown> | null;
}

const datasetManager = new DatasetManager();

const LocationInfoPanel: React.FC<LocationInfoPanelProps> = ({ location, isOnline, onClose }) => {
  const [sections, setSections] = useState<Record<string, DataSection>>({
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
      local: { title: 'Local Data', icon: '💾', status: 'loading', data: null },
      dynamicWorld: { title: 'Dynamic World (LULC)', icon: '🌍', status: 'loading', data: null },
      corestack: { title: 'CoreStack (Watershed)', icon: '💧', status: 'loading', data: null },
      weather: { title: 'Weather', icon: '🌤️', status: 'loading', data: null },
    });
    setWeatherData(null);
  }, [location.lat, location.lon]);

  useEffect(() => {
    const fetchAllData = async () => {
      // 1. Fetch local data (always available)
      try {
        await datasetManager.initialize();
        const layers = datasetManager.getLayers();
        const allLayerIds = layers.map(l => l.id);
        const localData = await datasetManager.getSummaryAtPoint(location.lat, location.lon, allLayerIds);
        
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

      // 2. Fetch Dynamic World (local cached + online if available)
      try {
        await dynamicWorldService.loadCachedData();
        const latestYear = new Date().getFullYear();
        const dwStats = dynamicWorldService.getRegionalStats(latestYear) || dynamicWorldService.getRegionalStats();
        
        if (dwStats) {
          setSections(prev => ({
            ...prev,
            dynamicWorld: { 
              ...prev.dynamicWorld, 
              status: 'loaded', 
              data: {
                year: dwStats.year,
                'Trees (%)': dwStats.trees?.toFixed(1),
                'Crops (%)': dwStats.crops?.toFixed(1),
                'Built (%)': dwStats.built?.toFixed(1),
                'Shrub & Scrub (%)': dwStats.shrubAndScrub?.toFixed(1),
                'Water (%)': dwStats.water?.toFixed(1),
                'Grass (%)': dwStats.grass?.toFixed(1),
              }
            }
          }));
        } else {
          setSections(prev => ({
            ...prev,
            dynamicWorld: { ...prev.dynamicWorld, status: 'error', data: null }
          }));
        }
      } catch (err) {
        console.error('Dynamic World error:', err);
        setSections(prev => ({
          ...prev,
          dynamicWorld: { ...prev.dynamicWorld, status: 'error', data: null }
        }));
      }

      // 3. Fetch CoreStack data (online only)
      if (isOnline && coreStackService.hasApiKey()) {
        try {
          const enrichment = await coreStackService.enrichLocation(location.lat, location.lon);
          if (enrichment && !enrichment.error) {
            setSections(prev => ({
              ...prev,
              corestack: { 
                ...prev.corestack, 
                status: 'loaded', 
                data: {
                  'State': enrichment.admin?.state_name,
                  'District': enrichment.admin?.district_name,
                  'Tehsil': enrichment.admin?.tehsil_name,
                  'MWS ID': enrichment.mwsId,
                  ...(enrichment.indicators || {})
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
              data: null 
            }
          }));
        }
      } else {
        setSections(prev => ({
          ...prev,
          corestack: { 
            ...prev.corestack, 
            status: 'offline', 
            data: { note: isOnline ? 'API key required - configure in settings' : 'Requires internet connection' }
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
  }, [location, isOnline]);

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

  const renderData = (data: Record<string, unknown> | null, sectionKey: string) => {
    if (!data) return <p className="no-data">No data available</p>;
    
    // Special rendering for local data (grouped by layer)
    if (sectionKey === 'local') {
      return (
        <div className="data-grid local-data">
          {Object.entries(data).map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              return (
                <div key={key} className="layer-data">
                  <h4>{formatLayerName(key)}</h4>
                  <div className="layer-values">
                    {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
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

    return (
      <div className="data-grid">
        {Object.entries(data).map(([key, value]) => (
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
