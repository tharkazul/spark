import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

import { useHealth } from '../../context/HealthStore';
import { useActivities } from '../../context/ActivityStore';
import { useLanguage } from '../../context/LanguageContext';
import { ActiveNiggle } from './AnatomicalBodyMap';
import { AppleHealthDailyBiometrics } from '../../services/appleHealthService';

interface TrainingReadinessWidgetProps {
  biometrics?: AppleHealthDailyBiometrics | null;
}

export const TrainingReadinessWidget: React.FC<TrainingReadinessWidgetProps> = ({ biometrics }) => {
  const { t } = useLanguage();
  const { niggles: storeNiggles } = useHealth();
  const { activities } = useActivities();
  const niggles = storeNiggles as ActiveNiggle[];

  // Compute readiness score (0 - 100)
  // 1. Base readiness
  let score = 85;

  // 2. Physiological Biometrics Contribution (if available)
  if (biometrics) {
    // Sleep: Target 8 hours (480 mins)
    if (biometrics.sleep_minutes && biometrics.sleep_minutes > 0) {
      const sleepHours = biometrics.sleep_minutes / 60;
      if (sleepHours >= 8) {
        score += 8;
      } else if (sleepHours >= 7) {
        score += 4;
      } else if (sleepHours < 5.5) {
        score -= 18;
      } else if (sleepHours < 6.5) {
        score -= 8;
      }
    }

    // HRV (SDNN):
    if (biometrics.hrv_sdnn && biometrics.hrv_sdnn > 0) {
      if (biometrics.hrv_sdnn >= 65) {
        score += 7;
      } else if (biometrics.hrv_sdnn >= 45) {
        score += 3;
      } else if (biometrics.hrv_sdnn < 30) {
        score -= 15;
      } else if (biometrics.hrv_sdnn < 40) {
        score -= 6;
      }
    }

    // Resting HR:
    if (biometrics.resting_hr && biometrics.resting_hr > 0) {
      if (biometrics.resting_hr < 52) {
        score += 4;
      } else if (biometrics.resting_hr > 75) {
        score -= 10;
      }
    }
  }

  // 3. Active Injury/Soreness deduction
  const nigglePenalty = niggles.reduce((acc, curr) => acc + Number(curr.severity) * 12, 0);
  score -= nigglePenalty;

  // 4. Workload Fatigue deduction (last 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentActs = activities.filter(
    (act) => new Date(act.start_date || Date.now()) >= sevenDaysAgo
  );
  if (recentActs.length >= 5) {
    score -= 12;
  } else if (recentActs.length >= 3) {
    score -= 6;
  }

  // Clamp score between 10 and 100
  score = Math.max(10, Math.min(100, Math.round(score)));

  /**
   * The four readiness bands, as a monotonic ramp.
   *
   * This gauge used to run red -> orange -> green -> cyan. Cyan sat past green
   * as the TOP band, and since "green is best" is about the strongest
   * convention in any readiness dial, a reader has no way to tell that cyan
   * outranks it without reading the legend. An ordinal scale needs an ordering
   * you can see: this one stays in one direction, deepening through green, and
   * lets the large numeral and the word ("Prime") carry the top distinction.
   *
   * Moderate also used to be BrandColors.primary. The brand orange means
   * "active / yours / now" everywhere else in the app, so spending it on a
   * middling health state weakens it in both places. It's amber now.
   */
  const READINESS_BANDS = [
    { min: 80, status: t('progress.readinessPrime', 'Prime'), color: '#059669', advice: t('progress.peakState', 'Peak state! Ideal for PR attempts') },
    { min: 60, status: t('progress.readinessHigh', 'High'), color: '#10B981', advice: t('progress.goodReadiness', 'Good readiness for structured workout efforts') },
    { min: 35, status: t('progress.readinessModerate', 'Moderate'), color: '#F5A623', advice: t('progress.moderateRecovery', 'Steady Zone 2 aerobic maintenance recommended') },
    { min: -Infinity, status: t('progress.readinessLow', 'Low'), color: '#F87171', advice: t('progress.timeToSlowDown', 'Time to slow down') },
  ] as const;

  const band = READINESS_BANDS.find((b) => score >= b.min) ?? READINESS_BANDS[READINESS_BANDS.length - 1];
  const statusText = band.status;
  const adviceText = band.advice;
  const activeColor = band.color;

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
    <View className="mb-4 bg-theme-card p-5 rounded-card border border-theme-border">
      {/* Header Row */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-x-2">
          <View className="w-2.5 h-2.5 rounded-full bg-theme-accent-strong mr-1.5" />
          <Text className="text-xs font-semibold text-theme-muted uppercase tracking-wider">
            {t('progress.trainingReadiness', 'Training Readiness')}
          </Text>
        </View>
        <Text className="text-xs font-semibold text-theme-muted">{t('progress.dailyReadinessScore', 'Daily Readiness Score')}</Text>
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

          {/* Segment 2: Moderate */}
          <Path
            d="M 64.7 53.7 A 86 86 0 0 1 112.5 34.3"
            fill="none"
            stroke="#F59E0B"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Segment 3: High */}
          <Path
            d="M 118 34.1 A 86 86 0 0 1 175.3 53.7"
            fill="none"
            stroke="#10B981"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Segment 4: Prime -- deepest green, top of the ramp */}
          <Path
            d="M 180.8 59.2 A 86 86 0 0 1 206 120"
            fill="none"
            stroke="#059669"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Pin Indicator Dot */}
          <Circle cx={dotX} cy={dotY} r="7" fill="#FFFFFF" />
          <Circle cx={dotX} cy={dotY} r="4" fill={activeColor} />
        </Svg>

        {/* Center Labels */}
        <View className="items-center mt-[-32px] mb-1">
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-5xl font-rajdhani font-bold text-theme-text tracking-tight"
          >
            {score}
          </Text>
          <Text className="text-base font-bold text-theme-text mt-1">{statusText}</Text>
          <Text className="text-xs text-theme-muted mt-0.5">{adviceText}</Text>
        </View>
      </View>
    </View>
  );
};
