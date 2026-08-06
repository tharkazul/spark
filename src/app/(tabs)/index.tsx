import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

// Context
import { useUser } from '../../context/UserStore';
import { useTabBar } from '../../context/TabBarContext';
import { useLanguage } from '../../context/LanguageContext';

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
  const { user } = useUser();
  const { t } = useLanguage();
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

  const [recordedWeight, setRecordedWeight] = useState<number>(user?.athlete_metrics?.weight_kg || 74.5);
  const [selectedWorkoutForEdit, setSelectedWorkoutForEdit] = useState<WorkoutItem | null>(null);

  // Dynamic real-time date calculation from device system clock
  const now = new Date();
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' }); // e.g. 'Thu'
  const dayOfWeekUpper = dayOfWeekShort.toUpperCase(); // e.g. 'THU'
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' }); // e.g. 'Aug'
  const dayNum = now.getDate(); // e.g. 6

  const headerDateLabel = `${dayOfWeekShort}, ${monthShort} ${dayNum}`; // e.g. 'Thu, Aug 6'
  const todaysCardDateLabel = `${dayOfWeekUpper} ${monthShort} ${dayNum}`; // e.g. 'THU Aug 6'
  const todayDateStr = `${monthShort} ${dayNum}`; // e.g. 'Aug 6'

  const [targetAddDay, setTargetAddDay] = useState<{ dayName: string; dateStr: string }>({
    dayName: dayOfWeekUpper,
    dateStr: todayDateStr,
  });

  // Calculate dynamic dimensions for tab indicator bubble
  const containerWidth = SCREEN_WIDTH - 40; // px-5 = 20px margin left/right
  const tabWidth = (containerWidth - 8) / 2; // p-1 = 4px padding left/right inside container

  const indicatorLeft = scrollX.interpolate({
    inputRange: [0, Math.max(1, SCREEN_WIDTH)],
    outputRange: [4, 4 + tabWidth],
    extrapolate: 'clamp',
  });

  // Dynamic user logged target race name & countdown
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

  // Training Phase (Dynamic race target name from UserStore)
  const seasonInfo: MacroPeriodInfo = {
    raceTargetName: mainRaceName,
    daysRemaining: daysRemaining,
    currentPhaseIndex: 1, // BUILD phase
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

  // Today's Workouts (Top of Dashboard - Real Today Date)
  const [todaysWorkouts, setTodaysWorkouts] = useState<WorkoutItem[]>([
    {
      id: 'w-today-1',
      day: dayOfWeekUpper,
      dateStr: todayDateStr,
      type: 'SWIM',
      title: 'Sharpening CSS Swim Session',
      duration: '45 mins',
      sparkPoints: 24,
      isStructured: true,
      isCompleted: false,
    },
    {
      id: 'w-today-2',
      day: dayOfWeekUpper,
      dateStr: todayDateStr,
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

  // Micro Agenda (Full Week: Aug 3 - Aug 9)
  const [weeklyAgenda, setWeeklyAgenda] = useState<DayAgenda[]>([
    {
      dayName: 'MON',
      dateStr: 'Aug 3',
      isPast: true,
      workouts: [
        {
          id: 'w-mon-1',
          day: 'MON',
          dateStr: 'Aug 3',
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
      dateStr: 'Aug 4',
      isPast: true,
      workouts: [
        {
          id: 'w-tue-1',
          day: 'TUE',
          dateStr: 'Aug 4',
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
      dateStr: 'Aug 5',
      isPast: true,
      workouts: [
        {
          id: 'w-wed-1',
          day: 'WED',
          dateStr: 'Aug 5',
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
      dateStr: 'Aug 6',
      isToday: true, // REAL TODAY!
      workouts: [
        {
          id: 'w-today-1',
          day: 'THU',
          dateStr: 'Aug 6',
          type: 'SWIM',
          title: 'Sharpening CSS Swim Session',
          duration: '45 mins',
          sparkPoints: 24,
          isStructured: true,
          isCompleted: false,
        },
        {
          id: 'w-today-2',
          day: 'THU',
          dateStr: 'Aug 6',
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
      dayName: 'FRI',
      dateStr: 'Aug 7',
      workouts: [],
    },
    {
      dayName: 'SAT',
      dateStr: 'Aug 8',
      workouts: [
        {
          id: 'w-sat-1',
          day: 'SAT',
          dateStr: 'Aug 8',
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
      dateStr: 'Aug 9',
      workouts: [
        {
          id: 'w-sun-1',
          day: 'SUN',
          dateStr: 'Aug 9',
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
  const handleOpenAddModal = (dayName = dayOfWeekUpper, dateStr = todayDateStr) => {
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

      if (newWorkout.day === dayOfWeekUpper || newWorkout.dateStr === todayDateStr) {
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
            <Text className="text-2xl font-extrabold text-theme-text tracking-tight">{t('nav.dashboard')}</Text>
          </View>
          <View className="flex-row items-center gap-1.5 bg-theme-card border border-theme-border px-3 py-1.5 rounded-full">
            <Ionicons name="calendar-outline" size={13} color="#16ACBD" />
            <Text className="text-xs font-bold font-mono text-theme-muted">{headerDateLabel}</Text>
          </View>
        </View>

        {/* Sub-tab Navigation Segmented Control */}
        <View className="relative flex-row bg-theme-card border border-theme-border rounded-2xl p-1 overflow-hidden">
          {/* Smooth Real-time Animated Indicator Bubble */}
          <Animated.View
            className="absolute top-1 bottom-1 bg-theme-accent-soft rounded-xl border border-theme-accent/30"
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
              {t('nav.dashboard')}
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
            dateLabel={todaysCardDateLabel}
            tempLabel="24°C"
            workouts={todaysWorkouts}
            onAdaptPress={() => setIsAdaptModalOpen(true)}
            onAddWorkout={() => handleOpenAddModal(dayOfWeekUpper, todayDateStr)}
            onSelectWorkout={handleSelectWorkoutForEdit}
          />

          {/* 2. ACTIVE QUEST CARD */}
          <ActiveQuestCard onRerollQuest={() => {}} />

          {/* 3. QUICK ACTIONS ROW */}
          <QuickActionsRow
            onAddActivity={() => handleOpenAddModal(dayOfWeekUpper, todayDateStr)}
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
            weekRangeLabel="Aug 3 - Aug 9"
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
