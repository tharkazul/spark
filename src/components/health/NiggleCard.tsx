import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '../ui/Card';
import { ScalePressable } from '../ui/ScalePressable';
import { EmptyState } from '../ui/EmptyState';
import { ActiveNiggle, BODY_PARTS_LOOKUP } from '../progress/AnatomicalBodyMap';
import { useLanguage } from '../../context/LanguageContext';

export interface NiggleCardProps {
  niggles: ActiveNiggle[];
  onSelectBodyPart: (bodyPartId: string, displayName: string) => void;
  onResolveNiggle?: (id: number | string) => void;
  onLogNew: () => void;
}

export function NiggleCard({
  niggles,
  onSelectBodyPart,
  onResolveNiggle,
  onLogNew,
}: NiggleCardProps) {
  const theme = useTheme();
  const { t } = useLanguage();

  const getPlanAdjustmentForNiggle = (bodyPart: string, severity: number): string => {
    const p = (bodyPart || '').toLowerCase();
    if (p.includes('foot') || p.includes('ankle') || p.includes('heel')) {
      return severity >= 3
        ? 'Impact running suspended. Converted running workouts to aerobic spin/swimming sessions to offload the ankle/foot joint.'
        : 'Running volume capped at Zone 2 aerobic steady pace; plyometrics and steep downhill strides removed.';
    }
    if (p.includes('calf') || p.includes('shin')) {
      return severity >= 3
        ? 'Calf eccentric load protected. Hard intervals swapped for low-impact cycling endurance.'
        : 'Hill repeats removed; strides limited to flat surfaces with extended dynamic warm-ups.';
    }
    if (p.includes('knee')) {
      return severity >= 3
        ? 'Patellofemoral relief. Heavy squats and outdoor running paused; light spinning with cadence >90 RPM.'
        : 'Run cadence bumped to 175+ spm to minimize joint braking force; plyometrics deferred.';
    }
    if (p.includes('hamstring') || p.includes('glute')) {
      return severity >= 3
        ? 'Posterior chain protection. Max-effort sprints and threshold intervals paused; recovery spin scheduled.'
        : 'Zone 4/5 track work shifted to steady Zone 2 tempo; terminal leg extension restricted.';
    }
    if (p.includes('shoulder') || p.includes('neck') || p.includes('arm')) {
      return severity >= 3
        ? 'Upper body deload. Swim pull sets converted to kickboard drills; heavy overhead pressing deferred.'
        : 'Swim main sets focused on kick technique; aero tuck posture minimized on bike rides.';
    }
    if (p.includes('back') || p.includes('core')) {
      return severity >= 3
        ? 'Lumbar protection. Aggressive aero-bar position restricted; core stabilization emphasized.'
        : 'Heavy axial loading lifts paused; running replaced with zero-impact swimming.';
    }
    return severity >= 3
      ? 'High-intensity sessions adjusted to aerobic recovery or cross-training until soreness resolves.'
      : 'Intensity capped at Zone 2 endurance to prevent acute overload.';
  };

  const getSeverityBadge = (sev: number) => {
    let bg = 'bg-semantic-warning/15 border-semantic-warning/30';
    let textColor = 'text-semantic-warning';
    let label = 'Severity 1 (Twinge)';

    if (sev >= 4) {
      bg = 'bg-semantic-error/15 border-semantic-error/30';
      textColor = 'text-semantic-error';
      label = `Severity ${sev} (Severe)`;
    } else if (sev >= 2) {
      bg = 'bg-theme-accent/15 border-theme-accent/30';
      textColor = 'text-theme-accent';
      label = `Severity ${sev} (Moderate)`;
    }

    return (
      <View className={`px-2.5 py-0.5 rounded-full border ${bg}`}>
        <Text className={`text-[11px] font-bold ${textColor}`}>{label}</Text>
      </View>
    );
  };

  const handleResolve = (id: number | string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (onResolveNiggle) onResolveNiggle(id);
  };

  return (
    <Card className="mb-6 bg-theme-card">
      {/* Header Row */}
      <View className="flex-row items-center justify-between mb-3.5">
        <View className="flex-row items-center gap-2">
          <View className="w-2.5 h-2.5 rounded-full bg-semantic-success" />
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            {t('progress.activeIssues', 'Active Issues Feed')}
          </Text>
        </View>

        {niggles.length > 0 && (
          <ScalePressable
            onPress={onLogNew}
            activeScale={0.96}
            haptic="selection"
            className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-theme-accent/10 border border-theme-accent/20"
          >
            <Ionicons name="add-circle-outline" size={14} color={theme.tint} />
            <Text className="text-xs font-extrabold text-theme-accent">{t('progress.logNew', 'Log New')}</Text>
          </ScalePressable>
        )}
      </View>

      {/* Content: Purpose-built Empty State vs Active Issues List */}
      {niggles.length === 0 ? (
        <EmptyState
          preset="healthy-niggles"
          badge="100% READINESS"
          title={t('progress.healthyReadyTitle', 'Healthy & Ready')}
          subtitle={t('progress.healthyReadySubtitle', 'No active niggles reported. Tap to log discomfort early before minor tightness becomes an injury.')}
          action={{
            label: t('progress.logDiscomfort', '+ Log Discomfort'),
            onPress: onLogNew,
            variant: 'primary',
          }}
          layout="compact"
        />
      ) : (
        <View className="gap-y-3">
          {niggles.map((item) => {
            const displayName =
              BODY_PARTS_LOOKUP[item.body_part] || item.body_part.replace('_', ' ');

            return (
              <View
                key={item.id}
                className="bg-theme-bg/80 border border-theme-border/60 rounded-tile p-3.5"
              >
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-row items-center gap-x-2 flex-1 mr-2">
                    <View className="w-7 h-7 rounded-lg bg-semantic-error/15 items-center justify-center">
                      <Ionicons name="fitness" size={15} color="#E3494F" />
                    </View>
                    <Text className="text-sm font-extrabold text-theme-text capitalize flex-1">
                      {displayName}
                    </Text>
                  </View>
                  {getSeverityBadge(item.severity)}
                </View>

                {item.notes ? (
                  <Text className="text-xs text-theme-muted mb-2.5 leading-relaxed italic bg-theme-card/60 p-2 rounded-lg border border-theme-border/30">
                    &ldquo;{item.notes}&rdquo;
                  </Text>
                ) : null}

                {/* COACH PLAN ADAPTATION */}
                <View className="bg-theme-accent/10 border border-theme-accent/20 rounded-xl p-2.5 mb-3">
                  <View className="flex-row items-center gap-1.5 mb-1">
                    <Ionicons name="sparkles" size={12} color={theme.tint} />
                    <Text className="text-[10px] font-extrabold text-theme-accent uppercase tracking-wider">
                      {t('dashboard.planAdjustment', 'Coach Plan Adjustment')}
                    </Text>
                  </View>
                  <Text className="text-xs text-theme-text font-medium leading-relaxed">
                    {getPlanAdjustmentForNiggle(item.body_part, item.severity)}
                  </Text>
                </View>

                <View className="flex-row justify-end gap-x-2 pt-1 border-t border-theme-border/40">
                  <ScalePressable
                    onPress={() => onSelectBodyPart(item.body_part, displayName)}
                    activeScale={0.96}
                    haptic="selection"
                    className="px-3 py-1.5 bg-theme-card border border-theme-border rounded-control"
                  >
                    <Text className="text-xs font-bold text-theme-text">{t('common.edit', 'Edit')}</Text>
                  </ScalePressable>

                  <ScalePressable
                    onPress={() => item.id && handleResolve(item.id)}
                    activeScale={0.96}
                    haptic="success"
                    className="px-3 py-1.5 bg-semantic-success/15 border border-semantic-success/30 rounded-control flex-row items-center gap-1"
                  >
                    <Ionicons name="checkmark-outline" size={13} color="#10B981" />
                    <Text className="text-xs font-bold text-semantic-success">
                      {t('progress.markResolved', 'Mark Resolved')}
                    </Text>
                  </ScalePressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

export default NiggleCard;
