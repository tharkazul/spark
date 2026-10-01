import React, { useState } from 'react';
import { View, Text, Image, StyleProp, ViewStyle } from 'react-native';
import { getFullProfilePhotoUrl, getUserAvatarTint } from '../../utils/avatarUtils';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export interface AvatarProps {
  photoUrl?: string | null;
  userId?: string | number | null;
  name?: string | null;
  size?: AvatarSize;
  ringColor?: string;
  ringWidth?: number;
  showOnlineDot?: boolean;
  badgeText?: string;
  badgeBg?: string;
  badgeTextColor?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

/**
 * Universal Avatar Component (Ticket R2-11):
 * - Sizes: xs (24), sm (32), md (40), lg (48), xl (64) or custom numeric.
 * - 6 deterministic background colors via hash(userId) % 6.
 * - Fallback to 2-letter initials if no photo or on image load error.
 * - Bold Rajdhani tabular initials.
 */
export function Avatar({
  photoUrl,
  userId,
  name,
  size = 'md',
  ringColor,
  ringWidth = 2,
  showOnlineDot = false,
  badgeText,
  badgeBg = '#0EA5E9',
  badgeTextColor = '#FFFFFF',
  style,
  className = '',
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const pxSize = typeof size === 'number' ? size : SIZE_MAP[size] || 40;

  const fullUrl = !imageError ? getFullProfilePhotoUrl(photoUrl) : null;
  const tint = getUserAvatarTint(userId || name);
  const initials = getInitials(name);

  const containerStyle: ViewStyle = {
    width: pxSize,
    height: pxSize,
    borderRadius: pxSize / 2,
    borderWidth: ringColor ? ringWidth : 0,
    borderColor: ringColor || 'transparent',
    overflow: 'hidden',
  };

  const fontSize = Math.max(10, Math.round(pxSize * 0.38));

  return (
    <View style={[{ width: pxSize, height: pxSize }, style]} className={`relative items-center justify-center ${className}`}>
      <View style={containerStyle} className="items-center justify-center">
        {fullUrl ? (
          <Image
            source={{ uri: fullUrl }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View
            style={{ width: '100%', height: '100%' }}
            className={`${tint.bg} items-center justify-center`}
          >
            <Text
              style={{ fontSize }}
              className={`font-extrabold ${tint.text} font-rajdhani`}
            >
              {initials}
            </Text>
          </View>
        )}
      </View>

      {/* Online status indicator */}
      {showOnlineDot && (
        <View
          style={{
            width: Math.max(8, Math.round(pxSize * 0.25)),
            height: Math.max(8, Math.round(pxSize * 0.25)),
            borderRadius: 999,
            bottom: 0,
            right: 0,
            borderWidth: 2,
          }}
          className="absolute bg-emerald-500 border-theme-bg"
        />
      )}

      {/* Optional Badge */}
      {badgeText && (
        <View
          style={{
            position: 'absolute',
            bottom: -4,
            backgroundColor: badgeBg,
            borderRadius: 999,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderWidth: 1.5,
          }}
          className="border-theme-bg items-center justify-center"
        >
          <Text
            style={{ color: badgeTextColor }}
            className="text-[10px] font-bold font-rajdhani"
          >
            {badgeText}
          </Text>
        </View>
      )}
    </View>
  );
}

export { Avatar as UserAvatar };
