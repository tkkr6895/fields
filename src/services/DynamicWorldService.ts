/**
 * Dynamic World Service
 * 
 * Provides access to Dynamic World LULC data.
 * Uses local cached data when offline, fetches from API when online.
 */

// Dynamic World land cover classes
export const DW_CLASSES = {
  0: { name: 'Water', color: '#419BDF' },
  1: { name: 'Trees', color: '#397D49' },
  2: { name: 'Grass', color: '#88B053' },
  3: { name: 'Flooded Vegetation', color: '#7A87C6' },
  4: { name: 'Crops', color: '#E49635' },
  5: { name: 'Shrub and Scrub', color: '#DFC35A' },
  6: { name: 'Built', color: '#C4281B' },
  7: { name: 'Bare', color: '#A59B8F' },
  8: { name: 'Snow and Ice', color: '#B39FE1' }
} as const;

export interface DynamicWorldData {
  year: number;
  month: string;
  water: number;
  trees: number;
  grass: number;
  floodedVegetation: number;
  crops: number;
  shrubAndScrub: number;
  built: number;
  bare: number;
  snowAndIce: number;
}

export interface DynamicWorldPointData {
  lat: number;
  lon: number;
  timestamp: string;
  landCoverClass: string;
  confidence: number;
  probabilities: Record<string, number>;
}

class DynamicWorldService {
  private cachedData: DynamicWorldData[] = [];
  private isOnline: boolean = navigator.onLine;
  private dataLoaded: boolean = false;

  constructor() {
    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);
  }

  /**
   * Load cached Dynamic World data from local files
   */
  async loadCachedData(): Promise<void> {
    if (this.dataLoaded) return;

    try {
      const response = await fetch('/data/dynamicworld/wg_dynamic_world_2018_2025.csv');
      if (!response.ok) {
        console.warn('Dynamic World data not found locally');
        return;
      }

      const text = await response.text();
      const lines = text.trim().split('\n');
      // First line is header, skip it

      this.cachedData = lines.slice(1).map(line => {
        const values = line.split(',');
        return {
          year: parseInt(values[0]),
          month: values[2],
          water: parseFloat(values[3]),
          trees: parseFloat(values[4]),
          grass: parseFloat(values[5]),
          floodedVegetation: parseFloat(values[6]),
          crops: parseFloat(values[7]),
          shrubAndScrub: parseFloat(values[8]),
          built: parseFloat(values[9]),
          bare: parseFloat(values[10]),
          snowAndIce: parseFloat(values[11])
        };
      });

      this.dataLoaded = true;
      console.log(`Loaded ${this.cachedData.length} Dynamic World records`);
    } catch (error) {
      console.error('Failed to load Dynamic World data:', error);
    }
  }

  /**
   * Get regional Dynamic World statistics for a year
   */
  getRegionalStats(year?: number): DynamicWorldData | null {
    if (!this.dataLoaded || this.cachedData.length === 0) return null;

    if (year) {
      return this.cachedData.find(d => d.year === year) || null;
    }

    // Return most recent year
    return this.cachedData[this.cachedData.length - 1];
  }

  /**
   * Get all available years
   */
  getAvailableYears(): number[] {
    return this.cachedData.map(d => d.year);
  }

  /**
   * Get time series data for a specific land cover class
   */
  getTimeSeries(className: keyof Omit<DynamicWorldData, 'year' | 'month'>): Array<{ year: number; value: number }> {
    return this.cachedData.map(d => ({
      year: d.year,
      value: d[className] as number
    }));
  }

  /**
   * Get change statistics between two years
   */
  getChangeStats(startYear: number, endYear: number): Record<string, { start: number; end: number; change: number; percentChange: number }> | null {
    const startData = this.cachedData.find(d => d.year === startYear);
    const endData = this.cachedData.find(d => d.year === endYear);

    if (!startData || !endData) return null;

    const classes = ['water', 'trees', 'grass', 'floodedVegetation', 'crops', 'shrubAndScrub', 'built', 'bare', 'snowAndIce'] as const;
    
    const result: Record<string, { start: number; end: number; change: number; percentChange: number }> = {};
    
    for (const cls of classes) {
      const start = startData[cls];
      const end = endData[cls];
      result[cls] = {
        start,
        end,
        change: end - start,
        percentChange: ((end - start) / start) * 100
      };
    }

    return result;
  }

  /**
   * Fetch Dynamic World data for a specific point (requires online + GEE setup)
   * This is a placeholder for future GEE API integration
   */
  async fetchPointData(lat: number, lon: number, date?: string): Promise<DynamicWorldPointData | null> {
    if (!this.isOnline) {
      console.warn('Cannot fetch Dynamic World point data: offline');
      return null;
    }

    // NOTE: This would require a backend proxy to GEE or use of GEE's REST API
    // For now, we return estimated data based on regional statistics
    const latestStats = this.getRegionalStats();
    if (!latestStats) return null;

    // Calculate dominant class from regional stats
    const classes = {
      'Water': latestStats.water,
      'Trees': latestStats.trees,
      'Grass': latestStats.grass,
      'Flooded Vegetation': latestStats.floodedVegetation,
      'Crops': latestStats.crops,
      'Shrub and Scrub': latestStats.shrubAndScrub,
      'Built': latestStats.built,
      'Bare': latestStats.bare,
      'Snow and Ice': latestStats.snowAndIce
    };

    const total = Object.values(classes).reduce((a, b) => a + b, 0);
    const probabilities: Record<string, number> = {};
    let dominantClass = 'Trees';
    let maxProb = 0;

    for (const [cls, area] of Object.entries(classes)) {
      const prob = area / total;
      probabilities[cls] = prob;
      if (prob > maxProb) {
        maxProb = prob;
        dominantClass = cls;
      }
    }

    return {
      lat,
      lon,
      timestamp: date || new Date().toISOString(),
      landCoverClass: dominantClass,
      confidence: maxProb,
      probabilities
    };
  }

  /**
   * Get summary for display in location panel
   */
  getSummaryForLocation(): Record<string, unknown> {
    const latest = this.getRegionalStats();
    if (!latest) return { status: 'No Dynamic World data available' };

    const changeStats = this.getChangeStats(2018, latest.year);
    
    return {
      source: 'Dynamic World (Google)',
      year: latest.year,
      month: latest.month,
      landCover: {
        trees: `${latest.trees.toFixed(1)} km²`,
        crops: `${latest.crops.toFixed(1)} km²`,
        built: `${latest.built.toFixed(1)} km²`,
        shrubAndScrub: `${latest.shrubAndScrub.toFixed(1)} km²`
      },
      changesSince2018: changeStats ? {
        trees: `${changeStats.trees.percentChange > 0 ? '+' : ''}${changeStats.trees.percentChange.toFixed(1)}%`,
        built: `${changeStats.built.percentChange > 0 ? '+' : ''}${changeStats.built.percentChange.toFixed(1)}%`,
        crops: `${changeStats.crops.percentChange > 0 ? '+' : ''}${changeStats.crops.percentChange.toFixed(1)}%`
      } : null
    };
  }
}

export const dynamicWorldService = new DynamicWorldService();
