/**
 * Place Gazetteer Service
 * 
 * Provides offline place search for Karnataka and Western Ghats region.
 * Uses a local gazetteer with common places, and falls back to Nominatim API when online.
 */

export interface PlaceResult {
  id: string;
  name: string;
  displayName: string;
  type: 'city' | 'town' | 'village' | 'district' | 'taluk' | 'landmark' | 'natural';
  lat: number;
  lon: number;
  state?: string;
  district?: string;
  importance: number;
}

// Karnataka districts with approximate centers
const KARNATAKA_DISTRICTS: PlaceResult[] = [
  { id: 'dk', name: 'Dakshina Kannada', displayName: 'Dakshina Kannada, Karnataka', type: 'district', lat: 12.8438, lon: 75.2479, state: 'Karnataka', importance: 0.9 },
  { id: 'uk', name: 'Uttara Kannada', displayName: 'Uttara Kannada, Karnataka', type: 'district', lat: 14.6819, lon: 74.6899, state: 'Karnataka', importance: 0.9 },
  { id: 'udupi', name: 'Udupi', displayName: 'Udupi, Karnataka', type: 'district', lat: 13.3409, lon: 74.7421, state: 'Karnataka', importance: 0.9 },
  { id: 'shimoga', name: 'Shimoga', displayName: 'Shimoga, Karnataka', type: 'district', lat: 13.9299, lon: 75.5681, state: 'Karnataka', importance: 0.9 },
  { id: 'chikmagalur', name: 'Chikmagalur', displayName: 'Chikmagalur, Karnataka', type: 'district', lat: 13.3161, lon: 75.7720, state: 'Karnataka', importance: 0.9 },
  { id: 'hassan', name: 'Hassan', displayName: 'Hassan, Karnataka', type: 'district', lat: 13.0068, lon: 76.1003, state: 'Karnataka', importance: 0.9 },
  { id: 'kodagu', name: 'Kodagu', displayName: 'Kodagu (Coorg), Karnataka', type: 'district', lat: 12.4244, lon: 75.7382, state: 'Karnataka', importance: 0.9 },
  { id: 'mysore', name: 'Mysore', displayName: 'Mysore, Karnataka', type: 'district', lat: 12.2958, lon: 76.6394, state: 'Karnataka', importance: 0.95 },
  { id: 'bangalore', name: 'Bangalore', displayName: 'Bangalore, Karnataka', type: 'district', lat: 12.9716, lon: 77.5946, state: 'Karnataka', importance: 1.0 },
  { id: 'belgaum', name: 'Belgaum', displayName: 'Belgaum, Karnataka', type: 'district', lat: 15.8497, lon: 74.4977, state: 'Karnataka', importance: 0.9 },
  { id: 'dharwad', name: 'Dharwad', displayName: 'Dharwad, Karnataka', type: 'district', lat: 15.4589, lon: 75.0078, state: 'Karnataka', importance: 0.9 },
  { id: 'haveri', name: 'Haveri', displayName: 'Haveri, Karnataka', type: 'district', lat: 14.7951, lon: 75.3991, state: 'Karnataka', importance: 0.85 },
  { id: 'chamrajnagar', name: 'Chamarajanagar', displayName: 'Chamarajanagar, Karnataka', type: 'district', lat: 11.9261, lon: 76.9437, state: 'Karnataka', importance: 0.85 },
  { id: 'mandya', name: 'Mandya', displayName: 'Mandya, Karnataka', type: 'district', lat: 12.5218, lon: 76.8951, state: 'Karnataka', importance: 0.85 },
  { id: 'ramanagara', name: 'Ramanagara', displayName: 'Ramanagara, Karnataka', type: 'district', lat: 12.7159, lon: 77.2819, state: 'Karnataka', importance: 0.8 },
];

// Major towns and cities in Karnataka (especially Western Ghats region)
const KARNATAKA_TOWNS: PlaceResult[] = [
  // Dakshina Kannada
  { id: 'mangalore', name: 'Mangalore', displayName: 'Mangalore, Dakshina Kannada', type: 'city', lat: 12.9141, lon: 74.8560, district: 'Dakshina Kannada', state: 'Karnataka', importance: 0.95 },
  { id: 'puttur', name: 'Puttur', displayName: 'Puttur, Dakshina Kannada', type: 'town', lat: 12.7596, lon: 75.2025, district: 'Dakshina Kannada', state: 'Karnataka', importance: 0.7 },
  { id: 'sullia', name: 'Sullia', displayName: 'Sullia, Dakshina Kannada', type: 'town', lat: 12.5610, lon: 75.3871, district: 'Dakshina Kannada', state: 'Karnataka', importance: 0.65 },
  { id: 'bantwal', name: 'Bantwal', displayName: 'Bantwal, Dakshina Kannada', type: 'town', lat: 12.8914, lon: 75.0345, district: 'Dakshina Kannada', state: 'Karnataka', importance: 0.7 },
  { id: 'belthangady', name: 'Belthangady', displayName: 'Belthangady, Dakshina Kannada', type: 'town', lat: 12.9833, lon: 75.3000, district: 'Dakshina Kannada', state: 'Karnataka', importance: 0.65 },
  
  // Udupi
  { id: 'udupi_city', name: 'Udupi', displayName: 'Udupi City, Udupi', type: 'city', lat: 13.3409, lon: 74.7421, district: 'Udupi', state: 'Karnataka', importance: 0.85 },
  { id: 'kundapura', name: 'Kundapura', displayName: 'Kundapura, Udupi', type: 'town', lat: 13.6316, lon: 74.6916, district: 'Udupi', state: 'Karnataka', importance: 0.7 },
  { id: 'karkala', name: 'Karkala', displayName: 'Karkala, Udupi', type: 'town', lat: 13.2167, lon: 74.9833, district: 'Udupi', state: 'Karnataka', importance: 0.7 },
  
  // Uttara Kannada
  { id: 'karwar', name: 'Karwar', displayName: 'Karwar, Uttara Kannada', type: 'city', lat: 14.8182, lon: 74.1351, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.8 },
  { id: 'sirsi', name: 'Sirsi', displayName: 'Sirsi, Uttara Kannada', type: 'town', lat: 14.6214, lon: 74.8354, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.75 },
  { id: 'kumta', name: 'Kumta', displayName: 'Kumta, Uttara Kannada', type: 'town', lat: 14.4284, lon: 74.4141, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.7 },
  { id: 'honavar', name: 'Honavar', displayName: 'Honavar, Uttara Kannada', type: 'town', lat: 14.2805, lon: 74.4438, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.7 },
  { id: 'bhatkal', name: 'Bhatkal', displayName: 'Bhatkal, Uttara Kannada', type: 'town', lat: 13.9850, lon: 74.5553, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.7 },
  { id: 'dandeli', name: 'Dandeli', displayName: 'Dandeli, Uttara Kannada', type: 'town', lat: 15.2667, lon: 74.6167, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.75 },
  { id: 'ankola', name: 'Ankola', displayName: 'Ankola, Uttara Kannada', type: 'town', lat: 14.6600, lon: 74.3000, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.65 },
  { id: 'gokarna', name: 'Gokarna', displayName: 'Gokarna, Uttara Kannada', type: 'town', lat: 14.5500, lon: 74.3167, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.75 },
  { id: 'murudeshwar', name: 'Murudeshwar', displayName: 'Murudeshwar, Uttara Kannada', type: 'town', lat: 14.0944, lon: 74.4844, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.7 },
  
  // Shimoga
  { id: 'shimoga_city', name: 'Shimoga', displayName: 'Shimoga City, Shimoga', type: 'city', lat: 13.9299, lon: 75.5681, district: 'Shimoga', state: 'Karnataka', importance: 0.85 },
  { id: 'bhadravati', name: 'Bhadravati', displayName: 'Bhadravati, Shimoga', type: 'town', lat: 13.8489, lon: 75.7050, district: 'Shimoga', state: 'Karnataka', importance: 0.75 },
  { id: 'sagar', name: 'Sagar', displayName: 'Sagar, Shimoga', type: 'town', lat: 14.1667, lon: 75.0333, district: 'Shimoga', state: 'Karnataka', importance: 0.7 },
  { id: 'hosanagara', name: 'Hosanagara', displayName: 'Hosanagara, Shimoga', type: 'town', lat: 13.9167, lon: 75.0667, district: 'Shimoga', state: 'Karnataka', importance: 0.6 },
  { id: 'thirthahalli', name: 'Thirthahalli', displayName: 'Thirthahalli, Shimoga', type: 'town', lat: 13.6833, lon: 75.2333, district: 'Shimoga', state: 'Karnataka', importance: 0.65 },
  { id: 'jog_falls', name: 'Jog Falls', displayName: 'Jog Falls, Shimoga', type: 'landmark', lat: 14.2294, lon: 74.8124, district: 'Shimoga', state: 'Karnataka', importance: 0.8 },
  
  // Chikmagalur
  { id: 'chikmagalur_city', name: 'Chikmagalur', displayName: 'Chikmagalur City', type: 'city', lat: 13.3161, lon: 75.7720, district: 'Chikmagalur', state: 'Karnataka', importance: 0.8 },
  { id: 'kadur', name: 'Kadur', displayName: 'Kadur, Chikmagalur', type: 'town', lat: 13.5500, lon: 76.0167, district: 'Chikmagalur', state: 'Karnataka', importance: 0.65 },
  { id: 'mudigere', name: 'Mudigere', displayName: 'Mudigere, Chikmagalur', type: 'town', lat: 13.1333, lon: 75.6333, district: 'Chikmagalur', state: 'Karnataka', importance: 0.65 },
  { id: 'sringeri', name: 'Sringeri', displayName: 'Sringeri, Chikmagalur', type: 'town', lat: 13.4167, lon: 75.2500, district: 'Chikmagalur', state: 'Karnataka', importance: 0.7 },
  { id: 'mullayanagiri', name: 'Mullayanagiri', displayName: 'Mullayanagiri Peak, Chikmagalur', type: 'natural', lat: 13.3875, lon: 75.7229, district: 'Chikmagalur', state: 'Karnataka', importance: 0.75 },
  { id: 'bababudangiri', name: 'Baba Budangiri', displayName: 'Baba Budangiri, Chikmagalur', type: 'natural', lat: 13.4333, lon: 75.7500, district: 'Chikmagalur', state: 'Karnataka', importance: 0.7 },
  
  // Kodagu
  { id: 'madikeri', name: 'Madikeri', displayName: 'Madikeri (Mercara), Kodagu', type: 'city', lat: 12.4244, lon: 75.7382, district: 'Kodagu', state: 'Karnataka', importance: 0.8 },
  { id: 'virajpet', name: 'Virajpet', displayName: 'Virajpet, Kodagu', type: 'town', lat: 12.1972, lon: 75.8019, district: 'Kodagu', state: 'Karnataka', importance: 0.7 },
  { id: 'somwarpet', name: 'Somwarpet', displayName: 'Somwarpet, Kodagu', type: 'town', lat: 12.5961, lon: 75.8500, district: 'Kodagu', state: 'Karnataka', importance: 0.65 },
  { id: 'kushalnagar', name: 'Kushalnagar', displayName: 'Kushalnagar, Kodagu', type: 'town', lat: 12.4582, lon: 75.9586, district: 'Kodagu', state: 'Karnataka', importance: 0.65 },
  { id: 'talakaveri', name: 'Talakaveri', displayName: 'Talakaveri, Kodagu', type: 'landmark', lat: 12.3833, lon: 75.4833, district: 'Kodagu', state: 'Karnataka', importance: 0.7 },
  
  // Hassan
  { id: 'hassan_city', name: 'Hassan', displayName: 'Hassan City', type: 'city', lat: 13.0068, lon: 76.1003, district: 'Hassan', state: 'Karnataka', importance: 0.8 },
  { id: 'belur', name: 'Belur', displayName: 'Belur, Hassan', type: 'town', lat: 13.1667, lon: 75.8667, district: 'Hassan', state: 'Karnataka', importance: 0.75 },
  { id: 'halebidu', name: 'Halebidu', displayName: 'Halebidu, Hassan', type: 'landmark', lat: 13.2117, lon: 75.9944, district: 'Hassan', state: 'Karnataka', importance: 0.75 },
  { id: 'sakleshpur', name: 'Sakleshpur', displayName: 'Sakleshpur, Hassan', type: 'town', lat: 12.9429, lon: 75.7847, district: 'Hassan', state: 'Karnataka', importance: 0.7 },
  
  // Other major cities
  { id: 'hubli', name: 'Hubli', displayName: 'Hubli-Dharwad, Karnataka', type: 'city', lat: 15.3647, lon: 75.1240, state: 'Karnataka', importance: 0.9 },
  { id: 'belgaum_city', name: 'Belgaum', displayName: 'Belgaum City', type: 'city', lat: 15.8497, lon: 74.4977, district: 'Belgaum', state: 'Karnataka', importance: 0.85 },
];

// Natural features and landmarks
const NATURAL_FEATURES: PlaceResult[] = [
  { id: 'kudremukh', name: 'Kudremukh', displayName: 'Kudremukh National Park', type: 'natural', lat: 13.2500, lon: 75.2500, district: 'Chikmagalur', state: 'Karnataka', importance: 0.85 },
  { id: 'bhadra', name: 'Bhadra Wildlife Sanctuary', displayName: 'Bhadra Wildlife Sanctuary', type: 'natural', lat: 13.6833, lon: 75.5167, district: 'Chikmagalur', state: 'Karnataka', importance: 0.8 },
  { id: 'sharavathi', name: 'Sharavathi Valley', displayName: 'Sharavathi Valley Wildlife Sanctuary', type: 'natural', lat: 14.1333, lon: 74.9167, district: 'Shimoga', state: 'Karnataka', importance: 0.75 },
  { id: 'agumbe', name: 'Agumbe', displayName: 'Agumbe Rainforest', type: 'natural', lat: 13.5019, lon: 75.0933, district: 'Shimoga', state: 'Karnataka', importance: 0.8 },
  { id: 'nagarhole', name: 'Nagarhole', displayName: 'Nagarhole National Park', type: 'natural', lat: 12.0167, lon: 76.0167, district: 'Kodagu', state: 'Karnataka', importance: 0.85 },
  { id: 'bandipur', name: 'Bandipur', displayName: 'Bandipur National Park', type: 'natural', lat: 11.6667, lon: 76.6333, district: 'Chamarajanagar', state: 'Karnataka', importance: 0.85 },
  { id: 'pushpagiri', name: 'Pushpagiri', displayName: 'Pushpagiri Wildlife Sanctuary', type: 'natural', lat: 12.5833, lon: 75.7000, district: 'Kodagu', state: 'Karnataka', importance: 0.7 },
  { id: 'brahmagiri', name: 'Brahmagiri', displayName: 'Brahmagiri Wildlife Sanctuary', type: 'natural', lat: 11.9333, lon: 75.9833, district: 'Kodagu', state: 'Karnataka', importance: 0.7 },
  { id: 'anshi', name: 'Anshi National Park', displayName: 'Anshi National Park', type: 'natural', lat: 15.0667, lon: 74.4000, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.75 },
  { id: 'kali_tiger', name: 'Kali Tiger Reserve', displayName: 'Kali Tiger Reserve', type: 'natural', lat: 15.3000, lon: 74.5000, district: 'Uttara Kannada', state: 'Karnataka', importance: 0.8 },
];

// Other WG states
const OTHER_WG_PLACES: PlaceResult[] = [
  // Kerala
  { id: 'wayanad', name: 'Wayanad', displayName: 'Wayanad, Kerala', type: 'district', lat: 11.6854, lon: 76.1320, state: 'Kerala', importance: 0.85 },
  { id: 'palakkad', name: 'Palakkad', displayName: 'Palakkad, Kerala', type: 'district', lat: 10.7867, lon: 76.6548, state: 'Kerala', importance: 0.85 },
  { id: 'idukki', name: 'Idukki', displayName: 'Idukki, Kerala', type: 'district', lat: 9.9189, lon: 77.1025, state: 'Kerala', importance: 0.85 },
  { id: 'munnar', name: 'Munnar', displayName: 'Munnar, Kerala', type: 'town', lat: 10.0889, lon: 77.0595, state: 'Kerala', importance: 0.85 },
  
  // Tamil Nadu
  { id: 'nilgiris', name: 'Nilgiris', displayName: 'Nilgiris (Ooty), Tamil Nadu', type: 'district', lat: 11.4102, lon: 76.6950, state: 'Tamil Nadu', importance: 0.9 },
  { id: 'ooty', name: 'Ooty', displayName: 'Ooty, Nilgiris', type: 'city', lat: 11.4102, lon: 76.6950, state: 'Tamil Nadu', importance: 0.9 },
  { id: 'coimbatore', name: 'Coimbatore', displayName: 'Coimbatore, Tamil Nadu', type: 'city', lat: 11.0168, lon: 76.9558, state: 'Tamil Nadu', importance: 0.9 },
  
  // Goa
  { id: 'north_goa', name: 'North Goa', displayName: 'North Goa', type: 'district', lat: 15.5333, lon: 73.9500, state: 'Goa', importance: 0.85 },
  { id: 'south_goa', name: 'South Goa', displayName: 'South Goa', type: 'district', lat: 15.2833, lon: 74.1667, state: 'Goa', importance: 0.85 },
  
  // Maharashtra
  { id: 'kolhapur', name: 'Kolhapur', displayName: 'Kolhapur, Maharashtra', type: 'district', lat: 16.6913, lon: 74.2446, state: 'Maharashtra', importance: 0.85 },
  { id: 'satara', name: 'Satara', displayName: 'Satara, Maharashtra', type: 'district', lat: 17.6805, lon: 74.0183, state: 'Maharashtra', importance: 0.8 },
  { id: 'ratnagiri', name: 'Ratnagiri', displayName: 'Ratnagiri, Maharashtra', type: 'district', lat: 16.9944, lon: 73.3000, state: 'Maharashtra', importance: 0.8 },
  { id: 'sindhudurg', name: 'Sindhudurg', displayName: 'Sindhudurg, Maharashtra', type: 'district', lat: 16.0500, lon: 73.4667, state: 'Maharashtra', importance: 0.8 },
  { id: 'mahabaleshwar', name: 'Mahabaleshwar', displayName: 'Mahabaleshwar, Maharashtra', type: 'town', lat: 17.9307, lon: 73.6477, state: 'Maharashtra', importance: 0.85 },
];

// Combine all places
const ALL_PLACES: PlaceResult[] = [
  ...KARNATAKA_DISTRICTS,
  ...KARNATAKA_TOWNS,
  ...NATURAL_FEATURES,
  ...OTHER_WG_PLACES,
];

export class GazetteerService {
  private places: PlaceResult[] = ALL_PLACES;
  private isOnline: boolean = navigator.onLine;

  constructor() {
    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);
  }

  /**
   * Search places by name (offline first, then online if needed)
   */
  async search(query: string, limit: number = 10): Promise<PlaceResult[]> {
    const normalizedQuery = query.toLowerCase().trim();
    
    if (!normalizedQuery) return [];

    // Check if it's a coordinate
    const coordMatch = normalizedQuery.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      return [{
        id: `coord_${lat}_${lon}`,
        name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        displayName: `Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        type: 'landmark',
        lat,
        lon,
        importance: 1.0
      }];
    }

    // Search local gazetteer
    const localResults = this.searchLocal(normalizedQuery, limit);
    
    // If we have enough results or offline, return local results
    if (localResults.length >= limit || !this.isOnline) {
      return localResults;
    }

    // Try online search for more results
    try {
      const onlineResults = await this.searchOnline(query, limit - localResults.length);
      
      // Merge and deduplicate
      const merged = this.mergeResults(localResults, onlineResults);
      return merged.slice(0, limit);
    } catch {
      // Fall back to local results
      return localResults;
    }
  }

  /**
   * Search local gazetteer
   */
  private searchLocal(query: string, limit: number): PlaceResult[] {
    const matches: Array<{ place: PlaceResult; score: number }> = [];

    for (const place of this.places) {
      const nameLower = place.name.toLowerCase();
      const displayLower = place.displayName.toLowerCase();
      
      let score = 0;
      
      // Exact match
      if (nameLower === query) {
        score = 100;
      }
      // Starts with query
      else if (nameLower.startsWith(query)) {
        score = 80 + (query.length / nameLower.length) * 10;
      }
      // Display name starts with
      else if (displayLower.startsWith(query)) {
        score = 70 + (query.length / displayLower.length) * 10;
      }
      // Contains query
      else if (nameLower.includes(query)) {
        score = 50 + (query.length / nameLower.length) * 20;
      }
      // Display contains
      else if (displayLower.includes(query)) {
        score = 40 + (query.length / displayLower.length) * 20;
      }
      // Fuzzy match (simple)
      else if (this.fuzzyMatch(query, nameLower)) {
        score = 30;
      }

      if (score > 0) {
        // Boost by importance
        score += place.importance * 10;
        matches.push({ place, score });
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(m => m.place);
  }

  /**
   * Simple fuzzy matching
   */
  private fuzzyMatch(query: string, target: string): boolean {
    let qi = 0;
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (query[qi] === target[ti]) {
        qi++;
      }
    }
    return qi === query.length;
  }

  /**
   * Search online using Nominatim (OpenStreetMap)
   */
  private async searchOnline(query: string, limit: number): Promise<PlaceResult[]> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', `${query}, Karnataka, India`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WGFieldValidator/1.0'
      }
    });

    if (!response.ok) throw new Error('Search failed');

    const data = await response.json();
    
    return data.map((item: {
      place_id: string;
      display_name: string;
      lat: string;
      lon: string;
      type: string;
      importance: number;
      address?: {
        state?: string;
        county?: string;
        state_district?: string;
      };
    }) => ({
      id: `osm_${item.place_id}`,
      name: item.display_name.split(',')[0],
      displayName: item.display_name,
      type: this.mapOsmType(item.type),
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      state: item.address?.state,
      district: item.address?.county || item.address?.state_district,
      importance: item.importance
    }));
  }

  private mapOsmType(osmType: string): PlaceResult['type'] {
    const typeMap: Record<string, PlaceResult['type']> = {
      'city': 'city',
      'town': 'town',
      'village': 'village',
      'administrative': 'district',
      'hamlet': 'village',
      'suburb': 'town',
      'peak': 'natural',
      'water': 'natural',
      'forest': 'natural',
    };
    return typeMap[osmType] || 'landmark';
  }

  /**
   * Merge and deduplicate results
   */
  private mergeResults(local: PlaceResult[], online: PlaceResult[]): PlaceResult[] {
    const seen = new Set(local.map(p => `${p.lat.toFixed(3)}_${p.lon.toFixed(3)}`));
    const merged = [...local];

    for (const place of online) {
      const key = `${place.lat.toFixed(3)}_${place.lon.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(place);
      }
    }

    return merged;
  }

  /**
   * Reverse geocode a location
   */
  async reverseGeocode(lat: number, lon: number): Promise<PlaceResult | null> {
    // First try to find a nearby local place
    const nearby = this.findNearby(lat, lon, 5000); // 5km radius
    if (nearby) {
      return nearby;
    }

    // Try online reverse geocoding
    if (this.isOnline) {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'WGFieldValidator/1.0'
          }
        });

        if (response.ok) {
          const data = await response.json();
          return {
            id: `osm_${data.place_id}`,
            name: data.name || data.display_name.split(',')[0],
            displayName: data.display_name,
            type: 'landmark',
            lat,
            lon,
            state: data.address?.state,
            district: data.address?.county || data.address?.state_district,
            importance: 0.5
          };
        }
      } catch {
        // Ignore errors
      }
    }

    return null;
  }

  /**
   * Find a place within radius
   */
  private findNearby(lat: number, lon: number, radiusM: number): PlaceResult | null {
    let closest: PlaceResult | null = null;
    let minDist = Infinity;

    for (const place of this.places) {
      const dist = this.haversineDistance(lat, lon, place.lat, place.lon);
      if (dist < radiusM && dist < minDist) {
        minDist = dist;
        closest = place;
      }
    }

    return closest;
  }

  /**
   * Haversine distance in meters
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Get all places for a district
   */
  getPlacesByDistrict(district: string): PlaceResult[] {
    const normalizedDistrict = district.toLowerCase();
    return this.places.filter(p => 
      p.district?.toLowerCase() === normalizedDistrict ||
      p.name.toLowerCase() === normalizedDistrict
    );
  }
}

export const gazetteerService = new GazetteerService();
