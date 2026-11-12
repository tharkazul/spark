import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export interface AppVersionInfo {
  /** Marketing version, e.g. "1.1.0". */
  version: string;
  /** App Store / Play build number, e.g. "35". Null in Expo Go or on web. */
  build: string | null;
  /** Id of the over-the-air update that is running, or null for the code shipped in the build. */
  updateId: string | null;
  /** EAS Update channel the build listens to, e.g. "production". */
  channel: string | null;
}

export const getAppVersionInfo = (): AppVersionInfo => ({
  version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '?',
  build: Application.nativeBuildVersion ?? null,
  updateId: Updates.isEnabled && !Updates.isEmbeddedLaunch ? Updates.updateId : null,
  channel: Updates.isEnabled ? Updates.channel : null,
});

/** Short label for the screen: "1.1.0 (35)", plus the first characters of an OTA update id when one is running. */
export const formatAppVersion = (info: AppVersionInfo = getAppVersionInfo()): string => {
  const base = info.build ? `${info.version} (${info.build})` : info.version;
  return info.updateId ? `${base} · ${info.updateId.slice(0, 7)}` : base;
};

/** Everything support needs to know which code an athlete is running. */
export const describeAppVersion = (info: AppVersionInfo = getAppVersionInfo()): string =>
  [
    `rooka ${info.build ? `${info.version} (${info.build})` : info.version}`,
    info.updateId ? `update ${info.updateId}` : 'no OTA update',
    info.channel ? `channel ${info.channel}` : null,
    `${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS} ${Platform.Version}`,
  ]
    .filter(Boolean)
    .join(', ');
