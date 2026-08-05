import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

// Custom Components
import { CoachHighlightCard } from '../../components/dashboard/CoachHighlightCard';
import { PMCMetricsCard } from '../../components/dashboard/PMCMetricsCard';
import { QuickActionsBar } from '../../components/dashboard/QuickActionsBar';
import { TodaysPlanCard } from '../../components/dashboard/TodaysPlanCard';
import { NutritionProtocolCard } from '../../components/dashboard/NutritionProtocolCard';
import { ActiveQuestsCard } from '../../components/dashboard/ActiveQuestsCard';
import { SeasonRoadmapCard } from '../../components/dashboard/SeasonRoadmapCard';
import { MicroPlanAgendaCard, DayAgenda } from '../../components/dashboard/MicroPlanAgendaCard';
import { AddWorkoutModal } from '../../components/dashboard/AddWorkoutModal';
import { AdaptPlanModal } from '../../components/dashboard/AdaptPlanModal';

import {
  WorkoutItem,
  NutritionMacro,
  MacroPeriodInfo,
  SportType,
} from '../../types/dashboard';

import { usePlan } from '../../context/PlanStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { useTabBar } from '../../context/TabBarContext';
import { chatApi, userApi, activitiesApi } from '../../services/apiServices';
import { briefingStorage } from '../../services/storage';
import { PlannedWorkout } from '../../types/plan';
import { UserProfile } from '../../types/user';
import { Activity } from '../../types/activity';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Date Utility Helpers
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDateToYYYYMMDD(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDayName(d: Date): string {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[d.getDay()];
}

function mapSportType(sportStr?: string): SportType {
  if (!sportStr) return 'RUN';
  const s = sportStr.toUpperCase();
  if (s.includes('SWIM')) return 'SWIM';
  if (s.includes('BIKE') || s.includes('CYCLE') || s.includes('RIDE')) return 'BIKE';
  if (s.includes('STRENGTH') || s.includes('WEIGHT')) return 'STRENGTH';
  if (s.includes('MOBILITY') || s.includes('STRETCH') || s.includes('YOGA')) return 'MOBILITY';
  if (s.includes('REST')) return 'REST';
  return 'RUN';
}

function getSnappyCoachSummary(msgs: ChatMessage[], tsb: number = -7.9): string {
  if (!msgs || msgs.length === 0) {
    return 'Readiness is solid today. Focus on consistency for your scheduled training volume.';
  }

  // 1. Check for dedicated morning briefing / hype message
  const morningMsg = msgs.slice().reverse().find(
    (m) => (m.mood === 'hype' || m.mood === 'morning' || m.mood === 'reflection') && m.content
  );
  if (morningMsg && morningMsg.content) {
    const text = morningMsg.content.trim();
    if (text.length <= 160) return text;
    const sentences = text.split(/(?<=[.!?])\s+/);
    return sentences.slice(0, 2).join(' ');
  }

  // 2. Extract action sentence from recent chat response
  const lastCoachMsg = msgs.slice().reverse().find(
    (m) => (m.role === 'coach' || m.role === 'assistant') && m.content
  );

  if (lastCoachMsg && lastCoachMsg.content) {
    const text = lastCoachMsg.content.trim();
    const sentences = text.split(/(?<=[.!?])\s+/);
    // Find an action sentence
    const actionSentence = sentences.find((s) =>
      /run|workout|session|focus|plan|rest|build|keep|let's|tempo|brick|interval|streak/i.test(s)
    );
    if (actionSentence && actionSentence.length >= 15 && actionSentence.length <= 160) {
      return actionSentence.trim();
    }
    if (sentences.length > 0 && sentences[0].length <= 160) {
      return sentences[0].trim();
    }
  }

  // 3. Fallback guidance
  if (tsb < -30) {
    return 'High fatigue detected. Focus on active recovery and fueling today to avoid overtraining.';
  } else if (tsb < -10) {
    return 'Optimal training zone! You are building fitness according to plan. Stay consistent today.';
  } else {
    return 'Readiness is solid today. Stick to your scheduled volume to trigger new fitness adaptations.';
  }
}

export default function DashboardScreen() {
  const router = useRouter();
  const { notifyScroll } = useTabBar();
  const { plan, loading: planLoading, addWorkout, updateWorkout, deleteWorkout, adaptPlan, pushForward, refreshPlan } = usePlan();
  const { physiqueLogs, nutrition: storeNutrition } = usePhysique();
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [segmentedWidth, setSegmentedWidth] = useState(SCREEN_WIDTH - 40);

  const tabWidth = Math.max(0, (segmentedWidth - 8) / 2);
  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, tabWidth],
    extrapolate: 'clamp',
  });

  // Sub-tab state ('dash' vs 'planning')
  const [activeTab, setActiveTab] = useState<'dash' | 'planning'>('dash');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [selectedWorkoutForEdit, setSelectedWorkoutForEdit] = useState<WorkoutItem | null>(null);
  const [targetAddDay, setTargetAddDay] = useState<{ dayName: string; dateStr: string; fullDate: string }>({
    dayName: 'TODAY',
    dateStr: formatShortDate(new Date()),
    fullDate: formatDateToYYYYMMDD(new Date()),
  });

  // Dynamic state from backend APIs
  const [coachMessage, setCoachMessage] = useState<string>(
    'You are in a transitional phase. You are shedding fatigue, but you need to push a bit harder to trigger new fitness adaptations.'
  );
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [completedActivities, setCompletedActivities] = useState<Activity[]>([]);
  const [weatherInfo, setWeatherInfo] = useState<{ temp: string; icon: string }>({
    temp: '22°C',
    icon: 'partly-sunny-outline',
  });

  // Selected week start date (defaults to Monday of current week)
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  // Fetch coach briefing message, user settings, activity history, and live weather forecast
  useEffect(() => {
    let isMounted = true;

    async function loadBackendData() {
      try {
        // Check local device cache for today's briefing
        const cachedBriefing = await briefingStorage.getDailyBriefing(todayYYYYMMDD);
        if (cachedBriefing && isMounted) {
          setCoachMessage(cachedBriefing);
        }

        const [chatHistory, profileData, historyData] = await Promise.allSettled([
          chatApi.getHistory(),
          userApi.getProfile(),
          activitiesApi.getActivities(),
        ]);

        if (isMounted && chatHistory.status === 'fulfilled' && Array.isArray(chatHistory.value)) {
          const summary = getSnappyCoachSummary(chatHistory.value);
          setCoachMessage(summary);
          await briefingStorage.setDailyBriefing(todayYYYYMMDD, summary);
        }

        if (isMounted && profileData.status === 'fulfilled' && profileData.value) {
          setUserProfile(profileData.value);
        }

        if (isMounted && historyData.status === 'fulfilled' && Array.isArray(historyData.value)) {
          setCompletedActivities(historyData.value);
        }

        // Fetch Live Weather Forecast from Open-Meteo
        try {
          const weatherRes = await fetch(
            'https://api.open-meteo.com/v1/forecast?latitude=52.3676&longitude=4.9041&current=temperature_2m,weather_code&timezone=Europe%2FAmsterdam'
          );
          const weatherData = await weatherRes.json();
          if (isMounted && weatherData && weatherData.current) {
            const tempVal = Math.round(weatherData.current.temperature_2m);
            const code = weatherData.current.weather_code;

            let icon = 'partly-sunny-outline';
            if (code === 0) icon = 'sunny-outline';
            else if (code >= 1 && code <= 3) icon = 'cloudy-outline';
            else if (code >= 45 && code <= 48) icon = 'cloud-outline';
            else if (code >= 51 && code <= 82) icon = 'rainy-outline';
            else if (code >= 95) icon = 'thunderstorm-outline';

            setWeatherInfo({ temp: `${tempVal}°C`, icon });
          }
        } catch (wErr) {
          console.log('Weather fetch info:', wErr);
        }
      } catch (err) {
        console.log('Error loading dashboard backend data:', err);
      }
    }

    loadBackendData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Today's Date Info
  const today = new Date();
  const todayYYYYMMDD = formatDateToYYYYMMDD(today);
  const todayHeaderLabel = `${formatDayName(today).slice(0, 3)}, ${formatShortDate(today)}`;

  // Season Roadmap derived info with expandable details
  const daysUntilRace = userProfile?.event_date
    ? Math.max(0, Math.ceil((new Date(userProfile.event_date).getTime() - today.getTime()) / (1000 * 3600 * 24)))
    : 36;

  const seasonInfo: MacroPeriodInfo = {
    raceTargetName: userProfile?.target_event || 'Ironman 70.3',
    daysRemaining: daysUntilRace,
    currentPhaseIndex: 1, // BUILD phase
    targetCTL: userProfile?.target_ctl || 95,
    currentCTL: userProfile?.current_ctl || 68,
    phases: [
      {
        name: 'BASE PHASE',
        weeks: 'Weeks 1-6',
        focus: 'Aerobic Volume & Technique',
        progressPercent: 100,
        targetVolume: '8-10 hrs/wk',
        targetSpark: '400-450 Spark/wk',
        keySessions: ['Long Aerobic Ride (3h)', 'Base Progression Run', 'CSS Swim Drills'],
      },
      {
        name: 'BUILD PHASE',
        weeks: 'Weeks 7-12',
        focus: 'Threshold Velocity & Power',
        progressPercent: 55,
        targetVolume: '10-12 hrs/wk',
        targetSpark: '480-550 Spark/wk',
        keySessions: ['2x20m Threshold Bike Intervals', 'Tempo Brick Run', 'CSS Swim Pace Sets'],
      },
      {
        name: 'PEAK PHASE',
        weeks: 'Weeks 13-14',
        focus: 'Race Pace Intervals',
        progressPercent: 0,
        targetVolume: '11-13 hrs/wk',
        targetSpark: '520-580 Spark/wk',
        keySessions: ['Race Pace Brick Session', 'Over-Under Bike Intervals', 'Sharpening Swim'],
      },
      {
        name: 'TAPER PHASE',
        weeks: 'Weeks 15-16',
        focus: 'Glycogen Supercompensation',
        progressPercent: 0,
        targetVolume: '5-7 hrs/wk',
        targetSpark: '250-300 Spark/wk',
        keySessions: ['Short Sharpening Open Water Swim', 'Pace Opener Ride & Run'],
      },
    ],
  };

  // Convert PlannedWorkout from PlanStore/Backend into WorkoutItem
  const convertPlannedWorkoutToItem = (p: PlannedWorkout, dayName: string, dateStr: string): WorkoutItem => {
    const matchedActivity = completedActivities.find(
      (a) => a.start_date && a.start_date.startsWith(p.date) && mapSportType(a.sport_type) === mapSportType(p.sport)
    );

    return {
      id: String(p.id),
      day: dayName,
      dateStr: dateStr,
      type: mapSportType(p.sport),
      title: p.description || `${p.sport} Session`,
      duration: p.details?.match(/(\d+\s*mins?)/i)?.[1] || '45 mins',
      sparkPoints: p.target_spark || 30,
      isStructured: !!p.steps_json,
      isCompleted: p.isCompleted || !!matchedActivity,
      actualMetrics: matchedActivity
        ? `${matchedActivity.average_heartrate ? `${matchedActivity.average_heartrate} avg bpm · ` : ''}${matchedActivity.distance_km ? `${matchedActivity.distance_km.toFixed(1)}km` : ''}`
        : p.actualMetrics,
      executionScore: p.executionScore || (matchedActivity ? 98 : undefined),
    };
  };

  // Compute Today's Workouts
  const todaysWorkouts: WorkoutItem[] = plan
    .filter((p) => p.date === todayYYYYMMDD)
    .map((p) => convertPlannedWorkoutToItem(p, formatDayName(today), formatShortDate(today)));

  // Compute Weekly Agenda for the selected week
  const agendaDays: DayAgenda[] = Array.from({ length: 7 }, (_, i) => {
    const dayDate = new Date(weekStart);
    dayDate.setDate(dayDate.getDate() + i);

    const dateYYYYMMDD = formatDateToYYYYMMDD(dayDate);
    const dayName = formatDayName(dayDate);
    const dateStr = formatShortDate(dayDate);
    const isToday = dateYYYYMMDD === todayYYYYMMDD;

    const dayPlanned = plan.filter((p) => p.date === dateYYYYMMDD);
    const workouts = dayPlanned.map((p) => convertPlannedWorkoutToItem(p, dayName, dateStr));

    return {
      dayName,
      dateStr,
      isToday,
      workouts,
    };
  });

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekRangeLabel = `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;

  // Tab Switcher
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

  const handleDiscussPlan = () => {
    router.push('/coach');
  };

  // Week Selector Navigation
  const handlePrevWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  // Open Add Modal for creating new exercise
  const handleOpenAddModal = (dayName = formatDayName(today), dateStr = formatShortDate(today), fullDate = todayYYYYMMDD) => {
    setSelectedWorkoutForEdit(null);
    setTargetAddDay({ dayName, dateStr, fullDate });
    setIsAddModalOpen(true);
  };

  // Open Edit Modal for editing existing exercise
  const handleSelectWorkoutForEdit = (workout: WorkoutItem) => {
    setSelectedWorkoutForEdit(workout);
    const planned = plan.find((p) => String(p.id) === workout.id);
    const fullDate = planned?.date || todayYYYYMMDD;
    setTargetAddDay({ dayName: workout.day, dateStr: workout.dateStr, fullDate });
    setIsAddModalOpen(true);
  };

  // Save/Update Workout logic (connected to backend)
  const handleSaveWorkout = async (
    workoutData: Omit<WorkoutItem, 'id'>,
    existingId?: string
  ) => {
    const payload: Partial<PlannedWorkout> = {
      sport: workoutData.type,
      description: workoutData.title,
      target_spark: workoutData.sparkPoints,
      details: workoutData.duration || '45 mins',
      date: targetAddDay.fullDate || todayYYYYMMDD,
    };

    if (existingId) {
      await updateWorkout(existingId, payload);
    } else {
      await addWorkout(payload);
    }
    setIsAddModalOpen(false);
    setSelectedWorkoutForEdit(null);
  };

  // Delete workout (connected to backend)
  const handleDeleteWorkout = async (workoutId: string) => {
    await deleteWorkout(workoutId);
    setIsAddModalOpen(false);
    setSelectedWorkoutForEdit(null);
  };

  // Confirm Adapt Plan
  const handleConfirmAdaptation = async (type: string) => {
    setIsAdaptModalOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (type === 'PUSH_FORWARD') {
      await pushForward(todayYYYYMMDD);
    } else {
      await adaptPlan({ targetDate: todayYYYYMMDD, adaptationType: type });
    }
  };

  // Auto Generate Week
  const handleAutoGenerateWeek = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await adaptPlan({ targetDate: formatDateToYYYYMMDD(weekStart) });
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
            <Ionicons name="calendar-outline" size={13} color="#FF5A1F" />
            <Text className="text-xs font-bold font-mono text-theme-muted">{todayHeaderLabel}</Text>
          </View>
        </View>

        {/* Sub-tab Navigation Segmented Control */}
        <View
          onLayout={(e) => setSegmentedWidth(e.nativeEvent.layout.width)}
          className="relative flex-row bg-theme-card border border-theme-border rounded-2xl p-1 shadow-sm overflow-hidden"
        >
          {/* Animated Indicator Bar */}
          <Animated.View
            className="absolute top-1 bottom-1 rounded-xl shadow-sm"
            style={{
              width: tabWidth,
              transform: [{ translateX: indicatorTranslateX }],
              left: 4,
              backgroundColor: '#FF5A1F1E',
              borderColor: '#FF5A1F',
              borderWidth: 1.5,
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
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        className="flex-1"
      >
        {/* TAB 1: DASHBOARD SUBTAB */}
        <ScrollView
          style={{ width: SCREEN_WIDTH }}
          className="flex-1 px-4 pt-2.5"
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={notifyScroll}
        >
          {/* Coach Highlights Hero Card */}
          <CoachHighlightCard
            message={coachMessage}
            onDiscussPlan={handleDiscussPlan}
          />

          {/* Quick Actions Row */}
          <QuickActionsBar
            onLogActivity={() => handleOpenAddModal(formatDayName(today), formatShortDate(today), todayYYYYMMDD)}
            onLifeHappens={() => setIsAdaptModalOpen(true)}
            onLogWeight={() => router.push('/physique')}
            onNiggleCheck={() => router.push('/coach')}
          />

          {/* Today's Plan Highlight Card (Editable & Telemetry Visualized) */}
          <TodaysPlanCard
            dateLabel={todayHeaderLabel}
            tempLabel={weatherInfo.temp}
            weatherIcon={weatherInfo.icon}
            workouts={todaysWorkouts}
            onAdaptPress={() => setIsAdaptModalOpen(true)}
            onAddWorkout={() => handleOpenAddModal(formatDayName(today), formatShortDate(today), todayYYYYMMDD)}
            onSelectWorkout={handleSelectWorkoutForEdit}
          />

          {/* Daily AI Nutrition Protocol Card */}
          <NutritionProtocolCard nutrition={storeNutrition} />

          {/* Active Quests Widget */}
          <ActiveQuestsCard />
        </ScrollView>

        {/* TAB 2: PLANNING SUBTAB */}
        <ScrollView
          style={{ width: SCREEN_WIDTH }}
          className="flex-1 px-4 pt-2.5"
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={notifyScroll}
        >
          {/* Season Roadmap (Redesigned 3-Stage Macro Periodization) */}
          <SeasonRoadmapCard info={seasonInfo} resetStageKey={activeTab} />

          {/* Micro Plan Full Agenda Card */}
          <MicroPlanAgendaCard
            weekRangeLabel={weekRangeLabel}
            agenda={agendaDays}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            onAutoGenerate={handleAutoGenerateWeek}
            onAddWorkoutToDay={(dayName, dateStr) => {
              const dayIndex = agendaDays.findIndex((d) => d.dayName === dayName && d.dateStr === dateStr);
              const targetDate = new Date(weekStart);
              if (dayIndex !== -1) {
                targetDate.setDate(targetDate.getDate() + dayIndex);
              }
              const fullDate = formatDateToYYYYMMDD(targetDate);
              handleOpenAddModal(dayName, dateStr, fullDate);
            }}
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
    </SafeAreaView>
  );
}
