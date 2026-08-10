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
import { useLanguage } from '../../context/LanguageContext';

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

export default function PlanningScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { t } = useLanguage();
  
  const part3ScrollViewRef = useRef<ScrollView>(null);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [isNiggleModalOpen, setIsNiggleModalOpen] = useState(false);
  
  const [selectedWorkoutForEdit, setSelectedWorkoutForEdit] = useState<WorkoutItem | null>(null);
  
  const insets = useSafeAreaInsets();
  
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(4);
  const [dayYPositions, setDayYPositions] = useState<Record<number, number>>({});

  useEffect(() => {
    const todayIdx = weeklyAgenda.findIndex((d) => d.isToday);
    setSelectedDayIndex(todayIdx >= 0 ? todayIdx : 0);
  }, [weeklyAgenda]);
  const now = new Date();
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const dayOfWeekUpper = dayOfWeekShort.toUpperCase();
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = now.getDate();

  const headerDateLabel = `${dayOfWeekShort}, ${monthShort} ${dayNum}`;
  const todayDateStr = `${monthShort} ${dayNum}`;

  const [targetAddDay, setTargetAddDay] = useState<{ dayName: string; dateStr: string }>({
    dayName: dayOfWeekUpper,
    dateStr: todayDateStr,
  });

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
      isToday: true,
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
    if (existingId) {
      setWeeklyAgenda((prev) =>
        prev.map((day) => ({
          ...day,
          workouts: day.workouts.map((w) => (w.id === existingId ? { ...w, ...workoutData } : w)),
        }))
      );
    } else {
      const newWorkout: WorkoutItem = { ...workoutData, id: `w-${Date.now()}` };
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
    setWeeklyAgenda((prev) =>
      prev.map((day) => ({
        ...day,
        workouts: day.workouts.filter((w) => w.id !== workoutId),
      }))
    );
  };

  const handleInvitePartner = (workout: WorkoutItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Invite Sent!', `An invite link for "${workout.title}" has been generated.`);
  };

  const handleConfirmAdaptation = (type: string) => {
    // Basic logic
  };

  const handleSendInjuryToCoach = (description: string, severity: number) => {
    router.push('/coach');
  };

  return (
    <View className="flex-1 bg-theme-bg" style={{ flex: 1, width: '100%', height: '100%' }}>
      {/* Header Spacer under DashboardSharedHeader */}
      <View style={{ height: 96 }} />

      <View className="flex-1 px-5 pt-1">
        {/* Pinned plan context — one surface, three zoom levels */}
        <View className="bg-theme-card border border-theme-border rounded-3xl p-4 mb-3 shadow-sm">
          <SeasonRoadmapCard info={seasonInfo} />

          <View className="h-px bg-theme-border/60 my-3.5" />

          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-[11px] uppercase tracking-wider font-extrabold text-theme-muted">
              Week plan
            </Text>
            <View className="flex-row items-center bg-theme-bg rounded-full px-2 py-1">
              <TouchableOpacity onPress={() => Haptics.selectionAsync()} className="px-1.5 py-0.5">
                <Ionicons name="chevron-back" size={13} color="#FF5F3B" />
              </TouchableOpacity>
              <Text className="text-xs font-mono font-extrabold text-theme-text px-1">Aug 3 - Aug 9</Text>
              <TouchableOpacity onPress={() => Haptics.selectionAsync()} className="px-1.5 py-0.5">
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
        </View>

        <ScrollView ref={part3ScrollViewRef} className="flex-1" contentContainerStyle={{ paddingBottom: 120, gap: 12 }} showsVerticalScrollIndicator={false}>
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
