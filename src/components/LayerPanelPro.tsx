import React, { useState, useMemo } from 'react';
import type { DatasetLayer, CustomLayer } from '../types';

// Import CoreStackLayer type
interface CoreStackLayer {
  id: string;
  name: string;
  type: 'vector' | 'raster' | 'table';
  description?: string;
  location?: {
    state: string;
    district: string;
    tehsil: string;
  };
}

interface LayerPanelProps {
  layers: DatasetLayer[];
  activeLayers: Set<string>;
  onToggle: (layerId: string) => void;
  onClose: () => void;
  coreStackLayers?: CoreStackLayer[];
  mapCenter?: { lat: number; lon: number };
  selectedLocation?: { lat: number; lon: number };
  onLoadCoreStackAtPoint?: (lat: number, lon: number) => Promise<void>;
  onLoadCoreStackByAdmin?: (state: string, district: string, tehsil: string) => Promise<void>;
  // Custom layers (Task 1.8.11-12)
  customLayers?: CustomLayer[];
  onToggleCustomLayer?: (layerId: string) => void;
  onEditCustomLayerStyle?: (layer: CustomLayer) => void;
  onDeleteCustomLayer?: (layerId: string) => void;
  onImportLayer?: () => void;
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
  dynamicworld: {
    id: 'dynamicworld',
    label: 'Dynamic World',
    icon: '🌍',
    color: '#26c6da',
    description: 'Live/derived LULC from Google Dynamic World'
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

const CATEGORY_ORDER = ['forest', 'lulc', 'built', 'dynamicworld', 'boundary', 'corestack', 'treecover', 'other'];

type ViewMode = 'categories' | 'timeline' | 'all';

const LayerPanelPro: React.FC<LayerPanelProps> = ({
  layers,
  activeLayers,
  onToggle,
  onClose,
  coreStackLayers = [],
  mapCenter,
  selectedLocation,
  onLoadCoreStackAtPoint,
  onLoadCoreStackByAdmin,
  customLayers = [],
  onToggleCustomLayer,
  onEditCustomLayerStyle,
  onDeleteCustomLayer,
  onImportLayer,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['forest', 'boundary']));
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCoreStackGroups, setExpandedCoreStackGroups] = useState<Set<string>>(new Set());
  const [coreStackAdminState, setCoreStackAdminState] = useState('');
  const [coreStackAdminDistrict, setCoreStackAdminDistrict] = useState('');
  const [coreStackAdminTehsil, setCoreStackAdminTehsil] = useState('');
  const [coreStackLoadStatus, setCoreStackLoadStatus] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });
  const [coreStackGroupQuery, setCoreStackGroupQuery] = useState('');
  const [coreStackShowEnabledOnly, setCoreStackShowEnabledOnly] = useState(false);

  // Group CoreStack layers by thematic type (unique layer names)
  const groupedCoreStackLayers = useMemo(() => {
    const groups: Record<string, { name: string; type: string; locations: string[]; count: number }> = {};
    
    coreStackLayers.forEach(layer => {
      const baseName = layer.name;
      if (!groups[baseName]) {
        groups[baseName] = {
          name: baseName,
          type: layer.type,
          locations: [],
          count: 0
        };
      }
      groups[baseName].count++;
      // Add location info if available
      const loc = (layer as any).tehsil || (layer as any).district;
      if (loc && !groups[baseName].locations.includes(loc)) {
        groups[baseName].locations.push(loc);
      }
    });
    
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [coreStackLayers]);

  const coreStackGroups = useMemo(() => {
    const groups = new Map<string, CoreStackLayer[]>();
    for (const layer of coreStackLayers) {
      const key = (layer.name || 'Unnamed Layer').trim();
      const arr = groups.get(key) || [];
      arr.push(layer);
      groups.set(key, arr);
    }
    return Array.from(groups.entries())
      .map(([name, items]) => ({
        name,
        items: items.slice().sort((a, b) => {
          const aLoc = `${(a as any).state || ''}/${(a as any).district || ''}/${(a as any).tehsil || ''}`;
          const bLoc = `${(b as any).state || ''}/${(b as any).district || ''}/${(b as any).tehsil || ''}`;
          return aLoc.localeCompare(bLoc);
        })
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [coreStackLayers]);

  const filteredCoreStackGroups = useMemo(() => {
    let groups = coreStackGroups;
    if (coreStackShowEnabledOnly) {
      groups = groups
        .map(g => ({ ...g, items: g.items.filter(i => activeLayers.has(i.id)) }))
        .filter(g => g.items.length > 0);
    }
    const q = coreStackGroupQuery.trim().toLowerCase();
    if (q.length > 0) {
      groups = groups.filter(g => g.name.toLowerCase().includes(q));
    }
    return groups;
  }, [coreStackGroups, coreStackGroupQuery, coreStackShowEnabledOnly, activeLayers]);

  const toggleCoreStackGroup = (groupName: string) => {
    const group = coreStackGroups.find(g => g.name === groupName);
    if (!group) return;

    const allActive = group.items.every(l => activeLayers.has(l.id));
    if (allActive) {
      group.items.forEach(l => {
        if (activeLayers.has(l.id)) onToggle(l.id);
      });
    } else {
      group.items.forEach(l => {
        if (!activeLayers.has(l.id)) onToggle(l.id);
      });
    }
  };

  const toggleCoreStackGroupExpanded = (groupName: string) => {
    setExpandedCoreStackGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  const runCoreStackLoad = async (fn: () => Promise<void>) => {
    try {
      setCoreStackLoadStatus({ kind: 'loading', message: 'Loading CoreStack layers…' });
      await fn();
      setCoreStackLoadStatus({ kind: 'ok', message: 'CoreStack layers loaded (if available for that area).' });
      window.setTimeout(() => setCoreStackLoadStatus({ kind: 'idle' }), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setCoreStackLoadStatus({ kind: 'error', message: `CoreStack load failed: ${msg}` });
    }
  };

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
  const rasterCount = layers.filter(l => l.type === 'image-overlay' || l.type === 'raster').length;
  const coreStackLiveActiveCount = coreStackLayers.filter(l => activeLayers.has(l.id)).length;

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
          {groupedCoreStackLayers.length > 0 && (
            <>
              <span className="lp-divider">•</span>
              <span className="lp-stat" style={{ color: '#00bfa5' }}>⚡ {groupedCoreStackLayers.length} live</span>
            </>
          )}
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
            {/* CoreStack Live Layers Section */}
            {coreStackLayers.length > 0 && (
              <div className={`lp-category ${expandedCategories.has('corestack-live') ? 'expanded' : ''}`}>
                <button className="lp-category-header" onClick={() => toggleCategory('corestack-live')}>
                  <span className="lp-cat-icon" style={{ backgroundColor: '#00bfa525', color: '#00bfa5' }}>
                    ⚡
                  </span>
                  <div className="lp-cat-info">
                    <span className="lp-cat-name">CoreStack Live Data</span>
                    <span className="lp-cat-desc">Real-time watershed & land cover from CoreStack API</span>
                  </div>
                  <div className="lp-cat-right">
                    <span className="lp-cat-count" style={{ backgroundColor: '#00bfa530', color: '#00bfa5' }}>
                      {coreStackLiveActiveCount}/{coreStackLayers.length}
                    </span>
                    <svg 
                      className={`lp-chevron ${expandedCategories.has('corestack-live') ? 'open' : ''}`}
                      viewBox="0 0 24 24" 
                      width="20" 
                      height="20" 
                      fill="currentColor"
                    >
                      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                    </svg>
                  </div>
                </button>
                
                {expandedCategories.has('corestack-live') && (
                  <div className="lp-category-content">
                    <div className="lp-corestack-info" style={{ 
                      padding: '8px 12px', 
                      fontSize: '11px', 
                      color: 'var(--text-secondary)', 
                      borderBottom: '1px solid var(--border-color)' 
                    }}>
                      ⚠️ These are LIVE layers loaded from CoreStack. Toggle on/off to show them on the map.
                    </div>

                    {(onLoadCoreStackAtPoint || onLoadCoreStackByAdmin) && (
                      <div className="lp-corestack-explorer" onClick={(e) => e.stopPropagation()}>
                        <div className="lp-corestack-explorer-title">Load CoreStack for an area</div>
                        <div className="lp-corestack-explorer-subtitle">
                          Tip: pan the map or tap a location to discover what CoreStack covers.
                        </div>

                        <div className="lp-corestack-explorer-actions">
                          <button
                            type="button"
                            disabled={!onLoadCoreStackAtPoint || !mapCenter}
                            onClick={() => {
                              if (!onLoadCoreStackAtPoint || !mapCenter) return;
                              void runCoreStackLoad(() => onLoadCoreStackAtPoint(mapCenter.lat, mapCenter.lon));
                            }}
                          >
                            Load map center
                          </button>
                          <button
                            type="button"
                            disabled={!onLoadCoreStackAtPoint || !selectedLocation}
                            onClick={() => {
                              if (!onLoadCoreStackAtPoint || !selectedLocation) return;
                              void runCoreStackLoad(() => onLoadCoreStackAtPoint(selectedLocation.lat, selectedLocation.lon));
                            }}
                          >
                            Load last location
                          </button>
                        </div>

                        <div className="lp-corestack-explorer-form">
                          <div className="lp-corestack-explorer-row">
                            <input
                              className="lp-corestack-input"
                              placeholder="State"
                              value={coreStackAdminState}
                              onChange={(e) => setCoreStackAdminState(e.target.value)}
                            />
                            <input
                              className="lp-corestack-input"
                              placeholder="District"
                              value={coreStackAdminDistrict}
                              onChange={(e) => setCoreStackAdminDistrict(e.target.value)}
                            />
                          </div>
                          <div className="lp-corestack-explorer-row">
                            <input
                              className="lp-corestack-input"
                              placeholder="Tehsil / Taluk"
                              value={coreStackAdminTehsil}
                              onChange={(e) => setCoreStackAdminTehsil(e.target.value)}
                            />
                            <button
                              type="button"
                              disabled={
                                !onLoadCoreStackByAdmin ||
                                !coreStackAdminState.trim() ||
                                !coreStackAdminDistrict.trim() ||
                                !coreStackAdminTehsil.trim()
                              }
                              onClick={() => {
                                if (!onLoadCoreStackByAdmin) return;
                                const s = coreStackAdminState.trim();
                                const d = coreStackAdminDistrict.trim();
                                const t = coreStackAdminTehsil.trim();
                                void runCoreStackLoad(() => onLoadCoreStackByAdmin(s, d, t));
                              }}
                            >
                              Load
                            </button>
                          </div>

                          {coreStackLoadStatus.kind !== 'idle' && (
                            <div className={`lp-corestack-status ${coreStackLoadStatus.kind}`}>
                              {coreStackLoadStatus.message}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="lp-cat-actions">
                      <button onClick={() => coreStackLayers.forEach(l => { if (!activeLayers.has(l.id)) onToggle(l.id); })}>Enable all</button>
                      <button onClick={() => coreStackLayers.forEach(l => { if (activeLayers.has(l.id)) onToggle(l.id); })}>Disable all</button>
                    </div>

                    <div className="lp-corestack-filter" onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <input
                          className="lp-corestack-input"
                          placeholder="Filter CoreStack layer types…"
                          value={coreStackGroupQuery}
                          onChange={(e) => setCoreStackGroupQuery(e.target.value)}
                        />
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          <input
                            type="checkbox"
                            checked={coreStackShowEnabledOnly}
                            onChange={(e) => setCoreStackShowEnabledOnly(e.target.checked)}
                          />
                          Enabled only
                        </label>
                      </div>
                    </div>
                    <div className="lp-layer-list">
                      {filteredCoreStackGroups.map(group => {
                        const activeCount = group.items.filter(l => activeLayers.has(l.id)).length;
                        const isExpanded = expandedCoreStackGroups.has(group.name);

                        return (
                          <div key={`corestack-group-${group.name}`} className="layer-item-pro" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                            <div
                              className={`layer-item-pro ${activeCount > 0 ? 'active' : ''}`}
                              style={{ marginBottom: 0 }}
                              onClick={() => toggleCoreStackGroup(group.name)}
                            >
                              <div className={`layer-checkbox ${activeCount > 0 ? 'checked' : ''}`}>
                                {activeCount > 0 && (
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                  </svg>
                                )}
                              </div>
                              <div className="layer-info">
                                <span className="layer-title">{group.name}</span>
                                <span className="layer-subtitle">
                                  <span className="layer-badge raster">Live</span>
                                  <span className="layer-badge year">{activeCount}/{group.items.length} loaded</span>
                                </span>
                              </div>
                              <button
                                type="button"
                                className="lp-search-clear"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCoreStackGroupExpanded(group.name);
                                }}
                                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                style={{ marginLeft: 'auto' }}
                              >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                                  <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                                </svg>
                              </button>
                            </div>

                            {isExpanded && (
                              <div style={{ paddingLeft: 34, paddingTop: 8, paddingBottom: 8 }}>
                                {group.items.map((layer) => {
                                  const isActive = activeLayers.has(layer.id);
                                  const locationLabel = [
                                    (layer as any).state,
                                    (layer as any).district,
                                    (layer as any).tehsil
                                  ].filter(Boolean).join(' / ');

                                  return (
                                    <div
                                      key={layer.id}
                                      className={`layer-item-pro ${isActive ? 'active' : ''}`}
                                      style={{ padding: '8px 10px', marginBottom: 6 }}
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
                                        <span className="layer-title" style={{ fontSize: 12 }}>{locationLabel || 'Unknown location'}</span>
                                        <span className="layer-subtitle">
                                          <span className="layer-badge year">{(layer as any).version ? `v${(layer as any).version}` : 'v?'} </span>
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* My Layers (Custom Layers) Section — Task 1.8.11 */}
            {(customLayers.length > 0 || onImportLayer) && (
              <div className={`lp-category ${expandedCategories.has('custom-layers') ? 'expanded' : ''}`}>
                <button className="lp-category-header" onClick={() => toggleCategory('custom-layers')}>
                  <span className="lp-cat-icon" style={{ backgroundColor: '#ab47bc25', color: '#ab47bc' }}>
                    📂
                  </span>
                  <div className="lp-cat-info">
                    <span className="lp-cat-name">My Layers</span>
                    <span className="lp-cat-desc">Imported custom datasets</span>
                  </div>
                  <div className="lp-cat-right">
                    <span className="lp-cat-count" style={{ backgroundColor: '#ab47bc30', color: '#ab47bc' }}>
                      {customLayers.filter(l => l.enabled).length}/{customLayers.length}
                    </span>
                    <svg
                      className={`lp-chevron ${expandedCategories.has('custom-layers') ? 'open' : ''}`}
                      viewBox="0 0 24 24" width="20" height="20" fill="currentColor"
                    >
                      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                    </svg>
                  </div>
                </button>

                {expandedCategories.has('custom-layers') && (
                  <div className="lp-category-content">
                    {customLayers.length === 0 && (
                      <div className="lp-empty" style={{ padding: '12px 16px', fontSize: 13 }}>
                        No custom layers imported yet.
                      </div>
                    )}
                    <div className="lp-layer-list">
                      {customLayers.map(cl => {
                        const isActive = cl.enabled ?? false;
                        return (
                          <div
                            key={cl.id}
                            className={`layer-item-pro ${isActive ? 'active' : ''}`}
                            onClick={() => onToggleCustomLayer?.(cl.id)}
                          >
                            <div className={`layer-checkbox ${isActive ? 'checked' : ''}`}>
                              {isActive && (
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                              )}
                            </div>
                            <div className="layer-info">
                              <span className="layer-title">{cl.title}</span>
                              <span className="layer-subtitle">
                                <span className="layer-badge year">{cl.featureCount} features</span>
                                <span className="layer-badge raster">{cl.geometryType}</span>
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                              {onEditCustomLayerStyle && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onEditCustomLayerStyle(cl); }}
                                  style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
                                  title="Edit style"
                                >🎨</button>
                              )}
                              {onDeleteCustomLayer && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDeleteCustomLayer(cl.id); }}
                                  style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}
                                  title="Delete layer"
                                >🗑️</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {onImportLayer && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onImportLayer(); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '10px 16px',
                          background: '#1a1d23', border: '1px dashed #555', borderRadius: 8, color: '#aaa',
                          cursor: 'pointer', fontSize: 13, marginTop: 8,
                        }}
                      >
                        ➕ Import Layer
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

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
        {onImportLayer && (
          <button 
            className="lp-footer-btn"
            onClick={onImportLayer}
            style={{ background: '#ab47bc30', color: '#ab47bc' }}
          >
            + Import
          </button>
        )}
      </div>
    </div>
  );
};

export default LayerPanelPro;
