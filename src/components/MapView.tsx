/**
 * MapView — satellite/dark basemap, IndiaSAT/CoRE WMS tiles, imported AOIs,
 * GPS, and field-note markers.
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
import type { CustomLayer, DatasetLayer, LocationData } from '../types';
import { isWmsBboxTemplate, maplibreWmsTileUrl, resolveWmsTileUrl } from '../services/wmsTiles';

export interface MapClickInfo {
  features: Array<{ datasetLayerId: string; properties: Record<string, unknown> }>;
}

export interface NoteMarker {
  id: string;
  lat: number;
  lon: number;
}

interface MapViewProps {
  center: [number, number];
  zoom: number;
  basemap: 'dark' | 'satellite';
  layers: DatasetLayer[];
  activeLayers: Set<string>;
  currentLocation: LocationData | null;
  aoiLayers?: CustomLayer[];
  noteMarkers?: NoteMarker[];
  trackPoints?: Array<{ lat: number; lon: number }>;
  onMapMove: (center: [number, number], zoom: number) => void;
  onMapClick?: (lat: number, lon: number, info?: MapClickInfo) => void;
}

export interface MapViewRef {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (center: [number, number], zoom?: number) => void;
  resetView: () => void;
  fitBounds: (b: { west: number; south: number; east: number; north: number }, pad?: number) => void;
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
  layers: [
    { id: 'canvas', type: 'background', paint: { 'background-color': '#12161c' } },
    { id: 'carto-dark', type: 'raster', source: 'carto-dark' },
  ],
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
  layers: [
    { id: 'canvas', type: 'background', paint: { 'background-color': '#1a2a1a' } },
    { id: 'esri-satellite', type: 'raster', source: 'esri-satellite' },
  ],
};

const DEFAULT_CENTER: [number, number] = [75.5, 13.0];
const DEFAULT_ZOOM = 8;

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

function tilePathForLayer(layer: DatasetLayer): string {
  const path = layer.source.path;
  if (isWmsBboxTemplate(path) && path.includes('{bbox-epsg-3857}')) {
    return maplibreWmsTileUrl(path);
  }
  return path;
}

const MapView = forwardRef<MapViewRef, MapViewProps>(
  ({ center, zoom, basemap, layers, activeLayers, currentLocation, aoiLayers = [], noteMarkers = [], trackPoints = [], onMapMove, onMapClick }, ref) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const userMarker = useRef<maplibregl.Marker | null>(null);

    const activeLayersRef = useRef<Set<string>>(activeLayers);
    const onMapMoveRef = useRef(onMapMove);
    const onMapClickRef = useRef(onMapClick);
    const aoiRef = useRef(aoiLayers);
    const notesRef = useRef(noteMarkers);
    const trackRef = useRef(trackPoints);

    useEffect(() => { activeLayersRef.current = activeLayers; }, [activeLayers]);
    useEffect(() => { onMapMoveRef.current = onMapMove; }, [onMapMove]);
    useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
    useEffect(() => { aoiRef.current = aoiLayers; }, [aoiLayers]);
    useEffect(() => { notesRef.current = noteMarkers; }, [noteMarkers]);
    useEffect(() => { trackRef.current = trackPoints; }, [trackPoints]);

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
      fitBounds: (b, pad = 48) => {
        map.current?.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: pad, duration: 800, maxZoom: 15 });
      },
    }), []);

    const syncAoiAndNotes = useCallback(() => {
      const m = map.current;
      if (!m || !m.isStyleLoaded()) return;

      const aoiFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: aoiRef.current.flatMap((layer) =>
          (layer.geojsonData?.features || []).map((f) => ({
            ...f,
            properties: { ...(f.properties || {}), _aoi: layer.title },
          }))
        ),
      };
      const aoiSrc = m.getSource('aoi-source') as maplibregl.GeoJSONSource | undefined;
      if (aoiSrc) aoiSrc.setData(aoiFc);
      else {
        m.addSource('aoi-source', { type: 'geojson', data: aoiFc });
        m.addLayer({
          id: 'aoi-fill',
          type: 'fill',
          source: 'aoi-source',
          filter: ['in', '$type', 'Polygon', 'MultiPolygon'],
          paint: { 'fill-color': '#4caf50', 'fill-opacity': 0.12 },
        });
        m.addLayer({
          id: 'aoi-line',
          type: 'line',
          source: 'aoi-source',
          paint: { 'line-color': '#81c784', 'line-width': 2 },
        });
        m.addLayer({
          id: 'aoi-pts',
          type: 'circle',
          source: 'aoi-source',
          filter: ['in', '$type', 'Point', 'MultiPoint'],
          paint: { 'circle-radius': 5, 'circle-color': '#81c784', 'circle-stroke-width': 1, 'circle-stroke-color': '#0a0a12' },
        });
      }

      const notesFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: notesRef.current.map((n) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
          properties: { id: n.id },
        })),
      };
      const nSrc = m.getSource('notes-source') as maplibregl.GeoJSONSource | undefined;
      if (nSrc) nSrc.setData(notesFc);
      else {
        m.addSource('notes-source', { type: 'geojson', data: notesFc });
        m.addLayer({
          id: 'notes-dots',
          type: 'circle',
          source: 'notes-source',
          paint: {
            'circle-radius': 6,
            'circle-color': '#ffd54f',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0a0a12',
          },
        });
      }

      const line: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: trackRef.current.map((p) => [p.lon, p.lat]),
        },
        properties: {},
      };
      const trackFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: line.geometry.coordinates.length >= 2 ? [line] : [],
      };
      const tSrc = m.getSource('track-source') as maplibregl.GeoJSONSource | undefined;
      if (tSrc) tSrc.setData(trackFc);
      else {
        m.addSource('track-source', { type: 'geojson', data: trackFc });
        m.addLayer({
          id: 'track-halo',
          type: 'line',
          source: 'track-source',
          paint: { 'line-color': '#0a0a12', 'line-width': 7, 'line-opacity': 0.45 },
        });
        m.addLayer({
          id: 'track-line',
          type: 'line',
          source: 'track-source',
          paint: { 'line-color': '#ff6b6b', 'line-width': 3.5, 'line-opacity': 0.95 },
        });
      }
    }, []);

    const syncRasterLayers = useCallback(() => {
      const m = map.current;
      if (!m) return;
      if (!m.isStyleLoaded()) {
        m.once('styledata', () => { syncRasterLayers(); syncAoiAndNotes(); });
        return;
      }

      const wantedSources = new Set(layers.map(l => `source-${l.id}`));
      const style = m.getStyle();
      for (const srcId of Object.keys(style?.sources || {})) {
        if (!srcId.startsWith('source-')) continue;
        if (srcId === 'source-aoi' || srcId === 'notes-source') continue;
        if (!wantedSources.has(srcId)) {
          const layerId = srcId.replace('source-', 'layer-');
          try {
            if (m.getLayer(layerId)) m.removeLayer(layerId);
            if (m.getSource(srcId)) m.removeSource(srcId);
          } catch {
            /* style may already have dropped it */
          }
        }
      }

      for (const layer of layers) {
        if (layer.type === 'image-overlay' && layer.bounds) {
          const sourceId = `source-${layer.id}`;
          const layerId = `layer-${layer.id}`;
          const isActive = activeLayers.has(layer.id);
          try {
            if (!m.getSource(sourceId)) {
              const { west, south, east, north } = layer.bounds;
              m.addSource(sourceId, {
                type: 'image',
                url: layer.source.path,
                coordinates: [
                  [west, north],
                  [east, north],
                  [east, south],
                  [west, south],
                ],
              });
              m.addLayer({
                id: layerId,
                type: 'raster',
                source: sourceId,
                paint: { 'raster-opacity': layer.style?.opacity ?? 0.72, 'raster-fade-duration': 0 },
                layout: { visibility: isActive ? 'visible' : 'none' },
              });
            } else if (m.getLayer(layerId)) {
              m.setLayoutProperty(layerId, 'visibility', isActive ? 'visible' : 'none');
            }
          } catch (err) {
            console.warn(`Failed to add image overlay ${layer.id}:`, err);
          }
          continue;
        }

        if (layer.type !== 'raster' || layer.source.format !== 'xyz') continue;
        const tile = tilePathForLayer(layer);
        if (!tile || tile.startsWith('dynamicworld://') || tile.startsWith('indiasat://')) continue;
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
      syncAoiAndNotes();
    }, [layers, activeLayers, syncAoiAndNotes]);

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
        transformRequest: (url) => {
          const wms = resolveWmsTileUrl(url);
          return wms ? { url: wms } : { url };
        },
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

    useEffect(() => {
      if (!map.current) return;
      map.current.setStyle(basemap === 'dark' ? DARK_STYLE : SATELLITE_STYLE);
      map.current.once('styledata', () => syncRasterLayers());
    }, [basemap, syncRasterLayers]);

    useEffect(() => { syncRasterLayers(); }, [syncRasterLayers]);
    useEffect(() => { syncAoiAndNotes(); }, [aoiLayers, noteMarkers, trackPoints, syncAoiAndNotes]);

    useEffect(() => {
      if (!map.current) return;
      const c = map.current.getCenter();
      const dCenter = Math.abs(c.lng - center[0]) + Math.abs(c.lat - center[1]);
      const dZoom = Math.abs(map.current.getZoom() - zoom);
      if (dCenter > 0.001 || dZoom > 0.5) {
        map.current.flyTo({ center, zoom, duration: 800, essential: true });
      }
    }, [center, zoom]);

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
