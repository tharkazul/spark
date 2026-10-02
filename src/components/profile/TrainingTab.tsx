import React from 'react';
import { View } from 'react-native';
import { GoalsTab } from './GoalsTab';
import { WeeklyAvailabilityCard } from './WeeklyAvailabilityCard';
import { TrainingZonesCard } from './TrainingZonesCard';
import { RecurringTrainingsCard } from './RecurringTrainingsCard';
import { BenchmarkSessionsCard } from './BenchmarkSessionsCard';

interface TrainingTabProps {
  onDirtyChange?: (isDirty: boolean) => void;
}

export const TrainingTab: React.FC<TrainingTabProps> = () => {
  return (
    <View className="gap-y-4 pb-8">
      {/* 1. ATHLETE GOALS & SEASON CALENDAR */}
      <GoalsTab />

      {/* 2. WEEKLY TRAINING AVAILABILITY (COMPRESSED 7-DAY STRIP) */}
      <WeeklyAvailabilityCard />

      {/* 3. TRAINING ZONES & PHYSIOLOGICAL THRESHOLDS (MAX HR, FTP) */}
      <TrainingZonesCard />

      {/* 4. RECURRING TRAININGS & CLUB SPORTS */}
      <RecurringTrainingsCard />

      {/* 5. BENCHMARK SESSIONS & PERFORMANCE ASSESSMENTS */}
      <BenchmarkSessionsCard />
    </View>
  );
};

export default TrainingTab;
