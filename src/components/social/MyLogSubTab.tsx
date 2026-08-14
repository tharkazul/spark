import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { PMCComboChart } from './PMCComboChart';
import { useActivities } from '../../context/ActivityStore';
import { usePhysique } from '../../context/PhysiqueStore';
import { useUser } from '../../context/UserStore';
import { exportActivitiesToCSV } from '../../utils/csvExport';
import { Activity } from '../../types/activity';

interface MyLogSubTabProps {
  onOpenActivityModal?: (id: string | number, activity?: Partial<Activity>) => void;
}

export const MyLogSubTab: React.FC<MyLogSubTabProps> = ({ onOpenActivityModal }) => {
  const { user } = useUser();
  const { activities, loading } = useActivities();
  const { physiqueLogs } = usePhysique();

  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState<boolean>(false);

  const toggleSelectActivity = (id: string) => {
    Haptics.selectionAsync();
    setSelectedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    Haptics.selectionAsync();
    if (selectedActivityIds.length === activities.length) {
      setSelectedActivityIds([]);
    } else {
      setSelectedActivityIds(activities.map((a) => String(a.id)));
    }
  };

  const handleExportCSV = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setExporting(true);

    try {
      const itemsToExport =
        selectedActivityIds.length > 0
          ? activities.filter((a) => selectedActivityIds.includes(String(a.id)))
          : activities;

      if (itemsToExport.length === 0) {
        Alert.alert('No Activities', 'There are no activities to export.');
        return;
      }

      await exportActivitiesToCSV(itemsToExport);
    } catch (err: any) {
      Alert.alert('Export Failed', err.message || 'Could not export CSV file.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View className="space-y-4 mb-8">
      {/* Header section with CSV export */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-1 pr-2">
          <Text className="text-sm font-extrabold text-theme-text">Personal Workout History</Text>
          <Text className="text-xs text-theme-muted">Tap row to view telemetry & route map.</Text>
        </View>

        <TouchableOpacity
          onPress={handleExportCSV}
          disabled={exporting}
          className="flex-row items-center space-x-1.5 bg-theme-card border border-theme-accent/40 px-3.5 py-2 rounded-xl shadow-sm active:bg-theme-accent/15"
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#FF5F3B" />
          ) : (
            <Ionicons name="download-outline" size={16} color="#FF5F3B" />
          )}
          <Text className="text-xs font-black text-theme-accent">Export CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Embedded PMC Combo Chart Card */}
      <PMCComboChart
        activities={activities}
        physiqueLogs={physiqueLogs}
        targetCtl={user?.target_ctl || 75}
      />

      {/* Activity History List Header */}
      <View className="flex-row justify-between items-center mb-2 px-1">
        <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted">
          Activity Logs ({activities.length})
        </Text>

        {activities.length > 0 && (
          <TouchableOpacity onPress={toggleSelectAll} className="flex-row items-center space-x-1">
            <Text className="text-xs font-bold text-theme-accent">
              {selectedActivityIds.length === activities.length ? 'Deselect All' : 'Select All'}
            </Text>
            {selectedActivityIds.length > 0 && (
              <View className="bg-theme-accent/20 px-1.5 py-0.5 rounded-full ml-1">
                <Text className="text-[10px] font-black text-theme-accent">
                  {selectedActivityIds.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Activity List Items */}
      {loading && activities.length === 0 ? (
        <View className="items-center justify-center p-8">
          <ActivityIndicator size="large" color="#FF5F3B" />
          <Text className="text-xs font-bold text-theme-muted mt-3">Loading activity history...</Text>
        </View>
      ) : activities.length === 0 ? (
        <View className="bg-theme-card border border-theme-border rounded-2xl p-6 items-center justify-center">
          <Ionicons name="fitness-outline" size={32} color="#6F6F79" />
          <Text className="text-sm font-bold text-theme-muted mt-2">No activity history recorded yet.</Text>
        </View>
      ) : (
        activities.map((act) => {
          const idStr = String(act.id);
          const isSelected = selectedActivityIds.includes(idStr);

          return (
            <TouchableOpacity
              key={`act-${idStr}`}
              onPress={() => onOpenActivityModal && onOpenActivityModal(act.id, act)}
              activeOpacity={0.8}
              className={`bg-theme-card border rounded-2xl p-4 mb-2.5 flex-row justify-between items-center shadow-sm ${
                isSelected ? 'border-theme-accent bg-theme-accent/5' : 'border-theme-border'
              }`}
            >
              {/* Checkbox selector */}
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation && e.stopPropagation();
                  toggleSelectActivity(idStr);
                }}
                className="pr-3"
              >
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={isSelected ? '#FF5F3B' : '#6F6F79'}
                />
              </TouchableOpacity>

              <View className="flex-row items-center space-x-3 flex-1">
                <View className="w-10 h-10 rounded-full bg-theme-bg items-center justify-center border border-theme-border">
                  <Ionicons
                    name={
                      act.sport_type === 'BIKE'
                        ? 'bicycle-outline'
                        : act.sport_type === 'SWIM'
                        ? 'water-outline'
                        : act.sport_type === 'STRENGTH'
                        ? 'barbell-outline'
                        : 'walk-outline'
                    }
                    size={20}
                    color="#FF5F3B"
                  />
                </View>

                <View className="flex-1 pr-2">
                  <Text className="text-sm font-extrabold text-theme-text" numberOfLines={1}>
                    {act.name || 'Workout'}
                  </Text>
                  <Text className="text-[11px] text-theme-muted">
                    {act.start_date ? act.start_date.substring(0, 10) : 'Recent'} ·{' '}
                    {typeof act.distance_km === 'number' && act.distance_km > 0
                      ? `${act.distance_km.toFixed(1)} km`
                      : `${Math.round(act.moving_time_min || 0)} mins`}
                  </Text>
                </View>
              </View>

              <View className="items-end">
                <View className="px-2 py-0.5 bg-theme-accent/15 rounded-full mb-1">
                  <Text className="text-[11px] font-black font-rajdhani text-theme-accent">
                    +{Math.round(act.spark_score || act.tss || 0)} Spark
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#6F6F79" />
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
};
