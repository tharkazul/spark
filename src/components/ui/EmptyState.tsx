import React from 'react';
import {
  View,
  Text,
  useColorScheme,
  StyleProp,
  ViewStyle,
  Image,
  ImageSourcePropType,
} from 'react-native';
import Svg, { Circle, Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';
import { ScalePressable } from './ScalePressable';

export type EmptyStatePreset =
  | 'rest-day'
  | 'healthy-niggles'
  | 'empty-feed'
  | 'no-activity'
  | 'custom';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'outline';
}

export interface EmptyStateProps {
  preset?: EmptyStatePreset;
  badge?: string;
  title?: string;
  subtitle?: string;
  /** Custom icon name from Ionicons (used if preset is 'custom' or as an override) */
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Custom image source (e.g. require('../path/to/img.png')) */
  imageSource?: ImageSourcePropType;
  /** Custom React node illustration */
  illustration?: React.ReactNode;
  /** Primary action button */
  action?: EmptyStateAction;
  /** Optional secondary action link or button */
  secondaryAction?: EmptyStateAction;
  /** Optional coach note or quote banner embedded inside */
  coachNote?: string;
  /** Layout mode: 'card' (elevated with card background and border) or 'compact' (borderless/inline) */
  layout?: 'card' | 'compact';
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/**
 * Golden Rest Day Emblem & Biomechanical Recharge Aura
 * Features the golden moon and leaves emblem from assets with circadian pulse rings and ambient glow.
 */
function RestDayIllustration({
  isDark,
  imageSource,
}: {
  isDark: boolean;
  imageSource?: ImageSourcePropType;
}) {
  const accentColor = isDark ? '#FB923C' : '#F97316';
  const ringColor = isDark ? '#334155' : '#CBD5E1';
  const source = imageSource || require('../../../assets/images/restday.png');

  return (
    <View className="items-center justify-center mb-3 relative" style={{ width: 96, height: 96 }}>
      {/* Ambient Glow Disk & Concentric Biomechanical Pulse Rings */}
      <Svg width={96} height={96} viewBox="0 0 96 96" fill="none" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="restGlow" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={accentColor} stopOpacity={isDark ? "0.22" : "0.12"} />
            <Stop offset="100%" stopColor="#EAB308" stopOpacity={isDark ? "0.08" : "0.04"} />
          </LinearGradient>
          <LinearGradient id="restRingGrad" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={accentColor} stopOpacity="0.4" />
            <Stop offset="100%" stopColor="#EAB308" stopOpacity="0.15" />
          </LinearGradient>
        </Defs>

        {/* Ambient Glow Disk */}
        <Circle cx="48" cy="48" r="44" fill="url(#restGlow)" />

        {/* Concentric Biomechanical Pulse Rings */}
        <Circle cx="48" cy="48" r="38" stroke="url(#restRingGrad)" strokeWidth="1.5" strokeDasharray="3 4" />
        <Circle cx="48" cy="48" r="30" stroke={ringColor} strokeWidth="1" strokeOpacity={isDark ? "0.4" : "0.5"} />
      </Svg>

      {/* Golden Rest Day Emblem */}
      <Image
        source={source}
        style={{ width: 62, height: 62 }}
        resizeMode="contain"
      />
    </View>
  );
}

/**
 * Biomechanical 100% Healthy / Zero Niggles Illustration
 * Visualizes anatomical shielding, physiological structural integrity, and green check node.
 */
function HealthyNigglesIllustration({ isDark }: { isDark: boolean }) {
  const shieldColor = '#10B981'; // Emerald/Green 500
  const shieldStroke = isDark ? '#34D399' : '#059669';
  const nodeStroke = isDark ? '#334155' : '#CBD5E1';

  return (
    <View className="items-center justify-center mb-3">
      <Svg width={96} height={96} viewBox="0 0 96 96" fill="none">
        <Defs>
          <LinearGradient id="shieldGlow" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#10B981" stopOpacity={isDark ? "0.25" : "0.15"} />
            <Stop offset="100%" stopColor="#065F46" stopOpacity={isDark ? "0.05" : "0.02"} />
          </LinearGradient>
          <LinearGradient id="shieldGrad" x1="48" y1="20" x2="48" y2="76" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={shieldStroke} stopOpacity="0.85" />
            <Stop offset="100%" stopColor={shieldColor} stopOpacity="0.3" />
          </LinearGradient>
        </Defs>

        {/* Outer Circular Aura */}
        <Circle cx="48" cy="48" r="42" fill="url(#shieldGlow)" />
        <Circle cx="48" cy="48" r="38" stroke={nodeStroke} strokeWidth="1" strokeDasharray="2 3" strokeOpacity={isDark ? "0.4" : "0.6"} />

        {/* Anatomical Shield Contour */}
        <Path
          d="M 48 20 C 60 20 70 23 72 32 C 72 52 58 68 48 74 C 38 68 24 52 24 32 C 26 23 36 20 48 20 Z"
          fill="url(#shieldGlow)"
          stroke="url(#shieldGrad)"
          strokeWidth="2"
        />

        {/* Inner Biomechanical Lattice */}
        <Path
          d="M 48 26 L 48 66 M 34 38 L 62 38 M 38 52 L 58 52"
          stroke={shieldStroke}
          strokeWidth="1"
          strokeOpacity={isDark ? "0.3" : "0.4"}
          strokeDasharray="2 2"
        />

        {/* Crisp Checkmark Node */}
        <Circle cx="48" cy="45" r="14" fill={shieldColor} />
        <Path
          d="M 42 45 L 46 49 L 54 41"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * Biomechanical Empty Social Feed / Network Illustration
 * Visualizes interconnected athlete nodes and dynamic pulse trails.
 */
function EmptyFeedIllustration({ isDark }: { isDark: boolean }) {
  const ember = isDark ? '#FB923C' : '#F97316';
  const cyan = isDark ? '#38BDF8' : '#0284C7';
  const bgRing = isDark ? '#334155' : '#CBD5E1';

  return (
    <View className="items-center justify-center mb-3">
      <Svg width={96} height={96} viewBox="0 0 96 96" fill="none">
        <Defs>
          <LinearGradient id="feedGlow" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={ember} stopOpacity={isDark ? "0.2" : "0.12"} />
            <Stop offset="100%" stopColor={cyan} stopOpacity={isDark ? "0.1" : "0.05"} />
          </LinearGradient>
        </Defs>

        {/* Orbital Background Rings */}
        <Circle cx="48" cy="48" r="42" fill="url(#feedGlow)" />
        <Circle cx="48" cy="48" r="34" stroke={bgRing} strokeWidth="1" strokeDasharray="3 3" strokeOpacity={isDark ? "0.35" : "0.5"} />
        <Circle cx="48" cy="48" r="22" stroke={bgRing} strokeWidth="1" strokeOpacity={isDark ? "0.2" : "0.3"} />

        {/* Telemetry Tri-Node Links */}
        <Path
          d="M 48 30 L 68 60 L 28 60 Z"
          stroke={isDark ? 'rgba(251, 146, 60, 0.4)' : 'rgba(249, 115, 22, 0.3)'}
          strokeWidth="1.5"
          strokeDasharray="2 3"
        />

        {/* Athlete Node 1 (Center Top) */}
        <Circle cx="48" cy="30" r="8" fill={ember} />
        <Circle cx="48" cy="30" r="12" stroke={ember} strokeWidth="1" strokeOpacity="0.4" />

        {/* Athlete Node 2 (Bottom Left) */}
        <Circle cx="28" cy="60" r="7" fill={cyan} />
        <Circle cx="28" cy="60" r="10" stroke={cyan} strokeWidth="1" strokeOpacity="0.3" />

        {/* Athlete Node 3 (Bottom Right) */}
        <Circle cx="68" cy="60" r="7" fill="#10B981" />
        <Circle cx="68" cy="60" r="10" stroke="#10B981" strokeWidth="1" strokeOpacity="0.3" />

        {/* Mini Icons / Pulses */}
        <Path d="M 45 30 H 51 M 48 27 V 33" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
        <Circle cx="28" cy="60" r="2.5" fill="#FFFFFF" />
        <Circle cx="68" cy="60" r="2.5" fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

/**
 * Biomechanical No Activity History Illustration
 * Visualizes telemetry track, target milestone, and sports telemetry pulse.
 */
function NoActivityIllustration({ isDark }: { isDark: boolean }) {
  const ember = isDark ? '#FB923C' : '#F97316';
  const trackColor = isDark ? '#334155' : '#E2E8F0';

  return (
    <View className="items-center justify-center mb-3">
      <Svg width={96} height={96} viewBox="0 0 96 96" fill="none">
        <Defs>
          <LinearGradient id="actGlow" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={ember} stopOpacity={isDark ? "0.2" : "0.12"} />
            <Stop offset="100%" stopColor="#3B82F6" stopOpacity={isDark ? "0.08" : "0.04"} />
          </LinearGradient>
        </Defs>

        <Circle cx="48" cy="48" r="42" fill="url(#actGlow)" />

        {/* Track Loop */}
        <Rect x="20" y="24" width="56" height="48" rx="24" stroke={trackColor} strokeWidth="3" strokeOpacity={isDark ? "0.5" : "0.7"} />
        <Rect x="28" y="32" width="40" height="32" rx="16" stroke={trackColor} strokeWidth="1" strokeDasharray="3 3" strokeOpacity={isDark ? "0.3" : "0.5"} />

        {/* Telemetry Target Flag / Runner Pulse */}
        <Path
          d="M 32 48 C 38 42, 44 54, 50 48 C 56 42, 60 52, 64 48"
          stroke={ember}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        <Circle cx="64" cy="48" r="4" fill={ember} />
        <Circle cx="64" cy="48" r="8" stroke={ember} strokeWidth="1" strokeOpacity="0.4" />
      </Svg>
    </View>
  );
}

/**
 * Custom / Default Icon Chamber
 */
function CustomIconIllustration({
  iconName = 'cube-outline',
  isDark,
}: {
  iconName?: keyof typeof Ionicons.glyphMap;
  isDark: boolean;
}) {
  const theme = useTheme();
  return (
    <View className="items-center justify-center mb-3">
      <View className="w-16 h-16 rounded-full items-center justify-center bg-theme-accent/15 border border-theme-accent/30">
        <Ionicons name={iconName} size={28} color={theme.tint} />
      </View>
    </View>
  );
}

/**
 * Purpose-Built Branded Empty State
 * Replaces raw blank boxes with branded biomechanical vector illustrations,
 * helpful physiological context, and tactile action CTAs.
 */
export function EmptyState({
  preset = 'custom',
  badge,
  title,
  subtitle,
  iconName,
  imageSource,
  illustration,
  action,
  secondaryAction,
  coachNote,
  layout = 'card',
  style,
  className = '',
}: EmptyStateProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const renderIllustration = () => {
    if (illustration) return illustration;

    if (imageSource && preset !== 'rest-day') {
      return (
        <View className="items-center justify-center mb-3">
          <Image
            source={imageSource}
            style={{ width: 64, height: 64 }}
            resizeMode="contain"
          />
        </View>
      );
    }

    switch (preset) {
      case 'rest-day':
        return <RestDayIllustration isDark={isDark} imageSource={imageSource} />;
      case 'healthy-niggles':
        return <HealthyNigglesIllustration isDark={isDark} />;
      case 'empty-feed':
        return <EmptyFeedIllustration isDark={isDark} />;
      case 'no-activity':
        return <NoActivityIllustration isDark={isDark} />;
      case 'custom':
      default:
        return <CustomIconIllustration iconName={iconName} isDark={isDark} />;
    }
  };

  const containerClasses =
    layout === 'card'
      ? 'p-6 rounded-card border border-theme-border/70 bg-theme-card items-center text-center shadow-xs'
      : 'py-4 px-2 items-center text-center';

  return (
    <View style={style} className={`${containerClasses} ${className}`}>
      {/* Optional Badge */}
      {badge && (
        <View className="mb-2.5 px-2.5 py-0.5 rounded-full bg-theme-accent/15 border border-theme-accent/30">
          <Text className="text-[10px] font-extrabold text-theme-accent uppercase tracking-wider font-rajdhani">
            {badge}
          </Text>
        </View>
      )}

      {/* Vector Illustration */}
      {renderIllustration()}

      {/* Title */}
      {Boolean(title) && (
        <Text className="text-base font-extrabold text-theme-text text-center px-2">
          {title}
        </Text>
      )}

      {/* Educational Context Subtitle */}
      {Boolean(subtitle) && (
        <Text className="text-xs text-theme-muted text-center mt-1.5 px-4 leading-relaxed max-w-[340px]">
          {subtitle}
        </Text>
      )}

      {/* Optional Embedded Coach Note */}
      {coachNote && (
        <View className="mt-3.5 mx-2 p-3 rounded-tile bg-theme-accent/5 border-l-2 border-l-theme-accent flex-row gap-2 items-start text-left">
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={14}
            color={theme.tint}
            style={{ marginTop: 2 }}
          />
          <Text className="flex-1 text-xs text-theme-muted leading-relaxed italic">
            &ldquo;{coachNote}&rdquo;
          </Text>
        </View>
      )}

      {/* Primary Action Button */}
      {action && (
        <ScalePressable
          onPress={action.onPress}
          activeScale={0.96}
          haptic="selection"
          className={`mt-4 px-5 py-2.5 rounded-control flex-row items-center gap-1.5 ${
            action.variant === 'secondary'
              ? 'bg-theme-accent/15 border border-theme-accent/30'
              : action.variant === 'outline'
              ? 'bg-transparent border border-theme-border'
              : 'bg-theme-accent'
          }`}
        >
          {action.icon && (
            <Ionicons
              name={action.icon}
              size={15}
              color={
                action.variant === 'secondary'
                  ? theme.tint
                  : action.variant === 'outline'
                  ? theme.text
                  : '#FFFFFF'
              }
            />
          )}
          <Text
            className={`text-xs font-extrabold ${
              action.variant === 'secondary'
                ? 'text-theme-accent'
                : action.variant === 'outline'
                ? 'text-theme-text'
                : 'text-white'
            }`}
          >
            {action.label}
          </Text>
        </ScalePressable>
      )}

      {/* Secondary Action Link */}
      {secondaryAction && (
        <ScalePressable
          onPress={secondaryAction.onPress}
          activeScale={0.97}
          haptic="selection"
          className="mt-2.5 py-1 px-3"
        >
          <Text className="text-xs font-semibold text-theme-muted">
            {secondaryAction.label}
          </Text>
        </ScalePressable>
      )}
    </View>
  );
}

export default EmptyState;
