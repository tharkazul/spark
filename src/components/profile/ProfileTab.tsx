import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { LanguageSelector } from '../LanguageSelector';
import { CoachPersonaSettings } from '../CoachPersonaSettings';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useColorScheme } from 'nativewind';
import { userApi, gamificationApi } from '../../services/apiServices';
import { API_BASE_URL } from '../../constants/api';
import { UserTitle } from '../../types/gamification';

interface ProfileTabProps {
  username: string;
  email?: string;
  isSparkPlus: boolean;
  renderSettingRow: (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    value?: React.ReactNode,
    onPress?: () => void
  ) => React.ReactNode;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  username,
  email,
  isSparkPlus,
  renderSettingRow,
}) => {
  const { t } = useLanguage();
  const { user, refreshUser } = useUser();
  const { colorScheme, toggleColorScheme } = useColorScheme();

  const [titles, setTitles] = useState<UserTitle[]>([]);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    fetchTitles();
  }, []);

  const getFullPhotoUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  };

  const handlePickProfilePicture = async () => {
    try {
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
        setUploadingPhoto(true);
        try {
          await userApi.uploadProfilePicture(fileUri);
          await refreshUser();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (err: any) {
          console.error('Failed to upload profile picture:', err);
        } finally {
          setUploadingPhoto(false);
        }
      }
    } catch (err: any) {
      console.error('Image picker error:', err);
    }
  };

  const fetchTitles = async () => {
    try {
      setLoadingTitles(true);
      const res = await gamificationApi.getGamificationData();
      if (res && Array.isArray(res.titles)) {
        setTitles(res.titles);
      } else {
        setTitles([]);
      }
    } catch (err) {
      setTitles([]);
    } finally {
      setLoadingTitles(false);
    }
  };

  const handleEquipTitle = async (id: number | string) => {
    try {
      setTitles((prev) =>
        prev.map((t) => ({
          ...t,
          is_equipped: t.id === id ? (t.is_equipped ? 0 : 1) : 0,
        }))
      );
      await gamificationApi.equipTitle(id);
      await fetchTitles();
    } catch (err: any) {
      console.error('Equip title error:', err.message || err);
      await fetchTitles();
    }
  };

  const profilePicUrl = getFullPhotoUrl(user?.profile_picture_url);

  const tier = user?.subscription_tier;
  let tierLabel = 'Free Member';
  if (tier === 'admin') {
    tierLabel = '⚡ Admin Member';
  } else if (tier === 'premium') {
    tierLabel = '⚡ Spark+ Premium';
  } else if (tier === 'spark_plus' || tier === 'subscription') {
    tierLabel = '⚡ Spark+ Member';
  }

  return (
    <View className="space-y-6">
      {/* USER PROFILE HEADER */}
      <View className="items-center my-4">
        <View className="relative mb-3">
          <View className="w-24 h-24 rounded-full bg-theme-card items-center justify-center shadow-sm overflow-hidden border-2 border-theme-border/60">
            {profilePicUrl ? (
              <Image
                source={{ uri: profilePicUrl }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="person" size={42} color="#8E8E93" />
            )}
            {uploadingPhoto && (
              <View className="absolute inset-0 bg-black/50 items-center justify-center">
                <ActivityIndicator size="small" color="#FF5A1F" />
              </View>
            )}
          </View>

          {/* Edit Camera Button Overlay */}
          <TouchableOpacity
            onPress={handlePickProfilePicture}
            disabled={uploadingPhoto}
            activeOpacity={0.8}
            className="absolute bottom-0 right-0 bg-theme-accent w-8 h-8 rounded-full items-center justify-center border-2 border-theme-bg shadow-md"
          >
            <Ionicons name="camera" size={15} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text className="text-theme-text text-2xl font-bold">{username}</Text>
        {email ? <Text className="text-theme-muted text-sm mt-0.5">{email}</Text> : null}
        <View className="mt-2 px-3 py-1 bg-theme-accent/10 rounded-full">
          <Text className="text-theme-accent text-xs font-bold">
            {tierLabel}
          </Text>
        </View>
      </View>

      {/* PERSONAL TITLES MANAGER */}
      <Text className="text-theme-muted font-bold text-xs uppercase tracking-wider mb-2 ml-1">
        Personal Titles & Accolades
      </Text>
      <Card className="p-4 mb-6">
        <View className="flex-row items-center pb-3 mb-3 border-b border-theme-border/20">
          <View className="w-2.5 h-2.5 rounded-full bg-theme-accent mr-2" />
          <Text className="text-theme-text font-bold text-sm">Personal Titles</Text>
        </View>

        {loadingTitles ? (
          <Text className="text-theme-muted text-xs italic text-center py-2">Loading titles...</Text>
        ) : titles.length === 0 ? (
          <View className="py-4 items-center justify-center">
            <Ionicons name="ribbon-outline" size={24} color="#8E8E93" style={{ marginBottom: 6 }} />
            <Text className="text-theme-muted text-xs italic text-center">
              No titles earned yet
            </Text>
          </View>
        ) : (
          <View className="space-y-2">
            {titles.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => handleEquipTitle(item.id)}
                className={`flex-row items-center justify-between p-3 rounded-xl mb-1.5 ${
                  item.is_equipped
                    ? 'bg-theme-accent/15 border border-theme-accent/40'
                    : 'bg-theme-bg'
                }`}
              >
                <View className="flex-row items-center space-x-2">
                  <Ionicons
                    name={item.is_equipped ? 'ribbon' : 'ribbon-outline'}
                    size={18}
                    color={item.is_equipped ? '#FF5A1F' : '#8E9BA4'}
                    style={{ marginRight: 6 }}
                  />
                  <Text className="text-theme-text font-bold text-sm">{item.title_name}</Text>
                </View>

                {item.is_equipped ? (
                  <View className="px-2.5 py-1 bg-theme-accent rounded-full">
                    <Text className="text-white text-[10px] font-bold">Equipped</Text>
                  </View>
                ) : (
                  <Text className="text-theme-muted text-xs font-semibold">Tap to Equip</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Card>

      {/* LANGUAGE SETTINGS */}
      <Text className="text-theme-muted font-bold text-xs uppercase tracking-wider mb-2 ml-1">
        {t('profile.languageSettingTitle')}
      </Text>
      <Card className="p-4 mb-6">
        <Text className="text-theme-muted text-xs mb-3">
          {t('profile.languageSettingDesc')}
        </Text>
        <LanguageSelector />
      </Card>

      {/* COACH PERSONA SETTINGS */}
      <CoachPersonaSettings />

      {/* APP PREFERENCES */}
      <Text className="text-theme-muted font-bold text-xs uppercase tracking-wider mb-2 ml-1">
        {t('nav.profile')} Preferences
      </Text>
      <Card className="p-2 mb-6">
        {renderSettingRow(
          'moon',
          t('profile.darkMode'),
          <Switch
            value={colorScheme === 'dark'}
            onValueChange={toggleColorScheme}
            trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }}
          />
        )}
        {renderSettingRow(
          'notifications',
          t('profile.pushNotifications'),
          <Switch value={true} trackColor={{ false: '#DDE3E9', true: '#FF5A1F' }} />
        )}
      </Card>
    </View>
  );
};
