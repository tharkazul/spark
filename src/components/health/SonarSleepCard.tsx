import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { AppleHealthDailyBiometrics } from '../../services/appleHealthService';

interface SonarSleepCardProps {
  biometrics: AppleHealthDailyBiometrics | null | undefined;
}

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export const SonarSleepCard: React.FC<SonarSleepCardProps> = ({ biometrics }) => {
  if (!biometrics || !biometrics.sleep_minutes || biometrics.sleep_minutes <= 0) {
    return null;
  }

  const totalMin = Math.round(biometrics.sleep_minutes);
  const deepMin = Math.round(biometrics.sleep_deep_minutes || 0);
  const remMin = Math.round(biometrics.sleep_rem_minutes || 0);
  const coreMin = Math.round(biometrics.sleep_core_minutes || 0);
  const awakeMin = Math.round(biometrics.sleep_awake_minutes || 0);

  // Target baseline: 8 hours (480 mins)
  const targetMin = 480;
  const progressPct = Math.min(100, Math.round((totalMin / targetMin) * 100));

  // Circular Dial Geometry
  const size = 110;
  const strokeWidth = 8;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * Math.min(progressPct, 100)) / 100;

  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  const stages = [
    { label: 'Deep Sleep', minutes: deepMin, color: '#6366F1', max: 120 },
    { label: 'REM', minutes: remMin, color: '#A855F7', max: 140 },
    { label: 'Light / Core', minutes: coreMin, color: '#38BDF8', max: 280 },
    { label: 'Time Awake', minutes: awakeMin, color: '#F59E0B', max: 60 },
  ];

  return (
    <Card className="mb-4 bg-theme-card p-4 border border-theme-border">
      {/* Header */}
      <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-theme-border/60">
        <View className="flex-row items-center gap-2">
          <Ionicons name="moon-outline" size={16} color="#818CF8" />
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            Sleep Analysis
          </Text>
        </View>
        <View className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
          <Text className="text-[10px] font-bold text-indigo-400">
            {progressPct}% of 8h goal
          </Text>
        </View>
      </View>

      {/* Main Content: Left Ring + Right Stages */}
      <View className="flex-row items-center gap-4">
        {/* Left Circular Ring */}
        <View className="items-center justify-center relative" style={{ width: size, height: size }}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background Track */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#334155"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Active Progress */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#818CF8"
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
              transform={`rotate(-90 ${center} ${center})`}
            />
          </Svg>
          {/* Center Text */}
          <View className="absolute items-center justify-center">
            <Text className="text-base font-extrabold text-theme-text">
              {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
            </Text>
            <Text className="text-[10px] font-bold text-theme-muted">
              Asleep
            </Text>
          </View>
        </View>

        {/* Right Stage Breakdown */}
        <View className="flex-1 gap-y-2">
          {stages.map((stage) => {
            const barPct = stage.max > 0 ? Math.min(100, Math.round((stage.minutes / stage.max) * 100)) : 0;
            return (
              <View key={stage.label}>
                <View className="flex-row justify-between items-center mb-0.5">
                  <Text className="text-[11px] text-theme-muted font-medium">
                    {stage.label}
                  </Text>
                  <Text className="text-[11px] text-theme-text font-bold">
                    {formatDuration(stage.minutes)}
                  </Text>
                </View>
                {/* Micro Bar */}
                <View className="h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${barPct}%`,
                      backgroundColor: stage.color,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </Card>
  );
};
