import React from 'react';
import { View, Image, useColorScheme, ImageSourcePropType } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { sportColor } from '../../constants/theme';
import {
  getSportEmblem,
  normalizeSportType,
  detectSubSport,
  SubSport,
  SUB_SPORT_EMBLEMS,
  SUB_SPORT_FAMILY,
} from '../../utils/disciplineConfig';

export interface SportMedallionProps {
  sport?: string;
  /** The session or activity title. Picks a ball or racket sport's own medallion ("Hockey training"). */
  title?: string;
  size?: number;
  onAccent?: boolean;
  /** Always draw the 3D medallion artwork, also below 36pt (where the flat glyph is the default). */
  emblem?: boolean;
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

const SUB_SPORT_GLYPHS: Record<SubSport, keyof typeof MaterialCommunityIcons.glyphMap> = {
  HOCKEY: 'hockey-sticks',
  FOOTBALL: 'soccer',
  TENNIS: 'tennis',
  PADEL: 'racquetball',
  BASKETBALL: 'basketball',
  VOLLEYBALL: 'volleyball',
  GOLF: 'golf',
  RUGBY: 'rugby',
};

/**
 * The MaterialCommunityIcons glyph for a sport, as used by the small medallions and the week
 * strip. With a title, ball and racket sports get their own glyph (hockey sticks, a racket).
 */
export function getSportGlyph(sport?: string, title?: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const sub = detectSubSport(sport, title);
  if (sub) return SUB_SPORT_GLYPHS[sub];
  return GLYPH_MAP[normalizeSportType(sport || 'REST')] || 'dumbbell';
}

/** The colour family for a session: the run gold for ball and racket sports, else its sport. */
export function getSportColorKey(sport?: string, title?: string): string {
  return detectSubSport(sport, title) ? SUB_SPORT_FAMILY : normalizeSportType(sport);
}

/**
 * SportMedallion component adhering to Rooka UI/UX Spec (Ticket R2-14):
 * - >= 36pt: renders high-res 3D medallion PNG artwork
 * - <= 32pt: renders matching MaterialCommunityIcons glyph in sport color inside a 14% tinted circle
 * - onAccent: renders white glyph and translucent white circle when placed over colored/accent buttons/cards
 */
export function SportMedallion({
  sport = 'REST',
  title,
  size = 40,
  onAccent = false,
  emblem = false,
  className = '',
  style,
}: SportMedallionProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const subSport = detectSubSport(sport, title);
  const cleanKey = subSport ? SUB_SPORT_FAMILY : normalizeSportType(sport);
  const label = (subSport || cleanKey).toLowerCase();
  const color = onAccent ? '#FFFFFF' : sportColor(cleanKey, scheme);
  const isGlyphOnly = size <= 32 && !emblem;

  if (isGlyphOnly) {
    const glyphName = subSport ? SUB_SPORT_GLYPHS[subSport] : GLYPH_MAP[cleanKey] || 'dumbbell';
    const iconSize = Math.round(size * 0.58);
    const bgColor = onAccent ? 'rgba(255, 255, 255, 0.22)' : `${color}24`; // 14% tint

    return (
      <View
        accessible={true}
        accessibilityRole="image"
        accessibilityLabel={`${label} icon`}
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

  const emblemSource: ImageSourcePropType = subSport ? SUB_SPORT_EMBLEMS[subSport] : getSportEmblem(cleanKey);

  return (
    <View
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={`${label} medallion`}
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
