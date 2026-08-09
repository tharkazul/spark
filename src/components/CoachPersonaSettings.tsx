import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { Card } from './ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '../context/UserStore';
import { userApi } from '../services/apiServices';
import { API_BASE_URL } from '../constants/api';

const TONE_OPTIONS = [
  { label: 'Empathetic & Demanding (Default)', value: 'Empathetic but demanding elite endurance coach.' },
  { label: 'Strict Data Nerd', value: 'Strict with data, but with a dry, snarky British sense of humor.' },
  { label: 'Enthusiastic Cheerleader', value: 'Enthusiastic cheerleader, extremely positive and forgiving.' },
  { label: 'Configure own coach', value: 'custom' },
];

export const CoachPersonaSettings: React.FC = () => {
  const { user, refreshUser } = useUser();

  const [selectedTone, setSelectedTone] = useState<string>('Empathetic but demanding elite endurance coach.');
  const [coachName, setCoachName] = useState<string>('Spark');
  const [coachContext, setCoachContext] = useState<string>('');
  const [athleteContext, setAthleteContext] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingMood, setUploadingMood] = useState<string | null>(null);

  const isInitialized = useRef<boolean>(false);

  useEffect(() => {
    if (user && !isInitialized.current) {
      isInitialized.current = true;
      const toneVal = user.coach_tone || 'Empathetic but demanding elite endurance coach.';
      const isCustom = toneVal === 'custom' || toneVal === 'Configure own coach' || !TONE_OPTIONS.some(o => o.value === toneVal);
      setSelectedTone(isCustom ? 'custom' : toneVal);
      setCoachName(user.coach_name || 'Spark');
      setCoachContext(user.coach_context || '');
      setAthleteContext(user.athlete_context || '');
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await userApi.updateSettings({
        coach_tone: selectedTone,
        coach_name: coachName,
        coach_context: coachContext,
        athlete_context: athleteContext,
      });
      await refreshUser();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save coach settings.');
    } finally {
      setSaving(false);
    }
  };

  const handlePickAvatar = async (mood: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Access to photos is required to upload coach avatars.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets[0]?.uri) {
      const fileUri = result.assets[0].uri;
      setUploadingMood(mood);
      try {
        // Save current persona text fields to backend first so active draft text isn't lost
        await userApi.updateSettings({
          coach_tone: selectedTone,
          coach_name: coachName,
          coach_context: coachContext,
          athlete_context: athleteContext,
        });

        await userApi.uploadCoachAvatar(mood, fileUri);
        await refreshUser();
      } catch (err: any) {
        Alert.alert('Error', err.message || `Failed to upload ${mood} avatar.`);
      } finally {
        setUploadingMood(null);
      }
    }
  };

  const getFullAvatarUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  };

  const isCustomSelected = selectedTone === 'custom';

  return (
    <Card className="p-4 mb-6 space-y-4">
      <View className="flex-row items-center pb-3 mb-2">
        <Ionicons name="sparkles" size={20} color="#FF5A1F" />
        <Text className="text-base font-bold text-theme-text ml-2">Coach Persona & Settings</Text>
      </View>

      {/* Tone Picker */}
      <View className="mb-3">
        <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-2">
          Coach Tone & Style
        </Text>
        <View className="space-y-2">
          {TONE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setSelectedTone(opt.value)}
              className={`p-3 rounded-xl flex-row items-center justify-between mb-2 ${
                selectedTone === opt.value
                  ? 'bg-theme-accent/10'
                  : 'bg-theme-bg/50'
              }`}
            >
              <Text className={`text-sm ${selectedTone === opt.value ? 'font-bold text-theme-accent' : 'text-theme-text'}`}>
                {opt.label}
              </Text>
              {selectedTone === opt.value && (
                <Ionicons name="checkmark-circle" size={18} color="#FF5A1F" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Custom Coach Fields */}
      {isCustomSelected && (
        <View className="p-3 bg-theme-bg/60 rounded-xl space-y-3 mb-3">
          <View>
            <Text className="text-xs font-bold text-theme-muted uppercase mb-1">Coach Name</Text>
            <TextInput
              className="bg-theme-card rounded-xl p-3 text-theme-text text-sm"
              placeholder="Coach Name: XXX"
              placeholderTextColor="#8E8E93"
              value={coachName}
              onChangeText={setCoachName}
            />
          </View>

          <View className="mt-2">
            <Text className="text-xs font-bold text-theme-muted uppercase mb-1">Coach Context</Text>
            <TextInput
              className="bg-theme-card rounded-xl p-3 text-theme-text text-sm min-h-[70px]"
              placeholder="Coach Context: XXX"
              placeholderTextColor="#8E8E93"
              value={coachContext}
              onChangeText={setCoachContext}
              multiline
            />
          </View>

          {/* 3 Avatar Mood Uploaders */}
          <View className="mt-3">
            <Text className="text-xs font-bold text-theme-muted uppercase mb-1">
              Coach Avatars (3 Moods)
            </Text>
            <Text className="text-[11px] text-theme-muted mb-3">
              Upload custom images for Neutral, Hype, and Disappointed moods:
            </Text>

            <View className="flex-row justify-between">
              {/* Neutral */}
              <View className="items-center flex-1 mr-1">
                <Text className="text-[10px] font-bold text-theme-text mb-1">Neutral</Text>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('neutral')}
                  disabled={uploadingMood === 'neutral'}
                  className="w-16 h-16 rounded-full bg-theme-card items-center justify-center overflow-hidden mb-1"
                >
                  {user?.coach_avatar_neutral ? (
                    <Image source={{ uri: getFullAvatarUrl(user.coach_avatar_neutral)! }} className="w-full h-full" />
                  ) : (
                    <Ionicons name="camera-outline" size={20} color="#8E8E93" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('neutral')}
                  className="bg-theme-accent/15 px-2 py-1 rounded"
                >
                  <Text className="text-[10px] font-bold text-theme-accent">
                    {uploadingMood === 'neutral' ? '...' : 'Upload'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Hype */}
              <View className="items-center flex-1 mx-1">
                <Text className="text-[10px] font-bold text-theme-text mb-1">Hype</Text>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('hype')}
                  disabled={uploadingMood === 'hype'}
                  className="w-16 h-16 rounded-full bg-theme-card items-center justify-center overflow-hidden mb-1"
                >
                  {user?.coach_avatar_hype ? (
                    <Image source={{ uri: getFullAvatarUrl(user.coach_avatar_hype)! }} className="w-full h-full" />
                  ) : (
                    <Ionicons name="flame-outline" size={20} color="#8E8E93" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('hype')}
                  className="bg-theme-accent/15 px-2 py-1 rounded"
                >
                  <Text className="text-[10px] font-bold text-theme-accent">
                    {uploadingMood === 'hype' ? '...' : 'Upload'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Disappointed */}
              <View className="items-center flex-1 ml-1">
                <Text className="text-[10px] font-bold text-theme-text mb-1">Disappointed</Text>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('disappointed')}
                  disabled={uploadingMood === 'disappointed'}
                  className="w-16 h-16 rounded-full bg-theme-card items-center justify-center overflow-hidden mb-1"
                >
                  {user?.coach_avatar_disappointed ? (
                    <Image source={{ uri: getFullAvatarUrl(user.coach_avatar_disappointed)! }} className="w-full h-full" />
                  ) : (
                    <Ionicons name="sad-outline" size={20} color="#8E8E93" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('disappointed')}
                  className="bg-theme-accent/15 px-2 py-1 rounded"
                >
                  <Text className="text-[10px] font-bold text-theme-accent">
                    {uploadingMood === 'disappointed' ? '...' : 'Upload'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Athlete Context Field */}
      <View className="mt-2">
        <Text className="text-xs font-bold text-theme-muted uppercase mb-1">
          Athlete Background Context
        </Text>
        <TextInput
          className="bg-theme-card rounded-xl p-3 text-theme-text text-sm min-h-[70px]"
          placeholder="e.g. Training for marathon, has 2 kids..."
          placeholderTextColor="#8E8E93"
          value={athleteContext}
          onChangeText={setAthleteContext}
          multiline
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        className="bg-theme-accent py-3.5 rounded-xl items-center flex-row justify-center mt-3"
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="save-outline" size={18} color="#FFF" />
            <Text className="text-white font-bold text-base ml-2">Save Coach Persona</Text>
          </>
        )}
      </TouchableOpacity>
    </Card>
  );
};
