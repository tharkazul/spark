import React from 'react';
import { View, Image, useColorScheme, ImageSourcePropType } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { sportColor } from '../../constants/theme';
import { getSportEmblem } from '../../utils/disciplineConfig';

export interface SportMedallionProps {
  sport?: string;
  size?: number;
  onAccent?: boolean;
  className?: string;
  style?: any;
}

const GLYPH_MAP: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  RUN: 'run',
  BIKE: 'bike',
  RIDE: 'bike',
  SWIM: 'swim',
  STRENGTH: 'dumbbell',
  MOBILITY: 'yoga',
  YOGA: 'yoga',
  WALK: 'walk',
  HIKE: 'hiking',
  CARDIO: 'heart-pulse',
  HIIT: 'lightning-bolt',
  TRIATHLON: 'trophy-variant',
  REST: 'weather-night',
};

/**
 * SportMedallion component adhering to Rooka UI/UX Spec (Ticket R2-14):
 * - >= 36pt: renders high-res 3D medallion PNG artwork
 * - <= 32pt: renders matching MaterialCommunityIcons glyph in sport color inside a 14% tinted circle
 * - onAccent: renders white glyph and translucent white circle when placed over colored/accent buttons/cards
 */
export function SportMedallion({
  sport = 'REST',
  size = 40,
  onAccent = false,
  className = '',
  style,
}: SportMedallionProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const cleanKey = String(sport || 'REST').toUpperCase().trim();
  const color = onAccent ? '#FFFFFF' : sportColor(cleanKey, scheme);
  const isGlyphOnly = size <= 32;

  if (isGlyphOnly) {
    const glyphName = GLYPH_MAP[cleanKey] || 'dumbbell';
    const iconSize = Math.round(size * 0.58);
    const bgColor = onAccent ? 'rgba(255, 255, 255, 0.22)' : `${color}24`; // 14% tint

    return (
      <View
        accessible={true}
        accessibilityRole="image"
        accessibilityLabel={`${cleanKey} icon`}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bgColor,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
        className={className}
      >
        <MaterialCommunityIcons name={glyphName} size={iconSize} color={color} />
      </View>
    );
  }

  const emblemSource: ImageSourcePropType = getSportEmblem(cleanKey);

  return (
    <View
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={`${cleanKey} medallion`}
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
      className={className}
    >
      <Image
        source={emblemSource}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

export default SportMedallion;
