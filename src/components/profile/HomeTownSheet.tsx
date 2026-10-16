import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, DeviceEventEmitter, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { BottomSheetModal } from '../ui/BottomSheetModal';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useTheme } from '@/hooks/use-theme';
import { PlaceResult, userApi } from '../../services/apiServices';
import { weatherService } from '../../services/weatherService';

const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam';
  } catch {
    return 'Europe/Amsterdam';
  }
};

/**
 * Home town for the weather forecast. Searched by name (no location permission),
 * one search per tap: the place search service doesn't allow search-as-you-type.
 */
export function HomeTownSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, language } = useLanguage();
  const theme = useTheme();
  const { user, refreshUser } = useUser();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults(null);
    }
  }, [visible]);

  const search = async () => {
    if (query.trim().length < 2 || searching) return;
    setSearching(true);
    try {
      const res = await userApi.searchPlaces(query.trim(), language);
      setResults(res.results || []);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('homeTown.searchFailed'));
    } finally {
      setSearching(false);
    }
  };

  const save = async (place: PlaceResult | null) => {
    setSaving(true);
    try {
      await userApi.setHomeTown(place ? { name: place.name, lat: place.lat, lon: place.lon, timezone: deviceTimezone() } : null);
      await weatherService.clearCache();
      DeviceEventEmitter.emit('homeTownChanged');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshUser();
      onClose();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('homeTown.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} showHandle>
      <View className="pb-8 gap-y-3">
        <Text className="text-lg font-extrabold text-theme-text">{t('homeTown.title')}</Text>
        <Text className="text-xs text-theme-muted">{t('homeTown.hint')}</Text>

        <View className="flex-row items-center gap-2">
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            autoFocus
            autoCorrect={false}
            placeholder={t('homeTown.placeholder')}
            placeholderTextColor={theme.textSecondary}
            className="flex-1 bg-theme-inset rounded-inset px-3 py-2.5 text-sm text-theme-text"
          />
          <TouchableOpacity
            onPress={search}
            disabled={query.trim().length < 2 || searching}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('homeTown.search')}
            className={`w-11 h-11 rounded-inset items-center justify-center ${query.trim().length >= 2 ? 'bg-theme-accent-strong' : 'bg-theme-border'}`}
          >
            {searching ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="search" size={18} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>

        {results && results.length === 0 && <Text className="text-sm text-theme-muted">{t('homeTown.noResults')}</Text>}
        {results?.map((r) => (
          <TouchableOpacity
            key={`${r.lat},${r.lon}`}
            onPress={() => save(r)}
            disabled={saving}
            activeOpacity={0.75}
            className="flex-row items-center gap-2 py-2.5 border-b border-theme-border/40"
          >
            <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-theme-text">{r.name}</Text>
              <Text className="text-[11px] text-theme-muted">{[r.region, r.country].filter(Boolean).join(', ')}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {saving && <ActivityIndicator color={theme.tint} />}

        {user?.homeTown ? (
          <TouchableOpacity onPress={() => save(null)} disabled={saving} className="py-2 items-center">
            <Text className="text-sm font-bold text-semantic-error">{t('homeTown.remove', { town: user.homeTown })}</Text>
          </TouchableOpacity>
        ) : null}

        <Text className="text-[10px] text-theme-muted text-center">{t('homeTown.searchCredit')}</Text>
      </View>
    </BottomSheetModal>
  );
}
