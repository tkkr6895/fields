import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { LocationData } from '../types';

function fromCapacitor(position: {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy?: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}): LocationData {
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
    altitude: position.coords.altitude ?? undefined,
    altitudeAccuracy: position.coords.altitudeAccuracy ?? undefined,
    heading: position.coords.heading ?? undefined,
    speed: position.coords.speed ?? undefined,
  };
}

export class GeoLocationService {
  private watchId: string | null = null;
  private lastPosition: LocationData | null = null;

  async requestPermission(): Promise<boolean> {
    try {
      const status = await Geolocation.requestPermissions();
      return status.location === 'granted' || status.coarseLocation === 'granted';
    } catch {
      return typeof navigator !== 'undefined' && 'geolocation' in navigator;
    }
  }

  async getCurrentPosition(): Promise<LocationData> {
    await this.requestPermission();
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
    const locationData = fromCapacitor(position);
    this.lastPosition = locationData;
    return locationData;
  }

  watchPosition(callback: (location: LocationData) => void): void {
    void this.requestPermission().then(() => {
      Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 2000,
        },
        (position, err) => {
          if (err || !position) {
            console.error('Watch position error:', err);
            return;
          }
          const locationData = fromCapacitor(position);
          this.lastPosition = locationData;
          callback(locationData);
        },
      ).then((id) => {
        this.watchId = id;
      });
    });
  }

  stopWatching(): void {
    if (this.watchId != null) {
      void Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
  }

  getLastPosition(): LocationData | null {
    return this.lastPosition;
  }

  static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  static calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
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

  static createBoundingBox(
    lat: number, lon: number, radiusMeters: number
  ): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
    const latDelta = (radiusMeters / 111320);
    const lonDelta = (radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180)));

    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLon: lon - lonDelta,
      maxLon: lon + lonDelta,
    };
  }
}
