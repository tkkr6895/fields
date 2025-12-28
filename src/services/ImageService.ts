import exifr from 'exifr';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { ExifData, ImageData } from '../types';

export class ImageService {
  
  async processImage(file: File | Blob): Promise<ImageData> {
    // Generate unique ID for the image
    const blobId = uuidv4();
    
    // Extract EXIF data
    const exif = await this.extractExif(file);
    
    // Store the blob in IndexedDB
    await db.images.add({
      id: blobId,
      blob: file as Blob,
      createdAt: new Date().toISOString()
    });
    
    // Generate thumbnail
    const thumbnail = await this.generateThumbnail(file);
    
    return {
      blobId,
      exif,
      thumbnail
    };
  }

  async extractExif(file: File | Blob): Promise<ExifData> {
    try {
      console.log('[ImageService] Extracting EXIF from file:', file.type, file.size);
      
      const exifData = await exifr.parse(file, {
        gps: true,
        xmp: false,
        icc: false,
        iptc: false,
        jfif: false,
        ihdr: false,
        pick: [
          'DateTimeOriginal', 'CreateDate', 'ModifyDate',
          'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
          'Orientation', 'Make', 'Model'
        ]
      });

      console.log('[ImageService] Raw EXIF data:', exifData);

      if (!exifData) {
        console.log('[ImageService] No EXIF data found in image');
        return {};
      }

      const result: ExifData = {};

      // Parse timestamp
      const timestamp = exifData.DateTimeOriginal || exifData.CreateDate || exifData.ModifyDate;
      if (timestamp) {
        result.timestamp = timestamp instanceof Date 
          ? timestamp.toISOString() 
          : String(timestamp);
      }

      // Parse GPS coordinates
      if (exifData.latitude !== undefined && exifData.longitude !== undefined) {
        console.log('[ImageService] Found GPS via latitude/longitude:', exifData.latitude, exifData.longitude);
        result.lat = exifData.latitude;
        result.lon = exifData.longitude;
      } else if (exifData.GPSLatitude !== undefined && exifData.GPSLongitude !== undefined) {
        console.log('[ImageService] Found GPS via GPSLatitude/GPSLongitude:', exifData.GPSLatitude, exifData.GPSLongitude);
        result.lat = exifData.GPSLatitude;
        result.lon = exifData.GPSLongitude;
      } else {
        console.log('[ImageService] No GPS coordinates found in EXIF');
      }

      // Parse orientation
      if (exifData.Orientation) {
        result.orientation = exifData.Orientation;
      }

      // Parse camera info
      if (exifData.Make || exifData.Model) {
        result.make = exifData.Make;
        result.camera = exifData.Model;
      }

      return result;
    } catch (error) {
      console.warn('EXIF extraction failed:', error);
      return {};
    }
  }

  async generateThumbnail(file: File | Blob, maxSize: number = 800): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Calculate dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  async getImageUrl(blobId: string): Promise<string | null> {
    const record = await db.images.get(blobId);
    if (!record) return null;
    return URL.createObjectURL(record.blob);
  }

  async getImageBlob(blobId: string): Promise<Blob | null> {
    const record = await db.images.get(blobId);
    if (!record) return null;
    return record.blob;
  }

  async captureFromCamera(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // Use rear camera

      input.onchange = (e) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        resolve(file || null);
      };

      input.click();
    });
  }

  async selectFromGallery(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = (e) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        resolve(file || null);
      };

      input.click();
    });
  }
}

export const imageService = new ImageService();
