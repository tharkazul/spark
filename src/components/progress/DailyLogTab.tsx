import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/TextInput';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { usePhysique } from '../../context/PhysiqueStore';

export interface DailyLogEntry {
  id?: number | string;
  date: string;
  weight_kg: string | number;
  sleep_quality: number; // 1-5
  fatigue_level: number; // 1-5
  notes?: string;
  photo_uri?: string;
}

interface DailyLogTabProps {
  initialHistory?: DailyLogEntry[];
  onSaveLog?: (entry: DailyLogEntry) => void;
  onDeleteLog?: (id: number | string) => void;
}

export const DailyLogTab: React.FC<DailyLogTabProps> = ({
  onSaveLog,
  onDeleteLog,
}) => {
  const { physiqueLogs, logPhysique } = usePhysique();
  const todayStr = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState<string>(todayStr);
  const [weightKg, setWeightKg] = useState<string>('75.5');
  const [sleepQuality, setSleepQuality] = useState<number>(3);
  const [fatigueLevel, setFatigueLevel] = useState<number>(2);
  const [notes, setNotes] = useState<string>('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const history: DailyLogEntry[] = physiqueLogs.map((log) => ({
    id: log.id,
    date: log.date,
    weight_kg: log.weight_kg,
    sleep_quality: log.sleep_quality || 3,
    fatigue_level: log.fatigue_level || 2,
    notes: log.notes,
  }));

  const handleAdjustWeight = (delta: number) => {
    Haptics.selectionAsync();
    const current = parseFloat(weightKg) || 75.0;
    const updated = Math.max(30, Math.min(200, current + delta));
    setWeightKg(updated.toFixed(1));
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newEntry: DailyLogEntry = {
      id: Date.now(),
      date,
      weight_kg: weightKg,
      sleep_quality: sleepQuality,
      fatigue_level: fatigueLevel,
      notes,
      photo_uri: photoUri || undefined,
    };

    logPhysique({
      weight_kg: parseFloat(weightKg) || 75.0,
      sleep_quality: sleepQuality,
      fatigue_level: fatigueLevel,
      notes,
    });
    if (onSaveLog) onSaveLog(newEntry);

    // Reset form notes
    setNotes('');
  };

  const handleDelete = (id: number | string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onDeleteLog) onDeleteLog(id);
  };

  return (
    <View className="space-y-4">
      {/* DAILY LOG INPUT FORM */}
      <Card className="mb-4 bg-theme-card">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            Daily Biometrics Log
          </Text>
          <View className="px-3 py-1 bg-theme-bg rounded-lg">
            <Text className="text-xs font-bold text-theme-accent">{date}</Text>
          </View>
        </View>

        {/* WEIGHT INPUT WITH STEPPERS */}
        <View className="mb-4">
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-2">
            Weight (KG)
          </Text>
          <View className="flex-row items-center space-x-3">
            <TouchableOpacity
              onPress={() => handleAdjustWeight(-0.5)}
              className="w-12 h-12 bg-theme-bg rounded-xl items-center justify-center"
            >
              <Ionicons name="remove" size={20} color="#FF5A1F" />
            </TouchableOpacity>

            <View className="flex-1 bg-theme-bg rounded-xl px-4 py-2.5 items-center justify-center">
              <TextInput
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="decimal-pad"
                className="text-lg font-black text-theme-text text-center w-full"
                placeholder="e.g. 75.5"
              />
            </View>

            <TouchableOpacity
              onPress={() => handleAdjustWeight(0.5)}
              className="w-12 h-12 bg-theme-bg rounded-xl items-center justify-center"
            >
              <Ionicons name="add" size={20} color="#FF5A1F" />
            </TouchableOpacity>
          </View>
        </View>

        {/* SLEEP QUALITY (1-5) */}
        <View className="mb-4">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              Sleep Quality
            </Text>
            <Text className="text-xs font-bold text-theme-accent">{sleepQuality} / 5 Stars</Text>
          </View>

          <View className="flex-row justify-between">
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSleepQuality(star);
                }}
                className={`flex-1 mx-1 py-2.5 rounded-xl items-center justify-center ${
                  sleepQuality >= star
                    ? 'bg-amber-500/15'
                    : 'bg-theme-bg'
                }`}
              >
                <Ionicons
                  name={sleepQuality >= star ? 'star' : 'star-outline'}
                  size={18}
                  color={sleepQuality >= star ? '#F9CF45' : '#5A6973'}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* FATIGUE LEVEL (1-5) */}
        <View className="mb-4">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              Fatigue Rating
            </Text>
            <Text className="text-xs font-bold text-[#E3494F]">Level {fatigueLevel} / 5</Text>
          </View>

          <View className="flex-row justify-between">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <TouchableOpacity
                key={lvl}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFatigueLevel(lvl);
                }}
                className={`flex-1 mx-1 py-2.5 rounded-xl items-center justify-center ${
                  fatigueLevel === lvl
                    ? 'bg-red-500/20'
                    : 'bg-theme-bg'
                }`}
              >
                <Text
                  className={`text-sm font-bold ${
                    fatigueLevel === lvl ? 'text-red-500' : 'text-theme-muted'
                  }`}
                >
                  {lvl}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* NOTES & SORENESS */}
        <View className="mb-4">
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-2">
            Notes / Soreness
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Left calf feels a bit tight after hill reps..."
            multiline
            numberOfLines={2}
            className="bg-theme-bg text-theme-text rounded-xl p-3 text-sm"
            style={{ textAlignVertical: 'top', minHeight: 60 }}
          />
        </View>

        {/* PROGRESS PHOTO ATTACHMENT */}
        <View className="mb-5">
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-2">
            Progress Photo
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              // Simulating photo picker touch
              setPhotoUri('selected');
            }}
            className="bg-theme-bg rounded-xl p-3 flex-row items-center justify-center space-x-2"
          >
            <Ionicons name="camera-outline" size={18} color="#FF5A1F" />
            <Text className="text-xs font-bold text-theme-accent">
              {photoUri ? 'Photo Selected ✓' : 'Choose / Take Progress Photo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* SAVE LOG BUTTON */}
        <Button label="Save Log" onPress={handleSave} className="bg-theme-accent" />
      </Card>

      {/* HISTORY FEED */}
      <Card className="mb-6 bg-theme-card">
        <View className="flex-row items-center space-x-2 mb-3">
          <View className="w-2.5 h-2.5 rounded-full bg-theme-accent" />
          <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
            Biometrics History
          </Text>
        </View>

        {history.length === 0 ? (
          <Text className="text-xs text-theme-muted py-4 text-center">No past logs recorded.</Text>
        ) : (
          history.map((entry) => (
            <View
              key={entry.id}
              className="bg-theme-bg/70 rounded-xl p-4 mb-3"
            >
              <View className="flex-row justify-between items-center mb-2 pb-2">
                <Text className="text-sm font-extrabold text-theme-text">{entry.date}</Text>

                <TouchableOpacity onPress={() => entry.id && handleDelete(entry.id)}>
                  <Ionicons name="trash-outline" size={16} color="#E3494F" />
                </TouchableOpacity>
              </View>

              <View className="flex-row justify-between items-center my-1">
                <Text className="text-xs text-theme-muted">
                  Weight: <Text className="font-bold text-theme-text">{entry.weight_kg}kg</Text>
                </Text>

                <Text className="text-xs text-theme-muted">
                  Sleep: <Text className="font-bold text-amber-500">{entry.sleep_quality}/5</Text>
                </Text>

                <Text className="text-xs text-theme-muted">
                  Fatigue: <Text className="font-bold text-red-500">{entry.fatigue_level}/5</Text>
                </Text>
              </View>

              {entry.notes ? (
                <Text className="text-xs text-theme-muted mt-2 italic leading-4">
                  "{entry.notes}"
                </Text>
              ) : null}
            </View>
          ))
        )}
      </Card>
    </View>
  );
};
