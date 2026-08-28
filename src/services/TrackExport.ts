import type { FieldTrack, Observation } from '../types';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function iso(ms: number | string): string {
  const d = typeof ms === 'number' ? new Date(ms) : new Date(ms);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** GPX 1.1: tracks as <trk>, field notes as <wpt>. Opens in Gaia, QGIS, Google Earth. */
export function exportTracksToGPX(tracks: FieldTrack[], notes: Observation[] = []): string {
  const trks = tracks.map((track) => {
    const pts = track.points
      .map((p) => {
        const ele = p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : '';
        const acc = p.accuracy != null ? `<hdop>${Math.max(0.5, p.accuracy / 5).toFixed(1)}</hdop>` : '';
        return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${iso(p.timestamp)}</time>${acc}</trkpt>`;
      })
      .join('\n');
    return `  <trk>
    <name>${xmlEscape(track.name)}</name>
    <desc>${xmlEscape(`${Math.round(track.distanceM)} m · ${track.points.length} fixes · ±GPS`)}</desc>
    <trkseg>
${pts}
    </trkseg>
  </trk>`;
  }).join('\n');

  const wpts = notes.map((obs) => {
    const name = obs.fieldData?.dominantSpecies || obs.tags?.[0] || obs.observationType || 'note';
    const desc = [obs.notes, obs.tags?.join(', ')].filter(Boolean).join(' — ');
    const ele = obs.location.altitude != null ? `<ele>${obs.location.altitude.toFixed(1)}</ele>` : '';
    return `  <wpt lat="${obs.location.lat.toFixed(7)}" lon="${obs.location.lon.toFixed(7)}">
    ${ele}<time>${iso(obs.timestamp)}</time>
    <name>${xmlEscape(name)}</name>
    <desc>${xmlEscape(desc)}</desc>
    <type>${xmlEscape(obs.observationType || 'note')}</type>
  </wpt>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fields" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Fields export</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${wpts}
${trks}
</gpx>
`;
}

export function exportTracksToGeoJSON(tracks: FieldTrack[]): string {
  const features: GeoJSON.Feature[] = tracks.map((track) => ({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: track.points.map((p) => (
        p.altitude != null ? [p.lon, p.lat, p.altitude] : [p.lon, p.lat]
      )),
    },
    properties: {
      id: track.id,
      name: track.name,
      startedAt: track.startedAt,
      endedAt: track.endedAt ?? null,
      status: track.status,
      distance_m: Math.round(track.distanceM * 10) / 10,
      point_count: track.points.length,
      tags: track.tags ?? [],
      notes: track.notes ?? '',
    },
  }));

  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
