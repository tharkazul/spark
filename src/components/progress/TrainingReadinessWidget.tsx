import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

import { useHealth } from '../../context/HealthStore';
import { useActivities } from '../../context/ActivityStore';
import { ActiveNiggle } from './AnatomicalBodyMap';

export const TrainingReadinessWidget: React.FC = () => {
  const { niggles: storeNiggles } = useHealth();
  const { activities } = useActivities();
  const niggles = storeNiggles as ActiveNiggle[];

  // Compute readiness score (0 - 100)
  // 1. Start from baseline 88
  let score = 88;

  // 2. Active Injury/Soreness deduction
  const nigglePenalty = niggles.reduce((acc, curr) => acc + Number(curr.severity) * 12, 0);
  score -= nigglePenalty;

  // 3. Workload Fatigue deduction (last 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentActs = activities.filter(
    (act) => new Date(act.start_date || Date.now()) >= sevenDaysAgo
  );
  if (recentActs.length >= 5) {
    score -= 15;
  } else if (recentActs.length >= 3) {
    score -= 8;
  }

  // Clamp score between 10 and 100
  score = Math.max(10, Math.min(100, Math.round(score)));

  // Tiers & advice mapping
  let statusText = 'Low';
  let adviceText = 'Time to slow down';
  let activeColor = '#EF4444'; // Red

  if (score >= 80) {
    statusText = 'Prime';
    adviceText = 'Peak state! Ideal for PR attempts';
    activeColor = '#38BDF8'; // Cyan / Teal
  } else if (score >= 60) {
    statusText = 'High';
    adviceText = 'Good readiness for structured workout efforts';
    activeColor = '#10B981'; // Emerald
  } else if (score >= 35) {
    statusText = 'Moderate';
    adviceText = 'Steady Zone 2 aerobic maintenance recommended';
    activeColor = '#FF5F3B'; // Orange
  } else {
    statusText = 'Low';
    adviceText = 'Time to slow down';
    activeColor = '#EF4444'; // Red
  }

  // SVG Semi-circle gauge geometry
  const width = 240;
  const height = 135;
  const cx = 120;
  const cy = 120;
  const R = 86; // Main arc radius
  const strokeW = 10;

  // Indicator dot coordinates
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const angleRad = Math.PI - pct * Math.PI;
  const dotX = cx + R * Math.cos(angleRad);
  const dotY = cy - R * Math.sin(angleRad);

  return (
    <View className="mb-4 bg-[#1E293B] p-5 rounded-[24px] shadow-md border border-[#334155]">
      {/* Header Row */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center space-x-2">
          <View className="w-2.5 h-2.5 rounded-full bg-[#FF5F3B] mr-2" />
          <Text className="text-xs font-bold text-slate-400">
            Training Readiness
          </Text>
        </View>
        <Text className="text-xs font-semibold text-slate-400">Daily Readiness Score</Text>
      </View>

      {/* Main Gauge & Center Content */}
      <View className="items-center justify-center my-2 relative">
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Segment 1: Low (180deg to 135deg) -> Red */}
          <Path
            d="M 34 120 A 86 86 0 0 1 59.2 59.2"
            fill="none"
            stroke="#EF4444"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Segment 2: Moderate (130deg to 85deg) -> Orange */}
          <Path
            d="M 64.7 53.7 A 86 86 0 0 1 112.5 34.3"
            fill="none"
            stroke="#FF5F3B"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Segment 3: High (80deg to 35deg) -> Green */}
          <Path
            d="M 118 34.1 A 86 86 0 0 1 175.3 53.7"
            fill="none"
            stroke="#10B981"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Segment 4: Prime (30deg to 0deg) -> Light Cyan / Blue */}
          <Path
            d="M 180.8 59.2 A 86 86 0 0 1 206 120"
            fill="none"
            stroke="#38BDF8"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Inner Dotted Semi-circle Track */}
          <Path
            d="M 48 120 A 72 72 0 0 1 192 120"
            fill="none"
            stroke="rgba(248, 250, 252, 0.4)"
            strokeWidth="2"
            strokeDasharray="2, 6"
            strokeLinecap="round"
          />

          {/* Pin Indicator Dot */}
          <Circle cx={dotX} cy={dotY} r="7" fill="#F8FAFC" />
          <Circle cx={dotX} cy={dotY} r="4" fill={activeColor} />
        </Svg>

        {/* Center Labels */}
        <View className="items-center mt-[-32px] mb-1">
          <Text className="text-5xl font-normal text-white tracking-tight">{score}</Text>
          <Text className="text-base font-bold text-white mt-1">{statusText}</Text>
          <Text className="text-xs text-slate-300 mt-0.5">{adviceText}</Text>
        </View>
      </View>
    </View>
  );
};
