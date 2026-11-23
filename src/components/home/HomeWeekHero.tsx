import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { getLocalizedDayName } from '../dashboard/DetailedDayCard';
import { useLanguage } from '../../context/LanguageContext';
import { sportColor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { DayAgenda } from '../../types/dashboard';
import { BodyStatus, Season } from '../../types/season';
import { normalizeSportType } from '../../utils/disciplineConfig';
import { calculateWorkoutDurationMinutes } from '../../utils/format';
import { formatHours, phaseLabel } from '../goal/seasonFormat';
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

/** One sport block of a day. A brick (bike then run) is two parts. */
interface DayPart {
  sport: string;
  mins: number;
  done: boolean;
}

const isRest = (type?: string) => String(type || '').toUpperCase() === 'REST';

const BUBBLE_MIN = 22;
const BUBBLE_MAX = 40;
/** Room for the largest bubble plus today's two-ring outline (2 + 2 px each side). */
const SLOT = BUBBLE_MAX + 8;
const SEAM = 2;

/** "#RRGGBB" + two-digit hex alpha. Colours already carrying alpha are left alone. */
const withAlpha = (hex: string, alpha: string) => (hex.length === 7 ? hex + alpha : hex);

/**
 * A day's sessions as sport blocks, in order. Back-to-back sessions of the
 * same sport merge into one block. The planner writes a brick as two
 * workouts on the same date, so a bike and a run on one day become a
 * two-part capsule, and the bike always comes first.
 */
function dayParts(day: DayAgenda): DayPart[] {
  const parts: DayPart[] = [];
  for (const w of day.workouts) {
    if (isRest(w.type)) continue;
    const sport = normalizeSportType(w.type || w.sport);
    const mins = calculateWorkoutDurationMinutes(w);
    const last = parts[parts.length - 1];
    if (last && last.sport === sport) {
      last.mins += mins;
      last.done = last.done && Boolean(w.isCompleted);
    } else {
      parts.push({ sport, mins, done: Boolean(w.isCompleted) });
    }
  }
  if (parts.length === 2 && parts[0].sport === 'RUN' && parts[1].sport === 'BIKE') parts.reverse();
  // More than three blocks will not fit in a day column.
  return parts.slice(0, 3);
}

/**
 * The top of Home: the goal countdown, then the week as a line of sport
 * bubbles, then hours done against planned.
 *
 * Each bubble is the day's sport, sized by its minutes relative to the
 * longest day of the week, so the load shape reads without numbers. Done is
 * the solid sport colour, upcoming a light tint, and today a tint with an
 * outline. A day with two sports (a brick) is one capsule with a block per
 * sport. No card and no accent here: the sport colours carry the week, and
 * the accent stays with the one action on the screen, send-to-watch on the
 * Today card. Tapping a day opens it in the Week view.
 */
export function HomeWeekHero({ week, streak, season, bodyGoal, onPressDay, onPressGoal }: HomeWeekHeroProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const current = season?.currentWeek || null;
  const bodyDays = bodyGoal?.goalDate
    ? Math.round((new Date(String(bodyGoal.goalDate).slice(0, 10) + 'T12:00:00').getTime() - new Date().setHours(12, 0, 0, 0)) / 86400000)
    : null;
  const goalName = season ? season.raceName : bodyGoal?.goalName;
  const goalDays = season ? season.daysToRace : bodyDays;
  const showGoal = Boolean(goalName && goalDays !== null && goalDays !== undefined && goalDays > 0);

  const days = week.map((day) => {
    const parts = dayParts(day);
    return { day, parts, total: parts.reduce((sum, p) => sum + p.mins, 0) };
  });
  const longestDay = Math.max(0, ...days.map((d) => d.total));
  const plannedMins = days.reduce((sum, d) => sum + d.total, 0);
  const doneMins = days.reduce((sum, d) => sum + d.parts.reduce((s, p) => s + (p.done ? p.mins : 0), 0), 0);

  const sizeFor = (mins: number) =>
    mins > 0 && longestDay > 0
      ? Math.round(BUBBLE_MIN + (BUBBLE_MAX - BUBBLE_MIN) * Math.min(1, mins / longestDay))
      : 28;

  /** Fill and glyph colour for one block: solid when done, tinted otherwise. */
  const paint = (part: DayPart, day: DayAgenda) => {
    const color = sportColor(part.sport, scheme);
    if (part.done) return { fill: color, glyph: theme.background };
    if (day.isToday) return { fill: withAlpha(color, '4D'), glyph: color }; // 30%
    // A missed session stays visible but recedes. 14 = 8%, 73 = 45%.
    if (day.isPast) return { fill: withAlpha(color, '14'), glyph: withAlpha(color, '73') };
    return { fill: withAlpha(color, '29'), glyph: color }; // 16%
  };

  /**
   * A background-coloured ring cuts the timeline line around each bubble.
   * Today gets a second, text-coloured ring outside it.
   */
  const ringed = (node: React.ReactNode, height: number, isToday?: boolean) =>
    isToday ? (
      <View style={{ padding: 2, borderRadius: (height + 8) / 2, backgroundColor: theme.text }}>
        <View style={{ padding: 2, borderRadius: (height + 4) / 2, backgroundColor: theme.background }}>{node}</View>
      </View>
    ) : (
      <View style={{ padding: 3, borderRadius: (height + 6) / 2, backgroundColor: theme.background }}>{node}</View>
    );

  const renderBubble = (day: DayAgenda, part: DayPart, total: number) => {
    const size = sizeFor(total);
    const { fill, glyph } = paint(part, day);
    return ringed(
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill }} className="items-center justify-center">
        <MaterialCommunityIcons name={getSportGlyph(part.sport)} size={Math.round(size * 0.52)} color={glyph} />
      </View>,
      size,
      day.isToday
    );
  };

  /** A multi-sport day: one rounded capsule, a block per sport, widths by share of the day's minutes. */
  const renderCapsule = (day: DayAgenda, parts: DayPart[], total: number) => {
    const n = parts.length;
    const height = n >= 3 ? 24 : Math.min(32, Math.max(26, sizeFor(total)));
    const span = n * height * 0.78;
    const minBlock = height * 0.55;
    const spare = span - n * minBlock;
    return ringed(
      <View style={{ height, borderRadius: height / 2, gap: SEAM }} className="flex-row overflow-hidden">
        {parts.map((part, i) => {
          const share = total > 0 ? part.mins / total : 1 / n;
          const { fill, glyph } = paint(part, day);
          return (
            <View
              key={`${part.sport}-${i}`}
              style={{
                width: Math.round(minBlock + spare * share),
                height,
                backgroundColor: fill,
                paddingLeft: i === 0 ? 3 : 0,
                paddingRight: i === n - 1 ? 3 : 0,
              }}
              className="items-center justify-center"
            >
              <MaterialCommunityIcons name={getSportGlyph(part.sport)} size={Math.round(height * 0.45)} color={glyph} />
            </View>
          );
        })}
      </View>,
      height,
      day.isToday
    );
  };

  return (
    <View className="px-0.5 pt-1 pb-1.5 gap-3">
      {/* Goal countdown, or a plain "this week" label when there is no dated goal */}
      <View className="flex-row items-baseline justify-between gap-2">
        <TouchableOpacity
          onPress={onPressGoal}
          disabled={!onPressGoal || !showGoal}
          activeOpacity={0.75}
          className="flex-1 flex-shrink"
        >
          <Text className="text-theme-text font-extrabold" style={{ fontSize: 20, lineHeight: 26 }} numberOfLines={1}>
            {showGoal ? t('home.heroDaysTo', { days: goalDays ?? 0, goal: goalName ?? '' }) : t('home.heroThisWeek')}
          </Text>
        </TouchableOpacity>
        {current && (
          <Text className="text-xs font-semibold text-theme-muted" numberOfLines={1}>
            {current.isRecovery ? t('goal.recoveryShort') : phaseLabel(t, current.phase)} · {t('home.heroWeekOf', { n: current.index, total: current.total })}
          </Text>
        )}
      </View>

      {/* The week as a line of sport bubbles */}
      <View>
        <View
          pointerEvents="none"
          className="absolute"
          style={{ left: `${100 / 14}%`, right: `${100 / 14}%`, top: SLOT / 2 - 1, height: 2, backgroundColor: theme.border }}
        />
        <View className="flex-row">
          {days.map(({ day, parts, total }, idx) => (
            <TouchableOpacity
              key={day.fullDate || idx}
              onPress={() => onPressDay(idx)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={[getLocalizedDayName(day.dayName, t), ...day.workouts.filter((w) => !isRest(w.type)).map((w) => w.title)].join(', ')}
              className="flex-1 items-center gap-1.5"
            >
              <View style={{ height: SLOT }} className="items-center justify-center">
                {parts.length === 0 ? (
                  <View
                    className="rounded-full"
                    style={
                      day.isToday
                        ? { width: 10, height: 10, backgroundColor: theme.text }
                        : { width: 6, height: 6, backgroundColor: theme.textSecondary }
                    }
                  />
                ) : parts.length === 1 ? (
                  renderBubble(day, parts[0], total)
                ) : (
                  renderCapsule(day, parts, total)
                )}
              </View>
              <Text className={`text-[10px] ${day.isToday ? 'font-extrabold text-theme-text' : 'font-bold text-theme-muted'}`}>
                {getLocalizedDayName(day.dayName, t).charAt(0)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Hours done against planned, and the streak */}
      {(plannedMins > 0 || streak > 0) && (
        <View className="flex-row items-center justify-between">
          {plannedMins > 0 ? (
            <Text className="text-xs text-theme-muted">
              <Text className="text-theme-text font-rajdhani" style={{ fontSize: 14 }}>
                {formatHours(doneMins)}
              </Text>{' '}
              {t('home.heroHoursOf', { planned: formatHours(plannedMins) })}
            </Text>
          ) : (
            <View />
          )}
          {streak > 0 && (
            <View className="flex-row items-center gap-1">
              <Ionicons name="flame" size={12} color={theme.warm} />
              <Text className="text-xs font-semibold text-theme-muted">{t('home.heroStreak', { count: streak })}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
