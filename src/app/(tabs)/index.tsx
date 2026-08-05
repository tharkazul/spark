import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

// Custom Dashboard Components
import { TodaysPlanCard } from '../../components/dashboard/TodaysPlanCard';
import { ActiveQuestCard } from '../../components/dashboard/ActiveQuestCard';
import { QuickActionsRow } from '../../components/dashboard/QuickActionsRow';
import { NutritionProtocolCard } from '../../components/dashboard/NutritionProtocolCard';
import { SeasonRoadmapCard } from '../../components/dashboard/SeasonRoadmapCard';
import { MicroPlanAgendaCard, DayAgenda } from '../../components/dashboard/MicroPlanAgendaCard';

// Modals
import { AddWorkoutModal } from '../../components/dashboard/AddWorkoutModal';
import { AdaptPlanModal } from '../../components/dashboard/AdaptPlanModal';
import { LogWeightModal } from '../../components/dashboard/LogWeightModal';
import { LogNiggleModal } from '../../components/dashboard/LogNiggleModal';

import {
  WorkoutItem,
  NutritionMacro,
  MacroPeriodInfo,
} from '../../types/dashboard';

export default function DashboardScreen() {
  const router = useRouter();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Sub-tab state ('dash' vs 'planning')
  const [activeTab, setActiveTab] = useState<'dash' | 'planning'>('dash');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isNiggleModalOpen, setIsNiggleModalOpen] = useState(false);

  const [recordedWeight, setRecordedWeight] = useState<number>(74.5);
  const [selectedWorkoutForEdit, setSelectedWorkoutForEdit] = useState<WorkoutItem | null>(null);
  const [targetAddDay, setTargetAddDay] = useState<{ dayName: string; dateStr: string }>({
    dayName: 'FRI',
    dateStr: 'Jul 24',
  });

  // Calculate dynamic dimensions for tab indicator bubble
  const containerWidth = SCREEN_WIDTH - 40; // px-5 = 20px margin left/right
  const tabWidth = (containerWidth - 8) / 2; // p-1 = 4px padding left/right inside container

  const indicatorLeft = scrollX.interpolate({
    inputRange: [0, Math.max(1, SCREEN_WIDTH)],
    outputRange: [4, 4 + tabWidth],
    extrapolate: 'clamp',
  });

  // Nutrition Protocol (Bottom of Dashboard)
  const nutrition: NutritionMacro = {
    focusTitle: 'Threshold Run Fuel & Muscle Recovery',
    rationale:
      'Based on your high 23.94 Spark Points load yesterday, prioritize complex carbs and quick protein synthesis to restore glycogen stores.',
    carbs: 320,
    carbsTarget: 350,
    protein: 160,
    proteinTarget: 170,
    fat: 65,
    fatTarget: 70,
  };

  // Training Phase (Renamed & Enhanced with Detailed Info + Completion Stats)
  const seasonInfo: MacroPeriodInfo = {
    raceTargetName: 'Ironman 70.3',
    daysRemaining: 36,
    currentPhaseIndex: 1, // BUILD phase
    targetCTL: 95,
    currentCTL: 68,
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

  // Today's Workouts (Top of Dashboard)
  const [todaysWorkouts, setTodaysWorkouts] = useState<WorkoutItem[]>([
    {
      id: 'w-today-1',
      day: 'FRI',
      dateStr: 'Jul 24',
      type: 'SWIM',
      title: 'Sharpening CSS Swim Session',
      duration: '45 mins',
      sparkPoints: 24,
      isStructured: true,
      isCompleted: false,
    },
    {
      id: 'w-today-2',
      day: 'FRI',
      dateStr: 'Jul 24',
      type: 'RUN',
      title: 'Morning Aerobic Maintenance Run',
      duration: '35 mins',
      sparkPoints: 32,
      isStructured: true,
      isCompleted: true,
      actualDuration: '34:12',
      actualMetrics: '154 avg bpm · 4:48/km pace',
      executionScore: 98,
    },
  ]);

  // Micro Agenda (Full Week)
  const [weeklyAgenda, setWeeklyAgenda] = useState<DayAgenda[]>([
    {
      dayName: 'MON',
      dateStr: 'Jul 20',
      workouts: [
        {
          id: 'w-mon-1',
          day: 'MON',
          dateStr: 'Jul 20',
          type: 'RUN',
          title: 'Controlled Aerobic Run - Injury Guardrail',
          duration: '50 mins',
          sparkPoints: 44,
          isStructured: true,
          isCompleted: true,
          actualMetrics: '152 avg bpm · 4:52/km',
          executionScore: 100,
        },
      ],
    },
    {
      dayName: 'TUE',
      dateStr: 'Jul 21',
      workouts: [
        {
          id: 'w-tue-1',
          day: 'TUE',
          dateStr: 'Jul 21',
          type: 'STRENGTH',
          title: 'Secret At-Home Core & Mobility with Spark',
          duration: '35 mins',
          sparkPoints: 26,
          isStructured: true,
          isCompleted: true,
          actualMetrics: '35 mins · 118 avg bpm',
          executionScore: 96,
        },
      ],
    },
    {
      dayName: 'WED',
      dateStr: 'Jul 22',
      workouts: [
        {
          id: 'w-wed-1',
          day: 'WED',
          dateStr: 'Jul 22',
          type: 'BIKE',
          title: 'Threshold Interval Trainer Session',
          duration: '60 mins',
          sparkPoints: 52,
          isStructured: true,
          isCompleted: true,
          actualMetrics: '248W avg · 164 bpm',
          executionScore: 102,
        },
      ],
    },
    {
      dayName: 'THU',
      dateStr: 'Jul 23',
      workouts: [],
    },
    {
      dayName: 'FRI',
      dateStr: 'Jul 24',
      isToday: true,
      workouts: [
        {
          id: 'w-today-1',
          day: 'FRI',
          dateStr: 'Jul 24',
          type: 'SWIM',
          title: 'Sharpening CSS Swim Session',
          duration: '45 mins',
          sparkPoints: 24,
          isStructured: true,
          isCompleted: false,
        },
        {
          id: 'w-today-2',
          day: 'FRI',
          dateStr: 'Jul 24',
          type: 'RUN',
          title: 'Morning Aerobic Maintenance Run',
          duration: '35 mins',
          sparkPoints: 32,
          isStructured: true,
          isCompleted: true,
          actualMetrics: '154 avg bpm · 4:48/km pace',
          executionScore: 98,
        },
      ],
    },
    {
      dayName: 'SAT',
      dateStr: 'Jul 25',
      workouts: [
        {
          id: 'w-sat-1',
          day: 'SAT',
          dateStr: 'Jul 25',
          type: 'BIKE',
          title: 'Long Endurance Ride & Brick Run',
          duration: '120 mins',
          sparkPoints: 95,
          isStructured: true,
          isCompleted: false,
        },
      ],
    },
    {
      dayName: 'SUN',
      dateStr: 'Jul 26',
      workouts: [
        {
          id: 'w-sun-1',
          day: 'SUN',
          dateStr: 'Jul 26',
          type: 'MOBILITY',
          title: 'Active Recovery Walk & Stretch',
          duration: '30 mins',
          sparkPoints: 15,
          isStructured: false,
          isCompleted: false,
        },
      ],
    },
  ]);

  // Tab Switching
  const handleTabSwitch = (tab: 'dash' | 'planning') => {
    Haptics.selectionAsync();
    setActiveTab(tab);
    if (scrollViewRef.current) {
      const xOffset = tab === 'dash' ? 0 : SCREEN_WIDTH;
      scrollViewRef.current.scrollTo({ x: xOffset, animated: true });
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / SCREEN_WIDTH);
    const newTab = pageIndex === 0 ? 'dash' : 'planning';
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
  };

  // Add / Edit Workout logic
  const handleOpenAddModal = (dayName = 'FRI', dateStr = 'Jul 24') => {
    setSelectedWorkoutForEdit(null);
    setTargetAddDay({ dayName, dateStr });
    setIsAddModalOpen(true);
  };

  const handleSelectWorkoutForEdit = (workout: WorkoutItem) => {
    setSelectedWorkoutForEdit(workout);
    setIsAddModalOpen(true);
  };

  const handleSaveWorkout = (
    workoutData: Omit<WorkoutItem, 'id'>,
    existingId?: string
  ) => {
    if (existingId) {
      setTodaysWorkouts((prev) =>
        prev.map((w) => (w.id === existingId ? { ...w, ...workoutData } : w))
      );
      setWeeklyAgenda((prev) =>
        prev.map((day) => ({
          ...day,
          workouts: day.workouts.map((w) =>
            w.id === existingId ? { ...w, ...workoutData } : w
          ),
        }))
      );
    } else {
      const newWorkout: WorkoutItem = {
        ...workoutData,
        id: `w-${Date.now()}`,
      };

      if (newWorkout.day === 'FRI' || newWorkout.dateStr === 'Jul 24') {
        setTodaysWorkouts((prev) => [...prev, newWorkout]);
      }

      setWeeklyAgenda((prev) =>
        prev.map((day) => {
          if (day.dayName === newWorkout.day || day.dateStr === newWorkout.dateStr) {
            return { ...day, workouts: [...day.workouts, newWorkout] };
          }
          return day;
        })
      );
    }
  };

  const handleDeleteWorkout = (workoutId: string) => {
    setTodaysWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
    setWeeklyAgenda((prev) =>
      prev.map((day) => ({
        ...day,
        workouts: day.workouts.filter((w) => w.id !== workoutId),
      }))
    );
  };

  const handleConfirmAdaptation = (type: string) => {
    setTodaysWorkouts((prev) =>
      prev.map((w) =>
        w.isCompleted
          ? w
          : {
              ...w,
              title: `${w.title} (Adapted - ${type})`,
              duration: '30 mins',
            }
      )
    );
  };

  const handleSaveWeight = (newWeight: number) => {
    setRecordedWeight(newWeight);
  };

  const handleSendInjuryToCoach = (description: string, severity: number) => {
    router.push('/coach');
  };

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      {/* Top Header */}
      <View className="px-5 pt-3 pb-2 border-b border-theme-border/50 bg-theme-bg">
        <View className="flex-row justify-between items-center mb-3">
          <View>
            <Text className="text-2xl font-extrabold text-theme-text tracking-tight">Dashboard</Text>
          </View>
          <View className="flex-row items-center gap-1.5 bg-theme-card border border-theme-border px-3 py-1.5 rounded-full shadow-sm">
            <Ionicons name="calendar-outline" size={13} color="#16ACBD" />
            <Text className="text-xs font-bold font-mono text-theme-muted">Fri, Jul 24</Text>
          </View>
        </View>

        {/* Sub-tab Navigation Segmented Control */}
        <View className="relative flex-row bg-theme-card border border-theme-border rounded-2xl p-1 shadow-sm overflow-hidden">
          {/* Smooth Real-time Animated Indicator Bubble */}
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent-soft rounded-xl border border-theme-accent/30 shadow-sm"
            style={{
              left: indicatorLeft,
              width: tabWidth,
            }}
          />

          <TouchableOpacity
            onPress={() => handleTabSwitch('dash')}
            activeOpacity={0.8}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <Text
              className={`text-sm font-extrabold ${
                activeTab === 'dash' ? 'text-theme-accent' : 'text-theme-muted'
              }`}
            >
              Dashboard
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleTabSwitch('planning')}
            activeOpacity={0.8}
            className="flex-1 py-2.5 items-center justify-center z-10"
          >
            <Text
              className={`text-sm font-extrabold ${
                activeTab === 'planning' ? 'text-theme-accent' : 'text-theme-muted'
              }`}
            >
              Planning
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Swipeable View Pager / ScrollView Container */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: handleScroll }
        )}
        scrollEventThrottle={16}
        className="flex-1"
      >
        {/* TAB 1: DASHBOARD SUBTAB */}
        <ScrollView
          style={{ width: SCREEN_WIDTH }}
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. TODAY'S PLAN CARD */}
          <TodaysPlanCard
            dateLabel="FRI Jul 24"
            tempLabel="24°C"
            workouts={todaysWorkouts}
            onAdaptPress={() => setIsAdaptModalOpen(true)}
            onAddWorkout={() => handleOpenAddModal('FRI', 'Jul 24')}
            onSelectWorkout={handleSelectWorkoutForEdit}
          />

          {/* 2. ACTIVE QUEST CARD */}
          <ActiveQuestCard onRerollQuest={() => {}} />

          {/* 3. QUICK ACTIONS ROW */}
          <QuickActionsRow
            onAddActivity={() => handleOpenAddModal('FRI', 'Jul 24')}
            onLogWeight={() => setIsWeightModalOpen(true)}
            onReportInjury={() => setIsNiggleModalOpen(true)}
          />

          {/* 4. DAILY AI NUTRITION PROTOCOL CARD */}
          <NutritionProtocolCard nutrition={nutrition} />
        </ScrollView>

        {/* TAB 2: PLANNING SUBTAB */}
        <ScrollView
          style={{ width: SCREEN_WIDTH }}
          className="flex-1 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Training Phase Component */}
          <SeasonRoadmapCard info={seasonInfo} />

          {/* Micro Plan Agenda Card */}
          <MicroPlanAgendaCard
            weekRangeLabel="Jul 20 - Jul 26"
            agenda={weeklyAgenda}
            onPrevWeek={() => {}}
            onNextWeek={() => {}}
            onAutoGenerate={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
            onAddWorkoutToDay={(dayName, dateStr) => handleOpenAddModal(dayName, dateStr)}
            onSelectWorkout={handleSelectWorkoutForEdit}
          />
        </ScrollView>
      </ScrollView>

      {/* Add / Edit Workout Modal */}
      <AddWorkoutModal
        visible={isAddModalOpen}
        targetDayName={targetAddDay.dayName}
        targetDateStr={targetAddDay.dateStr}
        initialWorkout={selectedWorkoutForEdit}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedWorkoutForEdit(null);
        }}
        onSave={handleSaveWorkout}
        onDelete={handleDeleteWorkout}
      />

      {/* Adapt Plan Modal */}
      <AdaptPlanModal
        visible={isAdaptModalOpen}
        onClose={() => setIsAdaptModalOpen(false)}
        onConfirmAdapt={handleConfirmAdaptation}
      />

      {/* Log Weight Modal */}
      <LogWeightModal
        visible={isWeightModalOpen}
        previousWeight={recordedWeight}
        onClose={() => setIsWeightModalOpen(false)}
        onSaveWeight={handleSaveWeight}
      />

      {/* Log Injury Modal */}
      <LogNiggleModal
        visible={isNiggleModalOpen}
        onClose={() => setIsNiggleModalOpen(false)}
        onSendToCoach={handleSendInjuryToCoach}
      />
    </SafeAreaView>
  );
}
