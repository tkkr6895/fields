import type { LocationData } from '../types';

export class GeoLocationService {
  private watchId: number | null = null;
  private lastPosition: LocationData | null = null;

  async getCurrentPosition(): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData: LocationData = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          this.lastPosition = locationData;
          resolve(locationData);
        },
        (error) => {
          reject(this.handleError(error));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    });
  }

  watchPosition(callback: (location: LocationData) => void): void {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const locationData: LocationData = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        this.lastPosition = locationData;
        callback(locationData);
      },
      (error) => {
        console.error('Watch position error:', this.handleError(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    );
  }

  stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  getLastPosition(): LocationData | null {
    return this.lastPosition;
  }

  private handleError(error: GeolocationPositionError): Error {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return new Error('Location permission denied. Please enable GPS access.');
      case error.POSITION_UNAVAILABLE:
        return new Error('Location unavailable. Please check GPS settings.');
      case error.TIMEOUT:
        return new Error('Location request timed out. Please try again.');
      default:
        return new Error('Unknown location error');
    }
  }

  // Calculate distance between two points (Haversine formula)
  static calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  // Create a bounding box around a point
  static createBoundingBox(
    lat: number, lon: number, radiusMeters: number
  ): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
    const latDelta = (radiusMeters / 111320);
    const lonDelta = (radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180)));

    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLon: lon - lonDelta,
      maxLon: lon + lonDelta
    };
  }
}
