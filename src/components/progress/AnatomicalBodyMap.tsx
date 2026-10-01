import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Pressable, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { G, Path, Ellipse, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useUser } from '../../context/UserStore';
import {
  getBodyModel,
  BodySize,
  BodyGender,
  BodyView,
} from '../../constants/bodyModels';

export type { BodySize, BodyGender, BodyView };

export interface ActiveNiggle {
  id?: number | string;
  body_part: string;
  severity: number; // 1 - 5
  notes?: string;
}

export interface AnatomicalBodyMapProps {
  activeNiggles?: ActiveNiggle[];
  onSelectBodyPart: (bodyPartId: string, displayName: string) => void;
  initialSize?: BodySize;
  onSizeChange?: (size: BodySize) => void;
  genderOverride?: BodyGender;
}

export const BODY_PARTS_LOOKUP: Record<string, string> = {
  // Front Single Parts
  head: 'Head',
  neck: 'Neck',

  // Front Paired Parts (Person's side: left / right)
  shoulder_left: 'Left Shoulder',
  shoulder_right: 'Right Shoulder',
  chest_left: 'Left Chest',
  chest_right: 'Right Chest',
  abs_left: 'Left Abdominals',
  abs_right: 'Right Abdominals',
  obliques_left: 'Left Obliques',
  obliques_right: 'Right Obliques',
  biceps_left: 'Left Biceps',
  biceps_right: 'Right Biceps',
  forearm_left: 'Left Forearm',
  forearm_right: 'Right Forearm',
  hand_left: 'Left Hand & Wrist',
  hand_right: 'Right Hand & Wrist',
  hips_left: 'Left Hip',
  hips_right: 'Right Hip',
  quads_left: 'Left Quadricep',
  quads_right: 'Right Quadricep',
  knee_left: 'Left Knee',
  knee_right: 'Right Knee',
  shin_left: 'Left Shin',
  shin_right: 'Right Shin',
  foot_left: 'Left Foot',
  foot_right: 'Right Foot',

  // Back Paired Parts
  traps_left: 'Left Trapezius',
  traps_right: 'Right Trapezius',
  rear_delt_left: 'Left Rear Deltoid',
  rear_delt_right: 'Right Rear Deltoid',
  lats_left: 'Left Latissimus',
  lats_right: 'Right Latissimus',
  lower_back_left: 'Left Lower Back',
  lower_back_right: 'Right Lower Back',
  triceps_left: 'Left Triceps',
  triceps_right: 'Right Triceps',
  glutes_left: 'Left Glute',
  glutes_right: 'Right Glute',
  hamstrings_left: 'Left Hamstring',
  hamstrings_right: 'Right Hamstring',
  calves_left: 'Left Calf',
  calves_right: 'Right Calf',
  heel_left: 'Left Heel & Achilles',
  heel_right: 'Right Heel & Achilles',

  // Legacy mappings for backwards compatibility with existing logs
  head_neck: 'Head & Neck',
  left_shoulder: 'Left Shoulder',
  right_shoulder: 'Right Shoulder',
  chest: 'Chest & Pectorals',
  upper_back: 'Upper Back & Shoulders',
  lower_back: 'Lower Back & Spine',
  core: 'Core & Abdominals',
  left_arm: 'Left Arm & Elbow',
  right_arm: 'Right Arm & Elbow',
  left_glute: 'Left Glute',
  right_glute: 'Right Glute',
  left_quad: 'Left Quadricep',
  right_quad: 'Right Quadricep',
  left_hamstring: 'Left Hamstring',
  right_hamstring: 'Right Hamstring',
  left_knee: 'Left Knee',
  right_knee: 'Right Knee',
  left_calf: 'Left Calf & Shin',
  right_calf: 'Right Calf & Shin',
  left_ankle_foot: 'Left Ankle & Foot',
  right_ankle_foot: 'Right Ankle & Foot',
};

/**
 * Robust matching between SVG part IDs and niggle body_part strings.
 * Handles prefix/suffix sides ('shoulder_left' <-> 'left_shoulder'),
 * singular/plural forms ('quads_left' <-> 'left_quad'), and anatomical groupings.
 */
export const partMatchesNiggle = (svgPartId: string, nigglePartId: string): boolean => {
  const s = svgPartId.toLowerCase().trim();
  const n = nigglePartId.toLowerCase().trim();
  if (s === n) return true;

  // Bilateral inversion e.g. shoulder_left <-> left_shoulder
  const sParts = s.split('_');
  if (sParts.length === 2) {
    if (sParts[1] === 'left' && n === `left_${sParts[0]}`) return true;
    if (sParts[1] === 'right' && n === `right_${sParts[0]}`) return true;
    if (sParts[0] === 'left' && n === `${sParts[1]}_left`) return true;
    if (sParts[0] === 'right' && n === `${sParts[1]}_right`) return true;
  }

  // Quads
  if (s === 'quads_left' && (n === 'left_quad' || n === 'quad_left' || n === 'quads')) return true;
  if (s === 'quads_right' && (n === 'right_quad' || n === 'quad_right' || n === 'quads')) return true;

  // Calves
  if (s === 'calves_left' && (n === 'left_calf' || n === 'calf_left' || n === 'calves')) return true;
  if (s === 'calves_right' && (n === 'right_calf' || n === 'calf_right' || n === 'calves')) return true;

  // Feet / Ankles / Heels
  if ((s === 'foot_left' || s === 'heel_left') && (n === 'left_ankle_foot' || n === 'ankle_foot_left' || n === 'left_foot')) return true;
  if ((s === 'foot_right' || s === 'heel_right') && (n === 'right_ankle_foot' || n === 'ankle_foot_right' || n === 'right_foot')) return true;

  // Arms / Delts
  if ((s === 'biceps_left' || s === 'forearm_left' || s === 'triceps_left') && n === 'left_arm') return true;
  if ((s === 'biceps_right' || s === 'forearm_right' || s === 'triceps_right') && n === 'right_arm') return true;

  // Back / Torso
  if ((s === 'traps_left' || s === 'traps_right' || s === 'rear_delt_left' || s === 'rear_delt_right') && n === 'upper_back') return true;
  if ((s === 'lower_back_left' || s === 'lower_back_right') && n === 'lower_back') return true;
  if ((s === 'abs_left' || s === 'abs_right' || s === 'obliques_left' || s === 'obliques_right') && n === 'core') return true;
  if ((s === 'chest_left' || s === 'chest_right') && n === 'chest') return true;
  if ((s === 'head' || s === 'neck') && n === 'head_neck') return true;

  return false;
};

/**
 * Coordinate mapping fallback for touch hit-testing on the 200x460 canvas.
 * Accounts for viewer's left (x < 100) vs viewer's right (x > 100):
 * - On Front view: viewer's left is person's right (_right), viewer's right is person's left (_left)
 * - On Back view: viewer's left is person's left (_left), viewer's right is person's right (_right)
 */
export const getBodyPartFromCoordinates = (
  x: number,
  y: number,
  view: BodyView
): string | null => {
  if (view === 'front') {
    if (y <= 54 && x >= 70 && x <= 130) return 'head';
    if (y > 54 && y <= 74 && x >= 80 && x <= 120) return 'neck';
    if (y >= 74 && y <= 122) {
      if (x < 80) return 'shoulder_right';
      if (x <= 100) return 'chest_right';
      if (x <= 120) return 'chest_left';
      return 'shoulder_left';
    }
    if (y > 122 && y <= 162) {
      if (x < 72) return 'biceps_right';
      if (x < 83) return 'obliques_right';
      if (x <= 100) return 'abs_right';
      if (x <= 117) return 'abs_left';
      if (x <= 128) return 'obliques_left';
      return 'biceps_left';
    }
    if (y > 162 && y <= 192) {
      if (x < 72) return 'forearm_right';
      if (x < 83) return 'obliques_right';
      if (x <= 100) return 'abs_right';
      if (x <= 117) return 'abs_left';
      if (x <= 128) return 'obliques_left';
      return 'forearm_left';
    }
    if (y > 192 && y <= 216) {
      if (x < 70) return 'forearm_right';
      if (x <= 100) return 'hips_right';
      if (x <= 130) return 'hips_left';
      return 'forearm_left';
    }
    if (y > 216 && y <= 232) {
      if (x < 70) return 'hand_right';
      if (x <= 100) return 'hips_right';
      if (x <= 130) return 'hips_left';
      return 'hand_left';
    }
    if (y > 232 && y <= 256) {
      if (x < 70) return 'hand_right';
      if (x <= 100) return 'quads_right';
      if (x <= 130) return 'quads_left';
      return 'hand_left';
    }
    if (y > 256 && y <= 332) {
      return x <= 100 ? 'quads_right' : 'quads_left';
    }
    if (y > 332 && y <= 358) {
      return x <= 100 ? 'knee_right' : 'knee_left';
    }
    if (y > 358 && y <= 422) {
      return x <= 100 ? 'shin_right' : 'shin_left';
    }
    if (y > 422 && y <= 460) {
      return x <= 100 ? 'foot_right' : 'foot_left';
    }
  } else {
    // Back view
    if (y <= 54 && x >= 70 && x <= 130) return 'head';
    if (y > 54 && y <= 70 && x >= 80 && x <= 120) return 'neck';
    if (y > 70 && y <= 122) {
      if (x < 75) return 'rear_delt_left';
      if (x <= 100) return 'traps_left';
      if (x <= 125) return 'traps_right';
      return 'rear_delt_right';
    }
    if (y > 122 && y <= 162) {
      if (x < 72) return 'triceps_left';
      if (x <= 100) return 'lats_left';
      if (x <= 128) return 'lats_right';
      return 'triceps_right';
    }
    if (y > 162 && y <= 214) {
      if (x < 72) return 'forearm_left';
      if (x <= 100) return 'lower_back_left';
      if (x <= 128) return 'lower_back_right';
      return 'forearm_right';
    }
    if (y > 214 && y <= 256) {
      if (x < 70) return 'hand_left';
      if (x <= 100) return 'glutes_left';
      if (x <= 130) return 'glutes_right';
      return 'hand_right';
    }
    if (y > 256 && y <= 264) {
      return x <= 100 ? 'glutes_left' : 'glutes_right';
    }
    if (y > 264 && y <= 334) {
      return x <= 100 ? 'hamstrings_left' : 'hamstrings_right';
    }
    if (y > 334 && y <= 422) {
      return x <= 100 ? 'calves_left' : 'calves_right';
    }
    if (y > 422 && y <= 460) {
      return x <= 100 ? 'heel_left' : 'heel_right';
    }
  }

  return null;
};

const SIZE_DIMENSIONS: Record<BodySize, { width: number; height: number }> = {
  small: { width: 140, height: 322 },
  medium: { width: 170, height: 391 },
  large: { width: 200, height: 460 },
};

export const AnatomicalBodyMap: React.FC<AnatomicalBodyMapProps> = ({
  activeNiggles = [],
  onSelectBodyPart,
  initialSize,
  onSizeChange,
  genderOverride,
}) => {
  const { user } = useUser();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [view, setView] = useState<BodyView>('front');
  const [size, setSize] = useState<BodySize>(initialSize || 'medium');
  const lastPressTime = useRef<number>(0);

  // Load persisted size preference on mount if not provided as initialSize
  useEffect(() => {
    if (initialSize) {
      setSize(initialSize);
      return;
    }
    AsyncStorage.getItem('@rooka_body_avatar_size')
      .then((stored) => {
        if (stored === 'small' || stored === 'medium' || stored === 'large') {
          setSize(stored as BodySize);
        }
      })
      .catch(() => {});
  }, [initialSize]);

  // Gender selection:
  // Male uses male.
  // Female or "Prefer not to say" / "Prefer not to share" uses female.
  const effectiveGender: BodyGender = useMemo(() => {
    if (genderOverride) return genderOverride;
    const g = user?.gender?.trim().toLowerCase();
    if (g === 'male') return 'male';
    return 'female';
  }, [genderOverride, user?.gender]);

  const handleSizeSelect = (newSize: BodySize) => {
    Haptics.selectionAsync();
    setSize(newSize);
    AsyncStorage.setItem('@rooka_body_avatar_size', newSize).catch(() => {});
    if (onSizeChange) onSizeChange(newSize);
  };

  const getNiggleSeverity = (partId: string): number => {
    const found = activeNiggles.find((n) => partMatchesNiggle(partId, n.body_part));
    return found ? Number(found.severity) : 0;
  };

  const getPartColor = (partId: string): { fill: string; stroke: string } => {
    const severity = getNiggleSeverity(partId);
    if (severity >= 4) return { fill: '#E3494F', stroke: '#FF6B70' };
    if (severity >= 2) return { fill: '#F98845', stroke: '#FFA56E' };
    if (severity === 1) return { fill: '#F9CF45', stroke: '#FFE382' };
    return isDark
      ? { fill: '#2A343D', stroke: '#404E5A' }
      : { fill: 'url(#skin)', stroke: '#FFFFFF' };
  };

  const handlePress = (partId: string) => {
    const now = Date.now();
    if (now - lastPressTime.current < 350) return;
    lastPressTime.current = now;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const name = BODY_PARTS_LOOKUP[partId] || partId.replace('_', ' ');
    onSelectBodyPart(partId, name);
  };

  const modelElements = useMemo(() => {
    return getBodyModel(effectiveGender, size, view);
  }, [effectiveGender, size, view]);

  const dimensions = SIZE_DIMENSIONS[size];

  return (
    <View className="items-center py-2">
      {/* Top Controls: View Switcher (Front/Back) & Size Selector (Small/Medium/Large) */}
      <View className="flex-row items-center justify-between w-full mb-3 px-1 flex-wrap gap-2">
        {/* Front / Back Toggle Buttons */}
        <View className="flex-row bg-theme-inset/80 p-1 rounded-xl">
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setView('front');
            }}
            className={`px-3.5 py-1.5 rounded-lg ${
              view === 'front' ? 'bg-theme-accent' : 'bg-transparent'
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                view === 'front' ? 'text-white' : 'text-theme-muted'
              }`}
            >
              Front
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setView('back');
            }}
            className={`px-3.5 py-1.5 rounded-lg ${
              view === 'back' ? 'bg-theme-accent' : 'bg-transparent'
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                view === 'back' ? 'text-white' : 'text-theme-muted'
              }`}
            >
              Back
            </Text>
          </TouchableOpacity>
        </View>

        {/* Size Selector: Small, Medium, Large */}
        <View className="flex-row items-center bg-theme-inset/80 p-1 rounded-xl">
          {(['small', 'medium', 'large'] as const).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => handleSizeSelect(s)}
              className={`px-3 py-1.5 rounded-lg ${
                size === s ? 'bg-theme-accent' : 'bg-transparent'
              }`}
            >
              <Text
                className={`text-xs font-bold capitalize ${
                  size === s ? 'text-white' : 'text-theme-muted'
                }`}
              >
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* SVG Anatomical Mannequin Body Map Canvas */}
      <View className="bg-theme-bg/60 p-4 rounded-2xl shadow-sm relative items-center justify-center">
        <Pressable
          onPress={(e) => {
            const { locationX, locationY } = e.nativeEvent;
            const scale = 200 / dimensions.width;
            const detectedPart = getBodyPartFromCoordinates(
              locationX * scale,
              locationY * scale,
              view
            );
            if (detectedPart) {
              handlePress(detectedPart);
            }
          }}
          style={{ width: dimensions.width, height: dimensions.height }}
        >
          <Svg
            width={dimensions.width}
            height={dimensions.height}
            viewBox="0 0 200 460"
          >
            <Defs>
              <LinearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={isDark ? '#334155' : '#E9EEF4'} />
                <Stop offset="1" stopColor={isDark ? '#1E293B' : '#D5DDE7'} />
              </LinearGradient>
            </Defs>

            {/* Background aesthetic grid / concentric guidelines */}
            <Circle
              cx="100"
              cy="230"
              r="170"
              stroke="#5A6973"
              strokeWidth="0.5"
              strokeDasharray="4 4"
              opacity="0.12"
            />
            <Circle
              cx="100"
              cy="230"
              r="110"
              stroke="#5A6973"
              strokeWidth="0.5"
              strokeDasharray="2 2"
              opacity="0.08"
            />
            <Line
              x1="100"
              y1="10"
              x2="100"
              y2="450"
              stroke="#5A6973"
              strokeWidth="0.5"
              strokeDasharray="3 3"
              opacity="0.08"
            />

            {/* Rendered Body Model */}
            <G id="body">
              {modelElements.map((el) => {
                const { fill, stroke } = getPartColor(el.id);
                const hasNiggle = getNiggleSeverity(el.id) > 0;

                if (el.type === 'ellipse') {
                  return (
                    <Ellipse
                      key={el.id}
                      id={el.id}
                      cx={el.cx}
                      cy={el.cy}
                      rx={el.rx}
                      ry={el.ry}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={hasNiggle ? 2.2 : 1.4}
                      strokeLinejoin="round"
                      opacity={hasNiggle ? 0.98 : 0.88}
                      onPress={() => handlePress(el.id)}
                    />
                  );
                }

                return (
                  <Path
                    key={el.id}
                    id={el.id}
                    d={el.d}
                    transform={el.transform}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={hasNiggle ? 2.2 : 1.4}
                    strokeLinejoin="round"
                    opacity={hasNiggle ? 0.98 : 0.88}
                    onPress={() => handlePress(el.id)}
                  />
                );
              })}
            </G>
          </Svg>
        </Pressable>

        <Text className="text-xs text-theme-muted mt-2 font-medium">
          Tap any body region to log an issue or view severity
        </Text>
      </View>
    </View>
  );
};
