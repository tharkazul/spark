import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  DeviceEventEmitter,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';
import { Button } from '../../components/ui/Button';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { useConnectedDevices } from '../../hooks/useConnectedDevices';
import { useActivities } from '../../context/ActivityStore';
import { useCoachChat } from '../../context/CoachChatStore';
import { useLanguage } from '../../context/LanguageContext';
import { usePlan } from '../../context/PlanStore';
import { useTabBar } from '../../context/TabBarContext';
import { useUser } from '../../context/UserStore';
import { useSubscription } from '../../context/SubscriptionStore';
import { canEditWorkouts } from '../../utils/permissions';
import { planApi } from '../../services/apiServices';

import { DetailedDayCard } from '../../components/dashboard/DetailedDayCard';
import { SideBySideWeekBar } from '../../components/dashboard/SideBySideWeekBar';
import { TodaysPlanSkeleton } from '../../components/skeletons/TodaysPlanSkeleton';
import { weatherService, DayWeather } from '../../services/weatherService';

import { AdaptPlanModal } from '../../components/dashboard/AdaptPlanModal';
import { AddWorkoutModal } from '../../components/dashboard/AddWorkoutModal';
import { InvitePartnerModal } from '../../components/dashboard/InvitePartnerModal';
import { LogActivityModal } from '../../components/dashboard/LogActivityModal';
import { LogNiggleModal } from '../../components/dashboard/LogNiggleModal';
import { LogWeightModal } from '../../components/dashboard/LogWeightModal';

import {
  DayAgenda,
  WorkoutItem,
} from '../../types/dashboard';
import { calculateWorkoutDurationMinutes, formatDuration } from '../../utils/format';

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setHours(0, 0, 0, 0);
  return new Date(d.setDate(diff));
}

function formatDateToYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const getLocaleCode = (lang: string) => {
  switch (lang) {
    case 'nl': return 'nl-NL';
    case 'de': return 'de-DE';
    case 'es': return 'es-ES';
    case 'fr': return 'fr-FR';
    default: return 'en-US';
  }
};

function formatShortDate(d: Date, lang = 'en'): string {
  return d.toLocaleDateString(getLocaleCode(lang), { month: 'short', day: 'numeric' });
}

export default function PlanningHomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { user } = useUser();
  const { isSubscribed, presentPaywall } = useSubscription();
  const canEdit = canEditWorkouts(user?.subscription_tier, isSubscribed);
  const { sendMessage, unreadCount } = useCoachChat();
  const { t, language } = useLanguage();
  const tabBarInset = useTabBarInset();
  const { plan, loading: planLoading, refreshPlan, addWorkout, updateWorkout, deleteWorkout } = usePlan();
  const { activities } = useActivities();
  const { hasAnyDevices, isSyncing, syncWorkouts } = useConnectedDevices();
  const [isSyncedSuccess, setIsSyncedSuccess] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isNiggleModalOpen, setIsNiggleModalOpen] = useState(false);
  const [isLogActivityOpen, setIsLogActivityOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [workoutToInvite, setWorkoutToInvite] = useState<WorkoutItem | null>(null);
  const [weatherForecast, setWeatherForecast] = useState<Record<string, DayWeather>>({});

  useEffect(() => {
    weatherService.getDailyForecast().then((forecast) => {
      if (forecast && Object.keys(forecast).length > 0) {
        setWeatherForecast(forecast);
      }
    });
  }, []);

  useEffect(() => {
    refreshPlan();
    const sub = DeviceEventEmitter.addListener('openQuickActionModal', (action: string) => {
      if (action === 'weight') {
        setIsWeightModalOpen(true);
      } else if (action === 'workout') {
        if (!canEdit) {
          presentPaywall();
          return;
        }
        setIsAddModalOpen(true);
      } else if (action === 'injury') {
        setIsNiggleModalOpen(true);
      } else if (action === 'activity') {
        setIsLogActivityOpen(true);
      }
    });
    return () => sub.remove();
  }, [canEdit, presentPaywall]);

  const { notifyScroll, notifyScrollEnd } = useTabBar();
  const part3ScrollViewRef = useRef<ScrollView>(null);

  const [recordedWeight, setRecordedWeight] = useState<number>(user?.athlete_metrics?.weight_kg || 0);
  const [selectedWorkoutForEdit, setSelectedWorkoutForEdit] = useState<WorkoutItem | null>(null);

  // Selected week start date (defaults to Monday of current week)
  const currentMonday = useMemo(() => getMonday(new Date()), []);
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const isCurrentWeek = weekStart.getTime() === currentMonday.getTime();

  const initialTodayIndex = (new Date().getDay() + 6) % 7;
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(initialTodayIndex);
  const [dayYPositions, setDayYPositions] = useState<Record<number, number>>({});
  const dayYPositionsRef = useRef<Record<number, number>>({});
  const dayCardRefs = useRef<(View | null)[]>([]);
  const pendingScrollIndexRef = useRef<number | null>(initialTodayIndex);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToSelectedDay = useCallback((targetIdx: number, animated = true) => {
    const el = dayCardRefs.current[targetIdx];
    if (el && part3ScrollViewRef.current) {
      el.measureLayout(
        part3ScrollViewRef.current as any,
        (_x, y) => {
          part3ScrollViewRef.current?.scrollTo({
            y: Math.max(0, y - 8),
            animated,
          });
        },
        () => {
          const cachedY = dayYPositionsRef.current[targetIdx];
          if (typeof cachedY === 'number') {
            part3ScrollViewRef.current?.scrollTo({
              y: Math.max(0, cachedY - 8),
              animated,
            });
          }
        }
      );
    } else {
      const cachedY = dayYPositionsRef.current[targetIdx];
      if (typeof cachedY === 'number') {
        part3ScrollViewRef.current?.scrollTo({
          y: Math.max(0, cachedY - 8),
          animated,
        });
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPlan();
      const currentMon = getMonday(new Date());
      setWeekStart(currentMon);
      const todayIdx = (new Date().getDay() + 6) % 7;
      setSelectedDayIndex(todayIdx);
      pendingScrollIndexRef.current = todayIdx;

      // Scroll immediately if position is already cached
      const immediateY = dayYPositionsRef.current[todayIdx];
      if (typeof immediateY === 'number') {
        part3ScrollViewRef.current?.scrollTo({
          y: Math.max(0, immediateY - 8),
          animated: false,
        });
      }

      const scrollToToday = (delay: number, animated = true) =>
        setTimeout(() => {
          scrollToSelectedDay(todayIdx, animated);
        }, delay);

      const t1 = scrollToToday(80, true);
      const t2 = scrollToToday(250, true);
      const t3 = setTimeout(() => {
        scrollToSelectedDay(todayIdx, true);
        pendingScrollIndexRef.current = null;
      }, 450);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }, [refreshPlan, scrollToSelectedDay])
  );

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  const handleSelectDay = useCallback((idx: number) => {
    Haptics.selectionAsync();
    setSelectedDayIndex(idx);
    pendingScrollIndexRef.current = idx;

    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }

    // 1. Immediate scroll attempt
    scrollToSelectedDay(idx, true);

    // 2. Mid-transition scroll
    setTimeout(() => {
      scrollToSelectedDay(idx, true);
    }, 80);

    // 3. Post-transition exact alignment
    scrollTimerRef.current = setTimeout(() => {
      scrollToSelectedDay(idx, true);
      pendingScrollIndexRef.current = null;
    }, 240);
  }, [scrollToSelectedDay]);

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayYYYYMMDD = formatDateToYYYYMMDD(now);

  const dayOfWeekShort = now.toLocaleDateString(getLocaleCode(language), { weekday: 'short' });
  const dayOfWeekUpper = dayOfWeekShort.toUpperCase();
  const monthShort = now.toLocaleDateString(getLocaleCode(language), { month: 'short' });
  const dayNum = now.getDate();
  const todayDateStr = `${monthShort} ${dayNum}`;

  const [targetAddDay, setTargetAddDay] = useState<{ dayName: string; dateStr: string; fullDate?: string }>({
    dayName: dayOfWeekUpper,
    dateStr: todayDateStr,
    fullDate: todayYYYYMMDD,
  });

  const handlePrevWeek = () => {
    Haptics.selectionAsync();
    dayYPositionsRef.current = {};
    part3ScrollViewRef.current?.scrollTo({ y: 0, animated: false });
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    Haptics.selectionAsync();
    dayYPositionsRef.current = {};
    part3ScrollViewRef.current?.scrollTo({ y: 0, animated: false });
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekRangeLabel = `${formatShortDate(weekStart, language)} - ${formatShortDate(weekEnd, language)}`;

  // Compute 7-Day Agenda Dynamically from weekStart
  const DAYS_HEADER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const buildAgenda = (start: Date): DayAgenda[] =>
    DAYS_HEADER.map((dayName, idx) => {
      const dayDate = new Date(start);
      dayDate.setDate(dayDate.getDate() + idx);
      dayDate.setHours(0, 0, 0, 0);

      const dateYYYYMMDD = formatDateToYYYYMMDD(dayDate);
      const dateStr = formatShortDate(dayDate, language);
      const isToday = dateYYYYMMDD === todayYYYYMMDD;
      const isPast = dayDate < todayMidnight;

      let workouts: WorkoutItem[] = [];

      if (plan && plan.length > 0) {
        const dbWorkouts = plan.filter((w) => w.date === dateYYYYMMDD);
        workouts = dbWorkouts.map((w) => {
          // Calculate duration safely using calculateWorkoutDurationMinutes (fixes 2-min swim bug)
          const durMins = calculateWorkoutDurationMinutes(w);
          const durStr = `${durMins} min`;

          let parsedSteps = [];
          if (w.steps_json && typeof w.steps_json === 'string') {
            try {
              parsedSteps = JSON.parse(w.steps_json);
            } catch (e) {}
          }

          return {
            id: String(w.id),
            day: w.day || dayName,
            dateStr: w.dateStr || dateStr,
            date: w.date || dateYYYYMMDD,
            type: (w.sport as any) || 'RUN',
            sport: (w.sport as any) || 'RUN',
            title: w.title || w.description || 'Planned Workout',
            duration: durStr,
            rookaPoints: w.target_rooka || 0,
            sparkPoints: w.target_spark || 0,
            isStructured: parsedSteps.length > 0,
            isCompleted: (() => {
              if (w.isCompleted) return true;
              const planSport = String(w.sport || (w as any).type).toUpperCase();
              if (planSport === 'REST') return false;
              const actsOnDay = activities.filter((a) => {
                const d = a.start_date_local || a.start_date || (a as any).date;
                return d?.startsWith(dateYYYYMMDD);
              });
              return actsOnDay.some((a) => {
                const aSport = String(a.sport_type || (a as any).type).toUpperCase();
                return aSport === planSport;
              });
            })(),
            actualMetrics: w.actualMetrics,
            executionScore: w.executionScore,
            steps: parsedSteps,
            notes: w.details,
            isCoachCreated: w.source !== 'user' && w.source !== 'template',
            isTemplate: w.source === 'template',
            coachNote:
              w.source !== 'user' && w.source !== 'template' && w.details && w.details.trim().length > 0
                ? w.details.trim()
                : undefined,
          } as WorkoutItem;
        });
      }

      return {
        dayName,
        dateStr,
        fullDate: dateYYYYMMDD,
        isToday,
        isPast,
        workouts,
      };
    });

  const shiftWeeks = (d: Date, n: number) => {
    const out = new Date(d);
    out.setDate(out.getDate() + n * 7);
    return out;
  };

  const weeklyAgenda = buildAgenda(weekStart);
  const prevWeekAgenda = buildAgenda(shiftWeeks(weekStart, -1));
  const nextWeekAgenda = buildAgenda(shiftWeeks(weekStart, 1));

  // Week summary calculations
  const allActiveWorkouts = weeklyAgenda.flatMap((d) =>
    d.workouts.filter((w) => String(w.type).toUpperCase() !== 'REST')
  );
  const totalPlannedCount = allActiveWorkouts.length;
  const doneCount = allActiveWorkouts.filter((w) => w.isCompleted).length;
  const totalPoints = Math.round(
    allActiveWorkouts.reduce((sum, w) => sum + (w.rookaPoints || 0), 0)
  );
  const progressPct = totalPlannedCount > 0 ? Math.round((doneCount / totalPlannedCount) * 100) : 0;

  useEffect(() => {
    const todayIdx = weeklyAgenda.findIndex((d) => d.isToday);
    setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
  }, [weekStart]);

  const handleOpenAddModal = (dayName = dayOfWeekUpper, dateStr = todayDateStr) => {
    if (!canEdit) {
      presentPaywall();
      return;
    }
    setSelectedWorkoutForEdit(null);
    const dayIdx = weeklyAgenda.findIndex((d) => d.dayName === dayName || d.dateStr === dateStr);
    let fullDate = todayYYYYMMDD;
    if (dayIdx >= 0) {
      const targetDate = new Date(weekStart);
      targetDate.setDate(targetDate.getDate() + dayIdx);
      fullDate = formatDateToYYYYMMDD(targetDate);
    }
    setTargetAddDay({ dayName, dateStr, fullDate });
    setIsAddModalOpen(true);
  };

  const handleSelectWorkoutForEdit = (workout: WorkoutItem) => {
    setSelectedWorkoutForEdit(workout);
    if (workout.day && workout.dateStr) {
      const dayIdx = weeklyAgenda.findIndex(
        (d) => d.dayName === workout.day || d.dateStr === workout.dateStr
      );
      let fullDate = workout.date || todayYYYYMMDD;
      if (dayIdx >= 0) {
        const targetDate = new Date(weekStart);
        targetDate.setDate(targetDate.getDate() + dayIdx);
        fullDate = formatDateToYYYYMMDD(targetDate);
      }
      setTargetAddDay({ dayName: workout.day, dateStr: workout.dateStr, fullDate });
    }
    setIsAddModalOpen(true);
  };

  const handleSaveWorkout = async (workoutData: Omit<WorkoutItem, 'id'>, existingId?: string) => {
    const matchedDay = weeklyAgenda.find(
      (d) => d.dayName === workoutData.day || d.dateStr === workoutData.dateStr
    );
    const targetDateStr = matchedDay ? matchedDay.dateStr : targetAddDay.dateStr;

    const dayIdx = weeklyAgenda.findIndex((d) => d.dateStr === targetDateStr);
    const targetDate = new Date(weekStart);
    if (dayIdx >= 0) targetDate.setDate(targetDate.getDate() + dayIdx);
    const targetYYYYMMDD = formatDateToYYYYMMDD(targetDate);

    try {
      const plannedWorkout = {
        date: targetYYYYMMDD,
        sport: workoutData.type,
        title: workoutData.title,
        description: workoutData.title,
        target_rooka: workoutData.rookaPoints,
        duration: workoutData.duration,
        steps_json: JSON.stringify(workoutData.steps || []),
        details: workoutData.notes || '',
        source: 'user',
      };

      if (existingId) {
        await updateWorkout(existingId, plannedWorkout as any);
      } else {
        await addWorkout(plannedWorkout as any);
      }
      setIsAddModalOpen(false);
      setSelectedWorkoutForEdit(null);
      await refreshPlan();
    } catch (e) {
      console.error('Failed to save workout:', e);
    }
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    try {
      await deleteWorkout(workoutId);
      await refreshPlan();
    } catch (e) {
      console.error('Failed to delete workout:', e);
    }
  };

  const handleInvitePartner = (workout: WorkoutItem) => {
    setWorkoutToInvite(workout);
    setIsInviteModalOpen(true);
  };

  const handleConfirmAdaptation = async (type: string) => {
    if (type === 'MOVE_ALL_ONE_DAY') {
      try {
        const todayStr = formatDateToYYYYMMDD(new Date());
        await planApi.pushForward(todayStr);
        await refreshPlan();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error('Failed to push forward:', err);
      }
    } else {
      let prompt = '';
      if (type === 'TIME_CRUNCH')
        prompt = 'I only have 30 minutes today, please adapt my workout to a time crunch.';
      if (type === 'MOVE_INDOORS')
        prompt = 'I need to move my workout indoors today. Please adapt it for the trainer/treadmill.';
      if (type === 'CANCEL_COMPLETELY')
        prompt = 'I want to cancel my workout completely today. I need to rest.';

      if (prompt) {
        sendMessage(prompt);
      }
    }
  };

  const handleSaveWeight = (newWeight: number) => {
    setRecordedWeight(newWeight);
  };

  const handleSendInjuryToCoach = (
    description: string,
    severity: number,
    bodyPartId?: string,
    bodyPartName?: string
  ) => {
    const areaPrefix = bodyPartName ? `[${bodyPartName}] ` : '';
    sendMessage(
      t('quickActions.niggleReportMessage', 'I have a niggle / injury to report: {area}{desc} (Severity: {sev}/10). Can you provide recovery advice?', {
        area: areaPrefix,
        desc: description,
        sev: severity,
      })
    );
    router.push('/coach');
  };

  const handleSendWeekToDevices = async () => {
    if (allActiveWorkouts.length === 0 || isSyncing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await syncWorkouts(allActiveWorkouts);
    if (result.success) {
      setIsSyncedSuccess(true);
      setTimeout(() => setIsSyncedSuccess(false), 3500);
      Alert.alert(t('alerts.settingsSaved', 'Success'), result.message);
    } else {
      Alert.alert(t('alerts.errorOccurred', 'Sync Failed'), result.message);
    }
  };

  const handleSendSingleWorkout = async (workout: WorkoutItem) => {
    if (isSyncing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await syncWorkouts([workout]);
    if (result.success) {
      Alert.alert(t('alerts.settingsSaved', 'Success'), result.message);
    } else {
      Alert.alert(t('alerts.errorOccurred', 'Sync Failed'), result.message);
    }
  };

  return (
    <View className="flex-1 bg-theme-bg" style={{ paddingTop: insets.top }}>
      {/* ------------------------------------------------------------- */}
      {/* PINNED STICKY WEEK HEADER (Opaque background, hairline border) */}
      {/* ------------------------------------------------------------- */}
      <View className="bg-theme-bg px-4 pt-2 pb-3 border-b border-theme-border z-20">
        <ScreenHeaderTitleRow
          title={t('tabs.planning', 'Planning')}
          unreadCount={unreadCount}
          onCoachPress={() => router.push('/(tabs)/coach')}
        />

        {/* Date Pager Row */}
        <View className="flex-row items-center justify-between mt-2 mb-2.5">
          <View className="flex-row items-center gap-1.5">
            <TouchableOpacity
              onPress={handlePrevWeek}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="w-8 h-8 items-center justify-center rounded-full"
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={isDark ? '#94A3B8' : '#64748B'}
              />
            </TouchableOpacity>

            <Text className="text-base font-bold text-theme-text font-jakarta px-1">
              {weekRangeLabel}
            </Text>

            <TouchableOpacity
              onPress={handleNextWeek}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="w-8 h-8 items-center justify-center rounded-full"
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={isDark ? '#94A3B8' : '#64748B'}
              />
            </TouchableOpacity>
          </View>

          {/* This week jump button if not currently viewing this week */}
          {!isCurrentWeek && (
            <Button
              variant="ghost"
              size="sm"
              label={t('dashboard.thisWeek', 'This week')}
              onPress={() => {
                Haptics.selectionAsync();
                setWeekStart(getMonday(new Date()));
              }}
            />
          )}
        </View>

        {/* 7-Tile Week Strip (Height 84, no card around it) */}
        <SideBySideWeekBar
          agenda={weeklyAgenda}
          prevAgenda={prevWeekAgenda}
          nextAgenda={nextWeekAgenda}
          selectedDayIndex={selectedDayIndex}
          onSelectDay={handleSelectDay}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
        />

        {/* Week Summary Line & Progress Bar */}
        <View className="flex-row items-center justify-between mt-2.5 min-h-[34px]">
          <Text className="text-[12px] text-theme-muted font-jakarta flex-1 pr-2" numberOfLines={1}>
            {t('dashboard.weekSummary', '{done} of {total} done · {points} rooka planned', {
              done: doneCount,
              total: totalPlannedCount,
              points: totalPoints,
            })}
          </Text>

          {hasAnyDevices && totalPlannedCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              label={
                isSyncedSuccess
                  ? t('dashboard.devicesSynced', 'Sent ✓')
                  : t('dashboard.sendToDevice', 'Send to device')
              }
              leftIcon={
                isSyncedSuccess ? (
                  <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                ) : (
                  <Ionicons name="watch-outline" size={13} color="#0EA5E9" />
                )
              }
              isLoading={isSyncing}
              onPress={handleSendWeekToDevices}
            />
          )}
        </View>
        <View className="h-1 w-full bg-theme-inset rounded-full mt-1.5 overflow-hidden">
          <View
            style={{ width: `${progressPct}%` }}
            className="h-full bg-theme-accent-strong rounded-full"
          />
        </View>

        {/* Standard (rule-based) week: invite the athlete to have the coach tailor it */}
        {weeklyAgenda.some((d) => d.workouts.some((w) => w.isTemplate)) && (
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/(tabs)/coach');
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 mt-2 self-start bg-theme-accent/15 px-2.5 py-1 rounded-full"
          >
            <Ionicons name="sparkles-outline" size={12} color="#0EA5E9" />
            <Text className="text-[11px] font-semibold text-theme-accent font-jakarta">
              {t('dashboard.templatePlanChip', 'Standard plan · Ask your coach to tailor it')}
            </Text>
            <Ionicons name="chevron-forward" size={12} color="#0EA5E9" />
          </TouchableOpacity>
        )}
      </View>

      {/* ------------------------------------------------------------- */}
      {/* AGENDA SCROLLVIEW (Selected day expanded, other days collapsed) */}
      {/* ------------------------------------------------------------- */}
      <ScrollView
        ref={part3ScrollViewRef}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: tabBarInset,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={notifyScroll}
        onScrollEndDrag={notifyScrollEnd}
        onMomentumScrollEnd={notifyScrollEnd}
      >
        {planLoading && plan.length === 0 ? (
          <Animated.View
            layout={LinearTransition.duration(200)}
            exiting={FadeOutUp.duration(150)}
            className="gap-y-3 pt-1"
          >
            <TodaysPlanSkeleton />
            <TodaysPlanSkeleton />
            <TodaysPlanSkeleton />
          </Animated.View>
        ) : (
          weeklyAgenda.map((day, idx) => (
            <Animated.View
              key={`${day.dayName}-${day.dateStr}`}
              ref={(el) => {
                dayCardRefs.current[idx] = el as any;
              }}
              layout={LinearTransition.duration(200)}
              entering={FadeInDown.duration(200)}
              exiting={FadeOutUp.duration(150)}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                dayYPositionsRef.current[idx] = y;
                setDayYPositions((prev) => ({ ...prev, [idx]: y }));
                if (pendingScrollIndexRef.current === idx) {
                  part3ScrollViewRef.current?.scrollTo({
                    y: Math.max(0, y - 8),
                    animated: true,
                  });
                }
              }}
            >
              {(() => {
                const dayWeather = day.fullDate ? weatherForecast[day.fullDate] : undefined;
                return (
                  <DetailedDayCard
                    day={day}
                    weatherTemp={dayWeather?.tempMax}
                    weatherIcon={dayWeather?.icon}
                    isExpanded={selectedDayIndex === idx}
                    onToggleExpand={() => handleSelectDay(idx)}
                    onAdaptPress={() => setIsAdaptModalOpen(true)}
                    onAddWorkout={(dayName, dateStr) => handleOpenAddModal(dayName, dateStr)}
                    onSelectWorkout={handleSelectWorkoutForEdit}
                    onDeleteWorkout={handleDeleteWorkout}
                    onInvitePartner={handleInvitePartner}
                    hasAnyDevices={hasAnyDevices}
                    onSendWorkoutToDevice={handleSendSingleWorkout}
                    canEdit={canEdit}
                    onUpgradePress={() => presentPaywall()}
                  />
                );
              })()}
            </Animated.View>
          ))
        )}
      </ScrollView>

      {/* Modals */}
      <AddWorkoutModal
        visible={isAddModalOpen}
        targetDayName={targetAddDay.dayName}
        targetDateStr={targetAddDay.dateStr}
        targetFullDate={targetAddDay.fullDate}
        initialWorkout={selectedWorkoutForEdit}
        isReadOnly={!canEdit && Boolean(selectedWorkoutForEdit)}
        onUpgradePress={() => presentPaywall()}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedWorkoutForEdit(null);
        }}
        onSave={handleSaveWorkout}
        onDelete={handleDeleteWorkout}
      />
      <AdaptPlanModal
        visible={isAdaptModalOpen}
        onClose={() => setIsAdaptModalOpen(false)}
        onConfirmAdapt={handleConfirmAdaptation}
      />
      <LogWeightModal
        visible={isWeightModalOpen}
        previousWeight={recordedWeight}
        onClose={() => setIsWeightModalOpen(false)}
        onSaveWeight={handleSaveWeight}
      />
      <LogNiggleModal
        visible={isNiggleModalOpen}
        onClose={() => setIsNiggleModalOpen(false)}
        onSendToCoach={handleSendInjuryToCoach}
      />
      <LogActivityModal
        visible={isLogActivityOpen}
        onClose={() => setIsLogActivityOpen(false)}
      />
      <InvitePartnerModal
        visible={isInviteModalOpen}
        onClose={() => {
          setIsInviteModalOpen(false);
          setWorkoutToInvite(null);
        }}
        workout={workoutToInvite}
      />
    </View>
  );
}
