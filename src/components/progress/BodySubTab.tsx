import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/TextInput';
import { BottomSheetModal } from '../ui/BottomSheetModal';
import { AnatomicalBodyMap, ActiveNiggle, partMatchesNiggle } from './AnatomicalBodyMap';
import { NiggleCard } from '../health/NiggleCard';
import { SonarSleepCard } from '../health/SonarSleepCard';
import { SonarVitalsCard } from '../health/SonarVitalsCard';
import { CycleTrackingWidget } from './CycleTrackingWidget';
import { Sparkline } from '../common/Sparkline';
import { LogWeightModal } from '../dashboard/LogWeightModal';
import { ScalePressable } from '../ui/ScalePressable';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useHealth } from '../../context/HealthStore';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { useTheme } from '@/hooks/use-theme';
import { calculatePMCMetrics } from '../../utils/pmcUtils';
import {
  AppleHealthDailyBiometrics,
  getCachedTodayBiometrics,
  fetchTodayBiometricsFromServer,
  fetchRecentBiometricsFromServer,
} from '../../services/appleHealthService';

interface BodySubTabProps {
  initialNiggles?: ActiveNiggle[];
  onSaveNiggle?: (niggle: ActiveNiggle) => void;
  onResolveNiggle?: (id: number | string) => void;
}

export const BodySubTab: React.FC<BodySubTabProps> = ({
  onSaveNiggle,
  onResolveNiggle,
}) => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { user } = useUser();
  const { activities } = useActivities();
  const { physiqueLogs, logPhysique } = usePhysique();
  const { niggles: storeNiggles, saveNiggle: storeSaveNiggle, resolveNiggle: storeResolveNiggle } = useHealth();
  const niggles = storeNiggles as ActiveNiggle[];

  const [modalVisible, setModalVisible] = useState(false);
  const [logWeightModalVisible, setLogWeightModalVisible] = useState(false);
  const [todayBiometrics, setTodayBiometrics] = useState<AppleHealthDailyBiometrics | null>(null);
  const [recentBiometrics, setRecentBiometrics] = useState<AppleHealthDailyBiometrics[]>([]);

  useEffect(() => {
    let cancelled = false;
    getCachedTodayBiometrics().then((cached) => {
      if (!cancelled && cached) setTodayBiometrics(cached);
    });
    fetchTodayBiometricsFromServer().then((fresh) => {
      if (!cancelled && fresh) setTodayBiometrics(fresh);
    });
    fetchRecentBiometricsFromServer(7).then((recent) => {
      if (!cancelled && Array.isArray(recent)) setRecentBiometrics(recent);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pmcMetrics = calculatePMCMetrics(
    activities,
    user?.athlete_metrics?.weight_kg || 0,
    physiqueLogs
  );

  // Form state
  const [selectedPartId, setSelectedPartId] = useState<string>('left_ankle_foot');
  const [selectedPartName, setSelectedPartName] = useState<string>('Left Ankle & Foot');
  const [severity, setSeverity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [editingNiggleId, setEditingNiggleId] = useState<number | string | null>(null);

  const handleSelectBodyPart = (partId: string, displayName: string) => {
    setSelectedPartId(partId);
    setSelectedPartName(displayName);

    // Check if an issue already exists for this body part
    const existing = niggles.find((n) => partMatchesNiggle(partId, n.body_part));
    if (existing) {
      setEditingNiggleId(existing.id || null);
      setSeverity(Number(existing.severity));
      setNotes(existing.notes || '');
    } else {
      setEditingNiggleId(null);
      setSeverity(1);
      setNotes('');
    }

    setModalVisible(true);
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newNiggle: ActiveNiggle = {
      id: editingNiggleId || Date.now(),
      body_part: selectedPartId,
      severity,
      notes,
    };

    storeSaveNiggle(newNiggle);
    if (onSaveNiggle) onSaveNiggle(newNiggle);
    setModalVisible(false);
  };

  const handleResolve = (id: number | string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    storeResolveNiggle(id);
    if (onResolveNiggle) onResolveNiggle(id);
    if (modalVisible) setModalVisible(false);
  };

  const handleSaveWeight = async (newWeight: number) => {
    try {
      if (logPhysique) {
        await logPhysique({ weight_kg: newWeight });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLogWeightModalVisible(false);
    } catch (err) {
      console.error('Failed to log weight:', err);
    }
  };

  return (
    <View className="gap-y-4 pb-8">
      {/* 1. BODY WEIGHT & TREND CARD */}
      <Card className="p-4 bg-theme-card border border-theme-border">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent" />
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              {t('dashboard.bodyWeight', 'Body Weight')}
            </Text>
          </View>

          <ScalePressable
            onPress={() => {
              Haptics.selectionAsync();
              setLogWeightModalVisible(true);
            }}
            activeScale={0.96}
            haptic="selection"
            className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-theme-accent/10 border border-theme-accent/20"
          >
            <Ionicons name="add-circle-outline" size={14} color={theme.tint} />
            <Text className="text-xs font-extrabold text-theme-accent">{t('dashboard.logWeight', 'Log Weight')}</Text>
          </ScalePressable>
        </View>

        <View className="flex-row items-center justify-between">
          <View>
            <View className="flex-row items-baseline gap-1">
              <Text className="text-3xl font-bold font-rajdhani text-theme-text tabular-nums">
                {pmcMetrics.weightKg > 0 ? pmcMetrics.weightKg.toFixed(1) : '—'}
              </Text>
              <Text className="text-sm font-semibold text-theme-muted">kg</Text>
            </View>
            <Text className="text-[11px] text-theme-muted mt-0.5">
              {pmcMetrics.weightPoints.length > 1
                ? `${pmcMetrics.weightPoints.length} logs recorded`
                : 'Baseline body mass'}
            </Text>
          </View>

          {/* Sparkline trend with date stamps & min range padding */}
          <View className="w-36 h-10 items-end justify-center">
            {pmcMetrics.weightPoints.length > 0 ? (
              <Sparkline
                data={pmcMetrics.weightPoints}
                width={140}
                height={36}
                color={theme.tint}
                minRangePadding={1.5}
                breakGapDays={14}
              />
            ) : null}
          </View>
        </View>
      </Card>

      {/* 2. INJURY TRACKER & ANATOMICAL BODY MAP CARD (CAPPED AT 260PT) */}
      <Card className="bg-theme-card">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-x-2">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent mr-2" />
            <Text className="text-xs font-bold text-theme-muted">
              {t('dashboard.injuryHeatmap', 'Injury & Soreness Heatmap')}
            </Text>
          </View>
          <Text className="text-xs font-semibold text-theme-accent">
            {niggles.length} {t('progress.activeIssues', 'Active Issue(s)')}
          </Text>
        </View>

        {/* Anatomical Mannequin Body Map Capped at 260pt */}
        <AnatomicalBodyMap
          activeNiggles={niggles}
          onSelectBodyPart={handleSelectBodyPart}
          biometrics={todayBiometrics}
          recentBiometrics={recentBiometrics}
        />
      </Card>

      {/* 3. ACTIVE ISSUES FEED & PLAN ADAPTATIONS */}
      <NiggleCard
        niggles={niggles}
        onSelectBodyPart={handleSelectBodyPart}
        onResolveNiggle={handleResolve}
        onLogNew={() => handleSelectBodyPart('left_calf', 'Left Calf')}
      />

      {/* 4. SONAR AI SLEEP ANALYSIS CARD */}
      <SonarSleepCard biometrics={todayBiometrics} />

      {/* 5. SONAR AI VITAL TRENDS CARD (HRV, RHR, Resting) */}
      <SonarVitalsCard biometrics={todayBiometrics} recentBiometrics={recentBiometrics} />

      {/* 6. CYCLE TRACKER & COACH SYNC WIDGET */}
      <CycleTrackingWidget />

      {/* NIGGLE LOGGING MODAL / BOTTOM SHEET */}
      <BottomSheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        showHandle={true}
      >
        <View className="flex-row justify-between items-center pb-4 mb-4">
          <View>
            <Text className="text-xs font-bold text-theme-muted">
              {t('dashboard.logNiggle', 'Log Issue / Soreness')}
            </Text>
            <Text className="text-lg font-extrabold text-theme-text mt-0.5">
              {selectedPartName}
            </Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Severity Chips */}
          <Text className="text-xs font-bold text-theme-muted mb-2">
            {t('dashboard.severityRating', 'Severity Level')}
          </Text>
          <View className="flex-row justify-between mb-4">
            {[1, 2, 3, 4, 5].map((level) => (
              <TouchableOpacity
                key={level}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSeverity(level);
                }}
                className={`w-12 h-12 rounded-xl items-center justify-center ${
                  severity === level
                    ? 'bg-theme-accent'
                    : 'bg-theme-bg'
                }`}
              >
                <Text
                  className={`text-base font-extrabold ${
                    severity === level ? 'text-white' : 'text-theme-text'
                  }`}
                >
                  {level}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row justify-between text-xs text-theme-muted mb-5 px-1">
            <Text className="text-xs text-theme-muted">{t('dashboard.gentleTwinge', '1: Gentle Twinge')}</Text>
            <Text className="text-xs text-theme-muted">{t('dashboard.modifiesGait', '3: Modifies Gait')}</Text>
            <Text className="text-xs text-theme-muted">{t('dashboard.cannotBearWeight', '5: Cannot Bear Weight')}</Text>
          </View>

          {/* Notes Input */}
          <Text className="text-xs font-bold text-theme-muted mb-2">
            {t('dashboard.notesOptional', 'Context & Pain Notes')}
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t('dashboard.nigglePlaceholder', 'e.g. Sharp pain when stepping off curb...')}
            multiline
            numberOfLines={3}
            className="bg-theme-bg text-theme-text rounded-xl p-3 text-sm mb-6"
            style={{ textAlignVertical: 'top', minHeight: 80 }}
          />

          {/* Buttons */}
          <View className="gap-y-3 mb-4">
            <Button label={t('dashboard.saveIssue', 'Save Issue')} onPress={handleSave} className="bg-theme-accent mb-2" />

            {editingNiggleId ? (
              <Button
                label={t('progress.markResolved', 'Mark as Resolved')}
                onPress={() => handleResolve(editingNiggleId)}
                variant="outline"
                className="border-semantic-success text-semantic-success"
              />
            ) : null}
          </View>
        </ScrollView>
      </BottomSheetModal>

      {/* LOG WEIGHT MODAL */}
      <LogWeightModal
        visible={logWeightModalVisible}
        previousWeight={pmcMetrics.weightKg > 0 ? pmcMetrics.weightKg : 70}
        onClose={() => setLogWeightModalVisible(false)}
        onSaveWeight={handleSaveWeight}
      />
    </View>
  );
};

export default BodySubTab;
