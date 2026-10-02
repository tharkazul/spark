import React, { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { ScalePressable } from '../ui/ScalePressable';
import { zonesApi, ZoneBandDto } from '../../services/apiServices';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Editor for the athlete's heart-rate and power zones.
 *
 * Every rooka score is minutes x a zone multiplier, so these boundaries are the
 * one input the whole scoring model rests on. They are seeded from 220 - age
 * (and FTP) during onboarding, and can be overridden here — per sport, because
 * heart rate in the water sits well below the same effort on the bike.
 */

const SPORTS = ['default', 'Run', 'Bike', 'Swim'] as const;
type SportKey = (typeof SPORTS)[number];

interface ZoneTableProps {
  title: string;
  unit: string;
  zones: ZoneBandDto[];
  onChange: (zones: ZoneBandDto[]) => void;
  disabled?: boolean;
}

function ZoneTable({ title, unit, zones, onChange, disabled }: ZoneTableProps) {
    const theme = useTheme();
  const setBound = (index: number, key: 'min' | 'max', raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    const next = zones.map((z, i) =>
      i === index ? { ...z, [key]: digits === '' ? (key === 'max' ? null : 0) : parseInt(digits, 10) } : z
    );
    onChange(next);
  };

  return (
    <View className="gap-1.5">
      <Text className="text-xs font-bold text-theme-muted">{title}</Text>
      {zones.map((z, i) => (
        <View
          key={z.zone}
          className="flex-row items-center justify-between bg-theme-bg border border-theme-border rounded-xl px-3 py-2"
        >
          <Text className="text-sm font-bold text-theme-text w-10">Z{z.zone}</Text>
          <View className="flex-row items-center gap-1.5">
            <TextInput
              editable={!disabled}
              value={String(z.min ?? '')}
              onChangeText={(v) => setBound(i, 'min', v)}
              keyboardType="number-pad"
              style={{ color: theme.tint }}
              className="w-14 text-sm font-bold text-center bg-theme-card border border-theme-border rounded-control py-1.5"
            />
            <Text className="text-theme-muted text-sm">–</Text>
            <TextInput
              editable={!disabled}
              value={z.max == null ? '' : String(z.max)}
              onChangeText={(v) => setBound(i, 'max', v)}
              placeholder="max"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={{ color: theme.tint }}
              className="w-14 text-sm font-bold text-center bg-theme-card border border-theme-border rounded-control py-1.5"
            />
            <Text className="text-theme-muted text-sm ml-1 w-10">{unit}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function TrainingZonesCard() {
  const theme = useTheme();
  const { t } = useLanguage();
  const [sport, setSport] = useState<SportKey>('default');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hrZones, setHrZones] = useState<ZoneBandDto[]>([]);
  const [powerZones, setPowerZones] = useState<ZoneBandDto[]>([]);
  const [maxHr, setMaxHr] = useState<number | null>(null);
  const [ftp, setFtp] = useState<number | null>(null);
  const [overriddenSports, setOverriddenSports] = useState<string[]>([]);

  const getSportLabel = (s: SportKey) => {
    if (s === 'default') return t('trainingZones.allSports');
    if (s === 'Run') return t('sports.run');
    if (s === 'Bike') return t('sports.bike');
    if (s === 'Swim') return t('sports.swim');
    return s;
  };

  const load = useCallback(async (target: SportKey) => {
    setLoading(true);
    try {
      const res = await zonesApi.get(target);
      setHrZones(res.hrZones || []);
      setPowerZones(res.powerZones || []);
      setMaxHr(res.maxHr);
      setFtp(res.ftp);
      setOverriddenSports(
        Array.from(new Set((res.tables || []).map((t) => t.sport).filter((sp) => sp !== 'default')))
      );
    } catch (err: any) {
      console.log('Zones load failed:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(sport);
  }, [sport, load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (hrZones.length) await zonesApi.save(sport, 'hr', hrZones, maxHr, ftp);
      if (powerZones.length) await zonesApi.save(sport, 'power', powerZones, maxHr, ftp);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load(sport);
      Alert.alert(
        t('trainingZones.zonesSaved'),
        sport === 'default'
          ? t('trainingZones.zonesSavedAll')
          : t('trainingZones.zonesSavedSport', { sport: getSportLabel(sport) })
      );
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not save zones', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      t('trainingZones.rebuildPrompt'),
      t('trainingZones.rebuildDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('trainingZones.rebuild'),
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const res = await zonesApi.reset(sport);
              setHrZones(res.hrZones || []);
              setPowerZones(res.powerZones || []);
            } catch (err: any) {
              Alert.alert('Could not rebuild zones', err?.message || 'Please try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleRemoveOverride = () => {
    Alert.alert(
      t('trainingZones.removeOverridePrompt', { sport: getSportLabel(sport) }),
      t('trainingZones.removeOverrideDesc', { sport: getSportLabel(sport) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('benchmarks.remove'),
          style: 'destructive',
          onPress: async () => {
            await zonesApi.remove(sport).catch(() => {});
            await load(sport);
          },
        },
      ]
    );
  };

  const hasOverride = sport !== 'default' && overriddenSports.includes(sport);

  return (
    <Card className="mb-4 bg-theme-card">
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center gap-2">
          <Ionicons name="speedometer-outline" size={18} color={theme.tint} />
          <Text className="text-base font-extrabold text-theme-text">{t('trainingZones.title')}</Text>
        </View>
        <TouchableOpacity onPress={handleReset} disabled={saving}>
          <Text className="text-xs font-bold text-theme-accent">{t('trainingZones.rebuild')}</Text>
        </TouchableOpacity>
      </View>

      <Text className="text-xs text-theme-muted mb-3 font-rajdhani">
        {t('trainingZones.desc')}
      </Text>

      {/* STRUCTURED BASELINE THRESHOLDS (Max HR & FTP) */}
      <View className="bg-theme-bg border border-theme-border rounded-xl p-3 mb-3">
        <Text className="text-[11px] font-bold text-theme-muted uppercase tracking-wider mb-2">
          Structured Thresholds
        </Text>
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Text className="text-[11px] text-theme-muted font-medium mb-1">Max HR (bpm)</Text>
            <TextInput
              value={maxHr ? String(maxHr) : ''}
              onChangeText={(val) => {
                const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
                setMaxHr(isNaN(num) ? null : num);
              }}
              placeholder="e.g. 185"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={{ color: theme.tint }}
              className="text-base font-bold font-rajdhani bg-theme-card border border-theme-border rounded-lg px-3 py-1.5"
            />
          </View>
          <View className="flex-1">
            <Text className="text-[11px] text-theme-muted font-medium mb-1">FTP (watts)</Text>
            <TextInput
              value={ftp ? String(ftp) : ''}
              onChangeText={(val) => {
                const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
                setFtp(isNaN(num) ? null : num);
              }}
              placeholder="e.g. 260"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={{ color: theme.tint }}
              className="text-base font-bold font-rajdhani bg-theme-card border border-theme-border rounded-lg px-3 py-1.5"
            />
          </View>
        </View>
      </View>

      {/* Sport selector — a sport without its own table inherits the all-sports one. */}
      <View className="flex-row gap-1.5 mb-3">
        {SPORTS.map((s) => {
          const active = s === sport;
          const custom = s !== 'default' && overriddenSports.includes(s);
          return (
            <ScalePressable
              key={s}
              onPress={() => setSport(s)}
              activeScale={0.93}
              haptic="selection"
              className="flex-1 py-2 rounded-lg items-center justify-center border"
              style={
                active
                  ? { backgroundColor: theme.tint, borderColor: theme.tint }
                  : { borderColor: 'rgba(148,163,184,0.35)' }
              }
            >
              <Text
                className="text-xs font-bold"
                style={{ color: active ? '#FFFFFF' : '#94A3B8' }}
              >
                {getSportLabel(s)}
              </Text>
              {custom && !active ? (
                <View className="w-1.5 h-1.5 rounded-full bg-theme-accent mt-1" />
              ) : null}
            </ScalePressable>
          );
        })}
      </View>

      {sport !== 'default' && !hasOverride ? (
        <View className="bg-theme-bg border border-theme-border rounded-xl px-3 py-2 mb-3">
          <Text className="text-xs text-theme-muted">
            {t('trainingZones.usesAllSports', { sport: getSportLabel(sport) })}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View className="py-8 items-center">
          <ActivityIndicator color={theme.tint} />
        </View>
      ) : hrZones.length === 0 && powerZones.length === 0 ? (
        <View className="py-6 items-center px-4">
          <Ionicons name="help-circle-outline" size={30} color={theme.textSecondary} />
          <Text className="text-theme-text font-bold text-sm mt-2 text-center">
            {t('trainingZones.noZonesYet')}
          </Text>
          <Text className="text-theme-muted text-xs mt-1 text-center font-rajdhani">
            {t('trainingZones.noZonesDesc')}
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          {hrZones.length > 0 && (
            <ZoneTable
              title={t('trainingZones.heartRate')}
              unit="bpm"
              zones={hrZones}
              onChange={setHrZones}
              disabled={saving}
            />
          )}
          {powerZones.length > 0 && (
            <ZoneTable
              title={t('trainingZones.power')}
              unit="W"
              zones={powerZones}
              onChange={setPowerZones}
              disabled={saving}
            />
          )}

          <View className="flex-row gap-2">
            <ScalePressable
              onPress={handleSave}
              disabled={saving}
              activeScale={0.96}
              haptic="selection"
              className={`flex-1 bg-theme-accent py-3 rounded-xl items-center justify-center ${
                saving ? 'opacity-50' : ''
              }`}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text className="text-white font-bold text-sm">
                  {sport === 'default' ? t('trainingZones.saveZones') : t('trainingZones.saveSportZones', { sport: getSportLabel(sport) })}
                </Text>
              )}
            </ScalePressable>

            {hasOverride && (
              <ScalePressable
                onPress={handleRemoveOverride}
                disabled={saving}
                activeScale={0.92}
                haptic="warning"
                className="px-4 py-3 rounded-xl items-center justify-center border border-theme-border"
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </ScalePressable>
            )}
          </View>
        </View>
      )}
    </Card>
  );
}
