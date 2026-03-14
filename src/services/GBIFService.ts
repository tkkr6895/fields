/**
 * GBIFService — Query GBIF occurrence data for the Western Ghats region
 * to suggest possible species sightings and improve data collection quality.
 *
 * Addresses mentor feedback:
 * "GBIF data from the region can in fact be used to suggest possible sightings
 *  to improve the quality of data being collected."
 *
 * Uses the GBIF public API (no key required for occurrence search).
 * https://www.gbif.org/developer/occurrence
 */

export interface GBIFOccurrence {
  key: number;
  scientificName: string;
  vernacularName?: string;
  species?: string;
  genus?: string;
  family?: string;
  order?: string;
  kingdom?: string;
  decimalLatitude?: number;
  decimalLongitude?: number;
  year?: number;
  month?: number;
  basisOfRecord?: string;
  iucnRedListCategory?: string;
  media?: { identifier?: string; type?: string }[];
}

export interface GBIFSpeciesSuggestion {
  scientificName: string;
  commonName?: string;
  family?: string;
  kingdom?: string;
  occurrenceCount: number;
  lastObserved?: number; // year
  iucnStatus?: string;
  thumbnailUrl?: string;
  gbifTaxonKey?: number;
}

export interface GBIFSearchParams {
  lat: number;
  lon: number;
  radiusKm?: number; // default 5
  kingdom?: 'Plantae' | 'Animalia' | 'Fungi';
  limit?: number; // default 20
}

const GBIF_API_BASE = 'https://api.gbif.org/v1';

class GBIFService {
  private cache = new Map<string, { data: GBIFSpeciesSuggestion[]; timestamp: number }>();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Get species suggestions near a location from GBIF occurrence data.
   * Groups occurrences by species and returns a ranked list.
   */
  async getSuggestionsNearby(params: GBIFSearchParams): Promise<GBIFSpeciesSuggestion[]> {
    const { lat, lon, radiusKm = 5, kingdom, limit = 20 } = params;

    const cacheKey = `${lat.toFixed(3)}_${lon.toFixed(3)}_${radiusKm}_${kingdom || 'all'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data.slice(0, limit);
    }

    try {
      const searchParams = new URLSearchParams({
        decimalLatitude: `${(lat - radiusKm / 111).toFixed(4)},${(lat + radiusKm / 111).toFixed(4)}`,
        decimalLongitude: `${(lon - radiusKm / (111 * Math.cos(lat * Math.PI / 180))).toFixed(4)},${(lon + radiusKm / (111 * Math.cos(lat * Math.PI / 180))).toFixed(4)}`,
        hasCoordinate: 'true',
        hasGeospatialIssue: 'false',
        limit: '300', // Fetch more to aggregate
      });
      if (kingdom) searchParams.set('kingdom', kingdom);

      const response = await fetch(`${GBIF_API_BASE}/occurrence/search?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error(`GBIF API error: ${response.status}`);
      }

      const data = await response.json();
      const occurrences: GBIFOccurrence[] = data.results || [];

      // Aggregate by species
      const speciesMap = new Map<string, {
        scientificName: string;
        commonName?: string;
        family?: string;
        kingdom?: string;
        count: number;
        lastYear?: number;
        iucnStatus?: string;
        thumbnail?: string;
        taxonKey?: number;
      }>();

      for (const occ of occurrences) {
        const name = occ.species || occ.scientificName;
        if (!name) continue;

        const existing = speciesMap.get(name);
        if (existing) {
          existing.count++;
          if (occ.year && (!existing.lastYear || occ.year > existing.lastYear)) {
            existing.lastYear = occ.year;
          }
        } else {
          speciesMap.set(name, {
            scientificName: name,
            commonName: occ.vernacularName,
            family: occ.family,
            kingdom: occ.kingdom,
            count: 1,
            lastYear: occ.year,
            iucnStatus: occ.iucnRedListCategory,
            thumbnail: occ.media?.[0]?.identifier,
            taxonKey: occ.key,
          });
        }
      }

      // Sort by occurrence count (most common first)
      const suggestions: GBIFSpeciesSuggestion[] = Array.from(speciesMap.values())
        .sort((a, b) => b.count - a.count)
        .map(s => ({
          scientificName: s.scientificName,
          commonName: s.commonName,
          family: s.family,
          kingdom: s.kingdom,
          occurrenceCount: s.count,
          lastObserved: s.lastYear,
          iucnStatus: s.iucnStatus,
          thumbnailUrl: s.thumbnail,
          gbifTaxonKey: s.taxonKey,
        }));

      this.cache.set(cacheKey, { data: suggestions, timestamp: Date.now() });
      return suggestions.slice(0, limit);
    } catch (err) {
      console.warn('[GBIFService] Failed to fetch suggestions:', err);
      return [];
    }
  }

  /**
   * Search GBIF species by name (autocomplete).
   */
  async searchSpecies(query: string, limit = 10): Promise<GBIFSpeciesSuggestion[]> {
    if (!query || query.length < 2) return [];

    try {
      const response = await fetch(
        `${GBIF_API_BASE}/species/suggest?q=${encodeURIComponent(query)}&limit=${limit}`
      );
      if (!response.ok) return [];

      const results = await response.json();
      return (results || []).map((r: any) => ({
        scientificName: r.scientificName || r.canonicalName || query,
        commonName: r.vernacularName,
        family: r.family,
        kingdom: r.kingdom,
        occurrenceCount: 0,
        gbifTaxonKey: r.key,
      }));
    } catch (err) {
      console.warn('[GBIFService] Species search failed:', err);
      return [];
    }
  }

  /**
   * Clear the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const gbifService = new GBIFService();
