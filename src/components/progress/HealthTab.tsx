import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/TextInput';
import { BottomSheetModal } from '../ui/BottomSheetModal';
import { AnatomicalBodyMap, ActiveNiggle } from './AnatomicalBodyMap';
import { NiggleCard } from '../health/NiggleCard';
import { TrainingReadinessWidget } from './TrainingReadinessWidget';
import { CycleTrackingWidget } from './CycleTrackingWidget';
import { MuscleFatigueCard } from './MuscleFatigueCard';
import * as Haptics from 'expo-haptics';

import { useHealth } from '../../context/HealthStore';

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
  const [modalVisible, setModalVisible] = useState(false);

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
    const existing = niggles.find((n) => n.body_part.toLowerCase() === partId.toLowerCase());
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
      <TrainingReadinessWidget />

      {/* CYCLE TRACKER & COACH SYNC WIDGET */}
      <CycleTrackingWidget />

      {/* INJURY TRACKER CARD */}
      <Card className="mb-4 bg-theme-card">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-x-2">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent mr-2" />
            <Text className="text-xs font-bold text-theme-muted">
              Injury & Soreness Heatmap
            </Text>
          </View>
          <Text className="text-xs font-semibold text-theme-accent">
            {niggles.length} Active {niggles.length === 1 ? 'Issue' : 'Issues'}
          </Text>
        </View>

        {/* Anatomical Mannequin Body Map */}
        <AnatomicalBodyMap activeNiggles={niggles} onSelectBodyPart={handleSelectBodyPart} />
      </Card>

      {/* MUSCLE FATIGUE SCORES BREAKDOWN CARD */}
      <MuscleFatigueCard />


      {/* ACTIVE ISSUES FEED & HEALTHY EMPTY STATE */}
      <NiggleCard
        niggles={niggles}
        onSelectBodyPart={handleSelectBodyPart}
        onResolveNiggle={handleResolve}
        onLogNew={() => handleSelectBodyPart('left_calf', 'Left Calf')}
      />

      {/* NIGGLE LOGGING MODAL / BOTTOM SHEET */}
      <BottomSheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        showHandle={true}
      >
        <View className="flex-row justify-between items-center pb-4 mb-4">
          <View>
            <Text className="text-xs font-bold text-theme-muted">
              Log Issue / Soreness
            </Text>
            <Text className="text-lg font-extrabold text-theme-text mt-0.5">
              {selectedPartName}
            </Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Severity Chips */}
          <Text className="text-xs font-bold text-theme-muted mb-2">
            Severity Level
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
            <Text className="text-xs text-theme-muted">1: Gentle Twinge</Text>
            <Text className="text-xs text-theme-muted">3: Modifies Gait</Text>
            <Text className="text-xs text-theme-muted">5: Cannot Bear Weight</Text>
          </View>

          {/* Notes Input */}
          <Text className="text-xs font-bold text-theme-muted mb-2">
            Context & Pain Notes
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Sharp pain when stepping off curb..."
            multiline
            numberOfLines={3}
            className="bg-theme-bg text-theme-text rounded-xl p-3 text-sm mb-6"
            style={{ textAlignVertical: 'top', minHeight: 80 }}
          />

          {/* Buttons */}
          <View className="gap-y-3 mb-4">
            <Button label="Save Issue" onPress={handleSave} className="bg-theme-accent mb-2" />

            {editingNiggleId ? (
              <Button
                label="Mark as Resolved"
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
