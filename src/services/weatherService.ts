import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

import { apiClient } from './apiClient';

export type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export interface DayWeather {
  tempMax: string;
  tempMin: string;
  icon: IoniconsName;
}

/** Required next to WeatherKit data (Apple's logo and legal link), on iOS and Android alike. */
export interface WeatherAttribution {
  serviceName: string;
  legalPageURL: string;
  logoLight: string | null;
  logoDark: string | null;
}

export interface WeatherForecast {
  homeTown: string | null;
  days: Record<string, DayWeather>;
  attribution: WeatherAttribution | null;
}

type Condition = 'clear' | 'partly_cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'thunder' | 'wind';

interface WeatherResponse {
  home: { name: string } | null;
  days: { date: string; tempMaxC: number | null; tempMinC: number | null; condition: Condition }[];
  attribution: WeatherAttribution | null;
}

const WEATHER_CACHE_KEY = 'rooka_weather_forecast_cache_v2';
const WEATHER_CACHE_TTL = 3 * 60 * 60 * 1000; // matches the server's refresh

const CONDITION_ICONS: Record<Condition, IoniconsName> = {
  clear: 'sunny-outline',
  partly_cloudy: 'partly-sunny-outline',
  cloudy: 'cloudy-outline',
  fog: 'cloudy-outline',
  rain: 'rainy-outline',
  snow: 'snow-outline',
  thunder: 'thunderstorm-outline',
  wind: 'partly-sunny-outline',
};

const EMPTY: WeatherForecast = { homeTown: null, days: {}, attribution: null };

const temp = (v: number | null) => (typeof v === 'number' ? `${Math.round(v)}°C` : '');

export const weatherService = {
  /**
   * The forecast for the athlete's home town, from rooka's server (which gets it
   * from Apple WeatherKit). Empty until a home town is set in Profile.
   */
  async getForecast(): Promise<WeatherForecast> {
    try {
      const cachedRaw = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached.timestamp && Date.now() - cached.timestamp < WEATHER_CACHE_TTL && cached.data) {
          return cached.data;
        }
      }
    } catch (_) {}

    try {
      const res = await apiClient<WeatherResponse>('/api/weather');
      const days: Record<string, DayWeather> = {};
      (res.days || []).forEach((d) => {
        days[d.date] = {
          tempMax: temp(d.tempMaxC),
          tempMin: temp(d.tempMinC),
          icon: CONDITION_ICONS[d.condition] || 'partly-sunny-outline',
        };
      });
      const data: WeatherForecast = { homeTown: res.home?.name || null, days, attribution: res.attribution || null };
      AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data })).catch(() => {});
      return data;
    } catch (err) {
      console.log('Weather forecast unavailable:', err);
      return EMPTY;
    }
  },

  /** Forget the cached forecast, e.g. after the home town changed. */
  async clearCache(): Promise<void> {
    await AsyncStorage.removeItem(WEATHER_CACHE_KEY).catch(() => {});
  },
};
