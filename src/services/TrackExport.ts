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
      kind: 'track',
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

export function exportTrackPointsToCSV(tracks: FieldTrack[]): string {
  const headers = [
    'track_id', 'track_name', 'seq', 'timestamp', 'iso_time',
    'lat', 'lon', 'accuracy_m', 'altitude_m', 'speed_mps', 'heading_deg', 'simulated',
  ];
  const rows = tracks.flatMap((track) =>
    track.points.map((p, seq) => [
      track.id,
      `"${track.name.replace(/"/g, '""')}"`,
      seq + 1,
      p.timestamp,
      iso(p.timestamp),
      p.lat.toFixed(7),
      p.lon.toFixed(7),
      p.accuracy,
      p.altitude ?? '',
      p.speed ?? '',
      p.heading ?? '',
      p.simulated ? 1 : 0,
    ].join(','))
  );
  return [headers.join(','), ...rows].join('\n');
}

export function exportFieldGeoJSON(tracks: FieldTrack[], notes: Observation[]): string {
  const trackFeatures: GeoJSON.Feature[] = JSON.parse(exportTracksToGeoJSON(tracks)).features;
  const noteFeatures: GeoJSON.Feature[] = notes.map((obs) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: obs.location.altitude != null
        ? [obs.location.lon, obs.location.lat, obs.location.altitude]
        : [obs.location.lon, obs.location.lat],
    },
    properties: {
      kind: 'note',
      id: obs.id,
      timestamp: obs.timestamp,
      observation_type: obs.observationType || 'note',
      tags: (obs.tags || []).join('|'),
      notes: obs.notes,
      accuracy_m: obs.location.accuracy,
      track_id: obs.trackId ?? null,
      species: obs.fieldData?.dominantSpecies ?? null,
      forest_type: obs.fieldData?.forest?.type ?? null,
      photo: obs.image?.blobId ? `images/${obs.image.blobId}.jpg` : null,
    },
  }));
  return JSON.stringify({ type: 'FeatureCollection', features: [...trackFeatures, ...noteFeatures] }, null, 2);
}

export function exportPackReadme(trackCount: number, noteCount: number, imageCount: number): string {
  return `Fields export
=============
${new Date().toISOString()}
${trackCount} track(s), ${noteCount} note(s), ${imageCount} photo(s)

Open in analysis tools
- QGIS / ArcGIS: field.geojson (tracks as lines, notes as points)
- Gaia / Google Earth / Garmin: tracks.gpx
- Spreadsheet / R / pandas: observations.csv and tracks.csv (one GPS fix per row)
- Raw: observations.json

tracks.csv columns: track_id, seq, iso_time, lat, lon, accuracy_m, altitude_m, speed_mps, heading_deg
Photos are in images/ and named by the photo id in observations.csv / field.geojson.

Coordinates are WGS84. accuracy_m is the phone's reported 68% horizontal error.
`;
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
