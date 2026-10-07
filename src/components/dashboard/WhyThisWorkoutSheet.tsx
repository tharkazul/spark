import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal, BottomSheetHeader } from '../ui/BottomSheetModal';
import { Button } from '../ui/Button';
import { WorkoutItem, SportType } from '../../types/dashboard';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '../../context/LanguageContext';
import { useHealth } from '../../context/HealthStore';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { calculatePMCMetrics } from '../../utils/pmcUtils';
import { getBodyPartLabel, ActiveNiggle } from '../progress/AnatomicalBodyMap';
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

    // Workout titles are written in the athlete's language, so match keywords in all app languages.
    if (/zone 2|zone2|base|basis|endurance|easy|duur|rustig|grundlage|locker|fondo|suave|fácil|facile|fondamentale/.test(title)) {
      return { focus: t('whyWorkout.aerobicFocus'), details: t('whyWorkout.aerobicDetails') };
    }
    if (/tempo|threshold|sweet spot|drempel|schwelle|umbral|seuil/.test(title)) {
      return { focus: t('whyWorkout.thresholdFocus'), details: t('whyWorkout.thresholdDetails') };
    }
    if (/vo2|interval|speed|hiit|snelheid|sprint|intervall|intervalo|intervalle|vitesse|velocidad/.test(title)) {
      return { focus: t('whyWorkout.vo2Focus'), details: t('whyWorkout.vo2Details') };
    }
    if (sport === 'STRENGTH') {
      return { focus: t('whyWorkout.strengthFocus'), details: t('whyWorkout.strengthDetails') };
    }
    return { focus: t('whyWorkout.defaultFocus'), details: t('whyWorkout.defaultDetails') };
  };

  const stimulus = getStimulusRationale();

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      showHandle={true}
      header={
        <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-theme-border/40">
          <View className="flex-row items-center gap-2 flex-1 mr-2">
            <View className="w-8 h-8 rounded-full bg-theme-accent/15 items-center justify-center">
              <Ionicons name="sparkles" size={16} color={theme.tint} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-theme-text font-jakarta">
                {t('whyWorkout.title')}
              </Text>
              <Text className="text-xs text-theme-muted font-medium" numberOfLines={1}>
                {workout.title}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              onClose();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="w-8 h-8 rounded-full bg-theme-inset items-center justify-center"
          >
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      }
    >
      <View className="pb-4">
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
                  {t('whyWorkout.injuryTitle')}
                </Text>
              </View>
              {activeNiggles.length > 0 ? (
                <View className="gap-y-2 mt-1">
                  {activeNiggles.map((n) => {
                    const name = getBodyPartLabel(n.body_part);
                    return (
                      <View key={n.id} className="p-2 bg-theme-bg rounded-lg border border-theme-border/30">
                        <Text className="text-xs font-bold text-theme-text">
                          {name} · {t('whyWorkout.severity', { level: n.severity })}
                        </Text>
                        <Text className="text-[11px] text-theme-muted mt-0.5 leading-relaxed">
                          {t('whyWorkout.injuryProtected')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text className="text-xs text-theme-muted leading-relaxed">
                  {t('whyWorkout.noNiggles')}
                </Text>
              )}
            </View>

            {/* 2. FORM & TRAINING LOAD (PMC TSB) */}
            <View className="p-3.5 bg-theme-card/80 border border-theme-border/60 rounded-tile">
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="pulse" size={16} color="#6366F1" />
                  <Text className="text-xs font-bold text-theme-text uppercase tracking-wider">
                    {t('whyWorkout.formTitle')}
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
                  ? t('whyWorkout.formFatigued')
                  : pmc.tsb < -10
                  ? t('whyWorkout.formOptimal')
                  : t('whyWorkout.formBalanced')}
              </Text>
            </View>

            {/* 3. TIME AVAILABLE */}
            <View className="p-3.5 bg-theme-card/80 border border-theme-border/60 rounded-tile">
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="time-outline" size={16} color="#0EA5E9" />
                  <Text className="text-xs font-bold text-theme-text uppercase tracking-wider">
                    {t('whyWorkout.timeTitle')}
                  </Text>
                </View>
                <Text className="text-xs font-bold text-theme-text font-rajdhani">
                  {formatDuration(durationMin)} / {t('whyWorkout.capMinutes', { mins: dayMaxMins })}
                </Text>
              </View>
              <Text className="text-xs text-theme-muted leading-relaxed">
                {t('whyWorkout.timeBody', { mins: dayMaxMins, day: t(`days.${dayName.slice(0, 3).toLowerCase()}`, dayName) })}
              </Text>
            </View>

            {/* 4. PHYSIOLOGICAL STIMULUS & WHAT CHANGED */}
            <View className="p-3.5 bg-theme-accent/10 border border-theme-accent/30 rounded-tile">
              <View className="flex-row items-center gap-2 mb-1.5">
                <Ionicons name="flame" size={16} color={theme.tint} />
                <Text className="text-xs font-bold text-theme-accent uppercase tracking-wider">
                  {t('whyWorkout.stimulusTitle')}
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
                    {t('whyWorkout.coachInstruction')}
                  </Text>
                  <Text className="text-xs text-theme-text italic">
                    &ldquo;{workout.coachNote}&rdquo;
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>

        {/* Done / Dismiss Button */}
        <View className="pt-3 border-t border-theme-border/40 mt-3">
          <Button
            label={t('common.gotIt')}
            variant="primary"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
          />
        </View>
      </View>
    </BottomSheetModal>
  );
};

export default WhyThisWorkoutSheet;
