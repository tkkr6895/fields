import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { DatasetLayer, LocationData } from '../types';
import { coreStackLayerService, CoreStackLayer } from '../services/CoreStackLayerService';
import { dynamicWorldService } from '../services/DynamicWorldService';
import { coreStackService } from '../services/CoreStackService';

// Re-export for convenience
export type { CoreStackLayer } from '../services/CoreStackLayerService';

export interface MapClickFeature {
  source: 'corestack' | 'dataset';
  mapLayerId: string;
  datasetLayerId?: string;
  coreStackLayerId?: string;
  properties: Record<string, unknown>;
}

export interface MapClickInfo {
  features: MapClickFeature[];
}

interface MapViewProps {
  center: [number, number];
  zoom: number;
  basemap: 'dark' | 'satellite';
  layers: DatasetLayer[];
  activeLayers: Set<string>;
  currentLocation: LocationData | null;
  onMapMove: (center: [number, number], zoom: number) => void;
  onMapClick?: (lat: number, lon: number, info?: MapClickInfo) => void;
  onCoreStackLayersLoaded?: (layers: CoreStackLayer[]) => void;
}

// Expose methods to parent
export interface MapViewRef {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (center: [number, number], zoom?: number) => void;
  resetView: () => void;
  loadCoreStackForAdmin: (state: string, district: string, tehsil: string) => Promise<void>;
  loadCoreStackAtPoint: (lat: number, lon: number) => Promise<void>;
}

// Dark map style for offline use
const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'Dark',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 22
    }
  ]
};

// Satellite style
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'Satellite',
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: 'Tiles &copy; Esri'
    }
  },
  layers: [
    {
      id: 'esri-satellite-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

// Western Ghats default view
const DEFAULT_CENTER: [number, number] = [75.5, 13.0];
const DEFAULT_ZOOM = 8;

const MapView = forwardRef<MapViewRef, MapViewProps>(({
  center,
  zoom,
  basemap,
  layers,
  activeLayers,
  currentLocation,
  onMapMove,
  onMapClick,
  onCoreStackLayersLoaded
}, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const accuracyCircle = useRef<string | null>(null);
  const [coreStackLayers, setCoreStackLayers] = useState<CoreStackLayer[]>([]);
  const loadedCoreStackSources = useRef<Set<string>>(new Set());
  const loadedCoreStackAdmins = useRef<Set<string>>(new Set());
  const coreStackAutoLoadTimer = useRef<number | null>(null);

  // MapLibre event handlers are registered once; keep latest props via refs.
  const activeLayersRef = useRef<Set<string>>(activeLayers);
  const onMapMoveRef = useRef<MapViewProps['onMapMove']>(onMapMove);
  const onMapClickRef = useRef<MapViewProps['onMapClick']>(onMapClick);

  useEffect(() => {
    activeLayersRef.current = activeLayers;
  }, [activeLayers]);

  useEffect(() => {
    onMapMoveRef.current = onMapMove;
  }, [onMapMove]);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  const setVisibilitySafe = useCallback((mapInstance: maplibregl.Map, mapLayerId: string, visible: boolean) => {
    if (!mapInstance.getLayer(mapLayerId)) return;
    mapInstance.setLayoutProperty(mapLayerId, 'visibility', visible ? 'visible' : 'none');
  }, []);

  const loadCoreStackForAdmin = useCallback(async (state: string, district: string, tehsil: string) => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const adminKey = `${state}|||${district}|||${tehsil}`;
    if (loadedCoreStackAdmins.current.has(adminKey)) return;
    loadedCoreStackAdmins.current.add(adminKey);

    try {
      const layers = await coreStackLayerService.getLayersForLocation(state, district, tehsil);
      if (layers.length === 0) return;

      setCoreStackLayers(prev => {
        const existing = new Set(prev.map(l => l.id));
        const newLayers = layers.filter(l => !existing.has(l.id));
        const updated = [...prev, ...newLayers];
        if (newLayers.length > 0 && onCoreStackLayersLoaded) {
          onCoreStackLayersLoaded(updated);
        }
        return updated;
      });

      for (const layer of layers) {
        if (loadedCoreStackSources.current.has(layer.id)) continue;
        if (layer.type !== 'vector') continue;

        const geojson = await coreStackLayerService.fetchLayerGeoJSON(layer);
        if (!geojson || !map.current) continue;

        const sourceId = `corestack-${layer.id}`;
        const layerId = `corestack-layer-${layer.id}`;

        try {
          // Add source
          if (!map.current.getSource(sourceId)) {
            map.current.addSource(sourceId, {
              type: 'geojson',
              data: geojson
            });

            // Determine geometry type from first feature
            const firstFeature = geojson.features?.[0];
            const geomType = firstFeature?.geometry?.type;

            const isVisible = activeLayersRef.current.has(layer.id);

            if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
              // Add fill layer
              map.current.addLayer({
                id: layerId,
                type: 'fill',
                source: sourceId,
                paint: {
                  'fill-color': getLayerColor(layer.name),
                  'fill-opacity': 0.4
                },
                layout: {
                  visibility: isVisible ? 'visible' : 'none'
                }
              });
              // Add outline
              map.current.addLayer({
                id: `${layerId}-outline`,
                type: 'line',
                source: sourceId,
                paint: {
                  'line-color': getLayerColor(layer.name),
                  'line-width': 2
                },
                layout: {
                  visibility: isVisible ? 'visible' : 'none'
                }
              });
            } else if (geomType === 'Point' || geomType === 'MultiPoint') {
              map.current.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: {
                  'circle-radius': 6,
                  'circle-color': getLayerColor(layer.name),
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#ffffff'
                },
                layout: {
                  visibility: isVisible ? 'visible' : 'none'
                }
              });
            } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
              map.current.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                paint: {
                  'line-color': getLayerColor(layer.name),
                  'line-width': 3
                },
                layout: {
                  visibility: isVisible ? 'visible' : 'none'
                }
              });
            }

            loadedCoreStackSources.current.add(layer.id);
            console.log(`[MapView] Added CoreStack layer: ${layer.name} (${geojson.features?.length} features)`);
          }
        } catch (err) {
          console.warn(`[MapView] Failed to add CoreStack layer ${layer.name}:`, err);
        }
      }
    } catch (err) {
      // Allow retry on a later click if anything in the pipeline fails.
      loadedCoreStackAdmins.current.delete(adminKey);
      throw err;
    }
  }, [onCoreStackLayersLoaded]);

  const loadCoreStackAtPoint = useCallback(async (lat: number, lon: number) => {
    if (!coreStackService.isAvailable()) return;
    const admin = await coreStackService.getAdminDetailsByLatLon(lat, lon);
    const state = admin?.state_name;
    const district = admin?.district_name;
    const tehsil = admin?.tehsil_name;
    if (!state || !district || !tehsil) return;
    await loadCoreStackForAdmin(state, district, tehsil);
  }, [loadCoreStackForAdmin]);

  // Expose map methods to parent
  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (map.current) {
        map.current.zoomIn({ duration: 300 });
      }
    },
    zoomOut: () => {
      if (map.current) {
        map.current.zoomOut({ duration: 300 });
      }
    },
    flyTo: (newCenter: [number, number], newZoom?: number) => {
      if (map.current) {
        map.current.flyTo({ 
          center: newCenter, 
          zoom: newZoom ?? map.current.getZoom(),
          duration: 800,
          essential: true
        });
      }
    },
    resetView: () => {
      if (map.current) {
        map.current.flyTo({ 
          center: DEFAULT_CENTER, 
          zoom: DEFAULT_ZOOM,
          duration: 1000,
          essential: true
        });
      }
    },
    loadCoreStackForAdmin: async (state: string, district: string, tehsil: string) => {
      await loadCoreStackForAdmin(state, district, tehsil);
    },
    loadCoreStackAtPoint: async (lat: number, lon: number) => {
      await loadCoreStackAtPoint(lat, lon);
    }
  }), [loadCoreStackAtPoint, loadCoreStackForAdmin]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: basemap === 'dark' ? DARK_STYLE : SATELLITE_STYLE,
      center: center,
      zoom: zoom,
      attributionControl: { compact: true },
      maxZoom: 18,
      minZoom: 4,
      // Improve touch handling
      touchZoomRotate: true,
      touchPitch: false,
      dragRotate: false,
      pitchWithRotate: false
    });

    // Remove default navigation control - we'll use custom controls
    // map.current.addControl(
    //   new maplibregl.NavigationControl({ showCompass: true }),
    //   'bottom-right'
    // );

    map.current.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100 }),
      'bottom-left'
    );

    // Handle map move
    map.current.on('moveend', () => {
      if (map.current) {
        const c = map.current.getCenter();
        onMapMoveRef.current([c.lng, c.lat], map.current.getZoom());

        // Debounced CoreStack auto-load for map center.
        // This improves coverage as the user pans across Western Ghats.
        if (coreStackAutoLoadTimer.current) {
          window.clearTimeout(coreStackAutoLoadTimer.current);
        }
        coreStackAutoLoadTimer.current = window.setTimeout(() => {
          void (async () => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              await loadCoreStackAtPoint(c.lat, c.lng);
            } catch (err) {
              console.warn('CoreStack center auto-load failed:', err);
            }
          })();
        }, 700);
      }
    });

    // Handle map click for location info
    map.current.on('click', (e) => {
      const clickCb = onMapClickRef.current;
      if (clickCb) {
        // Opportunistically load CoreStack live layers for the clicked admin unit.
        // This makes CoreStack feel "live" beyond the small bootstrap set.
        void (async () => {
          try {
            if (!coreStackService.isAvailable()) return;
            const admin = await coreStackService.getAdminDetailsByLatLon(e.lngLat.lat, e.lngLat.lng);
            const state = admin?.state_name;
            const district = admin?.district_name;
            const tehsil = admin?.tehsil_name;
            if (!state || !district || !tehsil) return;

            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            await loadCoreStackForAdmin(state, district, tehsil);
          } catch (err) {
            console.warn('CoreStack dynamic load failed:', err);
          }
        })();

        const info: MapClickInfo = { features: [] };

        try {
          const rendered = map.current?.queryRenderedFeatures(e.point) || [];
          for (const f of rendered) {
            const mapLayerId = (f.layer as any)?.id as string | undefined;
            if (!mapLayerId) continue;

            // Only report layers the user can actually toggle
            if (mapLayerId.startsWith('corestack-layer-')) {
              const coreStackLayerId = mapLayerId.replace('corestack-layer-', '');
              if (!activeLayersRef.current.has(coreStackLayerId)) continue;

              info.features.push({
                source: 'corestack',
                mapLayerId,
                coreStackLayerId,
                properties: (f.properties || {}) as Record<string, unknown>
              });
            } else if (mapLayerId.startsWith('layer-')) {
              const datasetLayerId = mapLayerId.replace('layer-', '');
              if (!activeLayersRef.current.has(datasetLayerId)) continue;

              info.features.push({
                source: 'dataset',
                mapLayerId,
                datasetLayerId,
                properties: (f.properties || {}) as Record<string, unknown>
              });
            }
          }
        } catch (err) {
          console.warn('Failed to query rendered features:', err);
        }

        clickCb(e.lngLat.lat, e.lngLat.lng, info);
      }
    });

    // Cleanup
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update basemap
  useEffect(() => {
    if (!map.current) return;
    map.current.setStyle(basemap === 'dark' ? DARK_STYLE : SATELLITE_STYLE);

    // Style change wipes custom sources/layers; reload once the new style is ready.
    loadedCoreStackSources.current.clear();
    loadedCoreStackAdmins.current.clear();
    setCoreStackLayers([]);

    const reload = () => {
      // These functions handle waiting for style load internally, but we call them to kick the process off.
      // They are defined below and are stable via useCallback.
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      loadGeoJSONLayers();
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      loadImageOverlays();
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      loadRasterTileLayers();
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      loadCoreStackLayers();
    };

    map.current.once('styledata', reload);
  }, [basemap]);

  // Load and display XYZ raster tile layers
  const loadRasterTileLayers = useCallback(async () => {
    if (!map.current) return;

    if (!map.current.isStyleLoaded()) {
      map.current.once('styledata', loadRasterTileLayers);
      return;
    }

    for (const layer of layers) {
      if (layer.type !== 'raster' || layer.source.format !== 'xyz') continue;

      // Dynamic World live layer is resolved via a proxy at runtime.
      let tileTemplate = layer.source.path;
      if (layer.id === 'dynamicworld_live' && tileTemplate.startsWith('dynamicworld://')) {
        try {
          const resolved = await dynamicWorldService.getLiveTileUrlTemplate();
          if (!resolved) {
            // Not configured; avoid adding a broken source.
            continue;
          }
          tileTemplate = resolved;
        } catch (err) {
          console.warn('Failed to resolve Dynamic World live tiles:', err);
          continue;
        }
      }

      const sourceId = `source-${layer.id}`;
      const layerId = `layer-${layer.id}`;
      const isActive = activeLayers.has(layer.id);

      try {
        if (!map.current.getSource(sourceId)) {
          map.current.addSource(sourceId, {
            type: 'raster',
            tiles: [tileTemplate],
            tileSize: 256,
            minzoom: layer.minZoom,
            maxzoom: layer.maxZoom
          } as any);

          map.current.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
              'raster-opacity': layer.style?.opacity ?? 0.8,
              'raster-fade-duration': 0
            },
            layout: {
              visibility: isActive ? 'visible' : 'none'
            }
          });
        } else {
          if (map.current.getLayer(layerId)) {
            map.current.setLayoutProperty(layerId, 'visibility', isActive ? 'visible' : 'none');
          }
        }
      } catch (error) {
        console.warn(`Failed to load tile layer ${layer.id}:`, error);
      }
    }
  }, [layers, activeLayers]);

  useEffect(() => {
    loadRasterTileLayers();
  }, [loadRasterTileLayers]);

  // Update center/zoom - only if significantly different to avoid loops
  useEffect(() => {
    if (!map.current) return;
    const currentCenter = map.current.getCenter();
    const currentZoom = map.current.getZoom();
    
    // Only fly if there's a significant change
    const centerDiff = Math.abs(currentCenter.lng - center[0]) + Math.abs(currentCenter.lat - center[1]);
    const zoomDiff = Math.abs(currentZoom - zoom);
    
    if (centerDiff > 0.001 || zoomDiff > 0.5) {
      map.current.flyTo({ 
        center, 
        zoom, 
        duration: 800,
        essential: true
      });
    }
  }, [center, zoom]);

  // Update user location marker
  useEffect(() => {
    if (!map.current || !currentLocation) return;

    // Create or update user marker
    if (!userMarker.current) {
      const el = document.createElement('div');
      el.className = 'user-marker';
      userMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat([currentLocation.lon, currentLocation.lat])
        .addTo(map.current);
    } else {
      userMarker.current.setLngLat([currentLocation.lon, currentLocation.lat]);
    }

    // Add/update accuracy circle
    const updateAccuracyCircle = () => {
      if (!map.current) return;

      const sourceId = 'accuracy-source';
      const layerId = 'accuracy-layer';

      // Create circle GeoJSON
      const circle = createCircle(
        currentLocation.lon,
        currentLocation.lat,
        currentLocation.accuracy
      );

      if (map.current.getSource(sourceId)) {
        (map.current.getSource(sourceId) as maplibregl.GeoJSONSource).setData(circle);
      } else {
        map.current.addSource(sourceId, {
          type: 'geojson',
          data: circle
        });

        map.current.addLayer({
          id: layerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': '#4a9eff',
            'fill-opacity': 0.15
          }
        });

        map.current.addLayer({
          id: `${layerId}-outline`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#4a9eff',
            'line-width': 2
          }
        });

        accuracyCircle.current = sourceId;
      }
    };

    if (map.current.isStyleLoaded()) {
      updateAccuracyCircle();
    } else {
      map.current.once('styledata', updateAccuracyCircle);
    }
  }, [currentLocation]);

  // Load and display GeoJSON layers
  const loadGeoJSONLayers = useCallback(async () => {
    if (!map.current) return;

    // Wait for style to load
    if (!map.current.isStyleLoaded()) {
      map.current.once('styledata', loadGeoJSONLayers);
      return;
    }

    for (const layer of layers) {
      if (layer.source.format !== 'geojson') continue;

      const sourceId = `source-${layer.id}`;
      const isActive = activeLayers.has(layer.id);

      try {
        // Check if source exists
        if (!map.current.getSource(sourceId)) {
          // Fetch and add source
          const response = await fetch(layer.source.path);
          if (response.ok) {
            const geojson = await response.json();
            
            map.current.addSource(sourceId, {
              type: 'geojson',
              data: geojson
            });

            // Add layer based on style
            const layerId = `layer-${layer.id}`;
            
            if (layer.style?.kind === 'polygon' || layer.style?.kind === 'choropleth') {
              map.current.addLayer({
                id: layerId,
                type: 'fill',
                source: sourceId,
                paint: {
                  'fill-color': layer.style?.colors?.default || '#4a9eff',
                  'fill-opacity': 0.3
                },
                layout: {
                  visibility: isActive ? 'visible' : 'none'
                }
              });

              map.current.addLayer({
                id: `${layerId}-outline`,
                type: 'line',
                source: sourceId,
                paint: {
                  'line-color': layer.style?.colors?.default?.replace('33', 'ff') || '#4a9eff',
                  'line-width': 2
                },
                layout: {
                  visibility: isActive ? 'visible' : 'none'
                }
              });
            } else if (layer.style?.kind === 'point') {
              map.current.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: {
                  'circle-radius': 6,
                  'circle-color': '#ff9800',
                  'circle-stroke-width': 2,
                  'circle-stroke-color': '#fff'
                },
                layout: {
                  visibility: isActive ? 'visible' : 'none'
                }
              });
            }
          }
        } else {
          // Update visibility
          const layerId = `layer-${layer.id}`;
          if (map.current.getLayer(layerId)) {
            map.current.setLayoutProperty(
              layerId,
              'visibility',
              isActive ? 'visible' : 'none'
            );
          }
          if (map.current.getLayer(`${layerId}-outline`)) {
            map.current.setLayoutProperty(
              `${layerId}-outline`,
              'visibility',
              isActive ? 'visible' : 'none'
            );
          }
        }
      } catch (error) {
        console.warn(`Failed to load layer ${layer.id}:`, error);
      }
    }
  }, [layers, activeLayers]);

  useEffect(() => {
    loadGeoJSONLayers();
  }, [loadGeoJSONLayers]);

  // Load and display image overlay layers (raster PNGs)
  const loadImageOverlays = useCallback(async () => {
    if (!map.current) return;

    // Wait for style to load
    if (!map.current.isStyleLoaded()) {
      map.current.once('styledata', loadImageOverlays);
      return;
    }

    for (const layer of layers) {
      if (layer.type !== 'image-overlay' || !layer.bounds) continue;

      const sourceId = `source-${layer.id}`;
      const layerId = `layer-${layer.id}`;
      const isActive = activeLayers.has(layer.id);

      try {
        // Check if source already exists
        if (!map.current.getSource(sourceId)) {
          // Add image source
          map.current.addSource(sourceId, {
            type: 'image',
            url: layer.source.path,
            coordinates: [
              [layer.bounds.west, layer.bounds.north], // top-left
              [layer.bounds.east, layer.bounds.north], // top-right
              [layer.bounds.east, layer.bounds.south], // bottom-right
              [layer.bounds.west, layer.bounds.south]  // bottom-left
            ]
          });

          // Add raster layer
          map.current.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
              'raster-opacity': layer.style?.opacity ?? 0.7,
              'raster-fade-duration': 0
            },
            layout: {
              visibility: isActive ? 'visible' : 'none'
            }
          });
        } else {
          // Update visibility
          if (map.current.getLayer(layerId)) {
            map.current.setLayoutProperty(
              layerId,
              'visibility',
              isActive ? 'visible' : 'none'
            );
          }
        }
      } catch (error) {
        console.warn(`Failed to load image layer ${layer.id}:`, error);
      }
    }
  }, [layers, activeLayers]);

  useEffect(() => {
    loadImageOverlays();
  }, [loadImageOverlays]);

  // Load CoreStack layers dynamically from API
  const loadCoreStackLayers = useCallback(async () => {
    if (!map.current || !map.current.isStyleLoaded()) {
      // Retry when style is loaded
      map.current?.once('styledata', () => loadCoreStackLayers());
      return;
    }

    // Load layers for known Western Ghats locations
    const knownLocations = coreStackLayerService.getKnownLocations();
    
    for (const loc of knownLocations.slice(0, 3)) { // Start with first 3 to avoid overload
      try {
        await loadCoreStackForAdmin(loc.state, loc.district, loc.tehsil);
      } catch (err) {
        console.warn(`[MapView] Failed to load CoreStack layers for ${loc.district}:`, err);
      }
    }
  }, [loadCoreStackForAdmin]);

  // Sync CoreStack layer visibility with activeLayers toggles
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    if (coreStackLayers.length === 0) return;

    for (const layer of coreStackLayers) {
      const baseId = `corestack-layer-${layer.id}`;
      const visible = activeLayers.has(layer.id);
      setVisibilitySafe(map.current, baseId, visible);
      setVisibilitySafe(map.current, `${baseId}-outline`, visible);
    }
  }, [activeLayers, coreStackLayers, setVisibilitySafe]);

  // Load CoreStack layers on mount
  useEffect(() => {
    // Delay to let map initialize
    const timer = setTimeout(() => {
      loadCoreStackLayers();
    }, 2000);
    return () => clearTimeout(timer);
  }, [loadCoreStackLayers]);

  return <div ref={mapContainer} className="map-container" />;
});

MapView.displayName = 'MapView';

// Helper: Get color based on layer name
function getLayerColor(name: string): string {
  const colorMap: Record<string, string> = {
    'SOGE': '#2196F3',      // Blue for SOGE (slope/geology)
    'Drainage': '#00BCD4',  // Cyan for drainage
    'MWS': '#4CAF50',       // Green for micro-watersheds
    'Settlement': '#FF5722', // Orange for settlements
    'Waterbody': '#03A9F4',  // Light blue for water
    'Cropping': '#8BC34A',   // Light green for crops
    'default': '#9C27B0'     // Purple default
  };
  
  for (const [key, color] of Object.entries(colorMap)) {
    if (name.toLowerCase().includes(key.toLowerCase())) {
      return color;
    }
  }
  return colorMap.default;
}

// Helper to create a circle GeoJSON
function createCircle(lng: number, lat: number, radiusMeters: number): GeoJSON.Feature {
  const points = 64;
  const coords: [number, number][] = [];
  
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    
    const dLat = dy / 111320;
    const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));
    
    coords.push([lng + dLng, lat + dLat]);
  }
  coords.push(coords[0]); // Close the polygon

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    }
  };
}

export default MapView;
