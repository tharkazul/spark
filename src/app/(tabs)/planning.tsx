import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useUser } from '../../context/UserStore';
import { usePlan } from '../../context/PlanStore';
import { useLanguage } from '../../context/LanguageContext';
import { useHeaderLayout } from '../../context/HeaderLayoutContext';
import { useTabBar } from '../../context/TabBarContext';
import { Card } from '../../components/ui/Card';

import { SeasonRoadmapCard } from '../../components/dashboard/SeasonRoadmapCard';
import { SideBySideWeekBar } from '../../components/dashboard/SideBySideWeekBar';
import { DetailedDayCard } from '../../components/dashboard/DetailedDayCard';

import { AddWorkoutModal } from '../../components/dashboard/AddWorkoutModal';
import { AdaptPlanModal } from '../../components/dashboard/AdaptPlanModal';
import { LogNiggleModal } from '../../components/dashboard/LogNiggleModal';

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

export default function PlanningScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { headerHeight } = useHeaderLayout();
  const { tabBarOccupied, notifyScroll } = useTabBar();
  
  const part3ScrollViewRef = useRef<ScrollView>(null);
  const hasScrolledToTodayRef = useRef(false);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [isNiggleModalOpen, setIsNiggleModalOpen] = useState(false);
  
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

  const mainRaceName = user?.target_event || 'Park 5k';
  
  const calculateDaysRemaining = (eventDateStr?: string): number => {
    if (!eventDateStr) return 181;
    try {
      const targetDate = new Date(eventDateStr);
      const diffTime = targetDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    } catch {
      return 181;
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

  // Sample Workout Generator per day
  const getSampleWorkoutsForDay = (dayName: string, dateStr: string, isPast: boolean): WorkoutItem[] => {
    if (dayName === 'MON') {
      return [
        {
          id: `w-mon-${dateStr}`,
          day: 'MON',
          dateStr,
          type: 'RUN',
          title: 'Controlled Aerobic Run - Injury Guardrail',
          duration: '50 mins',
          sparkPoints: 44,
          isStructured: true,
          isCompleted: isPast,
          actualMetrics: isPast ? '152 avg bpm · 4:52/km' : undefined,
          executionScore: isPast ? 100 : undefined,
        },
      ];
    }
    if (dayName === 'TUE') {
      return [
        {
          id: `w-tue-${dateStr}`,
          day: 'TUE',
          dateStr,
          type: 'STRENGTH',
          title: 'At-Home Core & Mobility with Spark',
          duration: '35 mins',
          sparkPoints: 26,
          isStructured: true,
          isCompleted: isPast,
          actualMetrics: isPast ? '35 mins · 118 avg bpm' : undefined,
          executionScore: isPast ? 96 : undefined,
        },
      ];
    }
    if (dayName === 'WED') {
      return [
        {
          id: `w-wed-${dateStr}`,
          day: 'WED',
          dateStr,
          type: 'BIKE',
          title: 'Threshold Interval Trainer Session',
          duration: '60 mins',
          sparkPoints: 52,
          isStructured: true,
          isCompleted: isPast,
          actualMetrics: isPast ? '248W avg · 164 bpm' : undefined,
          executionScore: isPast ? 102 : undefined,
        },
      ];
    }
    if (dayName === 'FRI') {
      return [
        {
          id: `w-fri-${dateStr}`,
          day: 'FRI',
          dateStr,
          type: 'BIKE',
          title: 'Lekker fietsen',
          duration: '60 mins',
          sparkPoints: 84,
          isStructured: true,
          isCompleted: false,
        },
      ];
    }
    if (dayName === 'SAT') {
      return [
        {
          id: `w-sat-${dateStr}`,
          day: 'SAT',
          dateStr,
          type: 'STRENGTH',
          title: 'Upper Body & Core Focus',
          duration: '45 mins',
          sparkPoints: 30,
          isStructured: false,
          isCompleted: false,
        },
      ];
    }
    if (dayName === 'SUN') {
      return [
        {
          id: `w-sun-${dateStr}`,
          day: 'SUN',
          dateStr,
          type: 'MOBILITY',
          title: 'Active Recovery Walk & Stretch',
          duration: '30 mins',
          sparkPoints: 15,
          isStructured: false,
          isCompleted: false,
        },
      ];
    }
    return [];
  };

  const { plan, addWorkout: addPlanWorkout, updateWorkout: updatePlanWorkout, deleteWorkout: deletePlanWorkout } = usePlan();

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

    const storeWorkoutsForDay = plan ? plan.filter((w) => w.date === dateYYYYMMDD || (isToday && (w.day === 'TODAY' || w.day === dayName))) : [];
    const mappedStoreWorkouts: WorkoutItem[] = storeWorkoutsForDay.map((w) => ({
      id: String(w.id),
      day: w.day || dayName,
      dateStr: dateStr,
      type: (w.sport || 'RUN').toUpperCase() as any,
      title: w.description || `${w.sport} Workout`,
      duration: w.details || '45 mins',
      sparkPoints: w.target_spark || 30,
      isStructured: !!w.steps_json,
      isCompleted: !!w.isCompleted,
      actualMetrics: w.actualMetrics,
      executionScore: w.executionScore,
    }));

    const customWorkouts = customWorkoutsByDate[dateYYYYMMDD];
    const workouts = customWorkouts !== undefined 
      ? customWorkouts 
      : mappedStoreWorkouts.length > 0 
      ? mappedStoreWorkouts 
      : getSampleWorkoutsForDay(dayName, dateStr, isPast);

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

  const handleSaveWorkout = (workoutData: Omit<WorkoutItem, 'id'>, existingId?: string) => {
    const matchedDay = weeklyAgenda.find(
      (d) => d.dayName === workoutData.day || d.dateStr === workoutData.dateStr
    );
    const targetDateStr = matchedDay ? matchedDay.dateStr : targetAddDay.dateStr;

    const dayIdx = weeklyAgenda.findIndex((d) => d.dateStr === targetDateStr);
    const targetDate = new Date(weekStart);
    if (dayIdx >= 0) targetDate.setDate(targetDate.getDate() + dayIdx);
    const targetYYYYMMDD = formatDateToYYYYMMDD(targetDate);

    setCustomWorkoutsByDate((prev) => {
      const existing = prev[targetYYYYMMDD] || getSampleWorkoutsForDay(workoutData.day, targetDateStr, false);
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

  const handleDeleteWorkout = (workoutId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
    Alert.alert('Invite Sent!', `An invite link for "${workout.title}" has been generated.`);
  };

  const handleConfirmAdaptation = (type: string) => {
    // Adaptation logic
  };

  const handleSendInjuryToCoach = (description: string, severity: number) => {
    router.push('/coach');
  };

  return (
    <View className="flex-1 bg-theme-bg" style={{ flex: 1, width: '100%', height: '100%' }}>
      {/* Header Spacer dynamically measured from DashboardSharedHeader onLayout */}
      <View style={{ height: headerHeight }} />

      <View className="flex-1 px-5 pt-2">
        {/* Pinned plan context — Card matching TodaysPlanCard styling */}
        <Card className="p-4 md:p-5 border-theme-border shadow-sm mb-5">
          <SeasonRoadmapCard info={seasonInfo} />

          <View className="h-px bg-theme-border/50 my-3.5" />

          {/* Week Selector Bar with Interactive Chevrons */}
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-[11px] uppercase tracking-wider font-extrabold text-theme-muted">
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
      <LogNiggleModal visible={isNiggleModalOpen} onClose={() => setIsNiggleModalOpen(false)} onSendToCoach={handleSendInjuryToCoach} />
    </View>
  );
}
