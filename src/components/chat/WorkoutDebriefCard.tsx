import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { SportMedallion } from '../ui/SportMedallion';
import { WorkoutDebriefPayload } from '../../types/chat';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '../../utils/format';

interface WorkoutDebriefCardProps {
  debrief: WorkoutDebriefPayload;
  onPressActivity?: (activityId: number | string) => void;
}

export const WorkoutDebriefCard: React.FC<WorkoutDebriefCardProps> = ({
  debrief,
  onPressActivity,
}) => {
  const { t } = useLanguage();
  const theme = useTheme();

  const { planned, actual, key_insight, whats_next, workout_title, sport } = debrief;

  return (
    <Card className="my-2 p-4 bg-theme-card border border-theme-border/80 shadow-sm max-w-[95%]">
      {/* 1. HEADER ROW */}
      <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-theme-border/40">
        <View className="flex-row items-center gap-2.5 flex-1 mr-2">
          <SportMedallion sport={sport} size={38} />
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <View className="px-2 py-0.5 rounded-full bg-semantic-success-bg border border-semantic-success/20">
                <Text className="text-[10px] font-extrabold text-semantic-success-text">
                  {t('chatCards.debriefBadge')}
                </Text>
              </View>
            </View>
            <Text
              numberOfLines={1}
              className="text-sm font-bold text-theme-text font-jakarta mt-0.5"
            >
              {workout_title}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. PLANNED VERSUS ACTUAL COMPARISON TABLE */}
      <View className="bg-theme-bg/70 rounded-xl p-3 mb-3 border border-theme-border/40">
        <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-theme-border/30">
          <Text className="text-[11px] font-bold text-theme-muted uppercase tracking-wider">
            {t('chatCards.metric')}
          </Text>
          <View className="flex-row items-center gap-6">
            <Text className="text-[11px] font-bold text-theme-muted uppercase tracking-wider w-16 text-right">
              {t('chatCards.planned')}
            </Text>
            <Text className="text-[11px] font-bold text-theme-accent uppercase tracking-wider w-16 text-right">
              {t('chatCards.actual')}
            </Text>
          </View>
        </View>

        {/* Duration Row */}
        <View className="flex-row items-center justify-between py-1">
          <Text className="text-xs font-semibold text-theme-text">{t('chatCards.duration')}</Text>
          <View className="flex-row items-center gap-6">
            <Text className="text-xs font-bold text-theme-muted font-rajdhani w-16 text-right">
              {formatDuration(planned.duration_min)}
            </Text>
            <Text className="text-xs font-bold text-theme-text font-rajdhani w-16 text-right">
              {formatDuration(actual.duration_min)}
            </Text>
          </View>
        </View>

        {/* Distance Row (if present) */}
        {(planned.distance_km !== undefined || actual.distance_km !== undefined) && (
          <View className="flex-row items-center justify-between py-1">
            <Text className="text-xs font-semibold text-theme-text">{t('chatCards.distance')}</Text>
            <View className="flex-row items-center gap-6">
              <Text className="text-xs font-bold text-theme-muted font-rajdhani w-16 text-right">
                {planned.distance_km ? `${planned.distance_km.toFixed(1)}\u00A0km` : '—'}
              </Text>
              <Text className="text-xs font-bold text-theme-text font-rajdhani w-16 text-right">
                {actual.distance_km ? `${actual.distance_km.toFixed(1)}\u00A0km` : '—'}
              </Text>
            </View>
          </View>
        )}

        {/* Rooka Score / Load Row */}
        {(planned.rooka_points !== undefined || actual.rooka_points !== undefined) && (
          <View className="flex-row items-center justify-between py-1">
            <Text className="text-xs font-semibold text-theme-text">{t('chatCards.rookaLoad')}</Text>
            <View className="flex-row items-center gap-6">
              <Text className="text-xs font-bold text-theme-muted font-rajdhani w-16 text-right">
                {planned.rooka_points ? `${Math.round(planned.rooka_points)}\u00A0pts` : '—'}
              </Text>
              <Text className="text-xs font-bold text-theme-accent font-rajdhani w-16 text-right">
                {actual.rooka_points ? `${Math.round(actual.rooka_points)}\u00A0pts` : '—'}
              </Text>
            </View>
          </View>
        )}

        {/* Heart Rate / Pace Row */}
        {(actual.avg_hr !== undefined || actual.avg_pace !== undefined) && (
          <View className="flex-row items-center justify-between py-1">
            <Text className="text-xs font-semibold text-theme-text">{t('chatCards.intensity')}</Text>
            <View className="flex-row items-center gap-6">
              <Text className="text-xs font-bold text-theme-muted font-rajdhani w-16 text-right">
                {planned.target_intensity || t('chatCards.target')}
              </Text>
              <Text className="text-xs font-bold text-theme-text font-rajdhani w-16 text-right">
                {actual.avg_hr ? `${actual.avg_hr}\u00A0bpm` : actual.avg_pace || '—'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* 3. ONE KEY INSIGHT */}
      <View className="p-3 bg-theme-accent/10 rounded-xl border border-theme-accent/25 mb-2.5">
        <View className="flex-row items-center gap-1.5 mb-1">
          <Ionicons name="sparkles" size={13} color={theme.tint} />
          <Text className="text-[11px] font-extrabold text-theme-accent uppercase tracking-wider">
            {t('chatCards.keyInsight')}
          </Text>
        </View>
        <Text className="text-xs text-theme-text font-medium leading-relaxed">
          {key_insight}
        </Text>
      </View>

      {/* 4. WHAT'S NEXT */}
      <View className="p-3 bg-theme-inset/80 rounded-xl border border-theme-border/40">
        <View className="flex-row items-center gap-1.5 mb-1">
          <Ionicons name="arrow-forward-circle-outline" size={14} color="#0EA5E9" />
          <Text className="text-[11px] font-extrabold text-theme-text uppercase tracking-wider">
            {t('chatCards.whatsNext')}
          </Text>
        </View>
        <Text className="text-xs text-theme-muted leading-relaxed font-medium">
          {whats_next}
        </Text>
      </View>
    </Card>
  );
};

export default WorkoutDebriefCard;
