import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { decidePoint, haversineMeters } from './TrackFilter';
import type { FieldTrack, LocationData, TrackPoint } from '../types';

type Listener = (track: FieldTrack | null) => void;

function toPoint(loc: LocationData): TrackPoint {
  return {
    lat: loc.lat,
    lon: loc.lon,
    accuracy: loc.accuracy,
    altitude: loc.altitude,
    altitudeAccuracy: loc.altitudeAccuracy,
    speed: loc.speed,
    heading: loc.heading,
    timestamp: loc.timestamp || Date.now(),
    simulated: loc.simulated,
  };
}

class TrackRecorder {
  private track: FieldTrack | null = null;
  private listeners = new Set<Listener>();
  private running = false;
  private wake: WakeLockSentinel | null = null;
  private watchId: string | number | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.track);
    return () => this.listeners.delete(fn);
  }

  getActive(): FieldTrack | null {
    return this.track;
  }

  isRecording(): boolean {
    return this.track?.status === 'recording';
  }

  async restore(): Promise<FieldTrack | null> {
    if (!await db.ensureOpen()) return null;
    const openRows = await db.tracks.where('status').anyOf(['recording', 'paused']).toArray();
    const open = openRows.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (!open) return null;
    this.track = open;
    this.emit();
    if (open.status === 'recording') {
      await this.startWatcher();
    }
    return open;
  }

  async start(name?: string): Promise<FieldTrack> {
    if (this.track?.status === 'recording') return this.track;
    if (this.track?.status === 'paused') {
      this.track.status = 'recording';
      await this.save();
      await this.startWatcher();
      this.emit();
      return this.track;
    }

    const now = new Date();
    const stamp = now.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    this.track = {
      id: uuidv4(),
      name: name?.trim() || `Hike ${stamp}`,
      startedAt: now.toISOString(),
      status: 'recording',
      points: [],
      distanceM: 0,
      observationIds: [],
      tags: [],
    };
    await this.save();
    await this.startWatcher();
    this.emit();
    return this.track;
  }

  async pause(): Promise<void> {
    if (!this.track || this.track.status !== 'recording') return;
    this.track.status = 'paused';
    await this.stopWatcher();
    await this.save();
    this.emit();
  }

  async resume(): Promise<void> {
    if (!this.track || this.track.status !== 'paused') return;
    this.track.status = 'recording';
    await this.save();
    await this.startWatcher();
    this.emit();
  }

  async stop(): Promise<FieldTrack | null> {
    if (!this.track) return null;
    this.track.status = 'finished';
    this.track.endedAt = new Date().toISOString();
    await this.stopWatcher();
    await this.save();
    const done = this.track;
    this.track = null;
    this.emit();
    return done;
  }

  async attachObservation(observationId: string): Promise<void> {
    if (!this.track) return;
    if (!this.track.observationIds.includes(observationId)) {
      this.track.observationIds.push(observationId);
      await this.save();
      this.emit();
    }
  }

  ingest(loc: LocationData): void {
    if (!this.track || this.track.status !== 'recording') return;
    const next = toPoint(loc);
    const prev = this.track.points[this.track.points.length - 1];
    const decision = decidePoint(prev, next, this.track.points.length === 0);
    if (decision === 'skip') return;
    if (decision === 'replace' && prev) {
      this.track.points[this.track.points.length - 1] = next;
    } else {
      if (prev) this.track.distanceM += haversineMeters(prev.lat, prev.lon, next.lat, next.lon);
      this.track.points.push(next);
    }
    this.scheduleSave();
    this.emit();
  }

  private emit() {
    for (const fn of this.listeners) fn(this.track);
  }

  private scheduleSave() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.save();
    }, 1200);
  }

  private async save() {
    if (!this.track) return;
    if (!await db.ensureOpen()) return;
    await db.tracks.put(this.track);
  }

  private async startWatcher() {
    if (this.running) return;
    this.running = true;
    await this.requestWakeLock();

    try {
      await Geolocation.requestPermissions();
    } catch {
      /* web / already prompted */
    }

    if (Capacitor.isNativePlatform()) {
      try {
        await BackgroundGeolocation.start(
          {
            backgroundMessage: 'Recording your track on this phone. Stop from Fields when you are done.',
            backgroundTitle: 'Fields is recording',
            requestPermissions: true,
            stale: false,
            distanceFilter: 0,
          },
          (location, error) => {
            if (error || !location) return;
            this.ingest({
              lat: location.latitude,
              lon: location.longitude,
              accuracy: location.accuracy,
              altitude: location.altitude ?? undefined,
              altitudeAccuracy: location.altitudeAccuracy ?? undefined,
              heading: location.bearing ?? undefined,
              speed: location.speed ?? undefined,
              timestamp: location.time ?? Date.now(),
              simulated: location.simulated,
            });
          },
        );
        this.watchId = 'capgo';
        return;
      } catch (err) {
        console.warn('[TrackRecorder] background plugin unavailable, using foreground GPS', err);
      }
    }

    this.watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 },
      (position, err) => {
        if (err || !position) return;
        this.ingest({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude ?? undefined,
          altitudeAccuracy: position.coords.altitudeAccuracy ?? undefined,
          heading: position.coords.heading ?? undefined,
          speed: position.coords.speed ?? undefined,
          timestamp: position.timestamp,
        });
      },
    );
  }

  private async stopWatcher() {
    this.running = false;
    if (this.watchId === 'capgo') {
      try { await BackgroundGeolocation.stop(); } catch { /* ignore */ }
    } else if (this.watchId != null) {
      try { await Geolocation.clearWatch({ id: String(this.watchId) }); } catch { /* ignore */ }
    }
    this.watchId = null;
    await this.releaseWakeLock();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      await this.save();
    }
  }

  private async requestWakeLock() {
    try {
      if (navigator.wakeLock) this.wake = await navigator.wakeLock.request('screen');
    } catch {
      /* unsupported or denied */
    }
  }

  private async releaseWakeLock() {
    try { await this.wake?.release(); } catch { /* ignore */ }
    this.wake = null;
  }
}

export const trackRecorder = new TrackRecorder();
