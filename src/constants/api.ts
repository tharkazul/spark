import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Set to true for local development backend, false to connect directly to the Termux production server.
export const USE_LOCAL_BACKEND = true;

// Production URLs
const PROD_API_BASE_URL = 'https://spark.amsterdamtriathlonassociation.uk';
const PROD_WS_URL = 'wss://spark.amsterdamtriathlonassociation.uk';

// Local Development URLs
const LOCAL_IP: string | null = null;
const LOCAL_PORT = 3005;

const getLocalHost = (): string => {
  if (LOCAL_IP) return LOCAL_IP;

  // Extract host IP dynamically from Expo manifest / hostUri when testing on physical device via Expo Go
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost || (Constants as any).manifest2?.extra?.expoGo?.developer?.tool;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return ip;
    }
  }

  if (Platform.OS === 'android') return '10.0.2.2'; // Android Emulator alias for host machine
  return 'localhost'; // iOS Simulator & Web
};

const getLocalBaseUrl = (): string => `http://${getLocalHost()}:${LOCAL_PORT}`;
const getLocalWsUrl = (): string => `ws://${getLocalHost()}:${LOCAL_PORT}`;

export const API_BASE_URL = USE_LOCAL_BACKEND ? getLocalBaseUrl() : PROD_API_BASE_URL;
export const WS_URL = USE_LOCAL_BACKEND ? getLocalWsUrl() : PROD_WS_URL;
