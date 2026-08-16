import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { LanguageSelector } from '../LanguageSelector';
import { CoachPersonaSettings } from '../CoachPersonaSettings';
import { useLanguage } from '../../context/LanguageContext';
import { useColorScheme } from 'nativewind';
import { gamificationApi } from '../../services/apiServices';
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
  const { colorScheme, toggleColorScheme } = useColorScheme();

  const [titles, setTitles] = useState<UserTitle[]>([
    { id: 1, title_name: '⚡ Spark Pioneer', is_equipped: 1, unlocked_at: new Date().toISOString() },
    { id: 2, title_name: '🚴 Hill Climber', is_equipped: 0, unlocked_at: new Date().toISOString() },
    { id: 3, title_name: '🔥 Streak Master', is_equipped: 0, unlocked_at: new Date().toISOString() },
  ]);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);

  useEffect(() => {
    fetchTitles();
  }, []);

  const fetchTitles = async () => {
    try {
      setLoadingTitles(true);
      const res = await gamificationApi.getGamificationData();
      if (res && res.titles && res.titles.length > 0) {
        setTitles(res.titles);
      }
    } catch (err) {
      // Keep default titles as fallbacks
    } finally {
      setLoadingTitles(false);
    }
  };

  const handleGenerateTitle = async () => {
    setGeneratingTitle(true);
    try {
      const res = await gamificationApi.generateTitle();
      if (res && res.title) {
        const titleData = res.title;
        const newTitleObj: UserTitle = {
          id: titleData.id || Date.now(),
          title_name: titleData.title || titleData.title_name || 'Master Athlete',
          description: titleData.description,
          is_equipped: (titleData as any).is_active || (titleData as any).is_equipped ? 1 : 0,
          unlocked_at: new Date().toISOString(),
        };
        setTitles((prev) => [newTitleObj, ...prev]);
        Alert.alert('New Title Generated!', `Unlocked: ${newTitleObj.title_name}`);
      } else {
        await fetchTitles();
      }
    } catch (err: any) {
      console.error('Title generation error:', err.message || err);
      Alert.alert('Error', 'Failed to generate new title. Please try again.');
    } finally {
      setGeneratingTitle(false);
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
    }
  };

  return (
    <View className="space-y-6">
      {/* USER PROFILE HEADER */}
      <View className="items-center my-4">
        <View className="w-24 h-24 rounded-full bg-theme-card items-center justify-center mb-3 shadow-sm">
          <Ionicons name="person" size={40} color="#8E8E93" />
        </View>
        <Text className="text-theme-text text-2xl font-bold">{username}</Text>
        {email ? <Text className="text-theme-muted text-sm mt-0.5">{email}</Text> : null}
        <View className="mt-2 px-3 py-1 bg-theme-accent/10 rounded-full">
          <Text className="text-theme-accent text-xs font-bold">
            {isSparkPlus ? '⚡ Spark+ Member' : 'Free Member'}
          </Text>
        </View>
      </View>

      {/* PERSONAL TITLES MANAGER */}
      <Text className="text-theme-muted font-bold text-xs uppercase tracking-wider mb-2 ml-1">
        Personal Titles & Accolades
      </Text>
      <Card className="p-4 mb-6">
        <View className="flex-row justify-between items-center pb-3 mb-3 border-b border-theme-border/20">
          <View className="flex-row items-center space-x-2">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent mr-2" />
            <Text className="text-theme-text font-bold text-sm">Active Athlete Title</Text>
          </View>
          <TouchableOpacity
            onPress={handleGenerateTitle}
            disabled={generatingTitle}
            className="px-3 py-1 bg-theme-accent/15 border border-theme-accent/30 rounded-lg flex-row items-center"
          >
            {generatingTitle ? (
              <ActivityIndicator size="small" color="#FF5A1F" />
            ) : (
              <Text className="text-theme-accent font-bold text-xs">+ Unlock Quest Title</Text>
            )}
          </TouchableOpacity>
        </View>

        {loadingTitles ? (
          <Text className="text-theme-muted text-xs italic text-center py-2">Loading titles...</Text>
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
