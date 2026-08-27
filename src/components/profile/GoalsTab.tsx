import React, { useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { EventDatePickerSheet } from '../ui/EventDatePickerSheet';
import { useUser } from '../../context/UserStore';
import { userApi } from '../../services/apiServices';

interface MilestoneRow {
  id: string;
  isARace: boolean;
  eventName: string;
  eventDate: string; // YYYY-MM-DD
}

// Auto-calculate Target CTL based on Event Title and Distance Keywords
export function calculateTargetCTL(eventName: string): number {
  const name = (eventName || '').toLowerCase();

  if (name.includes('140.6') || name.includes('full ironman') || (name.includes('ironman') && !name.includes('half') && !name.includes('70.3'))) {
    return 130;
  }
  if (name.includes('70.3') || name.includes('half ironman') || name.includes('middle distance')) {
    return 95;
  }
  if (name.includes('marathon') || name.includes('42.2') || name.includes('42k') || name.includes('42 km')) {
    return 90;
  }
  if (name.includes('half marathon') || name.includes('21.1') || name.includes('21k') || name.includes('21 km') || name.includes('half')) {
    return 70;
  }
  if (name.includes('olympic') || name.includes('standard') || name.includes('10k') || name.includes('10 km')) {
    return 50;
  }
  if (name.includes('sprint') || name.includes('5k') || name.includes('5 km') || name.includes('park run') || name.includes('parkrun')) {
    return 35;
  }

  return 70; // Default target CTL
}

export const GoalsTab: React.FC = () => {
    const theme = useTheme();
  const { user, refreshUser } = useUser();

  const [guideExpanded, setGuideExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Date Selector Sheet state. The year/month/day selection lives inside
  // EventDatePickerSheet, which onboarding shares.
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [pickerInitialDate, setPickerInitialDate] = useState<string>('');

  const [milestones, setMilestones] = useState<MilestoneRow[]>(() => {
    if (user?.target_event) {
      return [
        {
          id: '1',
          isARace: true,
          eventName: user.target_event,
          eventDate: user.event_date || new Date().toISOString().split('T')[0],
        },
      ];
    }
    return [];
  });

  const isInitialized = React.useRef(false);
  React.useEffect(() => {
    if (user && !isInitialized.current) {
      isInitialized.current = true;
      if (user.target_event) {
        setMilestones([
          {
            id: '1',
            isARace: true,
            eventName: user.target_event,
            eventDate: user.event_date || new Date().toISOString().split('T')[0],
          },
        ]);
      }
    }
  }, [user]);

  const handleAddMilestone = () => {
    Haptics.selectionAsync();
    const todayStr = new Date().toISOString().split('T')[0];
    const newRow: MilestoneRow = {
      id: Date.now().toString(),
      isARace: milestones.length === 0,
      eventName: '',
      eventDate: todayStr,
    };
    setMilestones((prev) => [...prev, newRow]);
  };

  const handleRemoveMilestone = (id: string) => {
    Haptics.selectionAsync();
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  const handleToggleARace = (id: string) => {
    Haptics.selectionAsync();
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

  const handleOpenDatePicker = (milestone: MilestoneRow) => {
    Haptics.selectionAsync();
    setActiveMilestoneId(milestone.id);
    setPickerInitialDate(milestone.eventDate || '');
    setDateModalVisible(true);
  };

  const handleConfirmDate = (dateStr: string) => {
    if (activeMilestoneId) {
      handleUpdateMilestone(activeMilestoneId, 'eventDate', dateStr);
    }
  };

  const handleSaveCalendar = async () => {
    setSaving(true);
    setSavedSuccess(false);

    const mainARace = milestones.find((m) => m.isARace) || milestones[0];
    try {
      if (mainARace) {
        const calculatedCTL = calculateTargetCTL(mainARace.eventName);
        await userApi.updateSettings({
          target_event: mainARace.eventName,
          event_date: mainARace.eventDate,
          target_ctl: calculatedCTL,
        });
      } else {
        await userApi.updateSettings({
          target_event: '',
          event_date: '',
          target_ctl: 70,
        });
      }
      await refreshUser();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Failed to save race calendar:', err);
    } finally {
      setSaving(false);
    }
  };

  // Helper to format YYYY-MM-DD nicely for display
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'Select Date';
    try {
      const parts = dateStr.split('-').map(Number);
      if (parts.length === 3) {
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        return d.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    } catch (e) {}
    return dateStr;
  };

  return (
    <View className="space-y-6">
      {/* RACE CALENDAR & GOALS CARD */}
      <Card className="p-4 mb-6">
        <View className="flex-row justify-between items-center pb-3 mb-4 border-b border-theme-border/50">
          <View className="flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <Text className="text-theme-text font-bold text-sm">Race Calendar & Goals</Text>
          </View>
          <TouchableOpacity
            onPress={handleAddMilestone}
            className="px-3 py-1.5 bg-theme-accent/10 rounded-lg flex-row items-center"
          >
            <Ionicons name="add" size={14} color={theme.tint} />
            <Text className="text-theme-accent font-bold text-xs ml-1">+ Add Race</Text>
          </TouchableOpacity>
        </View>

        {/* CTL TARGET REFERENCE GUIDE (COLLAPSIBLE) */}
        <TouchableOpacity
          onPress={() => setGuideExpanded(!guideExpanded)}
          activeOpacity={0.8}
          className="p-3 bg-theme-bg rounded-xl mb-4 flex-row items-center justify-between"
        >
          <View className="flex-row items-center flex-1 pr-2">
            <Ionicons name="information-circle-outline" size={18} color={theme.tint} />
            <Text className="text-theme-text font-bold text-xs ml-2">
              CTL Target Reference Guide
            </Text>
          </View>
          <Ionicons
            name={guideExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textSecondary}
          />
        </TouchableOpacity>

        {guideExpanded && (
          <View className="p-3 bg-theme-bg/60 rounded-xl mb-4 space-y-2">
            <View className="flex-row flex-wrap gap-2">
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">5K / Sprint Tri</Text>
                <Text className="text-theme-muted text-xs">Target: 30 - 45 CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">10K / Olympic Tri</Text>
                <Text className="text-theme-muted text-xs">Target: 45 - 60 CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">Half Marathon</Text>
                <Text className="text-theme-muted text-xs">Target: 60 - 80 CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">70.3 Half Ironman</Text>
                <Text className="text-theme-muted text-xs">Target: 80 - 110 CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">Full Marathon</Text>
                <Text className="text-theme-muted text-xs">Target: 80 - 100+ CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">140.6 Full Ironman</Text>
                <Text className="text-theme-muted text-xs">Target: 110 - 150+ CTL</Text>
              </View>
            </View>
            <Text className="text-xs text-theme-muted italic mt-1 leading-relaxed">
              *CTL (Fitness) is auto-calculated based on race type, distance, and preparation window.
            </Text>
          </View>
        )}

        {/* MILESTONES LIST */}
        {milestones.length === 0 ? (
          <View className="p-4 bg-theme-bg/60 rounded-xl items-center justify-center my-2">
            <Ionicons name="flag-outline" size={24} color={theme.textSecondary} />
            <Text className="text-theme-text font-bold text-xs mt-2 text-center">
              No upcoming races or milestones set
            </Text>
            <Text className="text-theme-muted text-xs mt-1 text-center">
              Tap "+ Add Race" above to add your target event and structure your fitness progression.
            </Text>
          </View>
        ) : (
          <View className="space-y-3">
            {milestones.map((row) => {
              return (
                <View
                  key={row.id}
                  className="p-3 bg-theme-bg rounded-xl space-y-3"
                >
                  <View className="flex-row items-center justify-between">
                    <TouchableOpacity
                      onPress={() => handleToggleARace(row.id)}
                      className={`px-2.5 py-1 rounded-full flex-row items-center ${
                        row.isARace ? 'bg-yellow-500/20' : 'bg-theme-card'
                      }`}
                    >
                      <Ionicons
                        name={row.isARace ? 'trophy' : 'trophy-outline'}
                        size={12}
                        color={row.isARace ? '#EAB308' : '#8E8E93'}
                      />
                      <Text
                        className={`text-xs font-bold ml-1 ${
                          row.isARace ? 'text-yellow-500' : 'text-theme-muted'
                        }`}
                      >
                        {row.isARace ? 'A-RACE (MAIN)' : 'B/C RACE'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleRemoveMilestone(row.id)}
                      className="p-1"
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  <View className="space-y-2.5">
                    {/* EVENT NAME INPUT */}
                    <View>
                      <Text className="text-xs font-bold text-theme-muted mb-1">
                        Event Name
                      </Text>
                      <TextInput
                        value={row.eventName}
                        onChangeText={(val) => handleUpdateMilestone(row.id, 'eventName', val)}
                        placeholder="e.g. 5K park run, Amsterdam Marathon..."
                        placeholderTextColor={theme.textSecondary}
                        className="bg-theme-card rounded-xl p-3 text-xs text-theme-text font-bold"
                      />
                    </View>

                    {/* EVENT DATE ROW */}
                    <View className="flex-row gap-2">
                      {/* DATE SELECTOR BUTTON (OPENS MODAL) */}
                      <View className="flex-1">
                        <Text className="text-xs font-bold text-theme-muted mb-1">
                          Event Date
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleOpenDatePicker(row)}
                          activeOpacity={0.8}
                          className="bg-theme-card rounded-xl p-3 flex-row items-center justify-between"
                        >
                          <Text
                            className={`text-xs font-bold ${
                              row.eventDate ? 'text-theme-text' : 'text-theme-muted'
                            }`}
                          >
                            {formatDateDisplay(row.eventDate)}
                          </Text>
                          <Ionicons name="calendar-outline" size={15} color={theme.tint} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

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
          <View className="p-3 bg-green-500/10 rounded-xl mt-3 items-center">
            <Text className="text-green-500 font-bold text-xs">
              Calendar saved successfully!
            </Text>
          </View>
        )}
      </Card>

      {/* Shared with the onboarding wizard — one date sheet, not two. */}
      <EventDatePickerSheet
        visible={dateModalVisible}
        value={pickerInitialDate}
        onClose={() => setDateModalVisible(false)}
        onConfirm={handleConfirmDate}
      />
    </View>
  );
};
