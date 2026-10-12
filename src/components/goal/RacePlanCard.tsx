import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';

import { Card } from '../ui/Card';
import { useLanguage } from '../../context/LanguageContext';
import { useSeason } from '../../context/SeasonStore';
import { useUser } from '../../context/UserStore';
import { useTheme } from '@/hooks/use-theme';
import { RacePlan, Season } from '../../types/season';
import { confirmEnableAi } from '../../utils/aiConsent';

// The race plan appears in the taper (or within 3 weeks of the race) and stays once made.
const SHOW_WITHIN_DAYS = 21;

export function shouldShowRacePlan(season: Season | null, plan: RacePlan | null) {
  if (plan) return true;
  if (!season) return false;
  return season.daysToRace >= 0 && (season.daysToRace <= SHOW_WITHIN_DAYS || season.currentWeek?.phase === 'taper' || season.currentWeek?.phase === 'race');
}

export function RacePlanCard({ season, plan }: { season: Season; plan: RacePlan | null }) {
  const { t } = useLanguage();
  const theme = useTheme();
  const { user, setAiConsent } = useUser();
  const { createRacePlan } = useSeason();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>('pacing');

  const handleCreate = async () => {
    if (user?.aiConsent !== true) {
      confirmEnableAi(t, setAiConsent);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCreating(true);
    try {
      await createRacePlan();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert(t('goal.racePlanErrorTitle'), e?.message || t('goal.racePlanError'));
    } finally {
      setCreating(false);
    }
  };

  if (!plan) {
    return (
      <Card variant="accent">
        <View className="flex-row items-center gap-2">
          <Ionicons name="map-outline" size={18} color={theme.tint} />
          <Text className="text-base font-extrabold text-theme-text flex-1">{t('goal.racePlanTitle')}</Text>
        </View>
        <Text className="text-sm text-theme-muted mt-1 leading-relaxed">{t('goal.racePlanOffer', { race: season.raceName })}</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={creating}
          activeOpacity={0.8}
          accessibilityRole="button"
          className="mt-3 py-3 rounded-button bg-theme-accent-strong flex-row items-center justify-center gap-2"
        >
          {creating ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="sparkles" size={15} color="#FFFFFF" />}
          <Text className="text-sm font-bold text-white">{creating ? t('goal.racePlanCreating') : t('goal.racePlanCreate')}</Text>
        </TouchableOpacity>
      </Card>
    );
  }

  const sections: { key: string; title: string; icon: any; render: () => React.ReactNode }[] = [
    {
      key: 'pacing',
      title: t('goal.planPacing'),
      icon: 'speedometer-outline',
      render: () =>
        plan.pacing.map((p, i) => (
          <View key={i} className="py-1.5 border-b border-theme-border/40">
            <View className="flex-row justify-between gap-2">
              <Text className="text-sm font-semibold text-theme-text flex-1">{p.segment}</Text>
              <Text className="text-sm font-bold text-theme-accent">{p.target}</Text>
            </View>
            {p.note ? <Text className="text-xs text-theme-muted mt-0.5">{p.note}</Text> : null}
          </View>
        )),
    },
    {
      key: 'fueling',
      title: t('goal.planFueling'),
      icon: 'nutrition-outline',
      render: () =>
        plan.fueling.map((f, i) => (
          <View key={i} className="flex-row gap-2 py-1.5 border-b border-theme-border/40">
            <Text className="text-xs font-bold text-theme-text w-24">{f.when}</Text>
            <Text className="text-xs text-theme-muted flex-1">{f.what}</Text>
          </View>
        )),
    },
    {
      key: 'raceWeek',
      title: t('goal.planRaceWeek'),
      icon: 'calendar-outline',
      render: () =>
        plan.raceWeek.map((d, i) => (
          <View key={i} className="py-1.5">
            <Text className="text-xs font-bold text-theme-text">{d.day}</Text>
            {d.items.map((it, j) => (
              <Text key={j} className="text-xs text-theme-muted mt-0.5">
                • {it}
              </Text>
            ))}
          </View>
        )),
    },
    {
      key: 'morning',
      title: t('goal.planMorning'),
      icon: 'sunny-outline',
      render: () =>
        plan.raceMorning.map((it, i) => (
          <Text key={i} className="text-xs text-theme-muted py-0.5">
            {i + 1}. {it}
          </Text>
        )),
    },
    {
      key: 'mindset',
      title: t('goal.planMindset'),
      icon: 'heart-outline',
      render: () =>
        plan.mindset.map((it, i) => (
          <Text key={i} className="text-xs text-theme-muted py-0.5">
            • {it}
          </Text>
        )),
    },
  ];

  return (
    <Card>
      <View className="flex-row items-center gap-2 mb-1">
        <Ionicons name="map" size={18} color={theme.tint} />
        <Text className="text-base font-extrabold text-theme-text flex-1">{t('goal.racePlanTitle')}</Text>
      </View>
      <Text className="text-sm text-theme-muted leading-relaxed mb-2">{plan.summary}</Text>
      {sections.map((s) => (
        <View key={s.key} className="border-t border-theme-border/60">
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setOpen(open === s.key ? null : s.key);
            }}
            activeOpacity={0.7}
            className="flex-row items-center gap-2 py-2.5"
          >
            <Ionicons name={s.icon} size={15} color={theme.tint} />
            <Text className="text-sm font-bold text-theme-text flex-1">{s.title}</Text>
            <Ionicons name={open === s.key ? 'chevron-up' : 'chevron-down'} size={15} color={theme.textSecondary} />
          </TouchableOpacity>
          {open === s.key && <View className="pb-2">{s.render()}</View>}
        </View>
      ))}
      <TouchableOpacity onPress={handleCreate} disabled={creating} className="mt-2 self-start flex-row items-center gap-1">
        {creating ? <ActivityIndicator size="small" color={theme.tint} /> : <Ionicons name="refresh" size={13} color={theme.tint} />}
        <Text className="text-xs font-bold text-theme-accent">{t('goal.racePlanRedo')}</Text>
      </TouchableOpacity>
    </Card>
  );
}
