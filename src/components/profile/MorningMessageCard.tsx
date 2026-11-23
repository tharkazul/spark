import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { track } from '../../services/analytics';
import { Card } from '../ui/Card';

/**
 * The latest time for the coach's morning message. The server sends it earlier once a
 * Garmin watch says the athlete is up (from 07:00), or when they open the app; this is
 * the "no later than" for everyone else. Quarter hours from 06:30 to 11:00, the same
 * range the server accepts (server/services/morningSchedule.js).
 */

const DEFAULT_TIME = '08:30';
const EARLIEST = 6 * 60 + 30;
const LATEST = 11 * 60;
const STEP = 15;

const toMinutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export const MorningMessageCard: React.FC = () => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { user, setMorningMessageTime } = useUser();
  const saved = user?.morningMessageTime || DEFAULT_TIME;
  const [minutes, setMinutes] = useState(() => toMinutes(saved));
  const [failed, setFailed] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the profile when it changes elsewhere (another device, a refresh).
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setMinutes(toMinutes(saved));
  }

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const change = (delta: number) => {
    const next = Math.min(LATEST, Math.max(EARLIEST, minutes + delta));
    if (next === minutes) return;
    Haptics.selectionAsync();
    setMinutes(next);
    setFailed(false);
    // Tapping through several quarter hours saves once, when the athlete stops.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setMorningMessageTime(toHM(next))
        .then(() => track('setting_changed', { setting: 'morning_time' }))
        .catch(() => {
          setFailed(true);
          setMinutes(toMinutes(saved));
        });
    }, 700);
  };

  const stepButton = (delta: number, icon: 'remove' | 'add', disabled: boolean, label: string) => (
    <TouchableOpacity
      onPress={() => change(delta)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className={`w-10 h-10 rounded-full bg-theme-card items-center justify-center ${disabled ? 'opacity-40' : ''}`}
    >
      <Ionicons name={icon} size={20} color={theme.text} />
    </TouchableOpacity>
  );

  return (
    <Card className="p-4 gap-y-3">
      <View className="flex-row items-center">
        <Ionicons name="sunny-outline" size={20} color={theme.tint} />
        <Text className="text-base font-bold text-theme-text ml-2">{t('morningMessage.title')}</Text>
      </View>
      <Text className="text-sm text-theme-muted">{t('morningMessage.body')}</Text>
      <View className="flex-row items-center justify-between bg-theme-inset rounded-inset px-3 py-2">
        <Text className="text-sm font-bold text-theme-text flex-1 mr-2">{t('morningMessage.latestLabel')}</Text>
        <View className="flex-row items-center gap-3">
          {stepButton(-STEP, 'remove', minutes <= EARLIEST, t('morningMessage.earlier'))}
          <Text
            className="font-rajdhani font-bold text-xl text-theme-text w-16 text-center"
            style={{ fontVariant: ['tabular-nums'] }}
            accessibilityLiveRegion="polite"
          >
            {toHM(minutes)}
          </Text>
          {stepButton(STEP, 'add', minutes >= LATEST, t('morningMessage.later'))}
        </View>
      </View>
      {failed ? <Text className="text-xs text-semantic-error">{t('morningMessage.saveFailed')}</Text> : null}
    </Card>
  );
};

export default MorningMessageCard;
