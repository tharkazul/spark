import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { BottomSheetModal } from '../ui/BottomSheetModal';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useTheme } from '@/hooks/use-theme';
import { seasonApi } from '../../services/apiServices';
import { Achievement } from '../../types/season';

const ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  flag: 'flag-checkered',
  run: 'run',
  medal: 'medal',
  bike: 'bike',
  swim: 'swim',
  swap: 'swap-horizontal',
  counter: 'counter',
  calendar: 'calendar-check',
};
const GROUP_COLORS: Record<Achievement['group'], string> = {
  milestones: '#F59E0B',
  run: '#F97316',
  ride: '#22C55E',
  swim: '#0EA5E9',
};

const seenKey = (userId: number | string) => `@rooka_achievements_seen_${userId}`;

function Badge({ a, size = 52, isNew = false }: { a: Achievement; size?: number; isNew?: boolean }) {
  const theme = useTheme();
  const earned = Boolean(a.earnedAt);
  const color = GROUP_COLORS[a.group];
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: earned ? `${color}22` : theme.background,
          borderWidth: 2,
          borderColor: earned ? color : `${theme.textSecondary}33`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name={ICONS[a.icon] || 'star'} size={size * 0.46} color={earned ? color : `${theme.textSecondary}66`} />
      </View>
      {isNew && <View className="absolute top-0 right-0 w-3 h-3 rounded-full bg-red-500 border-2 border-theme-card" />}
    </View>
  );
}

const RUN_TYPES = new Set(['run', 'virtualrun', 'trailrun', 'treadmill']);
const RIDE_TYPES = new Set(['ride', 'virtualride', 'bike', 'ebikeride', 'gravelride', 'mountainbikeride', 'cycling']);
const SWIM_TYPES = new Set(['swim', 'openwaterswim', 'poolswim']);
const sportKey = (t?: string) => String(t || '').toLowerCase().replace(/\s+/g, '');
const isRun = (a: any) => RUN_TYPES.has(sportKey(a.sport_type));
const isRide = (a: any) => RIDE_TYPES.has(sportKey(a.sport_type));
const isSwim = (a: any) => SWIM_TYPES.has(sportKey(a.sport_type));
const dayOf = (a: any) => String(a.start_date || '').slice(0, 10);

function weekKey(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

function findBrick(acts: any[]): string | null {
  const sorted = acts
    .filter((a) => isRun(a) || isRide(a))
    .sort((x, y) => String(x.start_date).localeCompare(String(y.start_date)));
  for (let i = 0; i < sorted.length - 1; i++) {
    const ride = sorted[i];
    if (!isRide(ride)) continue;
    const rideEnd = new Date(ride.start_date).getTime() + (ride.moving_time_min || 0) * 60000;
    for (let j = i + 1; j < sorted.length; j++) {
      const run = sorted[j];
      if (dayOf(run) !== dayOf(ride)) break;
      if (!isRun(run)) continue;
      const gap = (new Date(run.start_date).getTime() - rideEnd) / 60000;
      if (gap >= -5 && gap <= 30) return dayOf(run);
    }
  }
  return null;
}

function computeAchievementsFromActivities(
  rawActivities: any[] = [],
  rookaStartDate?: string | null
): Achievement[] {
  const startCutoff = rookaStartDate ? String(rookaStartDate).slice(0, 10) : '2026-01-01';
  const effectiveCutoff = startCutoff > '2026-01-01' ? startCutoff : '2026-01-01';

  const acts = [...rawActivities]
    .filter(
      (a) =>
        a &&
        !a.is_hidden &&
        a.start_date &&
        Number(a.rooka_score ?? a.spark_score ?? 0) > 0 &&
        dayOf(a) >= effectiveCutoff
    )
    .sort((x, y) => String(x.start_date).localeCompare(String(y.start_date)));

  const catalogue: { id: string; group: Achievement['group']; icon: string; test: (a: any) => boolean }[] = [
    { id: 'first_session', group: 'milestones', icon: 'flag', test: () => true },
    { id: 'run_5k', group: 'run', icon: 'run', test: (a) => isRun(a) && (a.distance_km || 0) >= 5 },
    { id: 'run_10k', group: 'run', icon: 'run', test: (a) => isRun(a) && (a.distance_km || 0) >= 10 },
    { id: 'run_half', group: 'run', icon: 'run', test: (a) => isRun(a) && (a.distance_km || 0) >= 21.0975 },
    { id: 'run_30k', group: 'run', icon: 'run', test: (a) => isRun(a) && (a.distance_km || 0) >= 30 },
    { id: 'run_marathon', group: 'run', icon: 'medal', test: (a) => isRun(a) && (a.distance_km || 0) >= 42.195 },
    { id: 'ride_50k', group: 'ride', icon: 'bike', test: (a) => isRide(a) && (a.distance_km || 0) >= 50 },
    { id: 'ride_100k', group: 'ride', icon: 'bike', test: (a) => isRide(a) && (a.distance_km || 0) >= 100 },
    { id: 'ride_3h', group: 'ride', icon: 'bike', test: (a) => isRide(a) && (a.moving_time_min || 0) >= 180 },
    { id: 'swim_1500', group: 'swim', icon: 'swim', test: (a) => isSwim(a) && (a.distance_km || 0) >= 1.5 },
    { id: 'swim_3800', group: 'swim', icon: 'swim', test: (a) => isSwim(a) && (a.distance_km || 0) >= 3.8 },
  ];

  const out: Achievement[] = [];
  for (const item of catalogue) {
    const first = acts.find(item.test);
    out.push({ id: item.id, group: item.group, icon: item.icon, earnedAt: first ? dayOf(first) : null });
  }

  out.push({ id: 'first_brick', group: 'milestones', icon: 'swap', earnedAt: findBrick(acts) });

  for (const n of [10, 50, 100, 250]) {
    out.push({
      id: `sessions_${n}`,
      group: 'milestones',
      icon: 'counter',
      earnedAt: acts.length >= n ? dayOf(acts[n - 1]) : null,
      target: n,
      progress: Math.min(acts.length, n),
    });
  }

  const perWeek = new Map<string, number>();
  for (const a of acts) {
    const k = weekKey(dayOf(a));
    perWeek.set(k, (perWeek.get(k) || 0) + 1);
  }
  const weeks = [...perWeek.keys()].sort();
  let streak = 0;
  let best = 0;
  let prev: string | null = null;
  const earnedWeeks: Record<number, string> = {};
  for (const k of weeks) {
    const consecutive =
      prev && (new Date(k + 'T12:00:00Z').getTime() - new Date(prev + 'T12:00:00Z').getTime()) / 86400000 === 7;
    if ((perWeek.get(k) || 0) >= 3) {
      streak = consecutive && streak > 0 ? streak + 1 : 1;
      best = Math.max(best, streak);
      for (const n of [4, 12, 26]) if (streak >= n && !earnedWeeks[n]) earnedWeeks[n] = k;
    } else {
      streak = 0;
    }
    prev = k;
  }
  for (const n of [4, 12, 26]) {
    out.push({
      id: `consistency_${n}w`,
      group: 'milestones',
      icon: 'calendar',
      earnedAt: earnedWeeks[n] ? weekKey(earnedWeeks[n]) : null,
      target: n,
      progress: Math.min(best, n),
    });
  }

  return out;
}

export interface AchievementsCardProps {
  variant?: 'default' | 'profile';
  userId?: number | string;
  initialAchievements?: Achievement[];
  activities?: any[];
  rookaStartDate?: string | null;
}

/**
 * Achievements for things the athlete already did. They never ask for an extra
 * session (unlike the old quests); they only recognise what's in the log.
 */
export function AchievementsCard({
  variant = 'default',
  userId,
  initialAchievements,
  activities,
  rookaStartDate,
}: AchievementsCardProps = {}) {
  const { t } = useLanguage();
  const theme = useTheme();
  const { user } = useUser();
  const isSelf = !userId || (user?.id !== undefined && String(userId) === String(user.id));

  const effectiveStartDate = rookaStartDate ?? (isSelf ? (user as any)?.rooka_start_date : null);
  const minValidDate =
    effectiveStartDate && String(effectiveStartDate).slice(0, 10) > '2026-01-01'
      ? String(effectiveStartDate).slice(0, 10)
      : '2026-01-01';

  const sanitizeServerAchievements = useCallback(
    (list?: Achievement[]) => {
      if (!list || list.length === 0) return [];
      const hasPreRookaDates = list.some((a) => a.earnedAt && String(a.earnedAt).slice(0, 10) < minValidDate);
      if (hasPreRookaDates && activities) {
        return computeAchievementsFromActivities(activities, effectiveStartDate);
      }
      return list.map((a) =>
        a.earnedAt && String(a.earnedAt).slice(0, 10) < minValidDate ? { ...a, earnedAt: null } : a
      );
    },
    [activities, effectiveStartDate, minValidDate]
  );

  const fallbackItems = useMemo(() => {
    if (initialAchievements && initialAchievements.length > 0) {
      return sanitizeServerAchievements(initialAchievements);
    }
    if (activities) return computeAchievementsFromActivities(activities, effectiveStartDate);
    return [];
  }, [initialAchievements, activities, effectiveStartDate, sanitizeServerAchievements]);

  const [fetchedItems, setFetchedItems] = useState<Achievement[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (isSelf && (!initialAchievements || initialAchievements.length === 0)) {
        seasonApi
          .getAchievements()
          .then((res) => active && res?.achievements && setFetchedItems(res.achievements))
          .catch(() => {});
      }
      if (isSelf && user?.id) {
        AsyncStorage.getItem(seenKey(user.id))
          .then((raw) => active && setSeen(new Set(raw ? JSON.parse(raw) : [])))
          .catch(() => {});
      }
      return () => {
        active = false;
      };
    }, [isSelf, initialAchievements, user?.id])
  );

  const items = useMemo(
    () => (fetchedItems.length > 0 ? sanitizeServerAchievements(fetchedItems) : fallbackItems),
    [fetchedItems, fallbackItems, sanitizeServerAchievements]
  );

  const earned = useMemo(
    () => items.filter((a) => a.earnedAt).sort((x, y) => String(y.earnedAt).localeCompare(String(x.earnedAt))),
    [items]
  );

  const markSeen = () => {
    if (!isSelf || !user?.id) return;
    const ids = earned.map((a) => a.id);
    setSeen(new Set(ids));
    AsyncStorage.setItem(seenKey(user.id), JSON.stringify(ids)).catch(() => {});
  };

  if (items.length === 0) return null;

  const title = (a: Achievement) => t(`achievements.${a.id}`, { n: a.target ?? '' });
  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <View>
      {variant === 'profile' ? (
        <View className="flex-row justify-between items-center mb-2.5 ml-1">
          <Text className="text-theme-muted font-bold text-xs uppercase tracking-wider">
            {t('achievements.title')}
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setOpen(true);
              markSeen();
            }}
            className="flex-row items-center gap-1 mr-1"
          >
            <Text className="text-xs font-semibold text-theme-accent">
              {t('achievements.count', { earned: earned.length, total: items.length })}
            </Text>
            <Ionicons name="chevron-forward" size={13} color={theme.tint} />
          </TouchableOpacity>
        </View>
      ) : (
        <View className="flex-row justify-between items-center mb-3 px-0.5">
          <Text className="text-lg font-extrabold text-theme-text tracking-tight">{t('achievements.title')}</Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setOpen(true);
              markSeen();
            }}
            className="flex-row items-center gap-1"
          >
            <Text className="text-xs font-semibold text-theme-accent">{t('achievements.count', { earned: earned.length, total: items.length })}</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.tint} />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          setOpen(true);
          markSeen();
        }}
        className={variant === 'profile'
          ? "bg-theme-card border border-theme-border rounded-card p-4 mb-2 shadow-xs"
          : "bg-theme-card/90 dark:bg-white/[0.06] border border-theme-border dark:border-white/[0.1] rounded-card p-4"
        }
      >
        {earned.length === 0 ? (
          <Text className="text-sm text-theme-muted">{t('achievements.empty')}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {earned.slice(0, 8).map((a) => (
              <View key={a.id} className="items-center" style={{ width: 64 }}>
                <Badge a={a} isNew={isSelf && !seen.has(a.id)} />
                <Text className="text-[10px] font-semibold text-theme-text text-center mt-1.5" numberOfLines={2}>
                  {title(a)}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </TouchableOpacity>

      <BottomSheetModal visible={open} onClose={() => setOpen(false)} showHandle>
        <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <Text className="text-lg font-extrabold text-theme-text mb-1">{t('achievements.title')}</Text>
          <Text className="text-xs text-theme-muted mb-4">{t('achievements.subtitle')}</Text>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            {items.map((a) => (
              <View key={a.id} className="items-center" style={{ width: '30%' }}>
                <Badge a={a} size={56} />
                <Text className={`text-[11px] font-bold text-center mt-1.5 ${a.earnedAt ? 'text-theme-text' : 'text-theme-muted'}`} numberOfLines={2}>
                  {title(a)}
                </Text>
                <Text className="text-[10px] text-theme-muted text-center">
                  {a.earnedAt
                    ? formatDate(a.earnedAt)
                    : a.target && a.progress !== undefined
                    ? `${a.progress}/${a.target}`
                    : t('achievements.locked')}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
}
