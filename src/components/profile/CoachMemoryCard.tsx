import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Card } from '../ui/Card';
import { BottomSheetModal } from '../ui/BottomSheetModal';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useTheme } from '@/hooks/use-theme';
import { factsApi } from '../../services/apiServices';
import { AthleteFact, AthleteMetric, FACT_CATEGORIES, FactCategory } from '../../types/facts';
import { getCoachDisplayName } from '../../utils/avatarUtils';

const CATEGORY_ICONS: Record<FactCategory, any> = {
  life: 'home-outline',
  schedule: 'calendar-outline',
  goal: 'flag-outline',
  preference: 'heart-outline',
  health: 'medkit-outline',
  experience: 'trophy-outline',
};

const METRIC_UNITS: Record<string, string> = {
  ftp: 'W',
  max_hr: 'bpm',
  resting_hr: 'bpm',
  threshold_hr: 'bpm',
  threshold_pace: '/km',
  css: '/100m',
};
const KNOWN_METRICS = ['ftp', 'max_hr', 'resting_hr', 'threshold_hr', 'threshold_pace', 'css', 'vo2max'];

type Editing =
  | { kind: 'fact'; fact: AthleteFact | null }
  | { kind: 'metric'; metric: AthleteMetric }
  | null;

const shortDate = (d?: string | null) =>
  d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';

/**
 * "What your coach knows about you": the facts and numbers the coach plans with,
 * visible and editable, so a wrong or outdated fact is gone in one tap.
 */
export function CoachMemoryCard() {
  const { t } = useLanguage();
  const theme = useTheme();
  const { user } = useUser();
  const [facts, setFacts] = useState<AthleteFact[]>([]);
  const [metrics, setMetrics] = useState<AthleteMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState('');
  const [draftCategory, setDraftCategory] = useState<FactCategory>('life');
  const [draftUntil, setDraftUntil] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await factsApi.list();
      setFacts(res?.facts || []);
      setMetrics(res?.metrics || []);
    } catch (e: any) {
      console.log('Facts load info:', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const coach = getCoachDisplayName(user);
  const metricLabel = (key: string) => (KNOWN_METRICS.includes(key) ? t(`coachMemory.metric_${key}`) : key);
  const metricValue = (m: AthleteMetric) => {
    const unit = METRIC_UNITS[m.key];
    return unit && /^[\d.:]+$/.test(m.value.trim()) ? `${m.value} ${unit}` : m.value;
  };
  const sourceLabel = (s?: string | null) => (s ? t(`coachMemory.source_${s}`, s) : '');

  const openFact = (fact: AthleteFact | null) => {
    Haptics.selectionAsync();
    setDraft(fact?.text || '');
    setDraftCategory(fact?.category || 'life');
    setDraftUntil(fact?.until || null);
    setEditing({ kind: 'fact', fact });
  };
  const openMetric = (metric: AthleteMetric) => {
    Haptics.selectionAsync();
    setDraft(metric.value);
    setEditing({ kind: 'metric', metric });
  };

  const save = async () => {
    if (!editing || !draft.trim()) return;
    setSaving(true);
    try {
      if (editing.kind === 'fact') {
        if (editing.fact) await factsApi.update(editing.fact.id, { text: draft.trim(), category: draftCategory, until: draftUntil });
        else await factsApi.add({ text: draft.trim(), category: draftCategory });
      } else {
        await factsApi.setMetric(editing.metric.key, draft.trim());
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(null);
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('coachMemory.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert(t('coachMemory.deleteTitle'), t('coachMemory.deleteBody', { coach }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('coachMemory.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            if (editing.kind === 'fact' && editing.fact) await factsApi.remove(editing.fact.id);
            if (editing.kind === 'metric') await factsApi.removeMetric(editing.metric.key);
            setEditing(null);
            await load();
          } catch (e: any) {
            Alert.alert(t('common.error'), e?.message || t('coachMemory.saveFailed'));
          }
        },
      },
    ]);
  };

  const grouped = FACT_CATEGORIES.map((c) => ({ category: c, items: facts.filter((f) => f.category === c) })).filter((g) => g.items.length);

  return (
    <Card className="p-4 gap-y-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-base font-bold text-theme-text">{t('coachMemory.title', { coach })}</Text>
          <Text className="text-xs text-theme-muted mt-0.5">{t('coachMemory.subtitle')}</Text>
        </View>
        <TouchableOpacity
          onPress={() => openFact(null)}
          activeOpacity={0.75}
          accessibilityRole="button"
          className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-full bg-theme-accent/10"
        >
          <Ionicons name="add" size={14} color={theme.tint} />
          <Text className="text-xs font-bold text-theme-accent">{t('coachMemory.add')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.tint} />
      ) : (
        <>
          {metrics.length > 0 && (
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {metrics.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => openMetric(m)}
                  activeOpacity={0.75}
                  className="px-2.5 py-1.5 rounded-lg bg-theme-inset"
                >
                  <Text className="text-[10px] font-semibold text-theme-muted">{metricLabel(m.key)}</Text>
                  <Text className="text-sm font-extrabold text-theme-text font-rajdhani">{metricValue(m)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {grouped.length === 0 ? (
            <Text className="text-sm text-theme-muted">{t('coachMemory.empty', { coach })}</Text>
          ) : (
            grouped.map((g) => (
              <View key={g.category}>
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Ionicons name={CATEGORY_ICONS[g.category]} size={13} color={theme.textSecondary} />
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-theme-muted">{t(`coachMemory.cat_${g.category}`)}</Text>
                </View>
                {g.items.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => openFact(f)}
                    activeOpacity={0.75}
                    className="flex-row items-start gap-2 py-2 border-b border-theme-border/40"
                  >
                    <View className="flex-1">
                      <Text className="text-sm text-theme-text">{f.text}</Text>
                      <Text className="text-[11px] text-theme-muted mt-0.5">
                        {[f.until ? t('coachMemory.until', { date: shortDate(f.until) }) : null, sourceLabel(f.source), shortDate(f.updatedAt)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <Ionicons name="create-outline" size={15} color={theme.textSecondary} style={{ marginTop: 2 }} />
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </>
      )}

      <BottomSheetModal visible={Boolean(editing)} onClose={() => setEditing(null)} showHandle>
        {editing && (
          <View className="pb-8 gap-y-3">
            <Text className="text-lg font-extrabold text-theme-text">
              {editing.kind === 'metric'
                ? metricLabel(editing.metric.key)
                : editing.fact
                ? t('coachMemory.editTitle')
                : t('coachMemory.addTitle')}
            </Text>

            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline={editing.kind === 'fact'}
              autoFocus
              placeholder={editing.kind === 'fact' ? t('coachMemory.placeholder') : ''}
              placeholderTextColor={theme.textSecondary}
              className="bg-theme-inset rounded-inset px-3 py-2.5 text-sm text-theme-text"
              style={editing.kind === 'fact' ? { minHeight: 72, textAlignVertical: 'top' } : undefined}
            />

            {editing.kind === 'fact' && (
              <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                {FACT_CATEGORIES.map((c) => {
                  const selected = draftCategory === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setDraftCategory(c)}
                      className={`flex-row items-center gap-1 px-2.5 py-1.5 rounded-full border ${selected ? 'bg-theme-accent border-theme-accent' : 'border-theme-border'}`}
                    >
                      <Ionicons name={CATEGORY_ICONS[c]} size={12} color={selected ? '#FFFFFF' : theme.textSecondary} />
                      <Text className={`text-xs font-semibold ${selected ? 'text-white' : 'text-theme-text'}`}>{t(`coachMemory.cat_${c}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {editing.kind === 'fact' && draftUntil && (
              <View className="flex-row items-center justify-between bg-theme-inset rounded-inset px-3 py-2">
                <Text className="text-xs text-theme-text">{t('coachMemory.until', { date: shortDate(draftUntil) })}</Text>
                <TouchableOpacity onPress={() => setDraftUntil(null)}>
                  <Text className="text-xs font-bold text-theme-accent">{t('coachMemory.makePermanent')}</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              onPress={save}
              disabled={saving || !draft.trim()}
              activeOpacity={0.8}
              className={`py-3 rounded-button items-center ${draft.trim() ? 'bg-theme-accent-strong' : 'bg-theme-border'}`}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-sm font-bold text-white">{t('coachMemory.save')}</Text>}
            </TouchableOpacity>

            {(editing.kind === 'metric' || editing.fact) && (
              <TouchableOpacity onPress={remove} className="py-2 items-center">
                <Text className="text-sm font-bold text-semantic-error">{t('coachMemory.delete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheetModal>
    </Card>
  );
}
