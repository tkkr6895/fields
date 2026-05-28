/**
 * MapView — slim raster-XYZ + location renderer for the LULC validator.
 * Renders the active basemap, the IndiaSAT / Dynamic World overlays passed
 * in via the `layers` prop, the user's GPS marker, and reports clicks
 * back to App.tsx. No CoreStack, GeoJSON, or image-overlay handling
 * (intentionally removed to keep the surface area small and the
 * dependencies credible).
 */
import {
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { DatasetLayer, LocationData } from '../types';

export interface MapClickInfo {
  features: Array<{ datasetLayerId: string; properties: Record<string, unknown> }>;
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
}

export interface MapViewRef {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (center: [number, number], zoom?: number) => void;
  resetView: () => void;
}

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'Dark',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: 'carto-dark', type: 'raster', source: 'carto-dark' }],
};

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'Satellite',
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Tiles © Esri',
    },
  },
  layers: [{ id: 'esri-satellite', type: 'raster', source: 'esri-satellite' }],
};

const DEFAULT_CENTER: [number, number] = [75.5, 13.0];
const DEFAULT_ZOOM = 8;

// Build an approximation of a geodesic circle (used for the GPS accuracy ring).
function buildAccuracyCircle(lon: number, lat: number, radiusMeters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const points = 32;
  const coords: [number, number][] = [];
  const earth = 6371000;
  const radius = Math.max(1, radiusMeters);
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = (radius * Math.cos(angle)) / earth;
    const dy = (radius * Math.sin(angle)) / earth;
    const newLat = lat + (dy * 180) / Math.PI;
    const newLon = lon + ((dx * 180) / Math.PI) / Math.cos((lat * Math.PI) / 180);
    coords.push([newLon, newLat]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

const MapView = forwardRef<MapViewRef, MapViewProps>(
  ({ center, zoom, basemap, layers, activeLayers, currentLocation, onMapMove, onMapClick }, ref) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const userMarker = useRef<maplibregl.Marker | null>(null);

    // Latest-prop refs (MapLibre handlers are bound once).
    const activeLayersRef = useRef<Set<string>>(activeLayers);
    const onMapMoveRef = useRef(onMapMove);
    const onMapClickRef = useRef(onMapClick);

    useEffect(() => { activeLayersRef.current = activeLayers; }, [activeLayers]);
    useEffect(() => { onMapMoveRef.current = onMapMove; }, [onMapMove]);
    useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

    useImperativeHandle(ref, () => ({
      zoomIn: () => map.current?.zoomIn({ duration: 300 }),
      zoomOut: () => map.current?.zoomOut({ duration: 300 }),
      flyTo: (newCenter, newZoom) => map.current?.flyTo({
        center: newCenter,
        zoom: newZoom ?? map.current.getZoom(),
        duration: 800,
        essential: true,
      }),
      resetView: () => map.current?.flyTo({
        center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 1000, essential: true,
      }),
    }), []);

    // Sync raster overlays into the map (idempotent).
    const syncRasterLayers = useCallback(() => {
      const m = map.current;
      if (!m) return;
      if (!m.isStyleLoaded()) {
        m.once('styledata', syncRasterLayers);
        return;
      }
      for (const layer of layers) {
        if (layer.type !== 'raster' || layer.source.format !== 'xyz') continue;
        const tile = layer.source.path;
        if (!tile || tile.startsWith('dynamicworld://') || tile.startsWith('indiasat://')) {
          continue;
        }
        const sourceId = `source-${layer.id}`;
        const layerId = `layer-${layer.id}`;
        const isActive = activeLayers.has(layer.id);
        try {
          if (!m.getSource(sourceId)) {
            m.addSource(sourceId, {
              type: 'raster',
              tiles: [tile],
              tileSize: 256,
              minzoom: layer.minZoom,
              maxzoom: layer.maxZoom,
            });
            m.addLayer({
              id: layerId,
              type: 'raster',
              source: sourceId,
              paint: { 'raster-opacity': layer.style?.opacity ?? 0.7, 'raster-fade-duration': 0 },
              layout: { visibility: isActive ? 'visible' : 'none' },
            });
          } else if (m.getLayer(layerId)) {
            m.setLayoutProperty(layerId, 'visibility', isActive ? 'visible' : 'none');
          }
        } catch (err) {
          console.warn(`Failed to add raster ${layer.id}:`, err);
        }
      }
    }, [layers, activeLayers]);

    // Initialize map once.
    useEffect(() => {
      if (!mapContainer.current || map.current) return;
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: basemap === 'dark' ? DARK_STYLE : SATELLITE_STYLE,
        center,
        zoom,
        attributionControl: { compact: true },
        maxZoom: 18,
        minZoom: 4,
        touchZoomRotate: true,
        touchPitch: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.current.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

      map.current.on('moveend', () => {
        if (!map.current) return;
        const c = map.current.getCenter();
        onMapMoveRef.current([c.lng, c.lat], map.current.getZoom());
      });

      map.current.on('click', (e) => {
        const cb = onMapClickRef.current;
        if (!cb) return;
        const info: MapClickInfo = { features: [] };
        try {
          const rendered = map.current?.queryRenderedFeatures(e.point) || [];
          for (const f of rendered) {
            const id = (f.layer as { id?: string })?.id;
            if (!id?.startsWith('layer-')) continue;
            const datasetLayerId = id.replace('layer-', '');
            if (!activeLayersRef.current.has(datasetLayerId)) continue;
            info.features.push({ datasetLayerId, properties: (f.properties || {}) as Record<string, unknown> });
          }
        } catch (err) {
          console.warn('Map click query failed:', err);
        }
        cb(e.lngLat.lat, e.lngLat.lng, info);
      });

      return () => {
        map.current?.remove();
        map.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Basemap swap.
    useEffect(() => {
      if (!map.current) return;
      map.current.setStyle(basemap === 'dark' ? DARK_STYLE : SATELLITE_STYLE);
      map.current.once('styledata', () => syncRasterLayers());
    }, [basemap, syncRasterLayers]);

    useEffect(() => { syncRasterLayers(); }, [syncRasterLayers]);

    // Follow center/zoom prop changes when the move is significant.
    useEffect(() => {
      if (!map.current) return;
      const c = map.current.getCenter();
      const dCenter = Math.abs(c.lng - center[0]) + Math.abs(c.lat - center[1]);
      const dZoom = Math.abs(map.current.getZoom() - zoom);
      if (dCenter > 0.001 || dZoom > 0.5) {
        map.current.flyTo({ center, zoom, duration: 800, essential: true });
      }
    }, [center, zoom]);

    // GPS marker + accuracy circle.
    useEffect(() => {
      const m = map.current;
      if (!m || !currentLocation) return;

      if (!userMarker.current) {
        const el = document.createElement('div');
        el.className = 'user-marker';
        userMarker.current = new maplibregl.Marker({ element: el })
          .setLngLat([currentLocation.lon, currentLocation.lat])
          .addTo(m);
      } else {
        userMarker.current.setLngLat([currentLocation.lon, currentLocation.lat]);
      }

      const apply = () => {
        if (!m) return;
        const data = buildAccuracyCircle(currentLocation.lon, currentLocation.lat, currentLocation.accuracy);
        const src = m.getSource('accuracy-source') as maplibregl.GeoJSONSource | undefined;
        if (src) { src.setData(data); return; }
        m.addSource('accuracy-source', { type: 'geojson', data });
        m.addLayer({ id: 'accuracy-layer', type: 'fill', source: 'accuracy-source', paint: { 'fill-color': '#4a9eff', 'fill-opacity': 0.15 } });
        m.addLayer({ id: 'accuracy-layer-outline', type: 'line', source: 'accuracy-source', paint: { 'line-color': '#4a9eff', 'line-width': 2 } });
      };
      if (m.isStyleLoaded()) apply(); else m.once('styledata', apply);
    }, [currentLocation]);

    return <div ref={mapContainer} className="map-container" role="region" aria-label="Map" />;
  }
);

MapView.displayName = 'MapView';

export default MapView;
