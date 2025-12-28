/**
 * Weather Service
 * 
 * Fetches weather data from Open-Meteo (free, no API key required)
 * https://open-meteo.com/
 */

export interface CurrentWeather {
  temperature: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
  weatherCode: number;
  weatherDescription: string;
  isDay: boolean;
}

export interface WeatherForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  precipitationProbability: number;
  weatherCode: number;
  weatherDescription: string;
}

export interface WeatherData {
  current: CurrentWeather;
  forecast: WeatherForecast[];
  fetchedAt: string;
}

// WMO Weather codes mapping
const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

class WeatherService {
  private baseUrl = 'https://api.open-meteo.com/v1/forecast';
  private isOnline: boolean = navigator.onLine;
  private cache: Map<string, { data: WeatherData; expiry: number }> = new Map();
  private cacheDuration = 30 * 60 * 1000; // 30 minutes

  constructor() {
    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.isOnline;
  }

  /**
   * Get weather for a location
   */
  async getWeather(lat: number, lon: number): Promise<WeatherData | null> {
    if (!this.isOnline) {
      return null;
    }

    // Check cache
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lon.toString(),
        current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
        timezone: 'Asia/Kolkata',
        forecast_days: '5'
      });

      const response = await fetch(`${this.baseUrl}?${params}`);
      if (!response.ok) {
        throw new Error('Weather API request failed');
      }

      const data = await response.json();
      
      const current: CurrentWeather = {
        temperature: data.current.temperature_2m,
        humidity: data.current.relative_humidity_2m,
        precipitation: data.current.precipitation,
        windSpeed: data.current.wind_speed_10m,
        windDirection: data.current.wind_direction_10m,
        weatherCode: data.current.weather_code,
        weatherDescription: WEATHER_CODES[data.current.weather_code] || 'Unknown',
        isDay: data.current.is_day === 1
      };

      const forecast: WeatherForecast[] = data.daily.time.map((date: string, i: number) => ({
        date,
        tempMax: data.daily.temperature_2m_max[i],
        tempMin: data.daily.temperature_2m_min[i],
        precipitation: data.daily.precipitation_sum[i],
        precipitationProbability: data.daily.precipitation_probability_max[i],
        weatherCode: data.daily.weather_code[i],
        weatherDescription: WEATHER_CODES[data.daily.weather_code[i]] || 'Unknown'
      }));

      const weatherData: WeatherData = {
        current,
        forecast,
        fetchedAt: new Date().toISOString()
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: weatherData,
        expiry: Date.now() + this.cacheDuration
      });

      return weatherData;
    } catch (error) {
      console.error('Weather fetch failed:', error);
      return null;
    }
  }

  /**
   * Get weather icon based on code and day/night
   */
  getWeatherIcon(code: number, isDay: boolean): string {
    if (code === 0 || code === 1) return isDay ? '☀️' : '🌙';
    if (code === 2) return isDay ? '⛅' : '☁️';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 55) return '🌧️';
    if (code >= 61 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 85 && code <= 86) return '🌨️';
    if (code >= 95) return '⛈️';
    return '🌤️';
  }
}

export const weatherService = new WeatherService();
