import { Capacitor, registerPlugin, WebPlugin } from '@capacitor/core';
import { formatDistance, formatDuration } from './TrackExport';
import type { FieldTrack } from '../types';

export interface TrackStatusUpdate {
  title: string;
  body: string;
  recording: boolean;
  startedAt?: number;
}

interface TrackStatusPlugin {
  update(options: TrackStatusUpdate): Promise<void>;
  clear(): Promise<void>;
}

class TrackStatusWeb extends WebPlugin implements TrackStatusPlugin {
  async update(options: TrackStatusUpdate): Promise<void> {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification(options.title, { body: options.body, tag: 'fields-track', silent: true });
    } catch {
      /* ignored */
    }
  }

  async clear(): Promise<void> {
    /* browsers cannot retract a tag reliably */
  }
}

const TrackStatus = registerPlugin<TrackStatusPlugin>('TrackStatus', {
  web: () => Promise.resolve(new TrackStatusWeb()),
});

export function describeTrackStatus(track: FieldTrack): TrackStatusUpdate {
  const elapsed = Date.now() - new Date(track.startedAt).getTime();
  const notes = track.observationIds.length;
  const noteLabel = notes === 1 ? '1 note' : `${notes} notes`;
  const last = track.points[track.points.length - 1];
  const age = last ? Date.now() - last.timestamp : Number.POSITIVE_INFINITY;
  const gps = !last
    ? 'waiting for GPS'
    : age > 25000
      ? 'GPS searching'
      : last.accuracy != null
        ? `±${Math.round(last.accuracy)} m`
        : 'GPS ok';
  const recording = track.status === 'recording';
  const dist = formatDistance(track.distanceM);
  return {
    title: recording ? `Fields · ${dist}` : `Paused · ${dist}`,
    body: `${formatDuration(elapsed)} · ${noteLabel} · ${gps}`,
    recording,
    startedAt: recording ? new Date(track.startedAt).getTime() : undefined,
  };
}

export async function showTrackStatus(track: FieldTrack): Promise<void> {
  try {
    await TrackStatus.update(describeTrackStatus(track));
  } catch {
    /* permission or web */
  }
}

export async function clearTrackStatus(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await TrackStatus.clear();
  } catch {
    /* ignored */
  }
}
