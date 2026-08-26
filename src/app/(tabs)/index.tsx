import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  DeviceEventEmitter,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useUser } from '../../context/UserStore';
import { useCoachChat } from '../../context/CoachChatStore';
import { useLanguage } from '../../context/LanguageContext';
import { useHeaderLayout } from '../../context/HeaderLayoutContext';
import { useTabBar } from '../../context/TabBarContext';
import { usePlan } from '../../context/PlanStore';
import { planApi } from '../../services/apiServices';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../../components/ui/Card';
import { ScreenHeaderTitleRow } from '../../components/ui/ScreenHeaderTitleRow';

import { SeasonRoadmapCard } from '../../components/dashboard/SeasonRoadmapCard';
import { SideBySideWeekBar } from '../../components/dashboard/SideBySideWeekBar';
import { DetailedDayCard } from '../../components/dashboard/DetailedDayCard';


import { AddWorkoutModal } from '../../components/dashboard/AddWorkoutModal';
import { AdaptPlanModal } from '../../components/dashboard/AdaptPlanModal';
import { LogWeightModal } from '../../components/dashboard/LogWeightModal';
import { LogNiggleModal } from '../../components/dashboard/LogNiggleModal';
import { LogActivityModal } from '../../components/dashboard/LogActivityModal';

import {
  WorkoutItem,
  MacroPeriodInfo,
  DayAgenda,
} from '../../types/dashboard';

// Date Helpers (Fixed to use local timezone date components instead of UTC ISO string)
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

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PlanningHomeScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { sendMessage } = useCoachChat();
  const { t } = useLanguage();
  const { headerHeight } = useHeaderLayout();
  const { plan, refreshPlan, addWorkout, updateWorkout, deleteWorkout } = usePlan();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isNiggleModalOpen, setIsNiggleModalOpen] = useState(false);
  const [isLogActivityOpen, setIsLogActivityOpen] = useState(false);

  useEffect(() => {
    refreshPlan();
    const sub = DeviceEventEmitter.addListener('openQuickActionModal', (action: string) => {
      if (action === 'weight') {
        setIsWeightModalOpen(true);
      } else if (action === 'workout') {
        setIsAddModalOpen(true);
      } else if (action === 'injury') {
        setIsNiggleModalOpen(true);
      } else if (action === 'activity') {
        setIsLogActivityOpen(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Re-fetch the plan every time this tab regains focus (e.g. coming back from the
  // coach chat after a new workout was discussed). Tab screens stay mounted between
  // switches, so the mount-only effect above won't catch changes made elsewhere.
  useFocusEffect(
    useCallback(() => {
      refreshPlan();
    }, [refreshPlan])
  );

  const { tabBarOccupied, notifyScroll } = useTabBar();

  const part3ScrollViewRef = useRef<ScrollView>(null);
  const hasScrolledToTodayRef = useRef(false);

  const [recordedWeight, setRecordedWeight] = useState<number>(user?.athlete_metrics?.weight_kg || 0);
  const [selectedWorkoutForEdit, setSelectedWorkoutForEdit] = useState<WorkoutItem | null>(null);
  const [customWorkoutsByDate, setCustomWorkoutsByDate] = useState<Record<string, WorkoutItem[]>>({});

  // Selected week start date (defaults to Monday of current week)
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [dayYPositions, setDayYPositions] = useState<Record<number, number>>({});

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayYYYYMMDD = formatDateToYYYYMMDD(now);

  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const dayOfWeekUpper = dayOfWeekShort.toUpperCase();
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = now.getDate();

  const todayDateStr = `${monthShort} ${dayNum}`;

  const [targetAddDay, setTargetAddDay] = useState<{ dayName: string; dateStr: string; fullDate?: string }>({
    dayName: dayOfWeekUpper,
    dateStr: todayDateStr,
    fullDate: todayYYYYMMDD,
  });

  const handlePrevWeek = () => {
    Haptics.selectionAsync();
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    Haptics.selectionAsync();
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekRangeLabel = `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;

  // The season roadmap only means anything once the athlete has actually set a
  // target event. Without one it used to render an invented "Park 5k" 181 days
  // out, which reads as real planning the athlete never asked for.
  const hasSeasonGoal = Boolean(user?.target_event && user?.event_date);
  const mainRaceName = user?.target_event ?? '';

  const calculateDaysRemaining = (eventDateStr?: string): number => {
    if (!eventDateStr) return 0;
    try {
      const targetDate = new Date(eventDateStr);
      const diffTime = targetDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    } catch {
      return 0;
    }
  };

  const daysRemaining = calculateDaysRemaining(user?.event_date);

  const seasonInfo: MacroPeriodInfo = {
    raceTargetName: mainRaceName,
    daysRemaining: daysRemaining,
    currentPhaseIndex: 1,
    targetCTL: user?.target_ctl || 35,
    currentCTL: user?.current_ctl || 68,
    phases: [
      {
        name: 'BASE PHASE',
        weeks: 'Weeks 1-6',
        focus: 'Aerobic Volume & Technic',
        description: 'Building mitochondrial density & base aerobic capacity with low HR long rides and CSS swim threshold sets.',
        status: 'completed',
        achievementLabel: 'Done at 94% Target CTL',
        targetCTL: 52,
        achievedCTL: 49,
      },
      {
        name: 'BUILD PHASE',
        weeks: 'Weeks 7-12',
        focus: 'Threshold Velocity & Power',
        description: 'High aerobic intervals, threshold swim pace, VO2 max bike intervals, and Saturday brick runs.',
        status: 'active',
        progressPercent: 55,
      },
      {
        name: 'PEAK PHASE',
        weeks: 'Weeks 13-14',
        focus: 'Race Pace Intervals',
        description: 'Race-specific pacing simulation, sharp interval efforts, and high-intensity micro efforts.',
        status: 'upcoming',
      },
      {
        name: 'TAPER PHASE',
        weeks: 'Weeks 15-16',
        focus: 'Glycogen Supercompensation',
        description: 'Volume reduction by 50% while maintaining sharp stride frequency to arrive fresh on race day.',
        status: 'upcoming',
      },
    ],
  };

  // Compute 7-Day Agenda Dynamically from weekStart
  const DAYS_HEADER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const weeklyAgenda: DayAgenda[] = DAYS_HEADER.map((dayName, idx) => {
    const dayDate = new Date(weekStart);
    dayDate.setDate(dayDate.getDate() + idx);
    dayDate.setHours(0, 0, 0, 0);

    const dateYYYYMMDD = formatDateToYYYYMMDD(dayDate);
    const dateStr = formatShortDate(dayDate);
    const isToday = dateYYYYMMDD === todayYYYYMMDD;
    const isPast = dayDate < todayMidnight;

    const customWorkouts = customWorkoutsByDate[dateYYYYMMDD];
    let workouts = customWorkouts !== undefined ? customWorkouts : [];

    if (plan && plan.length > 0) {
      const dbWorkouts = plan.filter((w) => w.date === dateYYYYMMDD);
      workouts = dbWorkouts.map((w) => {
        
        // calculate duration from steps_json if possible
        let durStr = '45 mins';
        if (w.steps_json && typeof w.steps_json === 'string' && w.steps_json !== '[]') {
          try {
            const steps = JSON.parse(w.steps_json);
            let totalMins = 0;
            const parseSteps = (sArr: any[]) => {
               for (const s of sArr) {
                 if (s.condition_type === 'time' && s.condition_value) totalMins += s.condition_value;
                 if (s.condition_type === 'time_sec' && s.condition_value) totalMins += s.condition_value / 60;
                 if (s.type === 'repeat' && s.iterations && s.steps) {
                    let iterMins = 0;
                    for (const rs of s.steps) {
                       if (rs.condition_type === 'time' && rs.condition_value) iterMins += rs.condition_value;
                       if (rs.condition_type === 'time_sec' && rs.condition_value) iterMins += rs.condition_value / 60;
                    }
                    totalMins += (iterMins * s.iterations);
                 }
               }
            }
            parseSteps(steps);
            if (totalMins > 0) durStr = `${Math.round(totalMins)} mins`;
          } catch (e) {}
        }
        
        return {
          id: String(w.id),
          day: dayName,
          dateStr: dateStr,
          type: (w.sport || 'RUN').toUpperCase() as any,
          title: w.description || 'Workout',
          duration: durStr,
          rookaPoints: w.target_rooka,
          sparkPoints: w.target_rooka,
          isStructured: !!w.steps_json && w.steps_json !== '[]',
          isCompleted: w.isCompleted || false,
          actualMetrics: w.actualMetrics,
          executionScore: w.executionScore,
          notes: w.details,
          // The coach's own description of the session. Rows written before the
          // `source` column existed all came from plan generation, so an absent
          // value counts as the coach.
          isCoachCreated: w.source !== 'user',
          coachNote:
            w.source !== 'user' && w.details && w.details.trim().length > 0
              ? w.details.trim()
              : undefined,
        };
      });
    }

    return {
      dayName,
      dateStr,
      isToday,
      isPast,
      workouts,
    };
  });

  useEffect(() => {
    hasScrolledToTodayRef.current = false;
    const todayIdx = weeklyAgenda.findIndex((d) => d.isToday);
    setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
  }, [weekStart]);

  // Automatically scroll to Today's card when opening planning subtab or layout measures
  useEffect(() => {
    const todayIdx = weeklyAgenda.findIndex((d) => d.isToday);
    const targetIdx = todayIdx >= 0 ? todayIdx : 0;

    if (!hasScrolledToTodayRef.current && dayYPositions[targetIdx] !== undefined) {
      hasScrolledToTodayRef.current = true;
      setTimeout(() => {
        part3ScrollViewRef.current?.scrollTo({
          y: dayYPositions[targetIdx],
          animated: true,
        });
      }, 100);
    }
  }, [dayYPositions, weeklyAgenda]);

  const handleOpenAddModal = (dayName = dayOfWeekUpper, dateStr = todayDateStr) => {
    setSelectedWorkoutForEdit(null);
    setTargetAddDay({ dayName, dateStr });
    setIsAddModalOpen(true);
  };

  const handleSelectWorkoutForEdit = (workout: WorkoutItem) => {
    setSelectedWorkoutForEdit(workout);
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

    // Save to DB via usePlan if available
    try {
      const plannedWorkout = {
        date: targetYYYYMMDD,
        day: workoutData.day,
        sport: workoutData.type,
        title: workoutData.title,
        description: workoutData.notes || '',
        target_rooka: workoutData.rookaPoints || 0,
        steps_json: JSON.stringify(workoutData.steps || []),
      };
      
      if (existingId && !existingId.startsWith('w-')) {
        await updateWorkout(existingId, plannedWorkout);
      } else {
        await addWorkout(plannedWorkout);
      }
      await refreshPlan();
    } catch (err) {
      console.error('Failed to save workout to DB', err);
    }

    setCustomWorkoutsByDate((prev) => {
      const existing = prev[targetYYYYMMDD] || [];
      let updated: WorkoutItem[];

      if (existingId) {
        updated = existing.map((w) => (w.id === existingId ? { ...w, ...workoutData } : w));
      } else {
        const newWorkout: WorkoutItem = { ...workoutData, id: `w-${Date.now()}` };
        updated = [...existing, newWorkout];
      }

      return {
        ...prev,
        [targetYYYYMMDD]: updated,
      };
    });
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    
    try {
      if (!workoutId.startsWith('w-')) {
        await deleteWorkout(workoutId);
        await refreshPlan();
      }
    } catch (err) {
      console.error('Failed to delete workout from DB', err);
    }
    
    setCustomWorkoutsByDate((prev) => {
      const nextState = { ...prev };
      Object.keys(nextState).forEach((key) => {
        nextState[key] = nextState[key].filter((w) => w.id !== workoutId);
      });
      return nextState;
    });
  };

  const handleInvitePartner = (workout: WorkoutItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      if (type === 'TIME_CRUNCH') prompt = 'I only have 30 minutes today, please adapt my workout to a time crunch.';
      if (type === 'MOVE_INDOORS') prompt = 'I need to move my workout indoors today. Please adapt it for the trainer/treadmill.';
      if (type === 'CANCEL_COMPLETELY') prompt = 'I want to cancel my workout completely today. I need to rest.';
      
      if (prompt) {
        sendMessage(prompt);
      }
    }
  };

  const handleSaveWeight = (newWeight: number) => {
    setRecordedWeight(newWeight);
  };

  const handleSendInjuryToCoach = (description: string, severity: number, bodyPartId?: string, bodyPartName?: string) => {
    const areaPrefix = bodyPartName ? `[${bodyPartName}] ` : '';
    sendMessage(`I have a niggle / injury to report: ${areaPrefix}${description} (Severity: ${severity}/10). Can you provide recovery advice?`);
    router.push('/coach');
  };

  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-theme-bg" style={{ paddingTop: insets.top }}>
      {/* HEADER WITH TITLE */}
      <View className="px-5 pt-3 pb-2 bg-theme-bg">
        <ScreenHeaderTitleRow title="Planning" />
      </View>

      <View className="flex-1 px-5 pt-2">
        {/* Pinned plan context — Card matching TodaysPlanCard styling */}
        <Card className="p-4 md:p-5 border-theme-border shadow-sm mb-5">
          {hasSeasonGoal && (
            <>
              <SeasonRoadmapCard info={seasonInfo} />
              <View className="h-px bg-theme-border/50 my-3.5" />
            </>
          )}

          {/* Week Selector Bar with Interactive Chevrons */}
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-extrabold text-theme-muted">
              Week plan
            </Text>
            <View className="flex-row items-center bg-theme-card border border-theme-border px-2.5 py-1 rounded-full shadow-sm">
              <TouchableOpacity onPress={handlePrevWeek} activeOpacity={0.6} className="px-1.5 py-0.5">
                <Ionicons name="chevron-back" size={13} color="#FF5F3B" />
              </TouchableOpacity>
              <Text className="text-xs font-mono font-extrabold text-theme-text px-1">{weekRangeLabel}</Text>
              <TouchableOpacity onPress={handleNextWeek} activeOpacity={0.6} className="px-1.5 py-0.5">
                <Ionicons name="chevron-forward" size={13} color="#FF5F3B" />
              </TouchableOpacity>
            </View>
          </View>

          <SideBySideWeekBar
            agenda={weeklyAgenda}
            selectedDayIndex={selectedDayIndex}
            onSelectDay={(idx) => {
              setSelectedDayIndex(idx);
              if (dayYPositions[idx] !== undefined) {
                part3ScrollViewRef.current?.scrollTo({ y: dayYPositions[idx], animated: true });
              }
            }}
          />
        </Card>

        <ScrollView
          ref={part3ScrollViewRef}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: tabBarOccupied + 20, gap: 12 }}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={notifyScroll}
        >
          {weeklyAgenda.map((day, idx) => (
            <View key={`${day.dayName}-${day.dateStr}`} onLayout={(e) => {
              const y = e.nativeEvent.layout.y;
              setDayYPositions((prev) => ({ ...prev, [idx]: y }));
            }}>
              <DetailedDayCard
                day={day}
                onAdaptPress={() => setIsAdaptModalOpen(true)}
                onAddWorkout={(dayName, dateStr) => handleOpenAddModal(dayName, dateStr)}
                onSelectWorkout={handleSelectWorkoutForEdit}
                onDeleteWorkout={handleDeleteWorkout}
                onInvitePartner={handleInvitePartner}
              />
            </View>
          ))}


        </ScrollView>
      </View>

      <AddWorkoutModal
        visible={isAddModalOpen}
        targetDayName={targetAddDay.dayName}
        targetDateStr={targetAddDay.dateStr}
        initialWorkout={selectedWorkoutForEdit}
        onClose={() => { setIsAddModalOpen(false); setSelectedWorkoutForEdit(null); }}
        onSave={handleSaveWorkout}
        onDelete={handleDeleteWorkout}
      />
      <AdaptPlanModal visible={isAdaptModalOpen} onClose={() => setIsAdaptModalOpen(false)} onConfirmAdapt={handleConfirmAdaptation} />
      <LogWeightModal visible={isWeightModalOpen} previousWeight={recordedWeight} onClose={() => setIsWeightModalOpen(false)} onSaveWeight={handleSaveWeight} />
      <LogNiggleModal visible={isNiggleModalOpen} onClose={() => setIsNiggleModalOpen(false)} onSendToCoach={handleSendInjuryToCoach} />
      <LogActivityModal visible={isLogActivityOpen} onClose={() => setIsLogActivityOpen(false)} />
    </View>
  );
}
