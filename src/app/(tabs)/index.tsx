import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  useWindowDimensions,
  Alert,
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
import { SideBySideWeekBar } from '../../components/dashboard/SideBySideWeekBar';
import { DetailedDayCard } from '../../components/dashboard/DetailedDayCard';
import { DayAgenda } from '../../components/dashboard/MicroPlanAgendaCard';

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

  const mainViewPagerRef = useRef<ScrollView>(null);
  const part3ScrollViewRef = useRef<ScrollView>(null);
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

  // Layout tracking for scrolling Part 3 cards
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(4); // Default FRI (index 4)
  const [dayYPositions, setDayYPositions] = useState<Record<number, number>>({});

  // Dynamic real-time date calculation from system clock
  const now = new Date();
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' }); // 'Fri'
  const dayOfWeekUpper = dayOfWeekShort.toUpperCase(); // 'FRI'
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' }); // 'Aug'
  const dayNum = now.getDate(); // 7

  const headerDateLabel = `${dayOfWeekShort}, ${monthShort} ${dayNum}`; // 'Fri, Aug 7'
  const todaysCardDateLabel = `${dayOfWeekUpper} ${monthShort} ${dayNum}`; // 'FRI Aug 7'
  const todayDateStr = `${monthShort} ${dayNum}`; // 'Aug 7'

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

  // Nutrition Protocol
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

  // Part 1: Macro Periodization Info
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

  // Today's Workouts (Dashboard Tab)
  const [todaysWorkouts, setTodaysWorkouts] = useState<WorkoutItem[]>([
    {
      id: 'w-today-1',
      day: 'FRI',
      dateStr: 'Aug 7',
      type: 'BIKE',
      title: 'Lekker fietsen',
      duration: '60 mins',
      sparkPoints: 84,
      isStructured: true,
      isCompleted: false,
    },
  ]);

  // Full 7-Day Agenda (Planning Tab - Aug 3 - Aug 9)
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
      isPast: true,
      workouts: [],
    },
    {
      dayName: 'FRI',
      dateStr: 'Aug 7',
      isToday: true, // TODAY!
      workouts: [
        {
          id: 'w-today-1',
          day: 'FRI',
          dateStr: 'Aug 7',
          type: 'BIKE',
          title: 'Lekker fietsen',
          duration: '60 mins',
          sparkPoints: 84,
          isStructured: true,
          isCompleted: false,
        },
      ],
    },
    {
      dayName: 'SAT',
      dateStr: 'Aug 8',
      workouts: [
        {
          id: 'w-sat-1',
          day: 'SAT',
          dateStr: 'Aug 8',
          type: 'STRENGTH',
          title: 'Chest only session',
          duration: '45 mins',
          sparkPoints: 30,
          isStructured: false,
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

  // Tab Switching logic
  const handleTabSwitch = (tab: 'dash' | 'planning') => {
    Haptics.selectionAsync();
    setActiveTab(tab);
    if (mainViewPagerRef.current) {
      const xOffset = tab === 'dash' ? 0 : SCREEN_WIDTH;
      mainViewPagerRef.current.scrollTo({ x: xOffset, animated: true });
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

  // Scroll Part 3 internally to Today's card (index 4) when Planning tab is selected
  useEffect(() => {
    if (activeTab === 'planning') {
      const todayIdx = weeklyAgenda.findIndex((d) => d.isToday);
      const targetIdx = todayIdx >= 0 ? todayIdx : 4;
      const targetY = dayYPositions[targetIdx] || 0;
      const timer = setTimeout(() => {
        part3ScrollViewRef.current?.scrollTo({ y: targetY, animated: true });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeTab, dayYPositions]);

  // Add / Edit / Remove Workout logic
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setTodaysWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
    setWeeklyAgenda((prev) =>
      prev.map((day) => ({
        ...day,
        workouts: day.workouts.filter((w) => w.id !== workoutId),
      }))
    );
  };

  const handleInvitePartner = (workout: WorkoutItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Invite Sent!',
      `An invite link for "${workout.title}" has been generated. Share it with your training partner or coach.`
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
          <View className="flex-row items-center gap-1.5 bg-theme-card border border-theme-border/60 px-3 py-1.5 rounded-full">
            <Ionicons name="calendar-outline" size={13} color="#16ACBD" />
            <Text className="text-xs font-bold font-mono text-theme-muted">{headerDateLabel}</Text>
          </View>
        </View>

        {/* Sub-tab Navigation Segmented Control */}
        <View className="relative flex-row bg-theme-card border border-theme-border/60 rounded-2xl p-1 overflow-hidden">
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
        ref={mainViewPagerRef}
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

        {/* TAB 2: REDESIGNED 3-PART PLANNING SUBTAB */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-5 pt-3">
          {/* PINNED HEADER SECTION (Part 1 + Part 2 remain fixed at top!) */}
          <View className="mb-2">
            {/* Part 1: Compact Macro Phase Card */}
            <SeasonRoadmapCard info={seasonInfo} />

            {/* Part 2: Week Plan Header Row & Side-by-Side Week Bar */}
            <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-theme-border/50 bg-theme-card border border-theme-border p-4 rounded-3xl shadow-sm">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-theme-accent/15 items-center justify-center">
                  <Ionicons name="calendar-outline" size={20} color="#16ACBD" />
                </View>
                <Text className="text-base font-extrabold text-theme-text">Week Plan</Text>
              </View>

              {/* Week Navigator */}
              <View className="flex-row items-center bg-theme-card border border-theme-border px-3 py-1.5 rounded-full shadow-sm">
                <TouchableOpacity onPress={() => Haptics.selectionAsync()} className="px-1 py-0.5">
                  <Ionicons name="chevron-back" size={13} color="#16ACBD" />
                </TouchableOpacity>
                <Text className="text-xs font-mono font-extrabold text-theme-text px-1">
                  Aug 3 - Aug 9
                </Text>
                <TouchableOpacity onPress={() => Haptics.selectionAsync()} className="px-1 py-0.5">
                  <Ionicons name="chevron-forward" size={13} color="#16ACBD" />
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
          </View>

          {/* SCROLLABLE BODY REGION (Part 3: Day by Day Cards scroll underneath Part 1 & 2!) */}
          <ScrollView
            ref={part3ScrollViewRef}
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="space-y-3">
              {weeklyAgenda.map((day, idx) => (
                <View
                  key={`${day.dayName}-${day.dateStr}`}
                  onLayout={(e) => {
                    const y = e.nativeEvent.layout.y;
                    setDayYPositions((prev) => ({ ...prev, [idx]: y }));
                  }}
                >
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
            </View>
          </ScrollView>
        </View>
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
