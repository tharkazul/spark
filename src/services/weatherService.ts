import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

export type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export interface DayWeather {
  tempMax: string;
  tempMin: string;
  icon: IoniconsName;
  description: string;
}

const WEATHER_CACHE_KEY = 'rooka_weather_forecast_cache';
const WEATHER_CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

/**
 * Maps WMO Weather Interpretation Codes (Open-Meteo) to Ionicons and human text
 */
export function mapWmoCodeToIcon(code: number): { icon: IoniconsName; description: string } {
  if (code === 0) return { icon: 'sunny-outline', description: 'Sunny' };
  if (code === 1 || code === 2) return { icon: 'partly-sunny-outline', description: 'Partly Cloudy' };
  if (code === 3) return { icon: 'cloudy-outline', description: 'Overcast' };
  if (code === 45 || code === 48) return { icon: 'cloudy-outline', description: 'Foggy' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: 'rainy-outline', description: 'Rain' };
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { icon: 'snow-outline', description: 'Snow' };
  if (code >= 95) return { icon: 'thunderstorm-outline', description: 'Thunderstorm' };
  return { icon: 'partly-sunny-outline', description: 'Partly Sunny' };
}

export const weatherService = {
  /**
   * Fetches daily weather forecast for a 14-day window around latitude & longitude
   */
  async getDailyForecast(lat = 52.3676, lon = 4.9041): Promise<Record<string, DayWeather>> {
    try {
      // Check local cache first
      const cachedRaw = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached.timestamp && Date.now() - cached.timestamp < WEATHER_CACHE_TTL && cached.data) {
          return cached.data;
        }
      }
    } catch (_) {}

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather API error ${res.status}`);
      const data = await res.json();

      if (!data.daily || !data.daily.time) {
        return {};
      }

      const result: Record<string, DayWeather> = {};
      const dates: string[] = data.daily.time;
      const maxTemps: number[] = data.daily.temperature_2m_max;
      const minTemps: number[] = data.daily.temperature_2m_min;
      const codes: number[] = data.daily.weather_code;

      dates.forEach((dateStr, idx) => {
        const max = Math.round(maxTemps[idx]);
        const min = Math.round(minTemps[idx]);
        const code = codes[idx] ?? 1;
        const { icon, description } = mapWmoCodeToIcon(code);

        result[dateStr] = {
          tempMax: `${max}°C`,
          tempMin: `${min}°C`,
          icon,
          description,
        };
      });

      // Save to cache
      await AsyncStorage.setItem(
        WEATHER_CACHE_KEY,
        JSON.stringify({ timestamp: Date.now(), data: result })
      ).catch(() => {});

      return result;
    } catch (err) {
      console.log('Failed to fetch live weather forecast:', err);
      return {};
    }
  },
};
