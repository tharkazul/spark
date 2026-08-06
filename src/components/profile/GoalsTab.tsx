import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { useUser } from '../../context/UserStore';
import { userApi } from '../../services/apiServices';

interface MilestoneRow {
  id: string;
  isARace: boolean;
  eventName: string;
  eventDate: string;
  targetCtl: string;
}

export const GoalsTab: React.FC = () => {
  const { user, refreshUser } = useUser();

  const [guideExpanded, setGuideExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [milestones, setMilestones] = useState<MilestoneRow[]>([
    {
      id: '1',
      isARace: true,
      eventName: user?.target_event || 'Amsterdam Marathon',
      eventDate: user?.event_date || '2026-10-18',
      targetCtl: user?.target_ctl ? String(user.target_ctl) : '85',
    },
    {
      id: '2',
      isARace: false,
      eventName: 'Zandvoort 10K Warmup',
      eventDate: '2026-09-06',
      targetCtl: '60',
    },
  ]);

  const handleAddMilestone = () => {
    const newRow: MilestoneRow = {
      id: Date.now().toString(),
      isARace: false,
      eventName: '',
      eventDate: '',
      targetCtl: '50',
    };
    setMilestones((prev) => [...prev, newRow]);
  };

  const handleRemoveMilestone = (id: string) => {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  const handleToggleARace = (id: string) => {
    setMilestones((prev) =>
      prev.map((m) => ({
        ...m,
        isARace: m.id === id,
      }))
    );
  };

  const handleUpdateMilestone = (id: string, field: keyof MilestoneRow, value: any) => {
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const handleSaveCalendar = async () => {
    setSaving(true);
    setSavedSuccess(false);

    const mainARace = milestones.find((m) => m.isARace) || milestones[0];
    try {
      if (mainARace) {
        await userApi.updateSettings({
          target_event: mainARace.eventName,
          event_date: mainARace.eventDate,
          target_ctl: parseInt(mainARace.targetCtl, 10) || 70,
        });
        await refreshUser();
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      Alert.alert('Success', 'Race calendar saved successfully!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save race calendar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="space-y-6">
      {/* RACE CALENDAR & GOALS */}
      <Card className="p-4 mb-6">
        <View className="flex-row justify-between items-center pb-3 mb-4 border-b border-theme-border">
          <View className="flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <Text className="text-theme-text font-bold text-sm">Race Calendar & Goals</Text>
          </View>
          <TouchableOpacity
            onPress={handleAddMilestone}
            className="px-3 py-1.5 bg-theme-accent/10 border border-theme-accent/30 rounded-lg flex-row items-center"
          >
            <Ionicons name="add" size={14} color="#FF5A1F" />
            <Text className="text-theme-accent font-bold text-xs ml-1">+ Add Race</Text>
          </TouchableOpacity>
        </View>

        {/* CTL TARGET REFERENCE GUIDE (COLLAPSIBLE) */}
        <TouchableOpacity
          onPress={() => setGuideExpanded(!guideExpanded)}
          activeOpacity={0.8}
          className="p-3 bg-theme-bg border border-theme-border rounded-xl mb-4 flex-row items-center justify-between"
        >
          <View className="flex-row items-center flex-1 pr-2">
            <Ionicons name="information-circle-outline" size={18} color="#FF5A1F" />
            <Text className="text-theme-text font-bold text-xs ml-2">
              CTL Target Reference Guide
            </Text>
          </View>
          <Ionicons
            name={guideExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#8E8E93"
          />
        </TouchableOpacity>

        {guideExpanded && (
          <View className="p-3 bg-theme-bg/60 border border-theme-border rounded-xl mb-4 space-y-2">
            <View className="flex-row flex-wrap gap-2">
              <View className="w-[48%] p-2 border border-theme-border rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">5K / Sprint Tri</Text>
                <Text className="text-theme-muted text-[10px]">Target: 30 - 45 CTL</Text>
              </View>
              <View className="w-[48%] p-2 border border-theme-border rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">10K / Olympic Tri</Text>
                <Text className="text-theme-muted text-[10px]">Target: 45 - 60 CTL</Text>
              </View>
              <View className="w-[48%] p-2 border border-theme-border rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">Half Marathon</Text>
                <Text className="text-theme-muted text-[10px]">Target: 60 - 80 CTL</Text>
              </View>
              <View className="w-[48%] p-2 border border-theme-border rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">70.3 Half Ironman</Text>
                <Text className="text-theme-muted text-[10px]">Target: 80 - 110 CTL</Text>
              </View>
              <View className="w-[48%] p-2 border border-theme-border rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">Full Marathon</Text>
                <Text className="text-theme-muted text-[10px]">Target: 80 - 100+ CTL</Text>
              </View>
              <View className="w-[48%] p-2 border border-theme-border rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">140.6 Full Ironman</Text>
                <Text className="text-theme-muted text-[10px]">Target: 110 - 150+ CTL</Text>
              </View>
            </View>
            <Text className="text-[10px] text-theme-muted italic mt-1 leading-relaxed">
              *CTL (Fitness) is a rolling 42-day average of daily Spark Training Stress. Higher targets require more weekly training volume.
            </Text>
          </View>
        )}

        {/* TABLE HEADERS & ROWS */}
        <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider mb-3">
          A-Race | Event Name | Date | Target CTL
        </Text>

        <View className="space-y-3">
          {milestones.map((row) => (
            <View
              key={row.id}
              className="p-3 bg-theme-bg border border-theme-border rounded-xl space-y-2"
            >
              <View className="flex-row items-center justify-between">
                <TouchableOpacity
                  onPress={() => handleToggleARace(row.id)}
                  className={`px-2.5 py-1 rounded-full flex-row items-center border ${
                    row.isARace
                      ? 'bg-yellow-500/20 border-yellow-500'
                      : 'bg-theme-card border-theme-border'
                  }`}
                >
                  <Ionicons
                    name={row.isARace ? 'trophy' : 'trophy-outline'}
                    size={12}
                    color={row.isARace ? '#EAB308' : '#8E8E93'}
                  />
                  <Text
                    className={`text-[10px] font-bold ml-1 ${
                      row.isARace ? 'text-yellow-500' : 'text-theme-muted'
                    }`}
                  >
                    {row.isARace ? 'A-RACE (MAIN)' : 'B/C RACE'}
                  </Text>
                </TouchableOpacity>

                {milestones.length > 1 && (
                  <TouchableOpacity
                    onPress={() => handleRemoveMilestone(row.id)}
                    className="p-1"
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>

              <View className="space-y-2 mt-1">
                <TextInput
                  value={row.eventName}
                  onChangeText={(val) => handleUpdateMilestone(row.id, 'eventName', val)}
                  placeholder="Event Name (e.g. Berlin Marathon)"
                  placeholderTextColor="#8E8E93"
                  className="bg-theme-card border border-theme-border rounded-lg p-2.5 text-xs text-theme-text font-bold"
                />

                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Text className="text-[9px] font-bold text-theme-muted uppercase mb-1">
                      Event Date (YYYY-MM-DD)
                    </Text>
                    <TextInput
                      value={row.eventDate}
                      onChangeText={(val) => handleUpdateMilestone(row.id, 'eventDate', val)}
                      placeholder="2026-10-18"
                      placeholderTextColor="#8E8E93"
                      className="bg-theme-card border border-theme-border rounded-lg p-2.5 text-xs text-theme-text"
                    />
                  </View>

                  <View className="w-28">
                    <Text className="text-[9px] font-bold text-theme-muted uppercase mb-1">
                      Target CTL
                    </Text>
                    <TextInput
                      value={row.targetCtl}
                      onChangeText={(val) => handleUpdateMilestone(row.id, 'targetCtl', val)}
                      keyboardType="numeric"
                      placeholder="85"
                      placeholderTextColor="#8E8E93"
                      className="bg-theme-card border border-theme-border rounded-lg p-2.5 text-xs text-theme-text font-bold"
                    />
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* SAVE BUTTON */}
        <TouchableOpacity
          onPress={handleSaveCalendar}
          disabled={saving}
          className="bg-theme-accent py-3.5 rounded-xl items-center mt-5 shadow-sm"
        >
          <Text className="text-white font-bold text-sm">
            {saving ? 'Saving Calendar...' : 'Save Calendar'}
          </Text>
        </TouchableOpacity>

        {savedSuccess && (
          <View className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl mt-3 items-center">
            <Text className="text-green-500 font-bold text-xs">
              Calendar saved successfully!
            </Text>
          </View>
        )}
      </Card>
    </View>
  );
};
