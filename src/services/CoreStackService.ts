/**
 * CoreStack API Service
 * 
 * Provides access to CoreStack APIs for online data enrichment.
 * https://api-doc.core-stack.org
 */

const CORESTACK_BASE_URL = 'https://api-doc.core-stack.org/api/v1';

export interface AdminDetails {
  state_name?: string;
  state_code?: string;
  district_name?: string;
  district_code?: string;
  tehsil_name?: string;
  tehsil_code?: string;
  mws_id?: string;
}

export interface MWSData {
  mws_id: string;
  date: string;
  et?: number;
  runoff?: number;
  precipitation?: number;
  soil_moisture?: number;
}

export interface LayerUrl {
  layer_name: string;
  url: string;
  type: 'raster' | 'vector';
  format?: string;
}

export interface WaterbodyData {
  uid: string;
  name?: string;
  type?: string;
  area_ha?: number;
  volume_ml?: number;
  status?: string;
  geometry?: GeoJSON.Geometry;
}

export interface KYLIndicator {
  indicator_name: string;
  value: number | string;
  unit?: string;
  category?: string;
}

export interface TehsilData {
  tehsil_code: string;
  tehsil_name: string;
  district_name: string;
  state_name: string;
  area_ha?: number;
  population?: number;
  cropping_intensity?: number;
  groundwater_stage?: string;
}

export interface CoreStackError {
  code: string;
  message: string;
}

class CoreStackService {
  private apiKey: string | null = null;
  private isOnline: boolean = navigator.onLine;

  // Hardcoded API key for testing - move to environment variable for production
  private static readonly DEFAULT_API_KEY = 'x0bXxURa.B9Qgfxd0aKxxJ8GIDHA5FCSIAc52hFgg';

  constructor() {
    // Load API key from localStorage, fallback to hardcoded key for testing
    this.apiKey = localStorage.getItem('corestack_api_key') || CoreStackService.DEFAULT_API_KEY;
    
    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);
  }

  /**
   * Set the API key
   */
  setApiKey(key: string): void {
    this.apiKey = key;
    localStorage.setItem('corestack_api_key', key);
  }

  /**
   * Check if API key is configured
   */
  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.isOnline && this.hasApiKey();
  }

  /**
   * Make an API request
   */
  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.isOnline) {
      throw new Error('Offline - cannot access CoreStack API');
    }

    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    const url = new URL(`${CORESTACK_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    console.log(`[CoreStack] Requesting: ${endpoint}`, params);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        console.error(`[CoreStack] Error ${response.status}:`, error);
        throw new Error(error.message || error.detail || `API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[CoreStack] Response from ${endpoint}:`, data);
      return data;
    } catch (err) {
      console.error(`[CoreStack] Request failed:`, err);
      throw err;
    }
  }

  /**
   * Get admin details by lat/lon
   */
  async getAdminDetailsByLatLon(lat: number, lon: number): Promise<AdminDetails> {
    return this.request<AdminDetails>('/get_admin_details_by_latlon/', {
      lat: lat.toString(),
      lon: lon.toString()
    });
  }

  /**
   * Get MWS ID by lat/lon
   */
  async getMWSIdByLatLon(lat: number, lon: number): Promise<{ mws_id: string }> {
    return this.request('/get_mwsid_by_latlon/', {
      lat: lat.toString(),
      lon: lon.toString()
    });
  }

  /**
   * Get MWS time series data
   */
  async getMWSData(
    mwsId: string,
    startDate?: string,
    endDate?: string
  ): Promise<MWSData[]> {
    const params: Record<string, string> = { mws_id: mwsId };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    
    return this.request<MWSData[]>('/get_mws_data/', params);
  }

  /**
   * Get MWS KYL (Know Your Location) indicators
   */
  async getMWSKYLIndicators(mwsId: string): Promise<KYLIndicator[]> {
    return this.request<KYLIndicator[]>('/get_mws_kyl_indicators/', {
      mws_id: mwsId
    });
  }

  /**
   * Get MWS report URL
   */
  async getMWSReportUrl(mwsId: string): Promise<{ url: string }> {
    return this.request('/get_mws_report/', {
      mws_id: mwsId
    });
  }

  /**
   * Get generated layer URLs for a location
   */
  async getLayerUrls(
    stateCode?: string,
    districtCode?: string,
    tehsilCode?: string
  ): Promise<LayerUrl[]> {
    const params: Record<string, string> = {};
    if (stateCode) params.state_code = stateCode;
    if (districtCode) params.district_code = districtCode;
    if (tehsilCode) params.tehsil_code = tehsilCode;
    
    return this.request<LayerUrl[]>('/get_generated_layer_urls/', params);
  }

  /**
   * Get tehsil data
   */
  async getTehsilData(tehsilCode: string): Promise<TehsilData> {
    return this.request<TehsilData>('/get_tehsil_data/', {
      tehsil_code: tehsilCode
    });
  }

  /**
   * Get waterbodies by admin area
   */
  async getWaterbodiesByAdmin(
    stateCode?: string,
    districtCode?: string,
    tehsilCode?: string
  ): Promise<WaterbodyData[]> {
    const params: Record<string, string> = {};
    if (stateCode) params.state_code = stateCode;
    if (districtCode) params.district_code = districtCode;
    if (tehsilCode) params.tehsil_code = tehsilCode;
    
    return this.request<WaterbodyData[]>('/get_waterbodies_data_by_admin/', params);
  }

  /**
   * Get waterbody data by UID
   */
  async getWaterbodyData(uid: string): Promise<WaterbodyData> {
    return this.request<WaterbodyData>('/get_waterbody_data/', {
      uid
    });
  }

  /**
   * Get active locations (for admin area dropdowns)
   */
  async getActiveLocations(): Promise<{
    states: Array<{ code: string; name: string }>;
    districts?: Array<{ code: string; name: string; state_code: string }>;
  }> {
    return this.request('/get_active_locations/');
  }

  /**
   * Enrich location data with CoreStack information
   * This is the main method used for field validation enrichment
   */
  async enrichLocation(lat: number, lon: number): Promise<{
    admin?: AdminDetails;
    mwsId?: string;
    indicators?: KYLIndicator[];
    layerUrls?: LayerUrl[];
    waterbodies?: WaterbodyData[];
    error?: string;
  }> {
    if (!this.isAvailable()) {
      return { error: 'CoreStack API not available' };
    }

    try {
      // Get admin details first
      const admin = await this.getAdminDetailsByLatLon(lat, lon);
      
      // Get MWS ID
      let mwsId: string | undefined;
      let indicators: KYLIndicator[] | undefined;
      
      try {
        const mwsResult = await this.getMWSIdByLatLon(lat, lon);
        mwsId = mwsResult.mws_id;
        
        if (mwsId) {
          indicators = await this.getMWSKYLIndicators(mwsId);
        }
      } catch {
        // MWS might not be available for all locations
      }

      // Get layer URLs if we have district code
      let layerUrls: LayerUrl[] | undefined;
      if (admin.state_code && admin.district_code) {
        try {
          layerUrls = await this.getLayerUrls(admin.state_code, admin.district_code);
        } catch {
          // Layers might not be available
        }
      }

      // Get nearby waterbodies
      let waterbodies: WaterbodyData[] | undefined;
      if (admin.district_code) {
        try {
          waterbodies = await this.getWaterbodiesByAdmin(
            admin.state_code,
            admin.district_code,
            admin.tehsil_code
          );
        } catch {
          // Waterbodies might not be available
        }
      }

      return {
        admin,
        mwsId,
        indicators,
        layerUrls,
        waterbodies
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const coreStackService = new CoreStackService();
