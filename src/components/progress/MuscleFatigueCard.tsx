import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { useActivities } from '../../context/ActivityStore';
import { fatiguePercentages, MuscleGroup } from '../../domain/muscleLoad';

interface MuscleScore {
  name: string;
  key: MuscleGroup;
  fatiguePct: number; // 0 - 100%
  icon: keyof typeof Ionicons.glyphMap;
}

export const MuscleFatigueCard: React.FC = () => {
  const { activities } = useActivities();

  // Per-muscle load from the shared model in domain/muscleLoad.ts. What used to
  // be here counted activities and clamped at 95, which put an ordinary week at
  // 95/91/86 on the three leg groups — three muscles hitting one ceiling rather
  // than three measurements. The model measures rooka, decays it by age and
  // saturates smoothly instead.
  const scores = React.useMemo(
    () => fatiguePercentages(activities as any),
    [activities]
  );

  const muscles: MuscleScore[] = [
    { name: 'Quadriceps', key: 'quads', fatiguePct: scores.quads, icon: 'walk-outline' },
    { name: 'Calves & Achilles', key: 'calves', fatiguePct: scores.calves, icon: 'footsteps-outline' },
    { name: 'Hamstrings', key: 'hamstrings', fatiguePct: scores.hamstrings, icon: 'fitness-outline' },
    { name: 'Glutes & Hip Flexors', key: 'glutes', fatiguePct: scores.glutes, icon: 'bicycle-outline' },
    { name: 'Core & Abdominals', key: 'core', fatiguePct: scores.core, icon: 'shield-checkmark-outline' },
    { name: 'Upper Body & Shoulders', key: 'upper', fatiguePct: scores.upper, icon: 'barbell-outline' },
  ];

  // Helper for color badge
  const getFatigueStyle = (pct: number) => {
    if (pct >= 65) return { color: '#EF4444', bg: 'bg-semantic-error/15', label: 'High Fatigue' };
    if (pct >= 35) return { color: '#F98845', bg: 'bg-theme-accent/15', label: 'Moderate' };
    return { color: '#10B981', bg: 'bg-semantic-success/15', label: 'Fresh / Low' };
  };

  return (
    <Card className="mb-4 bg-theme-card">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-x-2">
          <View className="w-2.5 h-2.5 rounded-full bg-theme-accent mr-2" />
          <Text className="text-xs font-bold text-theme-muted">
            Muscle Fatigue & Breakdown
          </Text>
        </View>
        <Text className="text-xs font-semibold text-theme-muted">7-Day Workload Model</Text>
      </View>

      <View className="gap-y-3">
        {muscles.map((m) => {
          const style = getFatigueStyle(m.fatiguePct);
          return (
            <View key={m.key} className="bg-theme-bg/60 p-3 rounded-xl mb-2">
              <View className="flex-row justify-between items-center mb-1.5">
                <View className="flex-row items-center gap-x-2">
                  <Ionicons name={m.icon} size={15} color="#8E9BA4" style={{ marginRight: 6 }} />
                  <Text className="text-xs font-extrabold text-theme-text">{m.name}</Text>
                </View>
                <View className={`px-2 py-0.5 rounded-md ${style.bg}`}>
                  <Text className="text-xs font-bold" style={{ color: style.color }}>
                    {m.fatiguePct}% ({style.label})
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View className="w-full h-2 bg-theme-card rounded-full overflow-hidden">
                <View
                  style={{ width: `${m.fatiguePct}%`, backgroundColor: style.color }}
                  className="h-full rounded-full"
                />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
};
