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
      const newQuest = await gamificationApi.generateQuest();
      const newTitleName = `✨ ${newQuest?.title || 'Master Athlete'}`;
      const newTitleObj: UserTitle = {
        id: Date.now(),
        title_name: newTitleName,
        is_equipped: 0,
        unlocked_at: new Date().toISOString(),
      };
      setTitles((prev) => [...prev, newTitleObj]);
      Alert.alert('New Title Generated!', `Unlocked: ${newTitleName}`);
    } catch (err: any) {
      Alert.alert('Title Generated', 'Unlocked: 🏆 Endurance Legend!');
      setTitles((prev) => [
        ...prev,
        {
          id: Date.now(),
          title_name: '🏆 Endurance Legend',
          is_equipped: 0,
          unlocked_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setGeneratingTitle(false);
    }
  };

  const handleEquipTitle = (id: number) => {
    setTitles((prev) =>
      prev.map((t) => ({
        ...t,
        is_equipped: t.id === id ? 1 : 0,
      }))
    );
  };

  return (
    <View className="space-y-6">
      {/* USER PROFILE HEADER */}
      <View className="items-center my-4">
        <View className="w-24 h-24 rounded-full bg-theme-card border-2 border-theme-accent items-center justify-center mb-3 shadow-sm">
          <Ionicons name="person" size={40} color="#8E8E93" />
        </View>
        <Text className="text-theme-text text-2xl font-bold">{username}</Text>
        {email ? <Text className="text-theme-muted text-sm mt-0.5">{email}</Text> : null}
        <View className="mt-2 px-3 py-1 bg-theme-accent/10 border border-theme-accent/30 rounded-full">
          <Text className="text-theme-accent text-xs font-bold">
            {isSparkPlus ? '⚡ Spark+ Member' : 'Free Member'}
          </Text>
        </View>
      </View>

      {/* TITLE CUPBOARD */}
      <Card className="p-4 mb-6">
        <View className="flex-row justify-between items-center pb-3 mb-3 border-b border-theme-border">
          <View className="flex-row items-center gap-2">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent" />
            <Text className="text-theme-text font-bold text-sm">Title Cupboard</Text>
          </View>
          <TouchableOpacity
            onPress={handleGenerateTitle}
            disabled={generatingTitle}
            className="px-3 py-1 bg-theme-bg border border-theme-accent rounded-lg flex-row items-center"
          >
            {generatingTitle ? (
              <ActivityIndicator size="small" color="#FF5A1F" />
            ) : (
              <Text className="text-theme-accent font-bold text-xs">+ Generate Title</Text>
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
                className={`flex-row items-center justify-between p-3 rounded-xl border ${
                  item.is_equipped
                    ? 'bg-theme-accent/10 border-theme-accent'
                    : 'bg-theme-bg border-theme-border'
                }`}
              >
                <Text className="text-theme-text font-bold text-sm">{item.title_name}</Text>
                {item.is_equipped ? (
                  <View className="px-2 py-0.5 bg-theme-accent rounded">
                    <Text className="text-white text-[10px] font-bold">Equipped</Text>
                  </View>
                ) : (
                  <Text className="text-theme-muted text-xs">Equip</Text>
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
