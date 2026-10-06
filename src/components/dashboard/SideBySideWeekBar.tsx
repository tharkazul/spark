import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { DayAgenda } from './MicroPlanAgendaCard';
import { SportType } from '../../types/dashboard';
import { SportMedallion } from '../ui/SportMedallion';
import { useLanguage } from '../../context/LanguageContext';
import { getLocalizedDayAbbr } from './DetailedDayCard';

interface SideBySideWeekBarProps {
  agenda: DayAgenda[];
  selectedDayIndex?: number;
  onSelectDay: (index: number, dayName: string) => void;
  prevAgenda?: DayAgenda[];
  nextAgenda?: DayAgenda[];
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
}

const SWIPE_DISTANCE = 48;
const SWIPE_VELOCITY = 450;
const SETTLE_MS = 170;

interface WeekStripProps {
  agenda: DayAgenda[];
  selectedDayIndex?: number;
  onSelectDay?: (index: number, dayName: string) => void;
}

function WeekStrip({ agenda, selectedDayIndex, onSelectDay }: WeekStripProps) {
  const { t } = useLanguage();
  return (
    <View className="flex-row gap-1.5 w-full">
      {agenda.map((day, idx) => {
        const isSelected = selectedDayIndex === idx;
        const isToday = day.isToday;
        const isRest = (sport?: SportType | string) => String(sport || '').toUpperCase() === 'REST';
        const activeWorkouts = (day.workouts || []).filter((w) => !isRest(w.type));
        const hasActiveWorkouts = activeWorkouts.length > 0;
        const isCompleted = hasActiveWorkouts && activeWorkouts.every((w) => w.isCompleted);
        const isMissed = day.isPast && hasActiveWorkouts && !isCompleted;
        // Only completed (past) days that the plan scheduled as rest get a check; today is still in
        // progress and unplanned days were never committed rest (same rule as the streak).
        const hasPlannedRest = (day.workouts || []).some((w) => isRest(w.type));
        const isRestHonored = !hasActiveWorkouts && hasPlannedRest && Boolean(day.isPast) && !isToday;

        // Parse day date number from dateStr e.g. "Sep 29" -> "29"
        const dateParts = day.dateStr.split(' ');
        const dayNumber = dateParts[dateParts.length - 1] || '';

        return (
          <TouchableOpacity
            key={`${day.dayName}-${day.dateStr}`}
            disabled={!onSelectDay}
            onPress={() => {
              Haptics.selectionAsync();
              onSelectDay?.(idx, day.dayName);
            }}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${day.dayName} ${day.dateStr}${hasActiveWorkouts ? `, ${activeWorkouts[0].type}` : ', Rest'}`}
            style={{ height: 84 }}
            className={`flex-1 rounded-[14px] items-center justify-between py-2 relative overflow-hidden ${
              isSelected
                ? 'bg-theme-accent-strong border border-transparent'
                : isToday
                ? 'bg-theme-inset border-[1.5px] border-theme-accent'
                : 'bg-theme-inset border border-transparent'
            }`}
          >
            {/* Top-Right Status Badge (Green check if completed workout or honored rest day, warning dot if missed) */}
            {(isCompleted || isRestHonored) && (
              <View className="absolute top-1 right-1 z-10">
                <Ionicons name="checkmark-circle" size={13} color="#10B981" />
              </View>
            )}
            {isMissed && (
              <View className="absolute top-1.5 right-1.5 z-10 w-1.5 h-1.5 rounded-full bg-semantic-warning" />
            )}

            {/* Top: Weekday Letter / Abbreviation in Caption */}
            <Text
              numberOfLines={1}
              className={`text-[11px] font-semibold uppercase tracking-wider font-jakarta ${
                isSelected ? 'text-white' : 'text-theme-muted'
              }`}
            >
              {getLocalizedDayAbbr(day.dayName, t)}
            </Text>

            {/* Middle: Date Number in stat-md Rajdhani */}
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className={`text-lg font-bold font-rajdhani -my-1 ${
                isSelected ? 'text-white' : 'text-theme-text'
              }`}
            >
              {dayNumber}
            </Text>

            {/* Bottom: SportMedallion (28pt) or Moon Icon for Rest */}
            <View className="items-center justify-center h-7 relative">
              {hasActiveWorkouts ? (
                <View className="flex-row items-center justify-center">
                  <SportMedallion
                    sport={activeWorkouts[0].type}
                    size={28}
                  />
                  {activeWorkouts.length > 1 && (
                    <View className="absolute -top-1 -right-1.5 bg-theme-accent-strong rounded-full px-1 py-0.2">
                      <Text className="text-[9px] font-bold text-white font-rajdhani">
                        +{activeWorkouts.length - 1}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Ionicons
                  name="moon"
                  size={16}
                  color={isSelected ? '#FFFFFF' : '#94A3B8'}
                />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function SideBySideWeekBar({
  agenda,
  selectedDayIndex,
  onSelectDay,
  prevAgenda,
  nextAgenda,
  onPrevWeek,
  onNextWeek,
}: SideBySideWeekBarProps) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const translateX = useSharedValue(0);
  const settling = useSharedValue(false);
  const widthSV = useSharedValue(0);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const next = e.nativeEvent.layout.width;
      widthSV.value = next;
      setWidth(next);
    },
    [widthSV]
  );

  const commitWeek = useCallback(
    (direction: 1 | -1) => {
      translateX.value = 0;
      setDragging(false);
      (direction === 1 ? onNextWeek : onPrevWeek)?.();
    },
    [onNextWeek, onPrevWeek, translateX]
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      if (settling.value) return;
      runOnJS(setDragging)(true);
    })
    .onUpdate((e) => {
      if (settling.value) return;
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (settling.value) return;
      const w = widthSV.value || 360;
      const dist = e.translationX;
      const vel = e.velocityX;

      const goNext = dist < -SWIPE_DISTANCE || vel < -SWIPE_VELOCITY;
      const goPrev = dist > SWIPE_DISTANCE || vel > SWIPE_VELOCITY;

      if (goNext && nextAgenda) {
        settling.value = true;
        translateX.value = withTiming(-w, { duration: SETTLE_MS }, () => {
          settling.value = false;
          runOnJS(commitWeek)(1);
        });
      } else if (goPrev && prevAgenda) {
        settling.value = true;
        translateX.value = withTiming(w, { duration: SETTLE_MS }, () => {
          settling.value = false;
          runOnJS(commitWeek)(-1);
        });
      } else {
        settling.value = true;
        translateX.value = withSpring(0, { damping: 20, stiffness: 240 }, () => {
          settling.value = false;
          runOnJS(setDragging)(false);
        });
      }
    })
    .onFinalize(() => {
      if (!settling.value && translateX.value === 0) {
        runOnJS(setDragging)(false);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View onLayout={onLayout} className="w-full overflow-hidden">
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle} className="w-full">
          {dragging && width > 0 ? (
            <View
              style={{
                width: width * 3,
                marginLeft: -width,
                flexDirection: 'row',
              }}
            >
              <View style={{ width }} className="px-1">
                {prevAgenda ? <WeekStrip agenda={prevAgenda} /> : null}
              </View>
              <View style={{ width }} className="px-1">
                <WeekStrip
                  agenda={agenda}
                  selectedDayIndex={selectedDayIndex}
                  onSelectDay={onSelectDay}
                />
              </View>
              <View style={{ width }} className="px-1">
                {nextAgenda ? <WeekStrip agenda={nextAgenda} /> : null}
              </View>
            </View>
          ) : (
            <WeekStrip
              agenda={agenda}
              selectedDayIndex={selectedDayIndex}
              onSelectDay={onSelectDay}
            />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default SideBySideWeekBar;
