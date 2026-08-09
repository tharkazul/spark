import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';

interface ConnectionsTabProps {
  onOpenGarminModal: () => void;
  onOpenStravaModal: () => void;
}

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

  // Strava Automation Toggles
  const [captionSparkScore, setCaptionSparkScore] = useState(true);
  const [titleSummary, setTitleSummary] = useState(true);
  const [includeMuscleStrain, setIncludeMuscleStrain] = useState(true);
  const [includeFueling, setIncludeFueling] = useState(false);

  const handleSyncGarmin = async () => {
    setGarminSyncing(true);
    try {
      await syncGarmin();
      Alert.alert('Garmin Sync', 'Garmin sync completed successfully!');
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Garmin sync failed.');
    } finally {
      setGarminSyncing(false);
    }
  };

  const handleSyncStrava = async () => {
    setStravaSyncing(true);
    try {
      await syncStrava();
      Alert.alert('Strava Sync', 'Latest Strava activities pulled successfully!');
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Strava sync failed.');
    } finally {
      setStravaSyncing(false);
    }
  };

  return (
    <View className="space-y-6">
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

      {/* STRAVA AUTOMATIONS */}
      <Card className="p-4 mb-6">
        <View className="flex-row items-center gap-2 pb-3 mb-3">
          <View className="w-2.5 h-2.5 rounded-full bg-[#ff6b6b]" />
          <Text className="text-theme-text font-bold text-sm">Strava Automations</Text>
        </View>

        <Text className="text-theme-muted text-xs mb-4 leading-relaxed">
          All recorded activities are universally analyzed by your AI Coach. Use the controls below to customize what details Spark shares to your Strava activity captions and workout titles.
        </Text>

        <View className="space-y-3">
          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 pr-3">
              <Text className="text-theme-text font-bold text-xs">Include Spark Score in Caption</Text>
              <Text className="text-theme-muted text-[10px]">Add calculated XP and TSS to caption</Text>
            </View>
            <Switch
              value={captionSparkScore}
              onValueChange={setCaptionSparkScore}
              trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
            />
          </View>

          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 pr-3">
              <Text className="text-theme-text font-bold text-xs">Post AI Workout Summary Title</Text>
              <Text className="text-theme-muted text-[10px]">Auto-generate catchy workout title</Text>
            </View>
            <Switch
              value={titleSummary}
              onValueChange={setTitleSummary}
              trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
            />
          </View>

          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 pr-3">
              <Text className="text-theme-text font-bold text-xs">Include Muscle Strain Metrics</Text>
              <Text className="text-theme-muted text-[10px]">Share affected muscle group load</Text>
            </View>
            <Switch
              value={includeMuscleStrain}
              onValueChange={setIncludeMuscleStrain}
              trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
            />
          </View>

          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 pr-3">
              <Text className="text-theme-text font-bold text-xs">Include Fueling Recommendations</Text>
              <Text className="text-theme-muted text-[10px]">Post carb/protein intake advice</Text>
            </View>
            <Switch
              value={includeFueling}
              onValueChange={setIncludeFueling}
              trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
            />
          </View>
        </View>
      </Card>
    </View>
  );
};
