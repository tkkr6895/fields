import React, { useState } from 'react';
import type { DatasetLayer } from '../types';

interface LayerPanelEnhancedProps {
  layers: DatasetLayer[];
  activeLayers: Set<string>;
  onToggle: (layerId: string) => void;
  onClose: () => void;
}

const categoryMeta: Record<string, { icon: string; label: string; color: string; description: string }> = {
  boundary: { 
    icon: '🗺️', 
    label: 'Boundaries', 
    color: '#4a9eff',
    description: 'Administrative and regional boundaries'
  },
  lulc: { 
    icon: '🌿', 
    label: 'Land Use / Land Cover', 
    color: '#81c784',
    description: 'Historical land classification (1987-2010)'
  },
  forest: { 
    icon: '🌳', 
    label: 'Forest Classification', 
    color: '#2e7d32',
    description: 'Plantations vs natural forest analysis'
  },
  built: { 
    icon: '🏘️', 
    label: 'Built-up Area', 
    color: '#ff5722',
    description: 'Urban expansion tracking (1987-2025)'
  },
  treecover: { 
    icon: '🌲', 
    label: 'Tree Cover', 
    color: '#4caf50',
    description: 'Tree cover density over time'
  },
  dynamicworld: { 
    icon: '🌍', 
    label: 'Dynamic World', 
    color: '#9c27b0',
    description: 'Near-real-time global land cover from Google'
  },
  corestack: { 
    icon: '📊', 
    label: 'CoreStack Data', 
    color: '#ff9800',
    description: 'Water balance, cropping & watershed data'
  },
  analysis: { 
    icon: '📈', 
    label: 'Analysis Results', 
    color: '#f44336',
    description: 'Urbanization and change detection'
  },
  other: { 
    icon: '📁', 
    label: 'Other Layers', 
    color: '#666',
    description: 'Additional datasets'
  }
};

const categoryOrder = ['boundary', 'forest', 'lulc', 'built', 'treecover', 'dynamicworld', 'corestack', 'analysis', 'other'];

const LayerPanelEnhanced: React.FC<LayerPanelEnhancedProps> = ({
  layers,
  activeLayers,
  onToggle,
  onClose
}) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('lulc');
  const [searchQuery, setSearchQuery] = useState('');

  // Group layers by category
  const groupedLayers = layers.reduce((acc, layer) => {
    const category = layer.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(layer);
    return acc;
  }, {} as Record<string, DatasetLayer[]>);

  // Filter by search
  const filteredGrouped = searchQuery 
    ? Object.fromEntries(
        Object.entries(groupedLayers).map(([cat, layers]) => [
          cat,
          layers.filter(l => l.title.toLowerCase().includes(searchQuery.toLowerCase()))
        ]).filter(([, layers]) => (layers as DatasetLayer[]).length > 0)
      )
    : groupedLayers;

  const activeCount = activeLayers.size;
  const totalCount = layers.length;

  return (
    <div className="layer-panel-enhanced">
      <div className="layer-panel-header">
        <div className="header-top">
          <h2>Data Layers</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <p className="layer-count">{activeCount} of {totalCount} layers active</p>
        
        <div className="layer-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="search-icon">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input 
            type="text"
            placeholder="Search layers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="layer-panel-content">
        {categoryOrder.map(category => {
          const categoryLayers = filteredGrouped[category];
          if (!categoryLayers || categoryLayers.length === 0) return null;
          
          const meta = categoryMeta[category] || categoryMeta.other;
          const isExpanded = expandedCategory === category || searchQuery.length > 0;
          const activeInCategory = categoryLayers.filter((l: DatasetLayer) => activeLayers.has(l.id)).length;

          return (
            <div key={category} className="layer-category">
              <button 
                className={`category-header ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedCategory(isExpanded && !searchQuery ? null : category)}
              >
                <div className="category-left">
                  <span className="category-icon" style={{ background: `${meta.color}20`, color: meta.color }}>
                    {meta.icon}
                  </span>
                  <div className="category-info">
                    <span className="category-label">{meta.label}</span>
                    <span className="category-desc">{meta.description}</span>
                  </div>
                </div>
                <div className="category-right">
                  <span className="category-badge" style={{ background: `${meta.color}30`, color: meta.color }}>
                    {activeInCategory}/{categoryLayers.length}
                  </span>
                  <svg 
                    className={`chevron ${isExpanded ? 'expanded' : ''}`} 
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
                <div className="category-layers">
                  {categoryLayers.map((layer: DatasetLayer) => {
                    const isActive = activeLayers.has(layer.id);
                    const isRaster = layer.type === 'image-overlay';
                    const layerYear = layer.year;
                    return (
                      <button
                        key={layer.id}
                        className={`layer-item-enhanced ${isActive ? 'active' : ''}`}
                        onClick={() => onToggle(layer.id)}
                      >
                        <div className="layer-toggle">
                          <div className={`toggle-switch ${isActive ? 'on' : ''}`}>
                            <div className="toggle-knob"></div>
                          </div>
                        </div>
                        <div className="layer-content">
                          <span className="layer-name">{layer.title}</span>
                          <span className="layer-meta">
                            {isRaster ? '🗺️ Map Layer' : layer.source.format.toUpperCase()}
                            {layerYear ? ` • ${layerYear}` : ''}
                            {layer.description && <span className="layer-desc"> • {layer.description.substring(0, 40)}...</span>}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="layer-panel-footer">
        <button className="footer-btn" onClick={() => {
          layers.forEach(l => {
            if (!activeLayers.has(l.id)) onToggle(l.id);
          });
        }}>
          Enable All
        </button>
        <button className="footer-btn" onClick={() => {
          layers.forEach(l => {
            if (activeLayers.has(l.id)) onToggle(l.id);
          });
        }}>
          Disable All
        </button>
      </div>
    </div>
  );
};

export default LayerPanelEnhanced;
