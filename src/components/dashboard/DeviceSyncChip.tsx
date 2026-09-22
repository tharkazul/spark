import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { ScalePressable } from '@/components/ui/ScalePressable';

export type DeviceType = 'garmin' | 'apple';

export interface DeviceSyncChipProps {
  device: DeviceType;
  isSynced: boolean;
  isSyncing: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * DeviceSyncChip
 *
 * Tactile device sync pill chip replacing legacy web-style checkboxes.
 * Connects workout planning to external hardware (Garmin / Apple Watch)
 * with spring physics, dedicated brand iconography, and active glowing status borders.
 */
export function DeviceSyncChip({
  device,
  isSynced,
  isSyncing,
  onPress,
  disabled = false,
}: DeviceSyncChipProps) {
  const theme = useTheme();

  const isGarmin = device === 'garmin';
  const deviceName = isGarmin ? 'Garmin' : 'Apple Watch';
  const deviceIconName = isGarmin
    ? (isSynced ? 'watch' : 'watch-outline')
    : 'logo-apple';

  const iconColor = isSynced
    ? theme.tint
    : isGarmin
    ? '#007ACC'
    : theme.text;

  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled || isSyncing}
      activeScale={0.96}
      haptic="selection"
      className={`flex-1 flex-row items-center justify-between p-3 rounded-control border ${
        isSynced
          ? 'bg-theme-accent-soft border-theme-accent'
          : isSyncing
          ? 'bg-theme-bg border-theme-accent/50'
          : 'bg-theme-bg border-theme-border/60'
      }`}
      style={isSynced ? styles.syncedGlow : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Sync workout to ${deviceName}${isSynced ? ', Synced' : isSyncing ? ', Syncing' : ''}`}
      accessibilityState={{ disabled: isSyncing, checked: isSynced }}
      accessibilityHint={`Pushes this structured workout to your ${deviceName}`}
    >
      <View className="flex-row items-center gap-2.5 flex-1 pr-1">
        <View
          className={`w-8 h-8 rounded-lg items-center justify-center ${
            isSynced
              ? 'bg-theme-accent/20'
              : 'bg-theme-card border border-theme-border/40'
          }`}
        >
          <Ionicons name={deviceIconName as any} size={18} color={iconColor} />
        </View>
        <View className="flex-1 justify-center">
          <Text
            numberOfLines={1}
            className={`text-sm font-bold ${isSynced ? 'text-theme-accent' : 'text-theme-text'}`}
          >
            {deviceName}
          </Text>
        </View>
      </View>

      <View className="items-center justify-center pl-1">
        {isSyncing ? (
          <ActivityIndicator size="small" color={theme.tint} />
        ) : isSynced ? (
          <Ionicons name="checkmark-circle" size={18} color={theme.tint} />
        ) : (
          <Ionicons name="cloud-upload-outline" size={16} color={theme.textSecondary} />
        )}
      </View>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  syncedGlow: {
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
});

export default DeviceSyncChip;
