import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { useActivities } from '../../context/ActivityStore';

interface MuscleScore {
  name: string;
  key: string;
  fatiguePct: number; // 0 - 100%
  icon: keyof typeof Ionicons.glyphMap;
}

export const MuscleFatigueCard: React.FC = () => {
  const { activities } = useActivities();

  // Compute realistic muscle group fatigue scores based on recent activities (last 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recent = activities.filter((act) => new Date(act.start_date || Date.now()) >= sevenDaysAgo);

  let runCount = 0;
  let bikeCount = 0;
  let strengthCount = 0;

  recent.forEach((act) => {
    const type = (act.sport_type || act.name || '').toLowerCase();
    if (type.includes('run')) runCount++;
    else if (type.includes('ride') || type.includes('bike') || type.includes('cycl')) bikeCount++;
    else if (type.includes('strength') || type.includes('weight') || type.includes('gym')) strengthCount++;
  });

  const quadsFatigue = Math.min(95, 30 + runCount * 15 + bikeCount * 18);
  const calvesFatigue = Math.min(95, 25 + runCount * 22);
  const hamstringsFatigue = Math.min(95, 20 + runCount * 14 + bikeCount * 12);
  const glutesFatigue = Math.min(95, 20 + bikeCount * 16 + strengthCount * 15);
  const coreFatigue = Math.min(95, 15 + runCount * 8 + strengthCount * 12);
  const upperBodyFatigue = Math.min(95, 10 + strengthCount * 25);

  const muscles: MuscleScore[] = [
    { name: 'Quadriceps', key: 'quads', fatiguePct: quadsFatigue, icon: 'walk-outline' },
    { name: 'Calves & Achilles', key: 'calves', fatiguePct: calvesFatigue, icon: 'footsteps-outline' },
    { name: 'Hamstrings', key: 'hamstrings', fatiguePct: hamstringsFatigue, icon: 'fitness-outline' },
    { name: 'Glutes & Hip Flexors', key: 'glutes', fatiguePct: glutesFatigue, icon: 'bicycle-outline' },
    { name: 'Core & Abdominals', key: 'core', fatiguePct: coreFatigue, icon: 'shield-checkmark-outline' },
    { name: 'Upper Body & Shoulders', key: 'upper', fatiguePct: upperBodyFatigue, icon: 'barbell-outline' },
  ];

  // Helper for color badge
  const getFatigueStyle = (pct: number) => {
    if (pct >= 65) return { color: '#EF4444', bg: 'bg-red-500/15', label: 'High Fatigue' };
    if (pct >= 35) return { color: '#F98845', bg: 'bg-orange-500/15', label: 'Moderate' };
    return { color: '#10B981', bg: 'bg-emerald-500/15', label: 'Fresh / Low' };
  };

  return (
    <Card className="mb-4 bg-theme-card">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center space-x-2">
          <View className="w-2.5 h-2.5 rounded-full bg-theme-accent mr-2" />
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            Muscle Fatigue & Breakdown
          </Text>
        </View>
        <Text className="text-[11px] font-semibold text-theme-muted">7-Day Workload Model</Text>
      </View>

      <View className="space-y-3">
        {muscles.map((m) => {
          const style = getFatigueStyle(m.fatiguePct);
          return (
            <View key={m.key} className="bg-theme-bg/60 p-3 rounded-xl mb-2">
              <View className="flex-row justify-between items-center mb-1.5">
                <View className="flex-row items-center space-x-2">
                  <Ionicons name={m.icon} size={15} color="#8E9BA4" style={{ marginRight: 6 }} />
                  <Text className="text-xs font-extrabold text-theme-text">{m.name}</Text>
                </View>
                <View className={`px-2 py-0.5 rounded-md ${style.bg}`}>
                  <Text className="text-[10px] font-bold" style={{ color: style.color }}>
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
