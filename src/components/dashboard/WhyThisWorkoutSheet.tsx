import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal } from '../ui/BottomSheetModal';
import { WorkoutItem, SportType } from '../../types/dashboard';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '../../context/LanguageContext';
import { useHealth } from '../../context/HealthStore';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { calculatePMCMetrics } from '../../utils/pmcUtils';
import { BODY_PARTS_LOOKUP, ActiveNiggle } from '../progress/AnatomicalBodyMap';
import { formatDuration, calculateWorkoutDurationMinutes } from '../../utils/format';

interface WhyThisWorkoutSheetProps {
  visible: boolean;
  onClose: () => void;
  workout: WorkoutItem | null;
  dayName: string;
}

export const WhyThisWorkoutSheet: React.FC<WhyThisWorkoutSheetProps> = ({
  visible,
  onClose,
  workout,
  dayName,
}) => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { user } = useUser();
  const { activities } = useActivities();
  const { physiqueLogs } = usePhysique();
  const { niggles } = useHealth();

  if (!workout) return null;

  const activeNiggles = (niggles || []) as ActiveNiggle[];
  const pmc = calculatePMCMetrics(
    activities,
    user?.athlete_metrics?.weight_kg || 0,
    physiqueLogs
  );

  const durationMin = calculateWorkoutDurationMinutes(workout);

  // Check user availability for this day of week
  const rawAvailability = (user as any)?.trainingAvailability || (user as any)?.training_availability;
  let dayMaxMins = 60;
  if (rawAvailability) {
    const dayKey = dayName.slice(0, 3);
    const availObj = typeof rawAvailability === 'string' ? JSON.parse(rawAvailability) : rawAvailability;
    const match = availObj?.[dayKey] || availObj?.[dayKey.toLowerCase()] || availObj?.[dayKey.toUpperCase()];
    if (match && typeof match.maxMinutes === 'number') {
      dayMaxMins = match.maxMinutes;
    }
  }

  // Derive physiological stimulus description based on sport and title
  const getStimulusRationale = () => {
    const title = (workout.title || '').toLowerCase();
    const sport = String(workout.type || '').toUpperCase();

    if (title.includes('zone 2') || title.includes('base') || title.includes('endurance') || title.includes('easy')) {
      return {
        focus: 'Aerobic Base Building & Mitochondrial Density',
        details: 'Calibrated below ventilatory threshold to maximize fat oxidation without creating autonomic stress.',
      };
    }
    if (title.includes('tempo') || title.includes('threshold') || title.includes('sweet spot')) {
      return {
        focus: 'Lactate Threshold & Clearance Efficiency',
        details: 'Structured intervals to raise sustainable aerobic power while monitoring muscular fatigue.',
      };
    }
    if (title.includes('vo2') || title.includes('interval') || title.includes('speed') || title.includes('hiit')) {
      return {
        focus: 'VO2 Max & Cardiac Stroke Volume',
        details: 'High-intensity intervals designed to expand aerobic ceiling, balanced with adequate recovery.',
      };
    }
    if (sport === 'STRENGTH') {
      return {
        focus: 'Neuromuscular Activation & Structural Resilience',
        details: 'Endurance-specific strength to bulletproof connective tissues and enhance movement economy.',
      };
    }
    return {
      focus: 'Targeted Aerobic Conditioning',
      details: 'Progressive training stimulus aligned with your macro-cycle and seasonal endurance milestones.',
    };
  };

  const stimulus = getStimulusRationale();

  return (
    <BottomSheetModal visible={visible} onClose={onClose} showHandle={true}>
      <View className="pb-4">
        {/* Header */}
        <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-theme-border/40">
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-full bg-theme-accent/15 items-center justify-center">
              <Ionicons name="sparkles" size={16} color={theme.tint} />
            </View>
            <View>
              <Text className="text-base font-bold text-theme-text font-jakarta">
                Why this workout?
              </Text>
              <Text className="text-xs text-theme-muted font-medium" numberOfLines={1}>
                {workout.title}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} className="max-h-[500px]">
          <View className="gap-y-3.5 pt-1">
            {/* 1. INJURY & SORENESS CONSIDERATIONS */}
            <View className="p-3.5 bg-theme-card/80 border border-theme-border/60 rounded-tile">
              <View className="flex-row items-center gap-2 mb-1.5">
                <Ionicons
                  name={activeNiggles.length > 0 ? 'shield-checkmark' : 'checkmark-circle'}
                  size={16}
                  color={activeNiggles.length > 0 ? '#F59E0B' : '#10B981'}
                />
                <Text className="text-xs font-bold text-theme-text uppercase tracking-wider">
                  Injury & Soreness Protection
                </Text>
              </View>
              {activeNiggles.length > 0 ? (
                <View className="gap-y-2 mt-1">
                  {activeNiggles.map((n) => {
                    const name = BODY_PARTS_LOOKUP[n.body_part] || n.body_part.replace('_', ' ');
                    return (
                      <View key={n.id} className="p-2 bg-theme-bg rounded-lg border border-theme-border/30">
                        <Text className="text-xs font-bold text-theme-text">
                          {name} · Severity {n.severity}/5
                        </Text>
                        <Text className="text-[11px] text-theme-muted mt-0.5 leading-relaxed">
                          Session prescribed to minimize high-impact loading on this area while preserving cardiovascular fitness.
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text className="text-xs text-theme-muted leading-relaxed">
                  No active niggles reported. Full movement mechanics cleared for prescribed training intensity.
                </Text>
              )}
            </View>

            {/* 2. FORM & TRAINING LOAD (PMC TSB) */}
            <View className="p-3.5 bg-theme-card/80 border border-theme-border/60 rounded-tile">
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="pulse" size={16} color="#6366F1" />
                  <Text className="text-xs font-bold text-theme-text uppercase tracking-wider">
                    Form & Training Load
                  </Text>
                </View>
                <View className="px-2 py-0.5 rounded-full bg-theme-accent/15">
                  <Text className="text-[10px] font-bold text-theme-accent">
                    TSB: {pmc.tsb > 0 ? `+${pmc.tsb.toFixed(1)}` : pmc.tsb.toFixed(1)}
                  </Text>
                </View>
              </View>
              <Text className="text-xs text-theme-muted leading-relaxed">
                {pmc.tsb < -25
                  ? 'Fatigue is elevated from recent heavy blocks. This session is throttled to prevent acute overreaching and support immune function.'
                  : pmc.tsb < -10
                  ? 'Optimal training window. Your fatigue-to-fitness ratio is primed to absorb this specific physiological stimulus.'
                  : 'Balanced form state. Adequate recovery buffer enables target pacing without excessive cardiovascular strain.'}
              </Text>
            </View>

            {/* 3. TIME AVAILABLE */}
            <View className="p-3.5 bg-theme-card/80 border border-theme-border/60 rounded-tile">
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="time-outline" size={16} color="#0EA5E9" />
                  <Text className="text-xs font-bold text-theme-text uppercase tracking-wider">
                    Time Window Match
                  </Text>
                </View>
                <Text className="text-xs font-bold text-theme-text font-rajdhani">
                  {formatDuration(durationMin)} / {dayMaxMins}m cap
                </Text>
              </View>
              <Text className="text-xs text-theme-muted leading-relaxed">
                Structured to fit within your {dayMaxMins}-minute availability for {dayName}. Pacing and rest intervals are optimized for maximum ROI without exceeding your schedule.
              </Text>
            </View>

            {/* 4. PHYSIOLOGICAL STIMULUS & WHAT CHANGED */}
            <View className="p-3.5 bg-theme-accent/10 border border-theme-accent/30 rounded-tile">
              <View className="flex-row items-center gap-2 mb-1.5">
                <Ionicons name="flame" size={16} color={theme.tint} />
                <Text className="text-xs font-bold text-theme-accent uppercase tracking-wider">
                  Target Stimulus & Rationale
                </Text>
              </View>
              <Text className="text-xs font-bold text-theme-text mb-1">
                {stimulus.focus}
              </Text>
              <Text className="text-xs text-theme-muted leading-relaxed">
                {stimulus.details}
              </Text>
              {workout.coachNote ? (
                <View className="mt-2.5 pt-2 border-t border-theme-accent/20">
                  <Text className="text-[11px] font-bold text-theme-accent mb-0.5">
                    Coach Direct Instruction:
                  </Text>
                  <Text className="text-xs text-theme-text italic">
                    &ldquo;{workout.coachNote}&rdquo;
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </View>
    </BottomSheetModal>
  );
};

export default WhyThisWorkoutSheet;
