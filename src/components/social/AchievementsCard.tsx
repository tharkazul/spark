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

/**
 * Achievements for things the athlete already did. They never ask for an extra
 * session (unlike the old quests); they only recognise what's in the log.
 */
export function AchievementsCard() {
  const { t } = useLanguage();
  const theme = useTheme();
  const { user } = useUser();
  const [items, setItems] = useState<Achievement[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      seasonApi
        .getAchievements()
        .then((res) => active && res?.achievements && setItems(res.achievements))
        .catch(() => {});
      if (user?.id) {
        AsyncStorage.getItem(seenKey(user.id))
          .then((raw) => active && setSeen(new Set(raw ? JSON.parse(raw) : [])))
          .catch(() => {});
      }
      return () => {
        active = false;
      };
    }, [user?.id])
  );

  const earned = useMemo(
    () => items.filter((a) => a.earnedAt).sort((x, y) => String(y.earnedAt).localeCompare(String(x.earnedAt))),
    [items]
  );

  const markSeen = () => {
    if (!user?.id) return;
    const ids = earned.map((a) => a.id);
    setSeen(new Set(ids));
    AsyncStorage.setItem(seenKey(user.id), JSON.stringify(ids)).catch(() => {});
  };

  if (items.length === 0) return null;

  const title = (a: Achievement) => t(`achievements.${a.id}`, { n: a.target ?? '' });
  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <View>
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

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          setOpen(true);
          markSeen();
        }}
        className="bg-theme-card/90 dark:bg-white/[0.06] border border-theme-border dark:border-white/[0.1] rounded-card p-4"
      >
        {earned.length === 0 ? (
          <Text className="text-sm text-theme-muted">{t('achievements.empty')}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {earned.slice(0, 8).map((a) => (
              <View key={a.id} className="items-center" style={{ width: 64 }}>
                <Badge a={a} isNew={!seen.has(a.id)} />
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
