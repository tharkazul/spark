import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLanguage } from '../../context/LanguageContext';
import { WeatherAttribution as Attribution } from '../../services/weatherService';

/**
 * The weather provider's mark and legal link. Apple requires it wherever
 * WeatherKit data is shown, on every platform; kept small, like a footnote.
 */
export function WeatherAttribution({ attribution }: { attribution: Attribution | null }) {
  const { t } = useLanguage();
  const scheme = useColorScheme();
  if (!attribution) return null;
  const logo = scheme === 'dark' ? attribution.logoDark : attribution.logoLight;

  return (
    <View className="flex-row items-center justify-center gap-1.5 py-3" style={{ opacity: 0.7 }}>
      {logo ? (
        <Image
          source={{ uri: logo }}
          style={{ height: 9, width: 45 }}
          contentFit="contain"
          accessibilityLabel={attribution.serviceName}
        />
      ) : (
        <Text className="text-[9px] text-theme-muted">{attribution.serviceName}</Text>
      )}
      <TouchableOpacity onPress={() => Linking.openURL(attribution.legalPageURL)} hitSlop={10} accessibilityRole="link">
        <Text className="text-[9px] text-theme-muted underline">{t('weather.legal')}</Text>
      </TouchableOpacity>
    </View>
  );
}
