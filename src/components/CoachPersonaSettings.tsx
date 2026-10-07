import { BrandColors } from '@/constants/theme';
import { RookaMark } from './ui/RookaPoints';
import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/use-theme';
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
import { useLanguage } from '../context/LanguageContext';

const CANONICAL_TONE_VALUES = {
  default: 'Empathetic but demanding elite endurance coach.',
  dataNerd: 'Strict with data, but with a dry, snarky British sense of humor.',
  cheerleader: 'Enthusiastic cheerleader, extremely positive and forgiving.',
  custom: 'custom',
};

export const CoachPersonaSettings: React.FC = () => {
  const theme = useTheme();
  const { user, refreshUser, updateUser } = useUser();
  const { t } = useLanguage();

  const toneOptions = React.useMemo(() => [
    { label: t('coachPersona.empatheticDemanding'), value: CANONICAL_TONE_VALUES.default },
    { label: t('coachPersona.strictDataNerd'), value: CANONICAL_TONE_VALUES.dataNerd },
    { label: t('coachPersona.enthusiasticCheerleader'), value: CANONICAL_TONE_VALUES.cheerleader },
    { label: t('coachPersona.configureOwnCoach'), value: CANONICAL_TONE_VALUES.custom, premium: true },
  ], [t]);

  const genderOptions = React.useMemo(() => [
    { label: t('coachPersona.male'), value: 'Male', icon: 'male-outline' },
    { label: t('coachPersona.female'), value: 'Female', icon: 'female-outline' },
    { label: t('coachPersona.preferNotToShare'), value: 'Prefer not to share', icon: 'shield-outline' },
  ], [t]);

  const [selectedTone, setSelectedTone] = useState<string>(CANONICAL_TONE_VALUES.default);
  const [coachName, setCoachName] = useState<string>('');
  const [coachContext, setCoachContext] = useState<string>('');
  const [athleteContext, setAthleteContext] = useState<string>('');
  const [gender, setGender] = useState<string>(user?.gender || 'Prefer not to share');
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  // Autosave: only after the athlete edits something (not when the form is first filled)
  const dirtyRef = useRef<boolean>(false);
  const [uploadingMood, setUploadingMood] = useState<string | null>(null);

  const isInitialized = useRef<boolean>(false);

  useEffect(() => {
    if (user && !isInitialized.current) {
      isInitialized.current = true;
      const toneVal = user.coach_tone || CANONICAL_TONE_VALUES.default;
      const isCustom = toneVal === 'custom' || toneVal === 'Configure own coach' || !Object.values(CANONICAL_TONE_VALUES).includes(toneVal);
      setSelectedTone(isCustom ? 'custom' : toneVal);
      setCoachName(user.coach_name && user.coach_name.toLowerCase() !== 'rooka' ? user.coach_name : '');
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
        coach_name: coachName.trim() || 'Rooka',
        coach_context: coachContext,
        athlete_context: athleteContext,
        gender: gender,
      });
      await refreshUser();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      console.error('Coach settings save error:', err);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = setTimeout(() => {
      dirtyRef.current = false;
      handleSave();
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTone, coachName, coachContext, athleteContext]);

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
          coach_name: coachName.trim() || 'Rooka',
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
    <Card className="p-4 mb-6 gap-y-4">
      <View className="flex-row items-center pb-3 mb-2">
        <RookaMark size={20} color={theme.tint} />
        <Text className="text-base font-bold text-theme-text ml-2">{t('coachPersona.title')}</Text>
      </View>

      {/* Tone Picker */}
      <View className="mb-3">
        <Text className="text-xs font-bold text-theme-muted mb-2">
          {t('coachPersona.coachToneAndStyle')}
        </Text>
        <View className="gap-y-2">
          {toneOptions.map((opt) => {
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
                  dirtyRef.current = true;
                  setSelectedTone(opt.value);
                }}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                className={`p-3 rounded-xl flex-row items-center justify-between mb-2 border ${
                  isSelected
                    ? 'bg-theme-accent/10 border-theme-accent'
                    : 'bg-theme-card border-theme-border'
                }`}
              >
                <View className="flex-row items-center flex-1">
                  {avatarSrc ? (
                    <View className={`w-8 h-8 rounded-full overflow-hidden mr-3 bg-theme-bg border ${isSelected ? 'border-theme-accent' : 'border-theme-border'}`}>
                      <Image
                        source={avatarSrc}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    </View>
                  ) : (
                    <View className="w-8 h-8 rounded-full items-center justify-center mr-3 bg-theme-accent/20">
                      <RookaMark size={16} color={BrandColors.primary} />
                    </View>
                  )}
                  <Text className={`text-sm flex-1 text-theme-text ${isSelected ? 'font-bold' : 'font-medium'}`}>
                    {opt.label}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={18} color={theme.tint} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Custom Coach Fields */}
      {isCustomSelected && (
        <View className="p-3 bg-theme-bg rounded-xl gap-y-3 mb-3 border border-theme-border">
          <View>
            <Text className="text-xs font-bold text-theme-muted mb-1">{t('coachPersona.coachName')}</Text>
            <TextInput
              className="bg-theme-bg border border-theme-border rounded-control p-3 text-theme-text text-sm"
              placeholder={t('zonesExtra.coachNamePlaceholder')}
              placeholderTextColor={theme.textSecondary}
              value={coachName}
              onChangeText={(v) => { dirtyRef.current = true; setCoachName(v); }}
            />
          </View>

          <View className="mt-2">
            <Text className="text-xs font-bold text-theme-muted mb-1">{t('coachPersona.coachContext')}</Text>
            <TextInput
              className="bg-theme-bg border border-theme-border rounded-control p-3 text-theme-text text-sm min-h-[70px]"
              placeholder={t('zonesExtra.coachContextPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              value={coachContext}
              onChangeText={(v) => { dirtyRef.current = true; setCoachContext(v); }}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* 3 Avatar Mood Uploaders */}
          <View className="mt-3">
            <Text className="text-xs font-bold text-theme-muted mb-1">
              {t('coachPersona.coachAvatars')}
            </Text>
            <Text className="text-xs text-theme-muted mb-3">
              {t('coachPersona.coachAvatarsDesc')}
            </Text>

            <View className="flex-row justify-between">
              {/* Neutral */}
              <View className="items-center flex-1 mr-1">
                <Text className="text-xs font-bold text-theme-text mb-1">{t('coachPersona.neutral')}</Text>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('neutral')}
                  disabled={uploadingMood === 'neutral'}
                  className="w-16 h-16 rounded-full bg-theme-card items-center justify-center overflow-hidden mb-1"
                >
                  {user?.coach_avatar_neutral ? (
                    <Image source={{ uri: getFullAvatarUrl(user.coach_avatar_neutral)! }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Ionicons name="camera-outline" size={20} color={theme.textSecondary} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('neutral')}
                  className="bg-theme-accent/15 px-2 py-1 rounded"
                >
                  <Text className="text-xs font-bold text-theme-accent">
                    {uploadingMood === 'neutral' ? '...' : t('coachPersona.upload')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Hype */}
              <View className="items-center flex-1 mx-1">
                <Text className="text-xs font-bold text-theme-text mb-1">{t('coachPersona.hype')}</Text>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('hype')}
                  disabled={uploadingMood === 'hype'}
                  className="w-16 h-16 rounded-full bg-theme-card items-center justify-center overflow-hidden mb-1"
                >
                  {user?.coach_avatar_hype ? (
                    <Image source={{ uri: getFullAvatarUrl(user.coach_avatar_hype)! }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Ionicons name="flame-outline" size={20} color={theme.textSecondary} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('hype')}
                  className="bg-theme-accent/15 px-2 py-1 rounded"
                >
                  <Text className="text-xs font-bold text-theme-accent">
                    {uploadingMood === 'hype' ? '...' : t('coachPersona.upload')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Disappointed */}
              <View className="items-center flex-1 ml-1">
                <Text className="text-xs font-bold text-theme-text mb-1">{t('coachPersona.disappointed')}</Text>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('disappointed')}
                  disabled={uploadingMood === 'disappointed'}
                  className="w-16 h-16 rounded-full bg-theme-card items-center justify-center overflow-hidden mb-1"
                >
                  {user?.coach_avatar_disappointed ? (
                    <Image source={{ uri: getFullAvatarUrl(user.coach_avatar_disappointed)! }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Ionicons name="sad-outline" size={20} color={theme.textSecondary} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickAvatar('disappointed')}
                  className="bg-theme-accent/15 px-2 py-1 rounded"
                >
                  <Text className="text-xs font-bold text-theme-accent">
                    {uploadingMood === 'disappointed' ? '...' : t('coachPersona.upload')}
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
          {t('coachPersona.athleteGender')}
        </Text>
        <View className="flex-row gap-2">
          {genderOptions.map((opt) => {
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
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                className={`flex-1 p-3 rounded-xl flex-row items-center justify-center gap-x-1.5 border ${
                  isSelected
                    ? 'bg-theme-accent/10 border-theme-accent'
                    : 'bg-theme-card border-theme-border'
                }`}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={15}
                  color={isSelected ? theme.tint : '#8E9BA4'}
                  style={{ marginRight: 4 }}
                />
                <Text
                  className={`text-xs font-bold text-center flex-shrink ${
                    isSelected ? 'text-theme-accent' : 'text-theme-text'
                  }`}
                  numberOfLines={2}
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
          {t('coachPersona.athleteBackgroundContext')}
        </Text>
        <TextInput
          className="bg-theme-bg border border-theme-border rounded-control p-3 text-theme-text text-sm min-h-[70px]"
          placeholder={t('coachPersona.athleteContextPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          value={athleteContext}
          onChangeText={(v) => { dirtyRef.current = true; setAthleteContext(v); }}
          multiline
          textAlignVertical="top"
        />
      </View>

      {/* Autosave status */}
      {(saving || savedSuccess) && (
        <View className="flex-row items-center justify-center gap-x-1.5 mt-1">
          {saving ? (
            <ActivityIndicator size="small" color={theme.tint} />
          ) : (
            <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
          )}
          <Text className={`text-xs font-bold ${saving ? 'text-theme-muted' : 'text-semantic-success'}`}>
            {saving ? t('goals.savingGoals', 'Saving…') : t('goals.goalsSavedSuccess', 'Saved')}
          </Text>
        </View>
      )}
    </Card>
  );
};
