import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useOfflineSync } from '../../services/offlineSync';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { isOnline, isSyncing, pendingCount, flushQueue, checkOnlineStatus } = useOfflineSync();

  // Animation values
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Local state for "Just Synced" feedback banner
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const prevSyncingRef = useRef(isSyncing);
  const prevPendingRef = useRef(pendingCount);
  const successTimeoutRef = useRef<any>(null);

  // Detect when sync completes (was syncing with items, now not syncing and queue is 0)
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing && prevPendingRef.current > 0 && pendingCount === 0 && isOnline) {
      setShowSuccessBanner(true);
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 2600);
    }
    prevSyncingRef.current = isSyncing;
    prevPendingRef.current = pendingCount;
  }, [isSyncing, pendingCount, isOnline]);

  const shouldBeVisible = !isOnline || isSyncing || showSuccessBanner || pendingCount > 0;

  useEffect(() => {
    if (shouldBeVisible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 240,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -60,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [shouldBeVisible]);

  if (!shouldBeVisible) return null;

  const handlePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isOnline) {
      await checkOnlineStatus();
    }
    if (pendingCount > 0) {
      await flushQueue();
    }
  };

  // Determine badge styling and copy
  let iconName: keyof typeof Ionicons.glyphMap = 'cloud-offline-outline';
  let iconColor = '#F59E0B'; // Amber
  let title = 'Offline Mode';
  let subtitle = 'Changes saved locally';
  let badgeText = pendingCount > 0 ? `${pendingCount}` : undefined;

  if (isSyncing) {
    iconName = 'sync-outline';
    iconColor = '#F97316'; // Rooka Ember
    title = 'Syncing...';
    subtitle = pendingCount > 0 ? `Syncing ${pendingCount} offline ${pendingCount === 1 ? 'change' : 'changes'}` : 'Syncing changes';
  } else if (showSuccessBanner) {
    iconName = 'checkmark-circle-outline';
    iconColor = '#10B981'; // Emerald
    title = 'Synced';
    subtitle = 'All changes synced to cloud';
    badgeText = undefined;
  } else if (!isOnline && pendingCount > 0) {
    subtitle = `${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'} queued • tap to retry`;
  }

  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24) + 6;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.overlayContainer,
        {
          top: topInset,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={handlePress}
        style={styles.pillContainer}
      >
        <View style={styles.pillContent}>
          {/* Status Indicator Icon or Spinner */}
          <View style={styles.iconWrapper}>
            {isSyncing ? (
              <ActivityIndicator size="small" color="#F97316" />
            ) : (
              <Ionicons name={iconName} size={15} color={iconColor} />
            )}
          </View>

          {/* Text Labels */}
          <View style={styles.textWrapper}>
            <Text style={styles.titleText}>{title}</Text>
            <Text style={styles.subtitleText} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          {/* Optional Pending Count Badge */}
          {badgeText && (
            <View style={styles.badgeWrapper}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          )}

          {/* Subtle chevron prompt when offline */}
          {!isOnline && (
            <Ionicons name="refresh-outline" size={13} color="rgba(255,255,255,0.4)" style={{ marginLeft: 4 }} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillContainer: {
    maxWidth: 380,
    width: '100%',
    backgroundColor: '#141923',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  pillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  textWrapper: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F1F5F9',
    letterSpacing: 0.2,
  },
  subtitleText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  badgeWrapper: {
    marginLeft: 8,
    backgroundColor: '#F97316',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
