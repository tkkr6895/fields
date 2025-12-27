import React from 'react';
import type { DatasetLayer } from '../types';

interface LayerPanelProps {
  layers: DatasetLayer[];
  activeLayers: Set<string>;
  onToggle: (layerId: string) => void;
  onClose: () => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  activeLayers,
  onToggle,
  onClose
}) => {
  // Group layers by category
  const groupedLayers = layers.reduce((acc, layer) => {
    const category = layer.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(layer);
    return acc;
  }, {} as Record<string, DatasetLayer[]>);

  const categoryLabels: Record<string, string> = {
    boundary: '🗺️ Boundaries',
    lulc: '🌿 LULC Layers',
    forest: '🌳 Forest Data',
    corestack: '📊 CoreStack Data',
    other: '📁 Other'
  };

  const categoryOrder = ['boundary', 'lulc', 'forest', 'corestack', 'other'];

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <h3>Layers</h3>
        <button className="bottom-sheet-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="side-panel-content">
        {categoryOrder.map(category => {
          const categoryLayers = groupedLayers[category];
          if (!categoryLayers || categoryLayers.length === 0) return null;

          return (
            <div key={category}>
              <div style={{ 
                padding: '8px 14px', 
                fontSize: '11px', 
                color: '#666',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                borderBottom: '1px solid #333355'
              }}>
                {categoryLabels[category]}
              </div>
              <div className="layer-list">
                {categoryLayers.map(layer => (
                  <div
                    key={layer.id}
                    className="layer-item"
                    onClick={() => onToggle(layer.id)}
                  >
                    <div className={`layer-checkbox ${activeLayers.has(layer.id) ? 'active' : ''}`} />
                    <div className="layer-info">
                      <div className="layer-title">{layer.title}</div>
                      <div className="layer-source">
                        {layer.source.format.toUpperCase()} • {layer.type}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LayerPanel;
