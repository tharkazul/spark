import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/TextInput';
import { BottomSheetModal, BottomSheetHeader } from '../ui/BottomSheetModal';
import { AnatomicalBodyMap, ActiveNiggle, partMatchesNiggle, getBodyPartLabel } from './AnatomicalBodyMap';
import { useLanguage } from '../../context/LanguageContext';
import { NiggleCard } from '../health/NiggleCard';
import { TrainingReadinessWidget } from './TrainingReadinessWidget';
import { SonarSleepCard } from '../health/SonarSleepCard';
import { SonarVitalsCard } from '../health/SonarVitalsCard';
import { AppleHealthStatusCard } from '../health/AppleHealthStatusCard';
import { CycleTrackingWidget } from './CycleTrackingWidget';
import * as Haptics from 'expo-haptics';

import { useHealth } from '../../context/HealthStore';
import {
  AppleHealthDailyBiometrics,
  getCachedTodayBiometrics,
  fetchTodayBiometricsFromServer,
  fetchRecentBiometricsFromServer,
} from '../../services/appleHealthService';

interface HealthTabProps {
  initialNiggles?: ActiveNiggle[];
  onSaveNiggle?: (niggle: ActiveNiggle) => void;
  onResolveNiggle?: (id: number | string) => void;
}

export const HealthTab: React.FC<HealthTabProps> = ({
  onSaveNiggle,
  onResolveNiggle,
}) => {
  const { niggles: storeNiggles, saveNiggle: storeSaveNiggle, resolveNiggle: storeResolveNiggle } = useHealth();
  const niggles = storeNiggles as ActiveNiggle[];
  const { t } = useLanguage();
  const [modalVisible, setModalVisible] = useState(false);
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

  // Form state
  const [selectedPartId, setSelectedPartId] = useState<string>('left_ankle_foot');
  const [selectedPartName, setSelectedPartName] = useState<string>(() => getBodyPartLabel('left_ankle_foot'));
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

  return (
    <View className="gap-y-4">
      {/* TRAINING READINESS GAUGE WIDGET */}
      <TrainingReadinessWidget biometrics={todayBiometrics} />

      {/* APPLE HEALTH CONNECTION & SYNC CARD */}
      <AppleHealthStatusCard
        biometrics={todayBiometrics}
        onSyncCompleted={(fresh) => setTodayBiometrics(fresh)}
      />

      {/* SONAR AI SLEEP ANALYSIS CARD (Appears when sleep data exists) */}
      <SonarSleepCard biometrics={todayBiometrics} />

      {/* SONAR AI VITAL TRENDS CARD (Appears when HRV/RHR/Steps/etc. exist) */}
      <SonarVitalsCard biometrics={todayBiometrics} recentBiometrics={recentBiometrics} />

      {/* CYCLE TRACKER & COACH SYNC WIDGET */}
      <CycleTrackingWidget />

      {/* INJURY TRACKER CARD */}
      <Card className="mb-4 bg-theme-card">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-x-2">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent mr-2" />
            <Text className="text-xs font-bold text-theme-muted">
              {t('healthTab.heatmapTitle')}
            </Text>
          </View>
          <Text className="text-xs font-semibold text-theme-accent">
            {niggles.length === 1 ? t('healthTab.oneActiveIssue') : t('healthTab.nActiveIssues', { count: niggles.length })}
          </Text>
        </View>

        {/* Anatomical Mannequin Body Map */}
        <AnatomicalBodyMap
          activeNiggles={niggles}
          onSelectBodyPart={handleSelectBodyPart}
          biometrics={todayBiometrics}
          recentBiometrics={recentBiometrics}
        />
      </Card>

      {/* ACTIVE ISSUES FEED & HEALTHY EMPTY STATE */}
      <NiggleCard
        niggles={niggles}
        onSelectBodyPart={handleSelectBodyPart}
        onResolveNiggle={handleResolve}
        onLogNew={() => handleSelectBodyPart('left_calf', getBodyPartLabel('left_calf'))}
      />

      {/* NIGGLE LOGGING MODAL / BOTTOM SHEET */}
      <BottomSheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        showHandle={true}
        header={
          <View className="flex-row justify-between items-center pb-4 mb-4">
            <View>
              <Text className="text-xs font-bold text-theme-muted">
                {t('healthTab.logIssue')}
              </Text>
              <Text className="text-lg font-extrabold text-theme-text mt-0.5">
                {selectedPartName}
              </Text>
            </View>
          </View>
        }
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Severity Chips */}
          <Text className="text-xs font-bold text-theme-muted mb-2">
            {t('healthTab.severityLevel')}
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
            <Text className="text-xs text-theme-muted">{t('healthTab.sev1')}</Text>
            <Text className="text-xs text-theme-muted">{t('healthTab.sev3')}</Text>
            <Text className="text-xs text-theme-muted">{t('healthTab.sev5')}</Text>
          </View>

          {/* Notes Input */}
          <Text className="text-xs font-bold text-theme-muted mb-2">
            {t('healthTab.notesLabel')}
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t('healthTab.notesPlaceholder')}
            multiline
            numberOfLines={3}
            className="bg-theme-bg text-theme-text rounded-xl p-3 text-sm mb-6"
            style={{ textAlignVertical: 'top', minHeight: 80 }}
          />

          {/* Buttons */}
          <View className="gap-y-3 mb-4">
            <Button label={t('healthTab.saveIssue')} onPress={handleSave} className="bg-theme-accent mb-2" />

            {editingNiggleId ? (
              <Button
                label={t('healthTab.markResolved')}
                onPress={() => handleResolve(editingNiggleId)}
                variant="outline"
                className="border-semantic-success text-semantic-success"
              />
            ) : null}
          </View>
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
};
