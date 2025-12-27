import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { DatasetLayer, LocationData } from '../types';

interface MapViewProps {
  center: [number, number];
  zoom: number;
  basemap: 'dark' | 'satellite';
  layers: DatasetLayer[];
  activeLayers: Set<string>;
  currentLocation: LocationData | null;
  onMapMove: (center: [number, number], zoom: number) => void;
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

const MapView: React.FC<MapViewProps> = ({
  center,
  zoom,
  basemap,
  layers,
  activeLayers,
  currentLocation,
  onMapMove
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const accuracyCircle = useRef<string | null>(null);

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
      minZoom: 4
    });

    // Add controls
    map.current.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      'bottom-right'
    );

    map.current.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100 }),
      'bottom-left'
    );

    // Handle map move
    map.current.on('moveend', () => {
      if (map.current) {
        const c = map.current.getCenter();
        onMapMove([c.lng, c.lat], map.current.getZoom());
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
  }, [basemap]);

  // Update center/zoom
  useEffect(() => {
    if (!map.current) return;
    map.current.flyTo({ center, zoom, duration: 500 });
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

  return <div ref={mapContainer} className="map-container" />;
};

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
