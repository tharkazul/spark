import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Pressable, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { G, Path, Ellipse, Circle, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useUser } from '../../context/UserStore';
import { useLanguage } from '../../context/LanguageContext';
import { translate } from '../../locales/i18n';
import { useActivities } from '../../context/ActivityStore';
import { fatiguePercentages, MuscleGroup } from '../../domain/muscleLoad';
import { BottomSheetModal, BottomSheetHeader } from '../ui/BottomSheetModal';
import {
  AppleHealthDailyBiometrics,
  computeCardiovascularStrain,
} from '../../services/appleHealthService';
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
  biometrics?: AppleHealthDailyBiometrics | null;
  recentBiometrics?: AppleHealthDailyBiometrics[];
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

/** Localized display name for a body part ID (falls back to a readable version of the ID). */
export const getBodyPartLabel = (partId: string): string => {
  if (!partId) return '';
  const key = `bodyParts.${partId}`;
  const label = translate(key);
  return label !== key ? label : BODY_PARTS_LOOKUP[partId] || partId.replace(/_/g, ' ');
};

/**
 * Maps each SVG body part ID to one of the 6 core muscle groups modeled in muscleLoad.ts.
 */
export const PART_TO_MUSCLE_GROUP: Record<string, MuscleGroup> = {
  // Quads
  quads_left: 'quads',
  quads_right: 'quads',
  knee_left: 'quads',
  knee_right: 'quads',

  // Calves, Shins & Feet
  calves_left: 'calves',
  calves_right: 'calves',
  shin_left: 'calves',
  shin_right: 'calves',
  foot_left: 'calves',
  foot_right: 'calves',
  heel_left: 'calves',
  heel_right: 'calves',

  // Hamstrings
  hamstrings_left: 'hamstrings',
  hamstrings_right: 'hamstrings',

  // Glutes & Hips
  glutes_left: 'glutes',
  glutes_right: 'glutes',
  hips_left: 'glutes',
  hips_right: 'glutes',

  // Core & Abdominals & Lower Back
  abs_left: 'core',
  abs_right: 'core',
  obliques_left: 'core',
  obliques_right: 'core',
  lower_back_left: 'core',
  lower_back_right: 'core',

  // Upper Body, Shoulders & Arms
  chest_left: 'upper',
  chest_right: 'upper',
  shoulder_left: 'upper',
  shoulder_right: 'upper',
  biceps_left: 'upper',
  biceps_right: 'upper',
  forearm_left: 'upper',
  forearm_right: 'upper',
  hand_left: 'upper',
  hand_right: 'upper',
  traps_left: 'upper',
  traps_right: 'upper',
  rear_delt_left: 'upper',
  rear_delt_right: 'upper',
  lats_left: 'upper',
  lats_right: 'upper',
  triceps_left: 'upper',
  triceps_right: 'upper',
  head: 'upper',
  neck: 'upper',
};

/**
 * Calculates continuous RGB color gradient from fresh green towards fatigued red.
 */
export function getFatigueColor(pct: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [16, 185, 129]],    // #10B981 (Fresh green)
    [25, [34, 197, 94]],    // #22C55E (Healthy green)
    [45, [132, 204, 22]],   // #84CC16 (Lime / Building)
    [65, [245, 158, 11]],   // #F59E0B (Amber / Moderate)
    [80, [249, 115, 22]],   // #F97316 (Orange / High)
    [100, [239, 68, 68]],   // #EF4444 (Red / Exhausted)
  ];

  const clamped = Math.max(0, Math.min(100, pct));
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (clamped >= p0 && clamped <= p1) {
      const ratio = (clamped - p0) / (p1 - p0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * ratio);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * ratio);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return '#EF4444';
}

/**
 * Robust matching between SVG part IDs and niggle body_part strings.
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

// Fixed image dimensions capped at 260pt height:
const FIXED_CANVAS_WIDTH = 115;
const FIXED_CANVAS_HEIGHT = 260;

export const AnatomicalBodyMap: React.FC<AnatomicalBodyMapProps> = ({
  activeNiggles = [],
  onSelectBodyPart,
  initialSize,
  onSizeChange,
  genderOverride,
  biometrics,
  recentBiometrics = [],
}) => {
  const { user } = useUser();
  const { activities } = useActivities();
  const { t } = useLanguage();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [view, setView] = useState<BodyView>('front');
  const [size, setSize] = useState<BodySize>(initialSize || 'medium');
  const [showCardioModal, setShowCardioModal] = useState(false);
  const lastPressTime = useRef<number>(0);

  // Compute 7-day workload muscle fatigue percentages from activities:
  const fatigueScores = useMemo(() => {
    return fatiguePercentages(activities as any);
  }, [activities]);

  // Compute systemic cardiovascular & autonomic recovery strain:
  const cardioStrain = useMemo(() => {
    return computeCardiovascularStrain(biometrics, recentBiometrics);
    // `t` changes with the language, so the localized strain copy is recomputed too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometrics, recentBiometrics, t]);

  // Load persisted size preference on mount if not provided as initialSize:
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

  const getPartColor = (
    partId: string
  ): { fill: string; stroke: string; strokeWidth: number } => {
    const niggleSev = getNiggleSeverity(partId);

    // 1. If part has an active injury/niggle: highlight with prominent warning/injury colors
    if (niggleSev >= 4) {
      return { fill: '#DC2626', stroke: '#FF4D4D', strokeWidth: 2.4 };
    }
    if (niggleSev >= 2) {
      return { fill: '#F97316', stroke: '#FFA56E', strokeWidth: 2.2 };
    }
    if (niggleSev === 1) {
      return { fill: '#F59E0B', stroke: '#FCD34D', strokeWidth: 2.0 };
    }

    // 2. Cardiovascular Core Strain: if part is chest or upper core, factor in autonomic/RHR strain
    const isChest = partId === 'chest_left' || partId === 'chest_right';
    const isCore = partId === 'abs_left' || partId === 'abs_right';
    if ((isChest || isCore) && cardioStrain.strainLevel !== 'none') {
      if (cardioStrain.strainLevel === 'high') {
        return { fill: isChest ? '#EF4444' : '#F87171', stroke: '#FF4D4D', strokeWidth: 2.0 };
      }
      if (cardioStrain.strainLevel === 'elevated') {
        return { fill: isChest ? '#F59E0B' : '#FBBF24', stroke: '#FCD34D', strokeWidth: 1.8 };
      }
      if (cardioStrain.strainLevel === 'moderate') {
        return { fill: isChest ? '#EAB308' : '#FDE047', stroke: '#FEF08A', strokeWidth: 1.5 };
      }
    }

    // 3. Otherwise: color based on muscle fatigue (fresh = green, fatigued = yellow/orange/red)
    const muscleGroup = PART_TO_MUSCLE_GROUP[partId];
    const fatiguePct = muscleGroup && fatigueScores ? (fatigueScores[muscleGroup] ?? 0) : 0;
    const fill = getFatigueColor(fatiguePct);
    const stroke = isDark ? '#1E293B' : '#FFFFFF';
    const strokeWidth = 1.3;

    return { fill, stroke, strokeWidth };
  };

  const handlePress = (partId: string) => {
    const now = Date.now();
    if (now - lastPressTime.current < 350) return;
    lastPressTime.current = now;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // If tapping chest when elevated cardio strain is present, offer to inspect cardio status
    const isChest = partId === 'chest_left' || partId === 'chest_right';
    if (isChest && cardioStrain.strainLevel !== 'none' && getNiggleSeverity(partId) === 0) {
      setShowCardioModal(true);
      return;
    }

    const name = getBodyPartLabel(partId);
    onSelectBodyPart(partId, name);
  };

  const modelElements = useMemo(() => {
    return getBodyModel(effectiveGender, size, view);
  }, [effectiveGender, size, view]);

  return (
    <View className="items-center py-2">
      {/* Top Controls: View Switcher (Front/Back) & Avatar Size (Small/Medium/Large) */}
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
              {t('bodyMap.front')}
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
              {t('bodyMap.back')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Interactive Cardiovascular Strain Alert Chip (if strain is elevated/moderate) */}
      {cardioStrain.strainLevel !== 'none' && (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCardioModal(true);
          }}
          className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl mb-3 border self-stretch justify-between ${
            cardioStrain.strainLevel === 'high'
              ? 'bg-red-500/10 border-red-500/30'
              : cardioStrain.strainLevel === 'elevated'
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-yellow-500/10 border-yellow-500/30'
          }`}
        >
          <View className="flex-row items-center gap-2 flex-1 mr-2">
            <View
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  cardioStrain.strainLevel === 'high'
                    ? '#EF4444'
                    : cardioStrain.strainLevel === 'elevated'
                    ? '#F59E0B'
                    : '#EAB308',
              }}
            />
            <Text
              className="text-xs font-bold flex-1"
              numberOfLines={1}
              style={{
                color:
                  cardioStrain.strainLevel === 'high'
                    ? '#EF4444'
                    : cardioStrain.strainLevel === 'elevated'
                    ? '#F59E0B'
                    : '#EAB308',
              }}
            >
              {cardioStrain.headline}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            {cardioStrain.rhrDelta !== null && (
              <Text className="text-[10px] text-theme-muted font-bold">
                {cardioStrain.rhrDelta >= 0 ? `+${cardioStrain.rhrDelta}` : cardioStrain.rhrDelta} bpm
              </Text>
            )}
            <Ionicons name="chevron-forward" size={13} color="#94A3B8" />
          </View>
        </TouchableOpacity>
      )}

      {/* SVG Anatomical Mannequin Body Map Canvas - Fixed Container Size */}
      <View className="bg-theme-bg/60 p-4 rounded-2xl shadow-sm relative items-center justify-center">
        <Pressable
          onPress={(e) => {
            const { locationX, locationY } = e.nativeEvent;
            const scale = 200 / FIXED_CANVAS_WIDTH;
            const detectedPart = getBodyPartFromCoordinates(
              locationX * scale,
              locationY * scale,
              view
            );
            if (detectedPart) {
              handlePress(detectedPart);
            }
          }}
          style={{ width: FIXED_CANVAS_WIDTH, height: FIXED_CANVAS_HEIGHT }}
        >
          <Svg
            key={`body_svg_${effectiveGender}_${size}_${view}`}
            width={FIXED_CANVAS_WIDTH}
            height={FIXED_CANVAS_HEIGHT}
            viewBox="0 0 200 460"
          >
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

            {/* Rendered Body Model Elements */}
            <G id="body">
              {modelElements.map((el) => {
                const { fill, stroke, strokeWidth } = getPartColor(el.id);
                const hasNiggle = getNiggleSeverity(el.id) > 0;
                // Distinct key including view, size, gender and part id prevents native node reuse/caching glitches
                const elementKey = `${effectiveGender}_${size}_${view}_${el.id}`;

                if (el.type === 'ellipse') {
                  return (
                    <Ellipse
                      key={elementKey}
                      id={el.id}
                      cx={el.cx}
                      cy={el.cy}
                      rx={el.rx}
                      ry={el.ry}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      strokeLinejoin="round"
                      opacity={hasNiggle ? 1.0 : 0.92}
                      onPress={() => handlePress(el.id)}
                    />
                  );
                }

                return (
                  <Path
                    key={elementKey}
                    id={el.id}
                    d={el.d}
                    transform={el.transform || undefined}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                    opacity={hasNiggle ? 1.0 : 0.92}
                    onPress={() => handlePress(el.id)}
                  />
                );
              })}
            </G>

            {/* Cardio Strain Pulse Marker on Front View */}
            {cardioStrain.strainLevel !== 'none' && view === 'front' && (
              <G
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowCardioModal(true);
                }}
              >
                <Circle
                  cx="100"
                  cy="100"
                  r="13"
                  fill={cardioStrain.strainLevel === 'high' ? '#EF444433' : '#F59E0B33'}
                  stroke={cardioStrain.strainLevel === 'high' ? '#EF4444' : '#F59E0B'}
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                />
                <Circle
                  cx="100"
                  cy="100"
                  r="5"
                  fill={cardioStrain.strainLevel === 'high' ? '#EF4444' : '#F59E0B'}
                />
              </G>
            )}
          </Svg>
        </Pressable>

        {/* Status Heatmap Color Legend: Fresh (Green) -> Fatigued (Orange) -> Injured (Red) */}
        <View className="flex-row items-center justify-center gap-x-4 mt-3 flex-wrap">
          <View className="flex-row items-center gap-x-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
            <Text className="text-[11px] font-semibold text-theme-muted">{t('bodyMap.fresh')}</Text>
          </View>
          <View className="flex-row items-center gap-x-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
            <Text className="text-[11px] font-semibold text-theme-muted">{t('bodyMap.fatigued')}</Text>
          </View>
          <View className="flex-row items-center gap-x-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
            <Text className="text-[11px] font-semibold text-theme-muted">{t('bodyMap.injured')}</Text>
          </View>
          {cardioStrain.strainLevel !== 'none' && (
            <TouchableOpacity
              onPress={() => setShowCardioModal(true)}
              className="flex-row items-center gap-x-1.5"
            >
              <Ionicons
                name="heart"
                size={11}
                color={cardioStrain.strainLevel === 'high' ? '#EF4444' : '#F59E0B'}
              />
              <Text
                className="text-[11px] font-bold"
                style={{ color: cardioStrain.strainLevel === 'high' ? '#EF4444' : '#F59E0B' }}
              >
                {t('bodyMap.cardioLoad')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text className="text-[11px] text-theme-muted/80 mt-1.5 font-medium">
          {t('bodyMap.tapHint')}
        </Text>
      </View>

      {/* Cardiovascular Strain Diagnostic Bottom Sheet */}
      <BottomSheetModal
        visible={showCardioModal}
        onClose={() => setShowCardioModal(false)}
        showHandle={true}
        header={
          <View className="flex-row items-center gap-3 pb-3 mb-3 border-b border-theme-border/60">
            <View
              className="w-10 h-10 rounded-2xl items-center justify-center"
              style={{
                backgroundColor:
                  cardioStrain.strainLevel === 'high'
                    ? '#EF444420'
                    : cardioStrain.strainLevel === 'elevated'
                    ? '#F59E0B20'
                    : '#EAB30820',
              }}
            >
              <Ionicons
                name="heart"
                size={22}
                color={
                  cardioStrain.strainLevel === 'high'
                    ? '#EF4444'
                    : cardioStrain.strainLevel === 'elevated'
                    ? '#F59E0B'
                    : '#EAB308'
                }
              />
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-theme-text">
                {cardioStrain.headline}
              </Text>
              <Text className="text-xs text-theme-muted font-medium">
                {t('bodyMap.cardioSubtitle')}
              </Text>
            </View>
          </View>
        }
      >
        <View className="p-1">
          {/* Metric Tiles (Resting HR & HRV SDNN) */}
          <View className="flex-row gap-3 mb-4">
            {/* Resting HR Tile */}
            <View className="flex-1 bg-slate-800/40 p-3.5 rounded-2xl border border-slate-700/40">
              <Text className="text-[11px] text-theme-muted font-bold uppercase tracking-wider">
                {t('bodyMap.restingHr')}
              </Text>
              <View className="flex-row items-baseline gap-1 my-1">
                <Text className="text-2xl font-black text-theme-text">
                  {cardioStrain.restingHr ?? '--'}
                </Text>
                <Text className="text-xs text-theme-muted font-bold">bpm</Text>
              </View>
              {cardioStrain.rhrDelta !== null && (
                <Text
                  className="text-xs font-bold"
                  style={{
                    color:
                      cardioStrain.rhrDelta > 3
                        ? '#F59E0B'
                        : cardioStrain.rhrDelta < 0
                        ? '#10B981'
                        : '#38BDF8',
                  }}
                >
                  {cardioStrain.rhrDelta >= 0 ? `▲ +${cardioStrain.rhrDelta}` : `▼ ${cardioStrain.rhrDelta}`} {t('bodyMap.bpmVs7d')}
                </Text>
              )}
            </View>

            {/* HRV SDNN Tile */}
            <View className="flex-1 bg-slate-800/40 p-3.5 rounded-2xl border border-slate-700/40">
              <Text className="text-[11px] text-theme-muted font-bold uppercase tracking-wider">
                HRV (SDNN)
              </Text>
              <View className="flex-row items-baseline gap-1 my-1">
                <Text className="text-2xl font-black text-theme-text">
                  {cardioStrain.hrv ?? '--'}
                </Text>
                <Text className="text-xs text-theme-muted font-bold">ms</Text>
              </View>
              {cardioStrain.hrvDelta !== null && (
                <Text
                  className="text-xs font-bold"
                  style={{
                    color:
                      cardioStrain.hrvDelta < -6
                        ? '#F87171'
                        : cardioStrain.hrvDelta > 5
                        ? '#10B981'
                        : '#38BDF8',
                  }}
                >
                  {cardioStrain.hrvDelta >= 0 ? `▲ +${cardioStrain.hrvDelta}` : `▼ ${cardioStrain.hrvDelta}`} {t('bodyMap.msVs7d')}
                </Text>
              )}
            </View>
          </View>

          {/* Diagnostic Explanation */}
          <View className="bg-theme-inset/70 p-3.5 rounded-2xl mb-4 border border-theme-border/50">
            <Text className="text-xs font-bold text-theme-text mb-1">
              {t('bodyMap.recoveryInsight')}
            </Text>
            <Text className="text-xs text-theme-muted leading-relaxed">
              {cardioStrain.description}
            </Text>
          </View>

          {/* Actionable Coach Recommendation */}
          <View className="bg-theme-accent/10 p-3.5 rounded-2xl border border-theme-accent/25 mb-4">
            <View className="flex-row items-center gap-2 mb-1">
              <Ionicons name="sparkles" size={14} color="#0EA5E9" />
              <Text className="text-xs font-bold text-theme-accent">
                {t('bodyMap.coachRecommendation')}
              </Text>
            </View>
            <Text className="text-xs text-theme-text font-medium leading-relaxed">
              {cardioStrain.actionAdvice}
            </Text>
          </View>

          {/* Close Button */}
          <TouchableOpacity
            onPress={() => setShowCardioModal(false)}
            className="w-full py-3 bg-theme-accent rounded-xl items-center justify-center mt-1"
          >
            <Text className="text-white font-bold text-sm">{t('bodyMap.understood')}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>
    </View>
  );
};
