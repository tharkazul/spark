import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/TextInput';
import { BottomSheetModal } from '../ui/BottomSheetModal';
import { AnatomicalBodyMap, ActiveNiggle, BODY_PARTS_LOOKUP } from './AnatomicalBodyMap';
import { TrainingReadinessWidget } from './TrainingReadinessWidget';
import { CycleTrackingWidget } from './CycleTrackingWidget';
import { MuscleFatigueCard } from './MuscleFatigueCard';
import { Ionicons } from '@expo/vector-icons';
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

  const getSeverityBadge = (sev: number) => {
    let bg = 'bg-amber-500/15 text-amber-500';
    let text = 'Severity 1 (Twinge)';

    if (sev >= 4) {
      bg = 'bg-red-500/15 text-red-500';
      text = `Severity ${sev} (Severe)`;
    } else if (sev >= 2) {
      bg = 'bg-theme-accent/15 text-theme-accent';
      text = `Severity ${sev} (Moderate)`;
    }

    return (
      <View className={`px-2.5 py-1 rounded-full ${bg}`}>
        <Text className="text-xs font-bold">{text}</Text>
      </View>
    );
  };

  return (
    <View className="space-y-4">
      {/* TRAINING READINESS GAUGE WIDGET */}
      <TrainingReadinessWidget />

      {/* CYCLE TRACKER & COACH SYNC WIDGET */}
      <CycleTrackingWidget />

      {/* INJURY TRACKER CARD */}
      <Card className="mb-4 bg-theme-card">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center space-x-2">
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


      {/* ACTIVE ISSUES LIST */}
      <Card className="mb-6 bg-theme-card">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xs font-bold text-theme-muted">
            Active Issues Feed
          </Text>
          <TouchableOpacity
            onPress={() => handleSelectBodyPart('left_calf', 'Left Calf')}
            className="flex-row items-center space-x-1"
          >
            <Ionicons name="add-circle-outline" size={16} color="#FF5F3B" />
            <Text className="text-xs font-bold text-theme-accent">Log New</Text>
          </TouchableOpacity>
        </View>

        {niggles.length === 0 ? (
          <View className="py-6 items-center justify-center">
            <Ionicons name="checkmark-circle-outline" size={36} color="#34C759" />
            <Text className="text-sm font-bold text-theme-text mt-2">100% Healthy</Text>
            <Text className="text-xs text-theme-muted mt-0.5">No active injuries or niggles reported.</Text>
          </View>
        ) : (
          niggles.map((item) => (
            <View
              key={item.id}
              className="bg-theme-bg/70 rounded-xl p-4 mb-3"
            >
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-row items-center space-x-2">
                  <Ionicons name="fitness" size={18} color="#E3494F" />
                  <Text className="text-sm font-extrabold text-theme-text capitalize">
                    {BODY_PARTS_LOOKUP[item.body_part] || item.body_part.replace('_', ' ')}
                  </Text>
                </View>
                {getSeverityBadge(item.severity)}
              </View>

              {item.notes ? (
                <Text className="text-xs text-theme-muted mb-3 leading-4">
                  &quot;{item.notes}&quot;
                </Text>
              ) : null}

              <View className="flex-row justify-end space-x-2 pt-2">
                <TouchableOpacity
                  onPress={() =>
                    handleSelectBodyPart(
                      item.body_part,
                      BODY_PARTS_LOOKUP[item.body_part] || item.body_part
                    )
                  }
                  className="px-3 py-1.5 bg-theme-bg rounded-lg"
                >
                  <Text className="text-xs font-bold text-theme-text">Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => item.id && handleResolve(item.id)}
                  className="px-3 py-1.5 bg-emerald-500/15 rounded-lg flex-row items-center space-x-1"
                >
                  <Ionicons name="checkmark" size={14} color="#34C759" />
                  <Text className="text-xs font-bold text-[#34C759]">Mark Resolved</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* NIGGLE LOGGING MODAL / BOTTOM SHEET */}
      <BottomSheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        showHandle={true}
        contentClassName="bg-theme-card rounded-t-3xl px-6 pt-3 pb-6 max-h-[85vh]"
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
          <View className="space-y-3 mb-4">
            <Button label="Save Issue" onPress={handleSave} className="bg-theme-accent mb-2" />

            {editingNiggleId ? (
              <Button
                label="Mark as Resolved"
                onPress={() => handleResolve(editingNiggleId)}
                variant="outline"
                className="border-emerald-500 text-emerald-500"
              />
            ) : null}
          </View>
        </ScrollView>
      </BottomSheetModal>
    </View>
  );
};
