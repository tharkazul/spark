import { Platform } from 'react-native';

// When testing on a physical device with Expo Go, 'localhost' points to the device itself.
// To connect to the local backend on your computer, use your computer's local IP address instead of localhost.
// e.g. const LOCAL_IP = '192.168.1.xxx';
// For Android Emulator, you can use 10.0.2.2 which points to the host machine's localhost.
const getBackendUrl = () => {
  // If you know your local IP, you can hardcode it here during development
  // return 'http://192.168.x.x:3000';
  
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000'; // For iOS Simulator
};

export const API_BASE_URL = 'https://spark.amsterdamtriathlonassociation.uk';
export const WS_URL = 'wss://spark.amsterdamtriathlonassociation.uk';
