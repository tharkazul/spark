import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { SportMedallion } from '../ui/SportMedallion';
import { WhyThisWorkoutSheet } from '../dashboard/WhyThisWorkoutSheet';
import { WorkoutStructureBar } from '../dashboard/WorkoutStructureBar';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { DayAgenda, WorkoutItem } from '../../types/dashboard';
import { calculateWorkoutDurationMinutes, formatDuration } from '../../utils/format';

interface HomeTodayCardProps {
  today?: DayAgenda;
  tomorrow?: DayAgenda;
  weatherTemp?: string;
  weatherIcon?: string;
  hasAnyDevices: boolean;
  onSelectWorkout: (workout: WorkoutItem) => void;
  onSendToDevice: (workout: WorkoutItem) => void;
  onAdapt: () => void;
  onOpenTomorrow: () => void;
}

const isRest = (type?: string) => String(type || '').toUpperCase() === 'REST';

/**
 * Compact Today card for Home: the session(s) at a glance with "Why?", Adapt
 * and send-to-watch, plus a one-line look at tomorrow. It is deliberately
 * shorter than the Week view's day card so the coach card below stays on
 * screen when the app opens; the full card lives in Week.
 */
export function HomeTodayCard({
  today,
  tomorrow,
  weatherTemp,
  weatherIcon,
  hasAnyDevices,
  onSelectWorkout,
  onSendToDevice,
  onAdapt,
  onOpenTomorrow,
}: HomeTodayCardProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const [whyWorkout, setWhyWorkout] = useState<WorkoutItem | null>(null);

  const sessions = (today?.workouts || []).filter((w) => !isRest(w.type));
  const tomorrowSessions = (tomorrow?.workouts || []).filter((w) => !isRest(w.type));
  const tomorrowFirst = tomorrowSessions[0];
  const tomorrowDuration = tomorrowFirst ? formatDuration(calculateWorkoutDurationMinutes(tomorrowFirst)) : '';
  const tomorrowSummary = tomorrowFirst
    ? [
        tomorrowFirst.title,
        // Plan titles often already lead with it ("40 min Easy Run").
        (tomorrowFirst.title || '').includes(tomorrowDuration) ? null : tomorrowDuration,
        tomorrowSessions.length > 1 ? t('home.tomorrowMore', { count: tomorrowSessions.length - 1 }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : t('home.tomorrowRest');

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header: label, weather, Adapt */}
      <View className="flex-row items-center justify-between px-4 pt-3.5">
        <View className="flex-row items-center gap-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted">{t('common.today', 'Today')}</Text>
          {weatherTemp ? (
            <View className="flex-row items-center gap-1">
              <Ionicons name={(weatherIcon as any) || 'partly-sunny-outline'} size={12} color={theme.textSecondary} />
              <Text className="text-xs font-medium text-theme-muted">{weatherTemp}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAdapt();
          }}
          activeOpacity={0.75}
          accessibilityRole="button"
          className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-theme-accent/10"
        >
          <Ionicons name="flash" size={12} color={theme.tint} />
          <Text className="text-xs font-bold text-theme-accent">{t('dashboard.adapt', 'Adapt')}</Text>
        </TouchableOpacity>
      </View>

      {/* Sessions, or the rest day */}
      <View className="px-4 pt-2.5 pb-3 gap-y-3">
        {sessions.length === 0 ? (
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-theme-inset items-center justify-center">
              <Ionicons name="moon" size={18} color="#94A3B8" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-theme-text">{t('home.tomorrowRest')}</Text>
              <Text className="text-xs text-theme-muted mt-0.5" numberOfLines={2}>
                {t('dashboard.restDayTodayDetails', 'Rest today. Aim for good sleep and some gentle mobility.')}
              </Text>
            </View>
          </View>
        ) : (
          sessions.map((workout) => (
            <View key={workout.id}>
              <View className="flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    onSelectWorkout(workout);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  className="flex-1 flex-row items-center gap-3"
                >
                  <SportMedallion sport={workout.type} size={44} />
                  <View className="flex-1">
                    <Text className="text-base font-bold text-theme-text leading-snug" numberOfLines={1}>
                      {workout.title}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <Text className="text-sm font-bold text-theme-muted font-rajdhani">
                        {formatDuration(calculateWorkoutDurationMinutes(workout))}
                      </Text>
                      <Chip variant="points" size="sm" label={Math.round(workout.rookaPoints || 0)} />
                      {workout.isCompleted ? (
                        <View className="flex-row items-center gap-1 bg-semantic-success-bg px-2 py-0.5 rounded-full">
                          <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                          <Text className="text-[10px] font-extrabold text-semantic-success-text">
                            {t('common.doneUpper', 'DONE')}
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.selectionAsync();
                            setWhyWorkout(workout);
                          }}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          className="flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-theme-accent/10 border border-theme-accent/25"
                        >
                          <Ionicons name="sparkles" size={10} color={theme.tint} />
                          <Text className="text-[11px] font-bold text-theme-accent-text">{t('whyWorkout.titleShort')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>

                {hasAnyDevices && !workout.isCompleted && (
                  <TouchableOpacity
                    onPress={() => onSendToDevice(workout)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={t('dashboard.sendToDevice', 'Send to device')}
                    className="w-10 h-10 rounded-full bg-theme-accent/10 items-center justify-center"
                  >
                    <Ionicons name="watch-outline" size={18} color={theme.tint} />
                  </TouchableOpacity>
                )}
              </View>

              {workout.steps && workout.steps.length > 0 && (
                <View className="mt-2.5">
                  <WorkoutStructureBar steps={workout.steps} />
                </View>
              )}
            </View>
          ))
        )}
      </View>

      {/* Tomorrow, one line */}
      {tomorrow && (
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            onOpenTomorrow();
          }}
          activeOpacity={0.75}
          accessibilityRole="button"
          className="flex-row items-center gap-2 px-4 py-2.5 border-t border-theme-border/60 bg-theme-inset/50"
        >
          <Text className="text-[11px] font-bold uppercase tracking-wider text-theme-muted">{t('home.tomorrow')}</Text>
          <Text className="text-xs font-semibold text-theme-text flex-1" numberOfLines={1}>
            {tomorrowSummary}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
        </TouchableOpacity>
      )}

      <WhyThisWorkoutSheet
        visible={Boolean(whyWorkout)}
        workout={whyWorkout}
        dayName={today?.dayName || ''}
        onClose={() => setWhyWorkout(null)}
      />
    </Card>
  );
}
