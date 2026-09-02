import React, { useEffect, useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { BottomSheetModal } from './BottomSheetModal';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const PRESETS: { months: number; label: string }[] = [
  { months: 1, label: '+1 Month' },
  { months: 3, label: '+3 Months' },
  { months: 6, label: '+6 Months' },
  { months: 12, label: '+1 Year' },
];

export interface EventDatePickerSheetProps {
  visible: boolean;
  /** Currently selected date, `YYYY-MM-DD`. Empty or absent starts on today. */
  value?: string;
  onClose: () => void;
  onConfirm: (dateStr: string) => void;

  /** Sheet heading. */
  title?: string;
  /** Caption above the big formatted date. */
  previewLabel?: string;
  confirmLabel?: string;
  /** Refuse dates before today, and say why. Onboarding needs this. */
  disallowPast?: boolean;
  pastWarning?: string;
  /**
   * Earliest selectable year. Defaults to the current year; the year stepper
   * will not go below it.
   */
  minYear?: number;
}

function parseDateString(dateStr?: string): Date | null {
  if (!dateStr || !dateStr.includes('-')) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return null;
  const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function toDateString(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateDisplay(dateStr: string) {
  const parsed = parseDateString(dateStr);
  if (!parsed) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The event date picker: year stepper, month grid, day strip and quick presets.
 *
 * Lifted out of GoalsTab so onboarding can use the same sheet rather than
 * maintaining a second, worse three-column roller alongside it.
 */
export const EventDatePickerSheet: React.FC<EventDatePickerSheetProps> = ({
  visible,
  value,
  onClose,
  onConfirm,
  title = 'Select Event Date',
  previewLabel = 'Selected Race Date',
  confirmLabel = 'Confirm Date',
  disallowPast = false,
  pastWarning = 'That date is already in the past',
  minYear,
}) => {
    const theme = useTheme();
  const thisYear = new Date().getFullYear();
  const floorYear = minYear ?? thisYear;

  const [pickerYear, setPickerYear] = useState<number>(floorYear);
  const [pickerMonth, setPickerMonth] = useState<number>(new Date().getMonth());
  const [pickerDay, setPickerDay] = useState<number>(new Date().getDate());

  // Re-seed from `value` each time the sheet opens, so reopening after a cancel
  // shows the saved date rather than whatever was last scrolled to.
  useEffect(() => {
    if (!visible) return;
    const initial = parseDateString(value) ?? new Date();
    const year = Math.max(floorYear, initial.getFullYear());
    const month = initial.getMonth();
    const maxDays = new Date(year, month + 1, 0).getDate();
    setPickerYear(year);
    setPickerMonth(month);
    setPickerDay(Math.min(initial.getDate(), maxDays));
  }, [visible, value, floorYear]);

  const daysInSelectedMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
  const selectedDateStr = toDateString(pickerYear, pickerMonth, pickerDay);

  const isInPast = React.useMemo(() => {
    if (!disallowPast) return false;
    const selected = new Date(pickerYear, pickerMonth, pickerDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected < today;
  }, [disallowPast, pickerYear, pickerMonth, pickerDay]);

  // Changing month or year can strand the day on the 31st of a 30-day month.
  const selectMonth = (monthIndex: number) => {
    setPickerMonth(monthIndex);
    const maxDays = new Date(pickerYear, monthIndex + 1, 0).getDate();
    setPickerDay((d) => Math.min(d, maxDays));
  };

  const stepYear = (delta: number) => {
    setPickerYear((y) => {
      const next = Math.max(floorYear, y + delta);
      const maxDays = new Date(next, pickerMonth + 1, 0).getDate();
      setPickerDay((d) => Math.min(d, maxDays));
      return next;
    });
  };

  const applyPreset = (monthsToAdd: number) => {
    Haptics.selectionAsync();
    const d = new Date();
    d.setMonth(d.getMonth() + monthsToAdd);
    setPickerYear(Math.max(floorYear, d.getFullYear()));
    setPickerMonth(d.getMonth());
    // Clamp to 28 so a preset never lands on a day the target month lacks.
    setPickerDay(Math.min(d.getDate(), 28));
  };

  const handleConfirm = () => {
    if (isInPast) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(selectedDateStr);
    onClose();
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      contentClassName="bg-theme-bg px-5 pt-3 pb-5 rounded-t-card border-t border-theme-border max-h-[90%]"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4 pb-3 border-b border-theme-border/50">
        <View className="flex-row items-center gap-2">
          <Ionicons name="calendar-outline" size={20} color={theme.tint} />
          <Text className="text-lg font-extrabold text-theme-text">{title}</Text>
        </View>
      </View>

      {/* Formatted preview */}
      <View className="p-3 bg-theme-card border border-theme-accent/30 rounded-control mb-4 items-center">
        <Text className="text-xs font-bold text-theme-muted">{previewLabel}</Text>
        <Text className="text-lg font-extrabold text-theme-accent mt-0.5">
          {formatDateDisplay(selectedDateStr)}
        </Text>
      </View>

      {isInPast && (
        <View className="mb-4 p-2 bg-semantic-error/10 border border-semantic-error/30 rounded-lg flex-row items-center justify-center gap-2">
          <Ionicons name="warning-outline" size={16} color="#ef4444" />
          <Text className="text-semantic-error text-xs font-bold text-center">{pastWarning}</Text>
        </View>
      )}

      {/* Quick presets */}
      <Text className="text-xs font-bold text-theme-muted mb-2">Quick Presets</Text>
      <View className="flex-row flex-wrap gap-2 mb-4">
        {PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.label}
            onPress={() => applyPreset(preset.months)}
            className="px-3 py-1.5 bg-theme-card border border-theme-border rounded-control"
          >
            <Text className="text-xs font-bold text-theme-text">{preset.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Year stepper */}
      <View className="flex-row items-center justify-between mb-3 bg-theme-card p-2 rounded-control">
        <Text className="text-xs font-bold text-theme-muted">Year</Text>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => stepYear(-1)}
            disabled={pickerYear <= floorYear}
            className={`p-1 ${pickerYear <= floorYear ? 'opacity-30' : ''}`}
          >
            <Ionicons name="chevron-back" size={18} color={theme.tint} />
          </TouchableOpacity>
          <Text className="text-sm font-extrabold text-theme-text font-mono">{pickerYear}</Text>
          <TouchableOpacity onPress={() => stepYear(1)} className="p-1">
            <Ionicons name="chevron-forward" size={18} color={theme.tint} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Month grid */}
      <Text className="text-xs font-bold text-theme-muted mb-2">Month</Text>
      <View className="flex-row flex-wrap gap-1.5 mb-4">
        {MONTH_NAMES.map((mName, idx) => {
          const isSelected = pickerMonth === idx;
          return (
            <TouchableOpacity
              key={mName}
              onPress={() => selectMonth(idx)}
              className={`w-[23%] py-2 rounded-lg items-center ${
                isSelected ? 'bg-theme-accent' : 'bg-theme-card border border-theme-border/50'
              }`}
            >
              <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-theme-text'}`}>
                {mName}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day strip */}
      <Text className="text-xs font-bold text-theme-muted mb-2">Day of Month</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
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
              <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-theme-text'}`}>
                {dNum}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Confirm */}
      <TouchableOpacity
        onPress={handleConfirm}
        disabled={isInPast}
        className={`bg-theme-accent py-3.5 rounded-xl items-center shadow-sm ${
          isInPast ? 'opacity-40' : ''
        }`}
      >
        <Text className="text-white font-bold text-sm">{confirmLabel}</Text>
      </TouchableOpacity>
    </BottomSheetModal>
  );
};
