import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { getLocalizedDayName } from '../dashboard/DetailedDayCard';
import { useLanguage } from '../../context/LanguageContext';
import { BrandColors } from '../../constants/theme';
import { DayAgenda } from '../../types/dashboard';
import { BodyStatus, Season } from '../../types/season';
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
 * The colourful top of Home: how far the goal is, how this week is going and
 * the streak, with one dot per day. Tapping a day opens it in the Week view.
 */
export function HomeWeekHero({ week, streak, season, bodyGoal, onPressDay, onPressGoal }: HomeWeekHeroProps) {
  const { t } = useLanguage();

  const sessions = week.flatMap((d) => d.workouts.filter((w) => !isRest(w.type)));
  const done = sessions.filter((w) => w.isCompleted).length;
  const current = season?.currentWeek || null;
  const bodyDays = bodyGoal?.goalDate
    ? Math.round((new Date(String(bodyGoal.goalDate).slice(0, 10) + 'T12:00:00').getTime() - new Date().setHours(12, 0, 0, 0)) / 86400000)
    : null;
  const goalName = season ? season.raceName : bodyGoal?.goalName;
  const goalDays = season ? season.daysToRace : bodyDays;
  const showGoal = Boolean(goalName && goalDays !== null && goalDays !== undefined && goalDays > 0);
  const weekTargets = current
    ? [formatVolume(current.volume, current.unit), ...current.longSessions.filter((l) => l.value > 0).map((l) => formatLongSession(t, l))].join(' · ')
    : null;

  return (
    <LinearGradient
      colors={[BrandColors.primary, BrandColors.deep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 20, padding: 16 }}
    >
      {/* Goal countdown, or a plain "this week" label when there is no dated goal */}
      <View className="flex-row items-center justify-between">
        <TouchableOpacity
          onPress={onPressGoal}
          disabled={!onPressGoal || !showGoal}
          activeOpacity={0.75}
          className="flex-row items-center gap-1.5 flex-1 mr-2"
        >
          <Ionicons name={showGoal ? 'flag' : 'calendar-outline'} size={13} color="#FFFFFF" />
          <Text className="text-xs font-bold text-white/90 flex-shrink" numberOfLines={1}>
            {showGoal ? t('home.heroDaysTo', { days: goalDays ?? 0, goal: goalName ?? '' }) : t('home.heroThisWeek')}
          </Text>
          {showGoal && onPressGoal && <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.8)" />}
        </TouchableOpacity>
        {current && (
          <View className="bg-white/20 px-2 py-0.5 rounded-full">
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-white">
              {current.isRecovery ? t('goal.recoveryShort') : phaseLabel(t, current.phase)} · {t('home.heroWeekOf', { n: current.index, total: current.total })}
            </Text>
          </View>
        )}
      </View>

      {/* Week progress and streak */}
      <View className="flex-row items-end justify-between mt-3">
        <View>
          <Text className="text-white font-extrabold font-rajdhani" style={{ fontSize: 34, lineHeight: 36 }}>
            {done}
            <Text className="text-white/60" style={{ fontSize: 22 }}>
              {' '}/ {sessions.length}
            </Text>
          </Text>
          <Text className="text-xs font-semibold text-white/80">{t('home.heroSessionsDone')}</Text>
          {weekTargets && (
            <Text className="text-[11px] font-semibold text-white/80 mt-0.5" numberOfLines={1}>
              {t('home.heroTargets', { targets: weekTargets })}
            </Text>
          )}
        </View>
        {streak > 0 && (
          <View className="flex-row items-center gap-1 bg-white/20 px-2.5 py-1 rounded-full">
            <Ionicons name="flame" size={13} color="#FDBA74" />
            <Text className="text-xs font-extrabold text-white">{t('home.heroStreak', { count: streak })}</Text>
          </View>
        )}
      </View>

      {/* One dot per day */}
      <View className="flex-row justify-between mt-4">
        {week.map((day, idx) => {
          const active = day.workouts.filter((w) => !isRest(w.type));
          const first = active[0];
          const allDone = active.length > 0 && active.every((w) => w.isCompleted);
          const missed = active.length > 0 && !allDone && day.isPast && !day.isToday;

          let circle = 'bg-white/20';
          if (allDone) circle = 'bg-white';
          else if (missed) circle = 'bg-white/10';
          if (day.isToday && !allDone) circle += ' border-2 border-white';

          return (
            <TouchableOpacity
              key={day.fullDate || idx}
              onPress={() => onPressDay(idx)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={day.dateStr}
              className="items-center gap-1.5"
            >
              <Text className={`text-[10px] font-bold ${day.isToday ? 'text-white' : 'text-white/70'}`}>
                {getLocalizedDayName(day.dayName, t).charAt(0)}
              </Text>
              <View className={`w-9 h-9 rounded-full items-center justify-center ${circle}`}>
                {allDone ? (
                  <Ionicons name="checkmark" size={18} color={BrandColors.deep} />
                ) : first ? (
                  <MaterialCommunityIcons name={getSportGlyph(first.type)} size={17} color={missed ? 'rgba(255,255,255,0.45)' : '#FFFFFF'} />
                ) : (
                  <View className="w-1.5 h-1.5 rounded-full bg-white/50" />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </LinearGradient>
  );
}
