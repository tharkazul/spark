import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Card } from './ui/Card';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useUser } from '../context/UserStore';
import { userApi } from '../services/apiServices';
import { API_BASE_URL } from '../constants/api';
import { canConfigureCoach } from '../utils/permissions';
import { getCoachAvatarSource } from '../utils/avatarUtils';

const TONE_OPTIONS = [
  { label: 'Empathetic & Demanding (Default)', value: 'Empathetic but demanding elite endurance coach.' },
  { label: 'Strict Data Nerd', value: 'Strict with data, but with a dry, snarky British sense of humor.' },
  { label: 'Enthusiastic Cheerleader', value: 'Enthusiastic cheerleader, extremely positive and forgiving.' },
  { label: 'Configure own coach (Premium)', value: 'custom', premium: true },
];

const GENDER_OPTIONS = [
  { label: 'Male', value: 'Male', icon: 'male-outline' },
  { label: 'Female', value: 'Female', icon: 'female-outline' },
  { label: 'Prefer not to share', value: 'Prefer not to share', icon: 'shield-outline' },
];

export const CoachPersonaSettings: React.FC = () => {
  const { user, refreshUser, updateUser } = useUser();

  const [selectedTone, setSelectedTone] = useState<string>('Empathetic but demanding elite endurance coach.');
  const [coachName, setCoachName] = useState<string>('Rooka');
  const [coachContext, setCoachContext] = useState<string>('');
  const [athleteContext, setAthleteContext] = useState<string>('');
  const [gender, setGender] = useState<string>(user?.gender || 'Prefer not to share');
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingMood, setUploadingMood] = useState<string | null>(null);

  const isInitialized = useRef<boolean>(false);

  useEffect(() => {
    if (user && !isInitialized.current) {
      isInitialized.current = true;
      const toneVal = user.coach_tone || 'Empathetic but demanding elite endurance coach.';
      const isCustom = toneVal === 'custom' || toneVal === 'Configure own coach' || !TONE_OPTIONS.some(o => o.value === toneVal);
      setSelectedTone(isCustom ? 'custom' : toneVal);
      setCoachName(user.coach_name || 'Rooka');
      setCoachContext(user.coach_context || '');
      setAthleteContext(user.athlete_context || '');
      setGender(user.gender || 'Prefer not to share');
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUser({
        coach_tone: selectedTone,
        coach_name: coachName,
        coach_context: coachContext,
        athlete_context: athleteContext,
        gender: gender,
      });
      await refreshUser();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Coach settings save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePickAvatar = async (mood: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: any) {
        console.error('Avatar upload error:', err);
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

  const hasPremium = canConfigureCoach(user?.subscription_tier);
  const isCustomSelected = selectedTone === 'custom' && hasPremium;

  return (
    <Card className="p-4 mb-6 space-y-4">
      <View className="flex-row items-center pb-3 mb-2">
        <Ionicons name="sparkles" size={20} color="#FF5F3B" />
        <Text className="text-base font-bold text-theme-text ml-2">Coach Persona & Settings</Text>
      </View>

      {/* Tone Picker */}
      <View className="mb-3">
        <Text className="text-xs font-bold text-theme-muted mb-2">
          Coach Tone & Style
        </Text>
        <View className="space-y-2">
          {TONE_OPTIONS.map((opt) => {
            const isPremiumOption = (opt as any).premium;
            if (isPremiumOption && !hasPremium) {
              return null;
            }

            const isSelected = selectedTone === opt.value;
            const avatarSrc = opt.value === 'custom' ? null : getCoachAvatarSource(opt.value, 'default');

            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedTone(opt.value);
                }}
                activeOpacity={0.7}
                className={`p-3 rounded-xl flex-row items-center justify-between mb-2 ${
                  isSelected
                    ? 'bg-theme-accent'
                    : 'bg-theme-bg opacity-60'
                }`}
              >
                <View className="flex-row items-center flex-1">
                  {avatarSrc ? (
                    <View className={`w-8 h-8 rounded-full overflow-hidden mr-3 bg-theme-bg ${isSelected ? 'border border-white/40' : 'border border-theme-border'}`}>
                      <Image
                        source={avatarSrc}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    </View>
                  ) : (
                    <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${isSelected ? 'bg-white/20' : 'bg-theme-accent/20'}`}>
                      <Ionicons name="sparkles" size={16} color={isSelected ? '#FFFFFF' : '#FF5F3B'} />
                    </View>
                  )}
                  <Text className={`text-sm flex-1 ${isSelected ? 'font-bold text-white' : 'text-theme-text font-medium'}`}>
                    {opt.label}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Custom Coach Fields */}
      {isCustomSelected && (
        <View className="p-3 bg-theme-bg opacity-60 rounded-xl space-y-3 mb-3">
          <View>
            <Text className="text-xs font-bold text-theme-muted mb-1">Coach Name</Text>
            <TextInput
              className="bg-theme-card rounded-xl p-3 text-theme-text text-sm"
              placeholder="Coach Name: XXX"
              placeholderTextColor="#8E8E93"
              value={coachName}
              onChangeText={setCoachName}
            />
          </View>

          <View className="mt-2">
            <Text className="text-xs font-bold text-theme-muted mb-1">Coach Context</Text>
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
            <Text className="text-xs font-bold text-theme-muted mb-1">
              Coach Avatars (3 Moods)
            </Text>
            <Text className="text-xs text-theme-muted mb-3">
              Upload custom images for Neutral, Hype, and Disappointed moods:
            </Text>

            <View className="flex-row justify-between">
              {/* Neutral */}
              <View className="items-center flex-1 mr-1">
                <Text className="text-xs font-bold text-theme-text mb-1">Neutral</Text>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('neutral')}
                  disabled={uploadingMood === 'neutral'}
                  className="w-16 h-16 rounded-full bg-theme-card items-center justify-center overflow-hidden mb-1"
                >
                  {user?.coach_avatar_neutral ? (
                    <Image source={{ uri: getFullAvatarUrl(user.coach_avatar_neutral)! }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Ionicons name="camera-outline" size={20} color="#8E8E93" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('neutral')}
                  className="bg-theme-accent/15 px-2 py-1 rounded"
                >
                  <Text className="text-xs font-bold text-theme-accent">
                    {uploadingMood === 'neutral' ? '...' : 'Upload'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Hype */}
              <View className="items-center flex-1 mx-1">
                <Text className="text-xs font-bold text-theme-text mb-1">Hype</Text>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('hype')}
                  disabled={uploadingMood === 'hype'}
                  className="w-16 h-16 rounded-full bg-theme-card items-center justify-center overflow-hidden mb-1"
                >
                  {user?.coach_avatar_hype ? (
                    <Image source={{ uri: getFullAvatarUrl(user.coach_avatar_hype)! }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Ionicons name="flame-outline" size={20} color="#8E8E93" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('hype')}
                  className="bg-theme-accent/15 px-2 py-1 rounded"
                >
                  <Text className="text-xs font-bold text-theme-accent">
                    {uploadingMood === 'hype' ? '...' : 'Upload'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Disappointed */}
              <View className="items-center flex-1 ml-1">
                <Text className="text-xs font-bold text-theme-text mb-1">Disappointed</Text>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('disappointed')}
                  disabled={uploadingMood === 'disappointed'}
                  className="w-16 h-16 rounded-full bg-theme-card items-center justify-center overflow-hidden mb-1"
                >
                  {user?.coach_avatar_disappointed ? (
                    <Image source={{ uri: getFullAvatarUrl(user.coach_avatar_disappointed)! }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Ionicons name="sad-outline" size={20} color="#8E8E93" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('disappointed')}
                  className="bg-theme-accent/15 px-2 py-1 rounded"
                >
                  <Text className="text-xs font-bold text-theme-accent">
                    {uploadingMood === 'disappointed' ? '...' : 'Upload'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Gender Selection Field */}
      <View className="mt-3 mb-2">
        <Text className="text-xs font-bold text-theme-muted mb-2">
          Athlete Gender
        </Text>
        <View className="flex-row gap-2">
          {GENDER_OPTIONS.map((opt) => {
            const isSelected = gender === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => {
                  Haptics.selectionAsync();
                  setGender(opt.value);
                  updateUser({ gender: opt.value }).catch(() => {});
                }}
                activeOpacity={0.7}
                className={`flex-1 p-3 rounded-xl flex-row items-center justify-center space-x-1.5 ${
                  isSelected
                    ? 'bg-theme-accent'
                    : 'bg-theme-bg opacity-60'
                }`}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={15}
                  color={isSelected ? '#FFFFFF' : '#8E9BA4'}
                  style={{ marginRight: 4 }}
                />
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? 'text-white' : 'text-theme-text'
                  }`}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Athlete Context Field */}
      <View className="mt-2">
        <Text className="text-xs font-bold text-theme-muted mb-1">
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
