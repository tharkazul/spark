import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../../context/LanguageContext';
import { translate as tr } from '../../locales/i18n';
import { usePhysique } from '../../context/PhysiqueStore';
import { usePlan } from '../../context/PlanStore';
import { NutritionProtocol } from '../../types/physique';
import { NutritionProtocolCard } from '../dashboard/NutritionProtocolCard';
import { Card } from '../ui/Card';

import { useRouter } from 'expo-router';
import { useUser } from '../../context/UserStore';

interface TimingCardItem {
  phase: string;
  detail: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  bgClass: string;
  borderClass: string;
}

function resolveFuelingItems(
  nutrition: NutritionProtocol,
  todayWorkouts: any[] = [],
  tintColor: string
): TimingCardItem[] {
  // If backend provided custom timing items, map them directly
  if (nutrition.timing && Array.isArray(nutrition.timing) && nutrition.timing.length > 0) {
    return nutrition.timing.map((item, idx) => {
      const type = (item.type || (idx === 0 ? 'morning' : idx === 1 ? 'midday' : 'evening')).toLowerCase();

      if (type === 'pre' || type === 'morning' || type === 'time') {
        return {
          phase: item.phase,
          detail: item.detail,
          iconName: 'time-outline',
          iconColor: tintColor,
          bgClass: 'bg-theme-accent/20',
          borderClass: 'border-theme-accent/30',
        };
      }
      if (type === 'intra' || type === 'midday' || type === 'hydration' || type === 'flash') {
        return {
          phase: item.phase,
          detail: item.detail,
          iconName: 'flash-outline',
          iconColor: tintColor,
          bgClass: 'bg-theme-accent/20',
          borderClass: 'border-theme-accent/30',
        };
      }
      return {
        phase: item.phase,
        detail: item.detail,
        iconName: 'fitness-outline',
        iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
        borderClass: 'border-theme-accent/30',
      };
    });
  }

  // Fallback intelligent deduction matching the user's current plan & protocol
  const combinedContext = `${nutrition.focusTitle || ''} ${nutrition.rationale || ''}`.toLowerCase();

  const isRestOrCarbLoad =
    /rest|carb-?load|race eve|pre-?race|taper|recovery day|ironman|marathon|recovery protocol/i.test(
      combinedContext
    ) ||
    (todayWorkouts.length > 0 &&
      todayWorkouts.every((w) => w.type === 'REST' || !w.type || String(w.sport).toUpperCase() === 'REST'));

  if (isRestOrCarbLoad) {
    return [
      {
        phase: tr('fuelingFallback.restMorningPhase'),
        detail:
          tr('fuelingFallback.restMorningDetail'),
        iconName: 'sunny-outline',
        iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
        borderClass: 'border-theme-accent/30',
      },
      {
        phase: tr('fuelingFallback.restMiddayPhase'),
        detail:
          tr('fuelingFallback.restMiddayDetail'),
        iconName: 'water-outline',
        iconColor: tintColor,
          bgClass: 'bg-theme-accent/20',
          borderClass: 'border-theme-accent/30',
      },
      {
        phase: tr('fuelingFallback.restEveningPhase'),
        detail:
          tr('fuelingFallback.restEveningDetail'),
        iconName: 'moon-outline',
        iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
        borderClass: 'border-theme-accent/30',
      },
    ];
  }

  const isBike =
    /bike|cycl|ride/i.test(combinedContext) ||
    todayWorkouts.some((w) => w.type === 'BIKE' || String(w.sport).toUpperCase() === 'BIKE');
  if (isBike) {
    return [
      {
        phase: tr('fuelingFallback.bikePrePhase'),
        detail: tr('fuelingFallback.bikePreDetail'),
        iconName: 'time-outline',
        iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
        borderClass: 'border-theme-accent/30',
      },
      {
        phase: tr('fuelingFallback.bikeIntraPhase'),
        detail:
          tr('fuelingFallback.bikeIntraDetail'),
        iconName: 'flash-outline',
        iconColor: tintColor,
          bgClass: 'bg-theme-accent/20',
          borderClass: 'border-theme-accent/30',
      },
      {
        phase: tr('fuelingFallback.bikePostPhase'),
        detail:
          tr('fuelingFallback.bikePostDetail'),
        iconName: 'fitness-outline',
        iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
        borderClass: 'border-theme-accent/30',
      },
    ];
  }

  const isSwim =
    /swim/i.test(combinedContext) ||
    todayWorkouts.some((w) => w.type === 'SWIM' || String(w.sport).toUpperCase() === 'SWIM');
  if (isSwim) {
    return [
      {
        phase: tr('fuelingFallback.swimPrePhase'),
        detail:
          tr('fuelingFallback.swimPreDetail'),
        iconName: 'time-outline',
        iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
        borderClass: 'border-theme-accent/30',
      },
      {
        phase: tr('fuelingFallback.swimPoolPhase'),
        detail:
          tr('fuelingFallback.swimPoolDetail'),
        iconName: 'water-outline',
        iconColor: tintColor,
          bgClass: 'bg-theme-accent/20',
          borderClass: 'border-theme-accent/30',
      },
      {
        phase: tr('fuelingFallback.swimPostPhase'),
        detail: tr('fuelingFallback.swimPostDetail'),
        iconName: 'fitness-outline',
        iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
        borderClass: 'border-theme-accent/30',
      },
    ];
  }

  const isStrength =
    /strength|gym|lift|mobility/i.test(combinedContext) ||
    todayWorkouts.some(
      (w) =>
        w.type === 'STRENGTH' ||
        w.type === 'MOBILITY' ||
        String(w.sport).toUpperCase() === 'STRENGTH' ||
        String(w.sport).toUpperCase() === 'MOBILITY'
    );
  if (isStrength) {
    return [
      {
        phase: tr('fuelingFallback.strengthPrePhase'),
        detail:
          tr('fuelingFallback.strengthPreDetail'),
        iconName: 'time-outline',
        iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
        borderClass: 'border-theme-accent/30',
      },
      {
        phase: tr('fuelingFallback.strengthIntraPhase'),
        detail: tr('fuelingFallback.strengthIntraDetail'),
        iconName: 'flash-outline',
        iconColor: tintColor,
          bgClass: 'bg-theme-accent/20',
          borderClass: 'border-theme-accent/30',
      },
      {
        phase: tr('fuelingFallback.strengthPostPhase'),
        detail:
          tr('fuelingFallback.strengthPostDetail'),
        iconName: 'fitness-outline',
        iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
        borderClass: 'border-theme-accent/30',
      },
    ];
  }

  // Default: Run / Aerobic Training Session
  return [
    {
      phase: tr('fuelingFallback.runPrePhase'),
      detail: tr('fuelingFallback.runPreDetail'),
      iconName: 'time-outline',
      iconColor: tintColor,
      bgClass: 'bg-theme-accent/20',
      borderClass: 'border-theme-accent/30',
    },
    {
      phase: tr('fuelingFallback.runIntraPhase'),
      detail: tr('fuelingFallback.runIntraDetail'),
      iconName: 'flash-outline',
      iconColor: tintColor,
          bgClass: 'bg-theme-accent/20',
          borderClass: 'border-theme-accent/30',
    },
    {
      phase: tr('fuelingFallback.runPostPhase'),
      detail: tr('fuelingFallback.runPostDetail'),
      iconName: 'fitness-outline',
      iconColor: tintColor,
        bgClass: 'bg-theme-accent/20',
      borderClass: 'border-theme-accent/30',
    },
  ];
}

const NutritionTabComponent: React.FC = () => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { nutrition } = usePhysique();
  const { plan } = usePlan();
  const { user } = useUser();
  const router = useRouter();

  if (user?.subscription_tier === 'free') {
    return (
      <View className="bg-theme-card border border-theme-border rounded-card p-6 items-center justify-center mt-4">
        <Ionicons name="lock-closed-outline" size={48} color={theme.tint} />
        <Text className="text-lg font-extrabold text-theme-text mt-4 text-center">{t('progress.nutritionLocked')}</Text>
        <Text className="text-sm text-theme-muted mt-2 text-center leading-relaxed font-rajdhani">
          {t('progress.nutritionLockedSub')}
        </Text>
        <TouchableOpacity
          onPress={() => router.navigate({ pathname: '/profile', params: { subtab: 'account' } })}
          className="bg-theme-accent-strong px-6 py-3.5 rounded-button w-full mt-6 items-center justify-center"
          activeOpacity={0.8}
        >
          <Text className="text-white font-black text-center font-rajdhani text-base">{t('account.upgradeToRookaPlus')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const todayWorkouts = React.useMemo(() => {
    const now = new Date();
    const todayDateStr = now.toISOString().split('T')[0];
    const todayDayName = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    return (plan || []).filter(
      (w: any) =>
        w.date === todayDateStr ||
        w.dateStr?.toUpperCase().includes(todayDayName) ||
        w.day?.toUpperCase() === todayDayName
    );
  }, [plan]);

  const fuelingItems = React.useMemo(() => {
    return resolveFuelingItems(nutrition, todayWorkouts, theme.tint);
  }, [nutrition, todayWorkouts, theme.tint]);

  return (
    <View className="gap-y-4">
      {/* DAILY AI NUTRITION PROTOCOL CARD */}
      <NutritionProtocolCard nutrition={nutrition} />

      {/* DYNAMIC FUELING STRATEGY & TIMING */}
      <Card className="mb-4 bg-theme-card border-theme-border">
        <Text className="text-xs font-bold text-theme-muted mb-3">
          {t('dashboard.fuelingSchedule')}
        </Text>

        <View className="gap-y-3">
          {fuelingItems.map((item, index) => (
            <View
              key={`${item.phase}-${index}`}
              className="flex-row items-center bg-theme-bg/60 border border-theme-border rounded-xl p-3 mb-2"
            >
              <View
                className={`w-10 h-10 rounded-full items-center justify-center mr-3 border ${item.bgClass} ${item.borderClass}`}
              >
                <Ionicons name={item.iconName} size={20} color={item.iconColor} />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-theme-text">{item.phase}</Text>
                <Text className="text-xs text-theme-muted mt-0.5 leading-relaxed">{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

    </View>
  );
};

export const NutritionTab = React.memo(NutritionTabComponent);
