import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
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

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const GoalsTab: React.FC = () => {
  const { user, refreshUser } = useUser();

  const [guideExpanded, setGuideExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Date Selector Modal state
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  
  // Date Picker temporary selection state
  const [pickerYear, setPickerYear] = useState<number>(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState<number>(new Date().getMonth()); // 0-11
  const [pickerDay, setPickerDay] = useState<number>(new Date().getDate());

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

  // Open Date Picker Modal
  const handleOpenDatePicker = (milestone: MilestoneRow) => {
    Haptics.selectionAsync();
    setActiveMilestoneId(milestone.id);

    let initialDate = new Date();
    if (milestone.eventDate && milestone.eventDate.includes('-')) {
      const parts = milestone.eventDate.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        initialDate = new Date(parts[0], parts[1] - 1, parts[2]);
      }
    }

    setPickerYear(initialDate.getFullYear());
    setPickerMonth(initialDate.getMonth());
    setPickerDay(initialDate.getDate());
    setDateModalVisible(true);
  };

  // Confirm selected date in modal
  const handleConfirmDate = () => {
    if (activeMilestoneId) {
      const mStr = String(pickerMonth + 1).padStart(2, '0');
      const dStr = String(pickerDay).padStart(2, '0');
      const formattedDate = `${pickerYear}-${mStr}-${dStr}`;

      handleUpdateMilestone(activeMilestoneId, 'eventDate', formattedDate);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setDateModalVisible(false);
  };

  // Apply Quick Date Presets (+1 Month, +3 Months, +6 Months, +1 Year)
  const handleApplyPreset = (monthsToAdd: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsToAdd);
    setPickerYear(d.getFullYear());
    setPickerMonth(d.getMonth());
    setPickerDay(Math.min(d.getDate(), 28));
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

  const daysInSelectedMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();

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
            <Ionicons name="add" size={14} color="#FF5A1F" />
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
          <View className="p-3 bg-theme-bg/60 rounded-xl mb-4 space-y-2">
            <View className="flex-row flex-wrap gap-2">
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">5K / Sprint Tri</Text>
                <Text className="text-theme-muted text-[10px]">Target: 30 - 45 CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">10K / Olympic Tri</Text>
                <Text className="text-theme-muted text-[10px]">Target: 45 - 60 CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">Half Marathon</Text>
                <Text className="text-theme-muted text-[10px]">Target: 60 - 80 CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">70.3 Half Ironman</Text>
                <Text className="text-theme-muted text-[10px]">Target: 80 - 110 CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">Full Marathon</Text>
                <Text className="text-theme-muted text-[10px]">Target: 80 - 100+ CTL</Text>
              </View>
              <View className="w-[48%] p-2 rounded-lg bg-theme-card">
                <Text className="text-theme-text font-bold text-xs">140.6 Full Ironman</Text>
                <Text className="text-theme-muted text-[10px]">Target: 110 - 150+ CTL</Text>
              </View>
            </View>
            <Text className="text-[10px] text-theme-muted italic mt-1 leading-relaxed">
              *CTL (Fitness) is auto-calculated based on race type, distance, and preparation window.
            </Text>
          </View>
        )}

        {/* MILESTONES LIST */}
        {milestones.length === 0 ? (
          <View className="p-4 bg-theme-bg/60 rounded-xl items-center justify-center my-2">
            <Ionicons name="flag-outline" size={24} color="#8E8E93" />
            <Text className="text-theme-text font-bold text-xs mt-2 text-center">
              No upcoming races or milestones set
            </Text>
            <Text className="text-theme-muted text-[11px] mt-1 text-center">
              Tap "+ Add Race" above to add your target event and structure your fitness progression.
            </Text>
          </View>
        ) : (
          <View className="space-y-3">
            {milestones.map((row) => {
              const calculatedCTL = calculateTargetCTL(row.eventName);

              return (
                <View
                  key={row.id}
                  className="p-3 bg-theme-bg rounded-xl space-y-3 border border-theme-border/30"
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
                        className={`text-[10px] font-bold ml-1 ${
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
                      <Text className="text-[9px] font-bold text-theme-muted uppercase mb-1">
                        Event Name
                      </Text>
                      <TextInput
                        value={row.eventName}
                        onChangeText={(val) => handleUpdateMilestone(row.id, 'eventName', val)}
                        placeholder="e.g. 5K park run, Amsterdam Marathon..."
                        placeholderTextColor="#8E8E93"
                        className="bg-theme-card rounded-xl p-3 text-xs text-theme-text font-bold border border-theme-border/50"
                      />
                    </View>

                    {/* EVENT DATE & AUTO-CALCULATED CTL ROW */}
                    <View className="flex-row gap-2">
                      {/* DATE SELECTOR BUTTON (OPENS MODAL) */}
                      <View className="flex-1">
                        <Text className="text-[9px] font-bold text-theme-muted uppercase mb-1">
                          Event Date
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleOpenDatePicker(row)}
                          activeOpacity={0.8}
                          className="bg-theme-card rounded-xl p-3 flex-row items-center justify-between border border-theme-border/50"
                        >
                          <Text
                            className={`text-xs font-bold ${
                              row.eventDate ? 'text-theme-text' : 'text-theme-muted'
                            }`}
                          >
                            {formatDateDisplay(row.eventDate)}
                          </Text>
                          <Ionicons name="calendar-outline" size={15} color="#FF5A1F" />
                        </TouchableOpacity>
                      </View>

                      {/* AUTO CALCULATED CTL READONLY BADGE */}
                      <View className="w-28 bg-theme-card rounded-xl p-2.5 border border-theme-border/50 justify-center items-center">
                        <Text className="text-[9px] font-bold text-theme-muted uppercase mb-0.5">
                          Target CTL
                        </Text>
                        <View className="flex-row items-center gap-1">
                          <Text className="text-base font-extrabold text-theme-accent">
                            {calculatedCTL}
                          </Text>
                          <View className="px-1.5 py-0.5 bg-theme-accent/15 rounded">
                            <Text className="text-[8px] font-extrabold text-theme-accent">AUTO</Text>
                          </View>
                        </View>
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

      {/* DATE SELECTOR MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={dateModalVisible}
        onRequestClose={() => setDateModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-theme-bg p-5 rounded-t-3xl border-t border-theme-border">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between mb-4 pb-3 border-b border-theme-border/50">
              <View className="flex-row items-center gap-2">
                <Ionicons name="calendar-outline" size={20} color="#FF5A1F" />
                <Text className="text-lg font-extrabold text-theme-text">Select Event Date</Text>
              </View>
              <TouchableOpacity onPress={() => setDateModalVisible(false)} className="p-1">
                <Ionicons name="close" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {/* Formatted Date Preview */}
            <View className="p-3 bg-theme-card border border-theme-accent/30 rounded-xl mb-4 items-center">
              <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">
                Selected Race Date
              </Text>
              <Text className="text-lg font-extrabold text-theme-accent mt-0.5">
                {formatDateDisplay(
                  `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(pickerDay).padStart(2, '0')}`
                )}
              </Text>
            </View>

            {/* Quick Presets */}
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider mb-2">
              Quick Presets
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              <TouchableOpacity
                onPress={() => handleApplyPreset(1)}
                className="px-3 py-1.5 bg-theme-card border border-theme-border rounded-lg"
              >
                <Text className="text-xs font-bold text-theme-text">+1 Month</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleApplyPreset(3)}
                className="px-3 py-1.5 bg-theme-card border border-theme-border rounded-lg"
              >
                <Text className="text-xs font-bold text-theme-text">+3 Months</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleApplyPreset(6)}
                className="px-3 py-1.5 bg-theme-card border border-theme-border rounded-lg"
              >
                <Text className="text-xs font-bold text-theme-text">+6 Months</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleApplyPreset(12)}
                className="px-3 py-1.5 bg-theme-card border border-theme-border rounded-lg"
              >
                <Text className="text-xs font-bold text-theme-text">+1 Year</Text>
              </TouchableOpacity>
            </View>

            {/* Year Selector */}
            <View className="flex-row items-center justify-between mb-3 bg-theme-card p-2 rounded-xl">
              <Text className="text-xs font-bold text-theme-muted">Year</Text>
              <View className="flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={() => setPickerYear((y) => Math.max(new Date().getFullYear(), y - 1))}
                  className="p-1"
                >
                  <Ionicons name="chevron-back" size={18} color="#FF5A1F" />
                </TouchableOpacity>
                <Text className="text-sm font-extrabold text-theme-text font-mono">{pickerYear}</Text>
                <TouchableOpacity
                  onPress={() => setPickerYear((y) => y + 1)}
                  className="p-1"
                >
                  <Ionicons name="chevron-forward" size={18} color="#FF5A1F" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Month Grid */}
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider mb-2">
              Month
            </Text>
            <View className="flex-row flex-wrap gap-1.5 mb-4">
              {MONTH_NAMES.map((mName, idx) => {
                const isSelected = pickerMonth === idx;
                return (
                  <TouchableOpacity
                    key={mName}
                    onPress={() => {
                      setPickerMonth(idx);
                      const maxDays = new Date(pickerYear, idx + 1, 0).getDate();
                      if (pickerDay > maxDays) setPickerDay(maxDays);
                    }}
                    className={`w-[23%] py-2 rounded-lg items-center ${
                      isSelected
                        ? 'bg-theme-accent'
                        : 'bg-theme-card border border-theme-border/50'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? 'text-white' : 'text-theme-text'
                      }`}
                    >
                      {mName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Day Selector Scroll */}
            <Text className="text-[10px] font-bold text-theme-muted uppercase tracking-wider mb-2">
              Day of Month
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-5"
            >
              {Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1).map((dNum) => {
                const isSelected = pickerDay === dNum;
                return (
                  <TouchableOpacity
                    key={dNum}
                    onPress={() => setPickerDay(dNum)}
                    className={`w-10 h-10 rounded-xl items-center justify-center mr-2 border ${
                      isSelected
                        ? 'bg-theme-accent border-theme-accent'
                        : 'bg-theme-card border-theme-border/50'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? 'text-white' : 'text-theme-text'
                      }`}
                    >
                      {dNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Confirm Button */}
            <TouchableOpacity
              onPress={handleConfirmDate}
              className="bg-theme-accent py-3.5 rounded-xl items-center shadow-sm"
            >
              <Text className="text-white font-bold text-sm">Confirm Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};
