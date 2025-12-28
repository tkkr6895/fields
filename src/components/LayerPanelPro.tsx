import React, { useState, useMemo } from 'react';
import type { DatasetLayer } from '../types';

interface LayerPanelProps {
  layers: DatasetLayer[];
  activeLayers: Set<string>;
  onToggle: (layerId: string) => void;
  onClose: () => void;
}

// Layer category configuration
const CATEGORIES = {
  forest: {
    id: 'forest',
    label: 'Forest Analysis',
    icon: '🌳',
    color: '#2e7d32',
    description: 'Plantation vs natural forest classification'
  },
  lulc: {
    id: 'lulc',
    label: 'Land Cover Maps',
    icon: '🌿',
    color: '#66bb6a',
    description: 'Historical LULC from GLC-FCS30D'
  },
  built: {
    id: 'built',
    label: 'Urban Expansion',
    icon: '🏘️',
    color: '#ff7043',
    description: 'Built-up area tracking over time'
  },
  boundary: {
    id: 'boundary',
    label: 'Boundaries',
    icon: '🗺️',
    color: '#42a5f5',
    description: 'Administrative boundaries'
  },
  corestack: {
    id: 'corestack',
    label: 'Watershed Data',
    icon: '💧',
    color: '#29b6f6',
    description: 'Water balance & cropping intensity'
  },
  treecover: {
    id: 'treecover',
    label: 'Tree Cover',
    icon: '🌲',
    color: '#43a047',
    description: 'Tree cover density analysis'
  },
  other: {
    id: 'other',
    label: 'Other Data',
    icon: '📊',
    color: '#78909c',
    description: 'Additional datasets'
  }
} as const;

const CATEGORY_ORDER = ['forest', 'lulc', 'built', 'boundary', 'corestack', 'treecover', 'other'];

type ViewMode = 'categories' | 'timeline' | 'all';

const LayerPanelPro: React.FC<LayerPanelProps> = ({
  layers,
  activeLayers,
  onToggle,
  onClose
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['forest', 'boundary']));
  const [searchQuery, setSearchQuery] = useState('');

  // Group layers by category
  const groupedLayers = useMemo(() => {
    const groups: Record<string, DatasetLayer[]> = {};
    layers.forEach(layer => {
      const cat = layer.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(layer);
    });
    
    // Sort layers within each group by year (if available)
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        if (a.year && b.year) return b.year - a.year; // Newest first
        if (a.year) return -1;
        if (b.year) return 1;
        return a.title.localeCompare(b.title);
      });
    });
    
    return groups;
  }, [layers]);

  // Group layers by year for timeline view
  const layersByYear = useMemo(() => {
    const years: Record<number, DatasetLayer[]> = {};
    layers.forEach(layer => {
      if (layer.year) {
        if (!years[layer.year]) years[layer.year] = [];
        years[layer.year].push(layer);
      }
    });
    return Object.entries(years)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, layers]) => ({ year: Number(year), layers }));
  }, [layers]);

  // Filter layers by search
  const filteredLayers = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    return layers.filter(l => 
      l.title.toLowerCase().includes(query) ||
      l.description?.toLowerCase().includes(query) ||
      l.category.toLowerCase().includes(query)
    );
  }, [layers, searchQuery]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const toggleAllInCategory = (cat: string, enable: boolean) => {
    const categoryLayers = groupedLayers[cat] || [];
    categoryLayers.forEach(layer => {
      const isActive = activeLayers.has(layer.id);
      if (enable && !isActive) onToggle(layer.id);
      if (!enable && isActive) onToggle(layer.id);
    });
  };

  const activeCount = activeLayers.size;
  const rasterCount = layers.filter(l => l.type === 'image-overlay').length;

  const renderLayerItem = (layer: DatasetLayer, compact = false) => {
    const isActive = activeLayers.has(layer.id);
    const isRaster = layer.type === 'image-overlay';
    
    return (
      <div
        key={layer.id}
        className={`layer-item-pro ${isActive ? 'active' : ''} ${compact ? 'compact' : ''}`}
        onClick={() => onToggle(layer.id)}
      >
        <div className={`layer-checkbox ${isActive ? 'checked' : ''}`}>
          {isActive && (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          )}
        </div>
        <div className="layer-info">
          <span className="layer-title">{layer.title}</span>
          {!compact && (
            <span className="layer-subtitle">
              {isRaster && <span className="layer-badge raster">Map</span>}
              {layer.year && <span className="layer-badge year">{layer.year}</span>}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="layer-panel-pro">
      {/* Header */}
      <div className="lp-header">
        <div className="lp-title-row">
          <h2>Map Layers</h2>
          <button className="lp-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <p className="lp-stats">
          <span className="lp-stat">{activeCount} active</span>
          <span className="lp-divider">•</span>
          <span className="lp-stat">{rasterCount} map layers</span>
          <span className="lp-divider">•</span>
          <span className="lp-stat">{layers.length - rasterCount} data tables</span>
        </p>
      </div>

      {/* Search */}
      <div className="lp-search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input
          type="text"
          placeholder="Search layers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="lp-search-clear" onClick={() => setSearchQuery('')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        )}
      </div>

      {/* View Mode Tabs */}
      {!searchQuery && (
        <div className="lp-tabs">
          <button 
            className={`lp-tab ${viewMode === 'categories' ? 'active' : ''}`}
            onClick={() => setViewMode('categories')}
          >
            By Category
          </button>
          <button 
            className={`lp-tab ${viewMode === 'timeline' ? 'active' : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            Timeline
          </button>
          <button 
            className={`lp-tab ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
          >
            All Layers
          </button>
        </div>
      )}

      {/* Content */}
      <div className="lp-content">
        {/* Search Results */}
        {searchQuery && filteredLayers && (
          <div className="lp-search-results">
            <p className="lp-results-count">
              {filteredLayers.length} result{filteredLayers.length !== 1 ? 's' : ''}
            </p>
            {filteredLayers.map(layer => renderLayerItem(layer))}
            {filteredLayers.length === 0 && (
              <div className="lp-empty">No layers found matching "{searchQuery}"</div>
            )}
          </div>
        )}

        {/* Category View */}
        {!searchQuery && viewMode === 'categories' && (
          <div className="lp-categories">
            {CATEGORY_ORDER.map(catId => {
              const categoryLayers = groupedLayers[catId];
              if (!categoryLayers || categoryLayers.length === 0) return null;
              
              const catConfig = CATEGORIES[catId as keyof typeof CATEGORIES] || CATEGORIES.other;
              const isExpanded = expandedCategories.has(catId);
              const activeInCat = categoryLayers.filter(l => activeLayers.has(l.id)).length;
              
              return (
                <div key={catId} className={`lp-category ${isExpanded ? 'expanded' : ''}`}>
                  <button className="lp-category-header" onClick={() => toggleCategory(catId)}>
                    <span className="lp-cat-icon" style={{ backgroundColor: catConfig.color + '25', color: catConfig.color }}>
                      {catConfig.icon}
                    </span>
                    <div className="lp-cat-info">
                      <span className="lp-cat-name">{catConfig.label}</span>
                      <span className="lp-cat-desc">{catConfig.description}</span>
                    </div>
                    <div className="lp-cat-right">
                      <span className="lp-cat-count" style={{ backgroundColor: catConfig.color + '30', color: catConfig.color }}>
                        {activeInCat}/{categoryLayers.length}
                      </span>
                      <svg 
                        className={`lp-chevron ${isExpanded ? 'open' : ''}`}
                        viewBox="0 0 24 24" 
                        width="20" 
                        height="20" 
                        fill="currentColor"
                      >
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                      </svg>
                    </div>
                  </button>
                  
                  {isExpanded && (
                    <div className="lp-category-content">
                      <div className="lp-cat-actions">
                        <button onClick={() => toggleAllInCategory(catId, true)}>Enable all</button>
                        <button onClick={() => toggleAllInCategory(catId, false)}>Disable all</button>
                      </div>
                      <div className="lp-layer-list">
                        {categoryLayers.map(layer => renderLayerItem(layer))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Timeline View */}
        {!searchQuery && viewMode === 'timeline' && (
          <div className="lp-timeline">
            {layersByYear.map(({ year, layers: yearLayers }) => (
              <div key={year} className="lp-timeline-year">
                <div className="lp-year-header">
                  <span className="lp-year-badge">{year}</span>
                  <span className="lp-year-count">{yearLayers.length} layers</span>
                </div>
                <div className="lp-year-layers">
                  {yearLayers.map(layer => renderLayerItem(layer, true))}
                </div>
              </div>
            ))}
            {layersByYear.length === 0 && (
              <div className="lp-empty">No time-series layers available</div>
            )}
          </div>
        )}

        {/* All Layers View */}
        {!searchQuery && viewMode === 'all' && (
          <div className="lp-all-layers">
            {layers.map(layer => renderLayerItem(layer))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="lp-footer">
        <button 
          className="lp-footer-btn"
          onClick={() => layers.forEach(l => { if (!activeLayers.has(l.id)) onToggle(l.id); })}
        >
          Enable All
        </button>
        <button 
          className="lp-footer-btn danger"
          onClick={() => layers.forEach(l => { if (activeLayers.has(l.id)) onToggle(l.id); })}
        >
          Clear All
        </button>
      </div>
    </div>
  );
};

export default LayerPanelPro;
