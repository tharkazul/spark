import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';

interface ConnectionsTabProps {
  onOpenGarminModal: () => void;
  onOpenStravaModal: () => void;
}

export type SportType = 'running' | 'cycling' | 'swimming' | 'strength';

export interface StravaSportToggles {
  captionSparkScore: boolean;
  titleSummary: boolean;
  includeMuscleStrain: boolean;
  includeFueling: boolean;
}

const STORAGE_KEY_AUTOMATIONS = 'spark_strava_automations_by_sport';

const DEFAULT_TOGGLES: Record<SportType, StravaSportToggles> = {
  running: { captionSparkScore: true, titleSummary: true, includeMuscleStrain: true, includeFueling: true },
  cycling: { captionSparkScore: true, titleSummary: true, includeMuscleStrain: true, includeFueling: true },
  swimming: { captionSparkScore: true, titleSummary: true, includeMuscleStrain: false, includeFueling: false },
  strength: { captionSparkScore: true, titleSummary: true, includeMuscleStrain: true, includeFueling: false },
};

const SPORT_OPTIONS: { id: SportType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'running', label: 'Run', icon: 'walk-outline' },
  { id: 'cycling', label: 'Cycle', icon: 'bicycle-outline' },
  { id: 'swimming', label: 'Swim', icon: 'water-outline' },
  { id: 'strength', label: 'Strength', icon: 'barbell-outline' },
];

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  onOpenGarminModal,
  onOpenStravaModal,
}) => {
  const { user } = useUser();
  const { syncGarmin, syncStrava } = useActivities();

  const isGarminConnected = !!user?.garmin_connected;
  const isStravaConnected = !!user?.strava_connected;

  const [garminSyncing, setGarminSyncing] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [appleSyncing, setAppleSyncing] = useState(false);
  const [isAppleConnected, setIsAppleConnected] = useState(true);

  // Strava Automation Toggles per sport type
  const [selectedSport, setSelectedSport] = useState<SportType>('running');
  const [sportToggles, setSportToggles] = useState<Record<SportType, StravaSportToggles>>(DEFAULT_TOGGLES);

  const handleSyncAppleHealth = async () => {
    setAppleSyncing(true);
    try {
      const { syncAppleHealthActivities } = require('../../services/appleHealthService');
      await syncAppleHealthActivities();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Apple Health sync error:', err);
    } finally {
      setAppleSyncing(false);
    }
  };

  const handleConnectAppleHealth = async () => {
    try {
      const { requestAppleHealthPermissions } = require('../../services/appleHealthService');
      const granted = await requestAppleHealthPermissions();
      if (granted) {
        setIsAppleConnected(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      console.error('Apple Health connect error:', err);
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_AUTOMATIONS).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setSportToggles((prev) => ({ ...prev, ...parsed }));
        } catch (_) {}
      }
    });
  }, []);

  const handleToggleChange = (toggleKey: keyof StravaSportToggles, value: boolean) => {
    setSportToggles((prev) => {
      const updated = {
        ...prev,
        [selectedSport]: {
          ...prev[selectedSport],
          [toggleKey]: value,
        },
      };
      AsyncStorage.setItem(STORAGE_KEY_AUTOMATIONS, JSON.stringify(updated));
      return updated;
    });
  };

  const handleSyncGarmin = async () => {
    setGarminSyncing(true);
    try {
      await syncGarmin();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Garmin sync error:', err);
    } finally {
      setGarminSyncing(false);
    }
  };

  const handleSyncStrava = async () => {
    setStravaSyncing(true);
    try {
      await syncStrava();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Strava sync error:', err);
    } finally {
      setStravaSyncing(false);
    }
  };

  const currentToggles = sportToggles[selectedSport] || DEFAULT_TOGGLES[selectedSport];

  return (
    <View className="space-y-6">
      {/* APPLE HEALTH & WORKOUTKIT INTEGRATION */}
      <Card className="p-4 mb-6">
        <View className="flex-row justify-between items-center pb-3 mb-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="logo-apple" size={20} color="#FF2D55" />
            <Text className="text-theme-text font-bold text-sm">Apple Health & Watch (WorkoutKit)</Text>
          </View>
          <View
            className={`px-2 py-0.5 rounded ${
              isAppleConnected
                ? 'bg-green-500/10'
                : 'bg-red-500/10'
            }`}
          >
            <Text
              className={`text-[10px] font-bold ${
                isAppleConnected ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {isAppleConnected ? 'Active' : 'Disconnected'}
            </Text>
          </View>
        </View>

        <Text className="text-theme-muted text-xs mb-4 leading-relaxed">
          Syncs structured workouts directly to your Apple Watch Workout app using WorkoutKit and imports completed activities from Apple Health.
        </Text>

        <View className="flex-row flex-wrap gap-2">
          <TouchableOpacity
            onPress={handleConnectAppleHealth}
            className="bg-red-600 px-4 py-2.5 rounded-xl flex-row items-center justify-center shadow-sm"
          >
            <Ionicons name="shield-checkmark-outline" size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-2">
              Permissions
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSyncAppleHealth}
            disabled={appleSyncing}
            className="bg-theme-bg px-4 py-2.5 rounded-xl flex-row items-center justify-center"
          >
            {appleSyncing ? (
              <ActivityIndicator size="small" color="#FF2D55" />
            ) : (
              <>
                <Ionicons name="sync-outline" size={16} color="#8E8E93" />
                <Text className="text-theme-text font-bold text-xs ml-2">Sync Apple Health</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Card>

      {/* GARMIN CONNECT INTEGRATION */}
      <Card className="p-4 mb-6">
        <View className="flex-row justify-between items-center pb-3 mb-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="watch-outline" size={20} color="#FF5A1F" />
            <Text className="text-theme-text font-bold text-sm">Garmin Connect Integration</Text>
          </View>
          <View
            className={`px-2 py-0.5 rounded ${
              isGarminConnected
                ? 'bg-green-500/10'
                : 'bg-red-500/10'
            }`}
          >
            <Text
              className={`text-[10px] font-bold ${
                isGarminConnected ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {isGarminConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>

        <Text className="text-theme-muted text-xs mb-4 leading-relaxed">
          Required to automatically push micro-plan workouts directly to your Garmin watch calendar. Credentials are secure and encrypted.
        </Text>

        <View className="flex-row flex-wrap gap-2">
          <TouchableOpacity
            onPress={onOpenGarminModal}
            className="bg-blue-600 px-4 py-2.5 rounded-xl flex-row items-center justify-center shadow-sm"
          >
            <Ionicons name="settings-outline" size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-2">
              {isGarminConnected ? 'Manage Garmin' : 'Connect Garmin'}
            </Text>
          </TouchableOpacity>

          {isGarminConnected && (
            <TouchableOpacity
              onPress={handleSyncGarmin}
              disabled={garminSyncing}
              className="bg-theme-bg px-4 py-2.5 rounded-xl flex-row items-center justify-center"
            >
              {garminSyncing ? (
                <ActivityIndicator size="small" color="#FF5A1F" />
              ) : (
                <>
                  <Ionicons name="sync-outline" size={16} color="#8E8E93" />
                  <Text className="text-theme-text font-bold text-xs ml-2">Sync Workouts</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </Card>

      {/* STRAVA INTEGRATION */}
      <Card className="p-4 mb-6">
        <View className="flex-row justify-between items-center pb-3 mb-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="fitness-outline" size={20} color="#FF5A1F" />
            <Text className="text-theme-text font-bold text-sm">Strava Integration</Text>
          </View>
          <View
            className={`px-2 py-0.5 rounded ${
              isStravaConnected
                ? 'bg-green-500/10'
                : 'bg-red-500/10'
            }`}
          >
            <Text
              className={`text-[10px] font-bold ${
                isStravaConnected ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {isStravaConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>

        <Text className="text-theme-muted text-xs mb-4 leading-relaxed">
          Required to pull completed activities automatically and push personalized AI Coach captions to your Strava profile.
        </Text>

        <View className="flex-row flex-wrap gap-2">
          <TouchableOpacity
            onPress={onOpenStravaModal}
            className="bg-orange-500 px-4 py-2.5 rounded-xl flex-row items-center justify-center shadow-sm"
          >
            <Ionicons name="logo-octocat" size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-2">
              {isStravaConnected ? 'Manage Strava' : 'Connect with Strava'}
            </Text>
          </TouchableOpacity>

          {isStravaConnected && (
            <TouchableOpacity
              onPress={handleSyncStrava}
              disabled={stravaSyncing}
              className="bg-theme-bg px-4 py-2.5 rounded-xl flex-row items-center justify-center"
            >
              {stravaSyncing ? (
                <ActivityIndicator size="small" color="#FF5A1F" />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={16} color="#8E8E93" />
                  <Text className="text-theme-text font-bold text-xs ml-2">Pull Latest Activities</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </Card>

      {/* STRAVA AUTOMATIONS PER SPORT TYPE */}
      <Card className="p-4 mb-6">
        <View className="flex-row items-center gap-2 pb-3 mb-3">
          <View className="w-2.5 h-2.5 rounded-full bg-[#ff6b6b]" />
          <Text className="text-theme-text font-bold text-sm">Strava Automations (Per Sport)</Text>
        </View>

        <Text className="text-theme-muted text-xs mb-4 leading-relaxed">
          Customize what details Spark AI Coach posts to your Strava captions for each individual sport type.
        </Text>

        {/* SPORT TYPE SELECTOR TABS */}
        <View className="flex-row bg-theme-bg p-1 rounded-xl mb-4">
          {SPORT_OPTIONS.map((sport) => {
            const isSelected = selectedSport === sport.id;
            return (
              <TouchableOpacity
                key={sport.id}
                onPress={() => setSelectedSport(sport.id)}
                className={`flex-1 py-2 rounded-lg flex-row items-center justify-center gap-1 ${
                  isSelected ? 'bg-orange-500 shadow-sm' : ''
                }`}
              >
                <Ionicons
                  name={sport.icon}
                  size={14}
                  color={isSelected ? '#FFFFFF' : '#8E8E93'}
                />
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? 'text-white' : 'text-theme-muted'
                  }`}
                >
                  {sport.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 4 STRAVA AUTOMATION TOGGLES FOR SELECTED SPORT */}
        <View className="space-y-3">
          <View className="flex-row items-center justify-between py-2 border-b border-theme-bg/60">
            <View className="flex-1 pr-3">
              <Text className="text-theme-text font-bold text-xs">Include Spark Score in Caption</Text>
              <Text className="text-theme-muted text-[10px]">Add calculated XP and TSS to caption</Text>
            </View>
            <Switch
              value={currentToggles.captionSparkScore}
              onValueChange={(val) => handleToggleChange('captionSparkScore', val)}
              trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
            />
          </View>

          <View className="flex-row items-center justify-between py-2 border-b border-theme-bg/60">
            <View className="flex-1 pr-3">
              <Text className="text-theme-text font-bold text-xs">Post AI Workout Summary Title</Text>
              <Text className="text-theme-muted text-[10px]">Auto-generate catchy workout title</Text>
            </View>
            <Switch
              value={currentToggles.titleSummary}
              onValueChange={(val) => handleToggleChange('titleSummary', val)}
              trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
            />
          </View>

          <View className="flex-row items-center justify-between py-2 border-b border-theme-bg/60">
            <View className="flex-1 pr-3">
              <Text className="text-theme-text font-bold text-xs">Include Muscle Strain Metrics</Text>
              <Text className="text-theme-muted text-[10px]">Share affected muscle group load</Text>
            </View>
            <Switch
              value={currentToggles.includeMuscleStrain}
              onValueChange={(val) => handleToggleChange('includeMuscleStrain', val)}
              trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
            />
          </View>

          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 pr-3">
              <Text className="text-theme-text font-bold text-xs">Include Fueling Recommendations</Text>
              <Text className="text-theme-muted text-[10px]">Post carb/protein intake advice</Text>
            </View>
            <Switch
              value={currentToggles.includeFueling}
              onValueChange={(val) => handleToggleChange('includeFueling', val)}
              trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
            />
          </View>
        </View>
      </Card>
    </View>
  );
};

