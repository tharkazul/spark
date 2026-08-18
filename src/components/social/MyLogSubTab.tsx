import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { PMCComboChart } from './PMCComboChart';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { useUser } from '../../context/UserStore';
import { Activity } from '../../types/activity';

interface MyLogSubTabProps {
  onOpenActivityModal?: (id: string | number, activity?: Partial<Activity>) => void;
}

function formatHumanizedDate(dateString?: string): string {
  if (!dateString) return 'Recent';
  try {
    const actDate = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(actDate.getFullYear(), actDate.getMonth(), actDate.getDate());
    const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 1 && diffDays < 7) {
      return actDate.toLocaleDateString('en-US', { weekday: 'short' });
    }

    return actDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (e) {
    return dateString.substring(0, 10);
  }
}

function getSportVisuals(sportType?: string, name?: string) {
  const sport = (sportType || '').toLowerCase();
  const n = (name || '').toLowerCase();

  if (
    sport.includes('bike') ||
    sport.includes('ride') ||
    sport.includes('cycl') ||
    n.includes('ride') ||
    n.includes('bike')
  ) {
    return {
      icon: 'bicycle-outline' as const,
      color: '#D97706',
      bgClass: 'bg-[#FEF3C7] dark:bg-amber-950/30',
    };
  }
  if (sport.includes('swim') || sport.includes('water') || n.includes('swim')) {
    return {
      icon: 'water-outline' as const,
      color: '#2563EB',
      bgClass: 'bg-[#EFF6FF] dark:bg-blue-950/30',
    };
  }
  if (
    sport.includes('weight') ||
    sport.includes('strength') ||
    sport.includes('gym') ||
    sport.includes('barbell') ||
    sport.includes('lift') ||
    n.includes('lift') ||
    n.includes('strength')
  ) {
    return {
      icon: 'barbell-outline' as const,
      color: '#9333EA',
      bgClass: 'bg-[#F3E8FF] dark:bg-purple-950/30',
    };
  }
  if (
    sport.includes('yoga') ||
    sport.includes('pilates') ||
    sport.includes('mobility') ||
    sport.includes('stretch') ||
    n.includes('mobility') ||
    n.includes('yoga')
  ) {
    return {
      icon: 'body-outline' as const,
      color: '#059669',
      bgClass: 'bg-[#ECFDF5] dark:bg-emerald-950/30',
    };
  }
  if (sport.includes('walk') || sport.includes('hike') || n.includes('walk') || n.includes('hike')) {
    return {
      icon: 'footsteps-outline' as const,
      color: '#F97316',
      bgClass: 'bg-[#FFF7ED] dark:bg-orange-950/30',
    };
  }
  // Default: Running / Workout
  return {
    icon: 'walk-outline' as const,
    color: '#EA580C',
    bgClass: 'bg-[#FFF5EB] dark:bg-orange-950/30',
  };
}

export const MyLogSubTab: React.FC<MyLogSubTabProps> = ({ onOpenActivityModal }) => {
  const { user } = useUser();
  const { activities, loading } = useActivities();
  const { physiqueLogs } = usePhysique();

  return (
    <View className="space-y-4">
      {/* Embedded PMC Training Load Chart Card */}
      <PMCComboChart
        activities={activities}
        physiqueLogs={physiqueLogs}
        targetCtl={user?.target_ctl || 75}
      />

      {/* Activity History List Header */}
      <View className="flex-row justify-between items-center mb-2 px-0.5">
        <Text className="text-[11px] uppercase font-bold tracking-wider text-[#64748B]">
          Activity Logs ({activities.length})
        </Text>
      </View>

      {/* Activity List Items */}
      {loading && activities.length === 0 ? (
        <View className="items-center justify-center p-8 bg-theme-card border border-[#E2E8F0] dark:border-slate-800 rounded-2xl">
          <ActivityIndicator size="large" color="#FF5F3B" />
          <Text className="text-xs font-bold text-[#64748B] mt-3">Loading activity history...</Text>
        </View>
      ) : activities.length === 0 ? (
        <View className="p-8 items-center justify-center bg-theme-card border border-[#E2E8F0] dark:border-slate-800 rounded-2xl">
          <Ionicons name="fitness-outline" size={32} color="#94A3B8" />
          <Text className="text-sm font-semibold text-[#64748B] mt-2">No activity history recorded yet.</Text>
        </View>
      ) : (
        <View className="space-y-2.5">
          {activities.map((act) => {
            const idStr = String(act.id);
            const visuals = getSportVisuals(act.sport_type, act.name);
            const dateStr = formatHumanizedDate(act.start_date);
            const rookaScore = Math.round(act.rooka_score || act.tss || 0);

            // Construct metric subtitle
            const metrics: string[] = [dateStr];
            if (typeof act.distance_km === 'number' && act.distance_km > 0) {
              metrics.push(`${act.distance_km.toFixed(2)} km`);
            }
            if (act.moving_time_min && act.moving_time_min > 0) {
              metrics.push(`${Math.round(act.moving_time_min)} mins`);
            }

            return (
              <TouchableOpacity
                key={`act-${idStr}`}
                onPress={() => onOpenActivityModal && onOpenActivityModal(act.id, act)}
                activeOpacity={0.7}
                className="bg-theme-card border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-3.5 flex-row justify-between items-center mb-2.5"
              >
                <View className="flex-row items-center flex-1 pr-3">
                  {/* 40x40 Rounded Tinted Icon Container */}
                  <View
                    className={`w-10 h-10 rounded-xl items-center justify-center mr-3.5 ${visuals.bgClass}`}
                  >
                    <Ionicons name={visuals.icon} size={20} color={visuals.color} />
                  </View>

                  {/* Title & Formatted Metadata */}
                  <View className="flex-1">
                    <Text className="text-[15px] font-semibold text-theme-text" numberOfLines={1}>
                      {act.name || 'Workout'}
                    </Text>
                    <Text className="text-[13px] font-medium text-[#64748B] mt-0.5">
                      {metrics.join(' · ')}
                    </Text>
                  </View>
                </View>

                {/* Right-side Rooka Score Pill & Chevron */}
                <View className="flex-row items-center">
                  <View className="bg-[#FFF7ED] dark:bg-orange-950/40 px-2.5 py-1 rounded-full mr-2 border border-[#FF5F3B]/15">
                    <Text className="text-xs font-bold text-[#EA580C] dark:text-orange-400 font-mono">
                      +{rookaScore} Rooka
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};
