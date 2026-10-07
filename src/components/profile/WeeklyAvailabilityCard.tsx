import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { DurationRoller } from '../ui/DurationRoller';
import { useUser } from '../../context/UserStore';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { userApi } from '../../services/apiServices';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const WeeklyAvailabilityCard: React.FC = () => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { user, updateUser, refreshUser } = useUser();

  const [availability, setAvailability] = useState<{ [day: string]: { available: boolean; maxMinutes: number } }>({
    Mon: { available: true, maxMinutes: 60 },
    Tue: { available: true, maxMinutes: 60 },
    Wed: { available: true, maxMinutes: 60 },
    Thu: { available: true, maxMinutes: 60 },
    Fri: { available: true, maxMinutes: 60 },
    Sat: { available: true, maxMinutes: 60 },
    Sun: { available: true, maxMinutes: 60 },
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const raw = (user as any)?.trainingAvailability || (user as any)?.training_availability;
    if (raw) {
      let parsed = typeof raw === 'string' ? null : raw;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch (_) {}
      }
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        const normalized: { [day: string]: { available: boolean; maxMinutes: number } } = {};
        DAYS.forEach((d) => {
          const match = parsed[d] || parsed[d.toLowerCase()] || parsed[d.toUpperCase()];
          if (match) {
            const isAvail = match.available !== false && match.status !== 'blocked';
            const mins = match.maxMinutes !== undefined ? match.maxMinutes : (match.max_minutes !== undefined ? match.max_minutes : 60);
            normalized[d] = { available: isAvail && mins > 0, maxMinutes: mins };
          } else {
            normalized[d] = { available: true, maxMinutes: 60 };
          }
        });
        setAvailability(normalized);
      }
    }
  }, [user?.id]);

  const handleDayDurationChange = (day: string, minutes: number) => {
    Haptics.selectionAsync();
    setHasChanges(true);
    setAvailability((prev) => ({
      ...prev,
      [day]: {
        available: minutes > 0,
        maxMinutes: minutes,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await userApi.updateSettings({
        training_availability: availability,
        trainingAvailability: availability,
      } as any);

      updateUser({
        training_availability: availability,
        trainingAvailability: availability,
      } as any);

      await refreshUser();
      setSaveSuccess(true);
      setHasChanges(false);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      console.error('Failed to update training availability:', err);
    } finally {
      setSaving(false);
    }
  };

  // Autosave shortly after the athlete changes a day
  useEffect(() => {
    if (!hasChanges) return;
    const timer = setTimeout(() => {
      handleSave();
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, hasChanges]);

  const [selectedDay, setSelectedDay] = useState<string>('Mon');

  const PRESET_MINUTES = [0, 30, 45, 60, 90, 120];

  return (
    <Card className="p-4 mb-4">
      <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-theme-border/30">
        <View className="flex-row items-center gap-x-2">
          <Ionicons name="calendar-outline" size={18} color={theme.tint} />
          <Text className="text-sm font-bold text-theme-text font-rajdhani">
            {t('availability.title', 'Weekly Training Availability')}
          </Text>
        </View>
        {saving ? (
          <ActivityIndicator size="small" color={theme.tint} />
        ) : saveSuccess ? (
          <View className="flex-row items-center gap-x-1">
            <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
            <Text className="text-[11px] font-bold text-semantic-success">
              {t('availability.availabilitySaved', 'Saved')}
            </Text>
          </View>
        ) : null}
      </View>

      <Text className="text-xs text-theme-muted mb-3">
        {t('availability.desc', 'Tap a day to set how many minutes you have available for training.')}
      </Text>

      {/* 7-COLUMN DAY STRIP */}
      <View className="flex-row justify-between gap-1 mb-3">
        {DAYS.map((day) => {
          const currentVal = availability[day]?.maxMinutes || 0;
          const isRest = currentVal === 0;
          const isSelected = selectedDay === day;
          const dayKey = `days.${day.toLowerCase()}Short` as any;
          const dayLabel = (t(dayKey) || day).slice(0, 3);

          return (
            <TouchableOpacity
              key={day}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedDay(day);
              }}
              activeOpacity={0.75}
              className={`flex-1 items-center py-2.5 px-1 rounded-xl border ${
                isSelected
                  ? 'bg-theme-accent/15 border-theme-accent'
                  : isRest
                  ? 'bg-theme-bg border-theme-border/40 opacity-70'
                  : 'bg-theme-bg border-theme-border/70'
              }`}
            >
              <Text
                className={`text-[11px] font-bold uppercase mb-1 ${
                  isSelected ? 'text-theme-accent' : 'text-theme-muted'
                }`}
              >
                {dayLabel}
              </Text>
              <View
                className={`px-1.5 py-0.5 rounded-md ${
                  isRest
                    ? 'bg-slate-500/10'
                    : isSelected
                    ? 'bg-theme-accent/25'
                    : 'bg-theme-inset'
                }`}
              >
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className={`text-[11px] font-bold font-rajdhani ${
                    isRest
                      ? 'text-theme-muted'
                      : isSelected
                      ? 'text-theme-accent'
                      : 'text-theme-text'
                  }`}
                >
                  {isRest ? t('zonesExtra.rest') : `${currentVal}m`}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ACTIVE DAY DURATION SELECTOR */}
      <View className="bg-theme-bg p-3 rounded-xl border border-theme-border/60">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs font-bold text-theme-text font-jakarta">
            {selectedDay} {t('availability.daySettings', 'Target Window')}
          </Text>
          <Text className="text-xs font-bold text-theme-accent font-rajdhani">
            {availability[selectedDay]?.maxMinutes === 0
              ? t('onboarding.restDay', 'Rest Day')
              : `${availability[selectedDay]?.maxMinutes} min`}
          </Text>
        </View>

        {/* Quick Presets */}
        <View className="flex-row flex-wrap gap-1.5">
          {PRESET_MINUTES.map((mins) => {
            const isActive = (availability[selectedDay]?.maxMinutes || 0) === mins;
            return (
              <TouchableOpacity
                key={`preset-${mins}`}
                onPress={() => handleDayDurationChange(selectedDay, mins)}
                activeOpacity={0.7}
                className={`px-3 py-1.5 rounded-lg border ${
                  isActive
                    ? 'bg-theme-accent border-theme-accent'
                    : 'bg-theme-card border-theme-border'
                }`}
              >
                <Text
                  className={`text-xs font-bold font-rajdhani ${
                    isActive ? 'text-white' : 'text-theme-text'
                  }`}
                >
                  {mins === 0 ? t('zonesExtra.rest') : `${mins}m`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

    </Card>
  );
};
