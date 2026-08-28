/** GPS quality gates for a hiking / survey track. */

export interface TrackSample {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
}

export const MIN_MOVE_M = 4;
export const MAX_ACCURACY_M = 65;
export const FIRST_FIX_ACCURACY_M = 120;
export const TELEPORT_MPS = 45;
export const REPLACE_IF_CLOSER_M = 6;

export function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Keep the best GPS sample, drop stationary jitter and impossible jumps. */
export function decidePoint(
  prev: TrackSample | undefined,
  next: TrackSample,
  isFirst: boolean,
): 'keep' | 'replace' | 'skip' {
  if (isFirst || !prev) {
    return next.accuracy <= FIRST_FIX_ACCURACY_M ? 'keep' : 'skip';
  }
  if (next.accuracy > MAX_ACCURACY_M && next.accuracy > prev.accuracy) return 'skip';

  const dt = Math.max(0.2, (next.timestamp - prev.timestamp) / 1000);
  const dist = haversineMeters(prev.lat, prev.lon, next.lat, next.lon);
  if (dist / dt > TELEPORT_MPS) return 'skip';

  if (dist < REPLACE_IF_CLOSER_M && next.accuracy + 1 < prev.accuracy) return 'replace';
  if (dist < MIN_MOVE_M) return 'skip';
  return 'keep';
}
