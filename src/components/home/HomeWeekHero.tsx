import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { getLocalizedDayName } from '../dashboard/DetailedDayCard';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { DayAgenda } from '../../types/dashboard';
import { BodyStatus, Season } from '../../types/season';
import { normalizeSportType } from '../../utils/disciplineConfig';
import { calculateWorkoutDurationMinutes } from '../../utils/format';
import { formatLongSession, formatVolume, phaseLabel } from '../goal/seasonFormat';
import { getSportGlyph } from '../ui/SportMedallion';

interface HomeWeekHeroProps {
  /** The current Monday-to-Sunday week. */
  week: DayAgenda[];
  streak: number;
  season: Season | null;
  bodyGoal?: BodyStatus | null;
  onPressDay: (index: number) => void;
  onPressGoal?: () => void;
}

const isRest = (type?: string) => String(type || '').toUpperCase() === 'REST';

/**
 * The top of Home: how far the goal is, how this week is going and the
 * streak, with one dot per day. Tapping a day opens it in the Week view.
 *
 * A neutral card under a light accent wash, not a solid accent block. The
 * full-bleed gradient this replaced covered about a quarter of the screen,
 * and in dark mode it was hardcoded to the light-mode sky blue while
 * everything around it used ultramarine, so it read as a second accent
 * colour. Now the only solid accent here is today's circle, which leaves the
 * accent for the one action on the screen: send-to-watch on the Today card.
 */
export function HomeWeekHero({ week, streak, season, bodyGoal, onPressDay, onPressGoal }: HomeWeekHeroProps) {
  const { t } = useLanguage();
  const theme = useTheme();

  const sessions = week.flatMap((d) => d.workouts.filter((w) => !isRest(w.type)));
  const done = sessions.filter((w) => w.isCompleted).length;
  const current = season?.currentWeek || null;
  const bodyDays = bodyGoal?.goalDate
    ? Math.round((new Date(String(bodyGoal.goalDate).slice(0, 10) + 'T12:00:00').getTime() - new Date().setHours(12, 0, 0, 0)) / 86400000)
    : null;
  const goalName = season ? season.raceName : bodyGoal?.goalName;
  const goalDays = season ? season.daysToRace : bodyDays;
  const showGoal = Boolean(goalName && goalDays !== null && goalDays !== undefined && goalDays > 0);

  // What this week's plan actually holds. This used to show the season's target
  // volume, which differs from the sessions planned and, next to "0 / 4 done",
  // read as hours already trained. The target stays on the Goal tab.
  const weekPlanned = (() => {
    let plannedMins = 0;
    let longestMins = 0;
    let longestSport = 'OTHER';
    for (const w of sessions) {
      const mins = calculateWorkoutDurationMinutes(w);
      plannedMins += mins;
      if (mins > longestMins) {
        longestMins = mins;
        longestSport = normalizeSportType(w.type || w.sport);
      }
    }
    if (plannedMins <= 0) return null;
    const parts = [formatVolume(plannedMins, 'min')];
    if (sessions.length > 1) {
      parts.push(
        formatLongSession(t, {
          sport: longestSport === 'BIKE' ? 'Bike' : longestSport === 'RUN' ? 'Run' : 'Any',
          unit: 'min',
          value: longestMins,
        })
      );
    }
    return parts.join(' · ');
  })();

  return (
    <View className="rounded-card overflow-hidden bg-theme-card border border-theme-accent/35">
      <View className="bg-theme-accent/10 p-4">
        {/* Goal countdown, or a plain "this week" label when there is no dated goal */}
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            onPress={onPressGoal}
            disabled={!onPressGoal || !showGoal}
            activeOpacity={0.75}
            className="flex-row items-center gap-1.5 flex-1 mr-2"
          >
            <Ionicons name={showGoal ? 'flag' : 'calendar-outline'} size={13} color={theme.accentText} />
            <Text className="text-xs font-bold text-theme-text flex-shrink" numberOfLines={1}>
              {showGoal ? t('home.heroDaysTo', { days: goalDays ?? 0, goal: goalName ?? '' }) : t('home.heroThisWeek')}
            </Text>
            {showGoal && onPressGoal && <Ionicons name="chevron-forward" size={12} color={theme.textSecondary} />}
          </TouchableOpacity>
          {current && (
            <View className="bg-theme-text/10 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-extrabold uppercase tracking-wider text-theme-muted">
                {current.isRecovery ? t('goal.recoveryShort') : phaseLabel(t, current.phase)} · {t('home.heroWeekOf', { n: current.index, total: current.total })}
              </Text>
            </View>
          )}
        </View>

        {/* Week progress and streak */}
        <View className="flex-row items-end justify-between mt-3">
          <View>
            <Text className="text-theme-text font-extrabold font-rajdhani" style={{ fontSize: 34, lineHeight: 36 }}>
              {done}
              <Text className="text-theme-muted" style={{ fontSize: 22 }}>
                {' '}/ {sessions.length}
              </Text>
            </Text>
            <Text className="text-xs font-semibold text-theme-muted">{t('home.heroSessionsDone')}</Text>
            {weekPlanned && (
              <Text className="text-[11px] font-semibold text-theme-muted mt-0.5" numberOfLines={1}>
                {t('home.heroPlanned', { planned: weekPlanned })}
              </Text>
            )}
          </View>
          {streak > 0 && (
            <View className="flex-row items-center gap-1 bg-theme-text/10 px-2.5 py-1 rounded-full">
              <Ionicons name="flame" size={13} color={theme.warm} />
              <Text className="text-xs font-extrabold text-theme-text">{t('home.heroStreak', { count: streak })}</Text>
            </View>
          )}
        </View>

        {/* One dot per day. Done days invert (text colour fill, card-coloured
            check), today is the one solid accent, the rest stay quiet. */}
        <View className="flex-row justify-between mt-4">
          {week.map((day, idx) => {
            const active = day.workouts.filter((w) => !isRest(w.type));
            const first = active[0];
            const allDone = active.length > 0 && active.every((w) => w.isCompleted);
            const missed = active.length > 0 && !allDone && day.isPast && !day.isToday;
            const isTodayOpen = day.isToday && !allDone;

            let circle = 'bg-theme-text/5';
            if (allDone) circle = 'bg-theme-text';
            else if (isTodayOpen) circle = 'bg-theme-accent-strong';

            // 73 = ~45% alpha: a missed session stays visible but recedes.
            const glyphColor = isTodayOpen ? '#FFFFFF' : missed ? `${theme.textSecondary}73` : theme.textSecondary;

            return (
              <TouchableOpacity
                key={day.fullDate || idx}
                onPress={() => onPressDay(idx)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={day.dateStr}
                className="items-center gap-1.5"
              >
                <Text className={`text-[10px] ${day.isToday ? 'font-extrabold text-theme-text' : 'font-bold text-theme-muted'}`}>
                  {getLocalizedDayName(day.dayName, t).charAt(0)}
                </Text>
                <View className={`w-9 h-9 rounded-full items-center justify-center ${circle}`}>
                  {allDone ? (
                    <Ionicons name="checkmark" size={18} color={theme.card} />
                  ) : first ? (
                    <MaterialCommunityIcons name={getSportGlyph(first.type)} size={17} color={glyphColor} />
                  ) : (
                    <View className="w-1.5 h-1.5 rounded-full bg-theme-text/30" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}
