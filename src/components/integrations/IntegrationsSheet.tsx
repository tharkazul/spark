import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '@/hooks/use-theme';
import { useUser } from '../../context/UserStore';
import { API_BASE_URL } from '../../constants/api';
import { integrationsApi } from '../../services/apiServices';
import { BottomSheetModal } from '../ui/BottomSheetModal';

interface IntegrationsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export const IntegrationsSheet: React.FC<IntegrationsSheetProps> = ({ visible, onClose }) => {
  const theme = useTheme();
  const { user, refreshUser } = useUser();
  const { t } = useLanguage();

  const isGarminActive = !!(user?.garmin_connected || (user as any)?.garmin_username);
  const isStravaActive = !!(user?.strava_connected || (user as any)?.strava_athlete_id);

  // Garmin state
  const [showGarminFields, setShowGarminFields] = useState(false);
  const [garminUser, setGarminUser] = useState('');
  const [garminPass, setGarminPass] = useState('');
  const [garminLoading, setGarminLoading] = useState(false);
  const [garminError, setGarminError] = useState<string | null>(null);

  // Strava state
  const [stravaLoading, setStravaLoading] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (showGarminFields) {
        scrollToBottom();
      }
    });
    return () => sub.remove();
  }, [showGarminFields]);

  // Garmin connect handler
  const handleConnectGarmin = async () => {
    if (!garminUser.trim() || !garminPass.trim()) {
      setGarminError(t('onboarding.garminFillError'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setGarminLoading(true);
    setGarminError(null);
    try {
      const res = await integrationsApi.saveGarminCredentials({
        garminUsername: garminUser.trim(),
        garminPassword: garminPass.trim(),
      });
      await refreshUser();
      setGarminUser('');
      setGarminPass('');
      setShowGarminFields(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        t('onboarding.garminTitle'),
        res?.message || t('onboarding.garminSavedSuccess')
      );
    } catch (err: any) {
      const msg = err?.message || 'Failed to save Garmin credentials.';
      setGarminError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setGarminLoading(false);
    }
  };

  // Garmin disconnect handler
  const handleDisconnectGarmin = async () => {
    Alert.alert(
      t('onboarding.garminDisconnectBtn'),
      'Are you sure you want to disconnect Garmin? This will stop rooka from pushing workouts to your watch.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setGarminLoading(true);
            try {
              await integrationsApi.disconnectGarmin();
              await refreshUser();
              setShowGarminFields(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Disconnected', 'Garmin disconnected successfully.');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to disconnect Garmin.');
            } finally {
              setGarminLoading(false);
            }
          },
        },
      ]
    );
  };

  // Strava connect OAuth
  const handleConnectStrava = async () => {
    setStravaLoading(true);
    try {
      const clientId = '208765';
      const stravaRedirectUri = `${API_BASE_URL}/oauthredirect`;
      const appDeepLink = Linking.createURL('oauthredirect');
      const authUrl = `https://www.strava.com/oauth/mobile/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        stravaRedirectUri
      )}&scope=activity:read_all,activity:write&approval_prompt=force`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, appDeepLink);
      if (result.type === 'success' && result.url) {
        let code: string | undefined;
        try {
          code = new URL(result.url).searchParams.get('code') || undefined;
        } catch (_) {
          const match = result.url.match(/[?&]code=([^&]+)/);
          if (match) code = match[1];
        }
        if (code) {
          const finishConnect = async (allowShared: boolean) => {
            const res = await integrationsApi.exchangeStravaCode(code!, allowShared);
            await refreshUser();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(
              t('onboarding.stravaTitle'),
              res?.message || t('onboarding.stravaSuccessMsg')
            );
          };

          try {
            await finishConnect(false);
          } catch (exchangeErr: any) {
            if (exchangeErr?.data?.code === 'STRAVA_ALREADY_LINKED') {
              Alert.alert(
                'Already Connected Elsewhere',
                `This Strava account is already connected to "${exchangeErr.data.linkedUsername}". Connect it to this account as well?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Connect Anyway',
                    onPress: () => {
                      finishConnect(true).catch((retryErr: any) =>
                        Alert.alert('Strava Error', retryErr?.message || 'Failed to connect Strava.')
                      );
                    },
                  },
                ]
              );
            } else {
              Alert.alert('Strava Error', exchangeErr?.message || 'Failed to connect Strava.');
            }
          }
        }
      }
    } catch (err: any) {
      Alert.alert('Strava Error', err?.message || 'Failed to open Strava authentication.');
    } finally {
      setStravaLoading(false);
    }
  };

  // Strava disconnect handler
  const handleDisconnectStrava = async () => {
    Alert.alert(
      t('onboarding.stravaDisconnectBtn'),
      'Are you sure you want to disconnect Strava? This will unlink your Strava account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setStravaLoading(true);
            try {
              await integrationsApi.disconnectStrava();
              await refreshUser();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Disconnected', 'Strava disconnected successfully.');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to disconnect Strava.');
            } finally {
              setStravaLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} showHandle>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ flexShrink: 1 }}
      >
        {/* Header */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <View className="w-8 h-8 rounded-full bg-theme-accent/15 items-center justify-center">
                <Ionicons name="hardware-chip-outline" size={18} color={theme.tint} />
              </View>
              <Text className="text-lg font-extrabold text-theme-text">
                {t('onboarding.integrationsTitle')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="w-8 h-8 rounded-full bg-theme-bg items-center justify-center border border-theme-border"
            >
              <Ionicons name="close" size={16} color={theme.textSecondary} />
            </Pressable>
          </View>

          <Text className="text-xs text-theme-muted mb-5 leading-relaxed">
            {t('onboarding.syncSmartwatchSubtitle')}
          </Text>

          {/* GARMIN CARD */}
          <View className="bg-theme-bg border border-theme-border rounded-2xl p-4 mb-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1 mr-2">
                <View className="w-10 h-10 rounded-xl bg-[#007ACC]/15 items-center justify-center">
                  <Ionicons name="watch-outline" size={22} color="#007ACC" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    <Text className="text-sm font-bold text-theme-text">
                      {t('onboarding.garminTitle')}
                    </Text>
                    {isGarminActive && (
                      <View className="bg-semantic-success/15 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                        <Ionicons name="checkmark-circle" size={11} color="#22C55E" />
                        <Text className="text-semantic-success text-[10px] font-bold">
                          {t('onboarding.garminConnectedBadge')}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-theme-muted">
                    {t('onboarding.garminSubtitle')}
                  </Text>
                </View>
              </View>

              {!isGarminActive && (
                <Switch
                  value={showGarminFields}
                  onValueChange={(val) => {
                    setShowGarminFields(val);
                    if (val) scrollToBottom();
                  }}
                  trackColor={{ false: '#3A3A3C', true: theme.tint }}
                />
              )}
            </View>

            {/* Garmin Active State */}
            {isGarminActive && (
              <View className="mt-3 pt-3 border-t border-theme-border/50 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2 flex-1 mr-2">
                  <Ionicons name="person-circle-outline" size={18} color="#22C55E" />
                  <Text className="text-xs text-theme-text font-bold" numberOfLines={1}>
                    {(user as any)?.garmin_username || (user as any)?.garminUsername || 'Garmin User'}
                  </Text>
                </View>
                <Pressable
                  disabled={garminLoading}
                  onPress={handleDisconnectGarmin}
                  className="px-3 py-1.5 bg-semantic-error/10 border border-semantic-error/30 rounded-lg"
                >
                  <Text className="text-semantic-error font-bold text-xs">
                    {garminLoading ? '...' : t('onboarding.garminDisconnectBtn')}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Garmin Credentials Entry */}
            {!isGarminActive && showGarminFields && (
              <View className="mt-3 pt-3 border-t border-theme-border/50 gap-2.5">
                <TextInput
                  editable={!garminLoading}
                  placeholder={t('onboarding.garminUserPlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  value={garminUser}
                  onChangeText={(val) => {
                    setGarminUser(val);
                    setGarminError(null);
                  }}
                  onFocus={scrollToBottom}
                  autoCapitalize="none"
                  className="p-3 bg-theme-card border border-theme-border rounded-xl text-theme-text text-xs"
                />
                <TextInput
                  editable={!garminLoading}
                  placeholder={t('onboarding.garminPassPlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  value={garminPass}
                  onChangeText={(val) => {
                    setGarminPass(val);
                    setGarminError(null);
                  }}
                  onFocus={scrollToBottom}
                  autoCapitalize="none"
                  className="p-3 bg-theme-card border border-theme-border rounded-xl text-theme-text text-xs"
                />

                {garminError && (
                  <View className="flex-row items-center gap-1.5 px-1">
                    <Ionicons name="alert-circle" size={14} color="#EF4444" />
                    <Text className="text-semantic-error text-xs flex-1">{garminError}</Text>
                  </View>
                )}

                <Pressable
                  disabled={garminLoading || !garminUser.trim() || !garminPass.trim()}
                  onPress={handleConnectGarmin}
                  className={`py-3 rounded-xl flex-row items-center justify-center gap-2 ${
                    !garminUser.trim() || !garminPass.trim()
                      ? 'bg-[#007ACC]/50 opacity-60'
                      : 'bg-[#007ACC]'
                  }`}
                >
                  {garminLoading ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text className="text-white font-bold text-xs">
                        {t('onboarding.garminSavingBtn')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                      <Text className="text-white font-bold text-xs">
                        {t('onboarding.garminSaveBtn')}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>

          {/* STRAVA CARD */}
          <View className="bg-theme-bg border border-theme-border rounded-2xl p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1 mr-2">
                <View className="w-10 h-10 rounded-xl bg-[#FC4C02]/15 items-center justify-center">
                  <Ionicons name="bicycle" size={20} color="#FC4C02" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    <Text className="text-sm font-bold text-theme-text">
                      {t('onboarding.stravaTitle')}
                    </Text>
                    {isStravaActive && (
                      <View className="bg-semantic-success/15 px-2 py-0.5 rounded-full flex-row items-center gap-1">
                        <Ionicons name="checkmark-circle" size={11} color="#22C55E" />
                        <Text className="text-semantic-success text-[10px] font-bold">
                          {t('onboarding.stravaConnectedBadge')}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-theme-muted">
                    {t('onboarding.stravaSubtitle')}
                  </Text>
                </View>
              </View>

              {isStravaActive ? (
                <Pressable
                  disabled={stravaLoading}
                  onPress={handleDisconnectStrava}
                  className="px-3 py-1.5 bg-semantic-error/10 border border-semantic-error/30 rounded-lg"
                >
                  <Text className="text-semantic-error font-bold text-xs">
                    {stravaLoading ? '...' : t('onboarding.stravaDisconnectBtn')}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  disabled={stravaLoading}
                  onPress={handleConnectStrava}
                  className="px-4 py-2 bg-[#FC4C02] rounded-xl flex-row items-center gap-1.5 shadow-sm"
                >
                  {stravaLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="link-outline" size={14} color="#FFFFFF" />
                      <Text className="text-white font-bold text-xs">
                        {t('onboarding.connectStrava')}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
    </BottomSheetModal>
  );
};
