import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useUser } from '../../context/UserStore';
import { usePlan } from '../../context/PlanStore';
import { useLanguage } from '../../context/LanguageContext';
import { useHeaderLayout } from '../../context/HeaderLayoutContext';
import { useTabBar } from '../../context/TabBarContext';
import { canAccessQuests } from '../../utils/permissions';

import { TodaysPlanCard } from '../../components/dashboard/TodaysPlanCard';
import { ActiveQuestsCard } from '../../components/dashboard/ActiveQuestsCard';
import { QuickActionsRow } from '../../components/dashboard/QuickActionsRow';

import { AddWorkoutModal } from '../../components/dashboard/AddWorkoutModal';
import { AdaptPlanModal } from '../../components/dashboard/AdaptPlanModal';
import { LogWeightModal } from '../../components/dashboard/LogWeightModal';
import { LogNiggleModal } from '../../components/dashboard/LogNiggleModal';

import {
  WorkoutItem,
  NutritionMacro,
} from '../../types/dashboard';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { plan } = usePlan();
  const { t } = useLanguage();
  const { headerHeight } = useHeaderLayout();
  const { notifyScroll, tabBarOccupied } = useTabBar();
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdaptModalOpen, setIsAdaptModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isNiggleModalOpen, setIsNiggleModalOpen] = useState(false);

  const [recordedWeight, setRecordedWeight] = useState<number>(user?.athlete_metrics?.weight_kg || 0);
  const [selectedWorkoutForEdit, setSelectedWorkoutForEdit] = useState<WorkoutItem | null>(null);

  const now = new Date();
  const todayYYYYMMDD = now.toISOString().split('T')[0];
  const dayOfWeekShort = now.toLocaleDateString('en-US', { weekday: 'short' });
  const dayOfWeekUpper = dayOfWeekShort.toUpperCase();
  const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
  const dayNum = now.getDate();

  const headerDateLabel = `${dayOfWeekShort}, ${monthShort} ${dayNum}`;
  const todaysCardDateLabel = `${dayOfWeekUpper} ${monthShort} ${dayNum}`;
  const todayDateStr = `${monthShort} ${dayNum}`;

  const [targetAddDay, setTargetAddDay] = useState<{ dayName: string; dateStr: string }>({
    dayName: dayOfWeekUpper,
    dateStr: todayDateStr,
  });

  const [fallbackWorkouts, setFallbackWorkouts] = useState<WorkoutItem[]>([
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

  const todaysWorkouts = useMemo(() => {
    if (plan && Array.isArray(plan)) {
      const filtered = plan.filter(
        (w) => w.date === todayYYYYMMDD || w.day === 'TODAY' || w.day === dayOfWeekUpper
      );
      if (filtered.length > 0) {
        return filtered.map((w) => ({
          id: String(w.id),
          day: w.day || dayOfWeekUpper,
          dateStr: todayDateStr,
          type: (w.sport || 'RUN').toUpperCase() as any,
          title: w.description || `${w.sport} Workout`,
          duration: w.details || '45 mins',
          sparkPoints: w.target_spark || 30,
          isStructured: !!w.steps_json,
          isCompleted: !!w.isCompleted,
          actualMetrics: w.actualMetrics,
          executionScore: w.executionScore,
        }));
      }
    }
    return fallbackWorkouts;
  }, [plan, todayYYYYMMDD, dayOfWeekUpper, todayDateStr, fallbackWorkouts]);

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
      setFallbackWorkouts((prev) =>
        prev.map((w) => (w.id === existingId ? { ...w, ...workoutData } : w))
      );
    } else {
      const newWorkout: WorkoutItem = { ...workoutData, id: `w-${Date.now()}` };
      if (newWorkout.day === dayOfWeekUpper || newWorkout.dateStr === todayDateStr) {
        setFallbackWorkouts((prev) => [...prev, newWorkout]);
      }
    }
  };

  const handleDeleteWorkout = (workoutId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setFallbackWorkouts((prev) => prev.filter((w) => w.id !== workoutId));
  };

  const handleConfirmAdaptation = (type: string) => {
    setFallbackWorkouts((prev) =>
      prev.map((w) =>
        w.isCompleted ? w : { ...w, title: `${w.title} (Adapted - ${type})`, duration: '30 mins' }
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
    <View className="flex-1 bg-theme-bg" style={{ flex: 1, width: '100%', height: '100%' }}>
      {/* Header Spacer dynamically measured from DashboardSharedHeader onLayout */}
      <View style={{ height: headerHeight }} />

      <ScrollView 
        className="flex-1 px-5 pt-2" 
        contentContainerStyle={{ paddingBottom: tabBarOccupied + 20 }} 
        showsVerticalScrollIndicator={false} 
        contentInsetAdjustmentBehavior="never"
        onScrollBeginDrag={notifyScroll}
      >
        <TodaysPlanCard
          dateLabel={todaysCardDateLabel}
          tempLabel="24°C"
          workouts={todaysWorkouts}
          onAdaptPress={() => setIsAdaptModalOpen(true)}
          onAddWorkout={() => handleOpenAddModal(dayOfWeekUpper, todayDateStr)}
          onSelectWorkout={handleSelectWorkoutForEdit}
        />
        {canAccessQuests(user?.subscription_tier) && (
          <ActiveQuestsCard />
        )}
        <QuickActionsRow
          onAddActivity={() => handleOpenAddModal(dayOfWeekUpper, todayDateStr)}
          onLogWeight={() => setIsWeightModalOpen(true)}
          onReportInjury={() => setIsNiggleModalOpen(true)}
        />
      </ScrollView>

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
    </View>
  );
}
