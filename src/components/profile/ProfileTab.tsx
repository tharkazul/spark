import { BrandColors } from '@/constants/theme';
import { RookaMark } from '../ui/RookaPoints';
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, Switch, TouchableOpacity, Alert, ActivityIndicator, TextInput, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { ScalePressable } from '../ui/ScalePressable';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { useCoachChatStore } from '../../context/CoachChatStore';
import { useSubscription } from '../../context/SubscriptionStore';
import { useColorScheme } from 'nativewind';
import { userApi, gamificationApi } from '../../services/apiServices';
import { API_BASE_URL } from '../../constants/api';
import { UserTitle } from '../../types/gamification';
import { calculateActivityStreak } from '../../utils/gamification';
import { formatRookaPoints, formatTokens } from '../../utils/format';
import { TitlesSkeleton } from '../skeletons/TitlesSkeleton';
import { LanguageSelector } from '../LanguageSelector';

interface ProfileTabProps {
  username: string;
  email?: string;
  isRookaPlus: boolean;
  onLogout?: () => void;
  renderSettingRow: (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    value?: React.ReactNode,
    onPress?: () => void
  ) => React.ReactNode;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  username,
  email: initialEmail,
  isRookaPlus,
  onLogout,
  renderSettingRow,
}) => {
  const theme = useTheme();
  const { t } = useLanguage();
  const { user, updateUser, refreshUser } = useUser();
  const { activities } = useActivities();
  const { tokenUsage } = useCoachChatStore();
  const { presentCustomerCenter, presentPaywall } = useSubscription();
  const { colorScheme, toggleColorScheme } = useColorScheme();

  const [titles, setTitles] = useState<UserTitle[]>([]);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [expandedTitleId, setExpandedTitleId] = useState<string | number | null>(null);

  // Email form state
  const [email, setEmail] = useState(user?.email || initialEmail || '');
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchTitles();
  }, []);

  const getFullPhotoUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('file://')) return path;
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
        setLocalPhotoUri(fileUri);
        setUploadingPhoto(true);
        try {
          const res = await userApi.uploadProfilePicture(fileUri);
          if (res && res.url) {
            updateUser({ profile_picture_url: res.url });
          }
          await refreshUser();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (err: any) {
          console.error('Failed to upload profile picture:', err);
          setLocalPhotoUri(null);
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
        prev.map((item) => {
          const isTarget = item.id === id;
          const wasEquipped = Boolean(item.is_equipped || item.is_active);
          const nextState = isTarget ? (wasEquipped ? 0 : 1) : 0;
          return {
            ...item,
            is_equipped: nextState,
            is_active: nextState,
          };
        })
      );
      await gamificationApi.equipTitle(id);
      await fetchTitles();
    } catch (err: any) {
      console.error('Equip title error:', err.message || err);
      await fetchTitles();
    }
  };

  const handleSaveAccount = async () => {
    if (email === user?.email) return;
    setSavingAccount(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await userApi.updateAccountDetails({ email });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Account email updated successfully.');
      await refreshUser();
    } catch (err: any) {
      console.error('Update account error:', err);
      Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to update account.');
    } finally {
      setSavingAccount(false);
    }
  };

  const equippedTitle = useMemo(() => {
    return titles.find((t) => Boolean(t.is_equipped || t.is_active)) || null;
  }, [titles]);

  const totalDistanceKm = useMemo(() => {
    const sumKm = activities.reduce((acc, a) => acc + (a.distance_km || 0), 0);
    return Math.round(sumKm);
  }, [activities]);

  const totalPoints = useMemo(() => {
    return Math.round(user?.total_rooka || activities.reduce((acc, a) => acc + (a.rooka_score || 0), 0));
  }, [user?.total_rooka, activities]);

  const streakDays = useMemo(() => {
    const calculated = calculateActivityStreak(activities);
    return calculated || user?.streak_days || (user as any)?.current_streak || 0;
  }, [activities, user]);

  const profilePicUrl = localPhotoUri || getFullPhotoUrl(user?.profile_picture_url || (user as any)?.profilePictureUrl);

  const tier = user?.subscription_tier || 'free';
  let tierLabel = t('profile.freeMember');
  if (tier === 'admin') {
    tierLabel = t('profile.adminMember');
  } else if (tier === 'premium') {
    tierLabel = t('profile.premiumMember');
  } else if (tier === 'rooka_plus' || tier === 'subscription') {
    tierLabel = t('profile.plusMember');
  }
  const isPaidTier = tier === 'admin' || tier === 'premium' || tier === 'rooka_plus' || tier === 'subscription';

  const dailyUsage =
    typeof tokenUsage?.daily_token_usage === 'number'
      ? tokenUsage.daily_token_usage
      : (typeof user?.daily_token_usage === 'number'
          ? user.daily_token_usage
          : 0);

  const dailyLimit =
    typeof tokenUsage?.daily_token_limit === 'number'
      ? tokenUsage.daily_token_limit
      : (typeof user?.daily_token_limit === 'number'
          ? user.daily_token_limit
          : (tier === 'admin' ? 500000 : isPaidTier ? 50000 : 5000));

  return (
    <View className="gap-y-6 pb-8">
      {/* 1. COMPACT IDENTITY HEADER (88pt avatar with accent ring) */}
      <View className="items-center my-3">
        <View className="relative mb-3">
          <View className="w-[88px] h-[88px] rounded-full bg-theme-card items-center justify-center overflow-hidden border-2 border-theme-accent-strong">
            {profilePicUrl ? (
              <Image
                source={{ uri: profilePicUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <Ionicons name="person" size={38} color={theme.textSecondary} />
            )}
            {uploadingPhoto && (
              <View className="absolute inset-0 bg-black/50 items-center justify-center">
                <ActivityIndicator size="small" color={theme.tint} />
              </View>
            )}
          </View>

          {/* Edit Camera Button Overlay */}
          <TouchableOpacity
            onPress={handlePickProfilePicture}
            disabled={uploadingPhoto}
            activeOpacity={0.8}
            className="absolute bottom-0 right-0 bg-theme-accent-strong w-7 h-7 rounded-full items-center justify-center border-2 border-theme-bg"
          >
            <Ionicons name="camera" size={13} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text className="text-theme-text text-xl font-bold font-rajdhani">{username}</Text>
        {email ? <Text className="text-theme-muted text-xs mt-0.5 font-medium">{email}</Text> : null}

        <View className="flex-row items-center gap-2 mt-2">
          <View className="px-3 py-1 bg-theme-accent/15 rounded-full flex-row items-center gap-x-1">
            {isPaidTier ? <RookaMark size={12} color={theme.tint} /> : null}
            <Text className="text-theme-accent text-xs font-bold font-rajdhani">
              {tierLabel}
            </Text>
          </View>

          {equippedTitle ? (
            <View className="px-3 py-1 bg-amber-500/15 rounded-full flex-row items-center gap-x-1 border border-amber-600/30">
              <Ionicons name="ribbon" size={12} color="#D97706" />
              <Text className="text-amber-800 dark:text-amber-300 text-xs font-bold font-rajdhani">
                {equippedTitle.title_name || equippedTitle.title}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* 2. 4-COLUMN ATHLETE STAT ROW */}
      <Card className="p-4 bg-theme-card border border-theme-border">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 items-center">
            <Text className="text-2xl font-bold font-rajdhani text-theme-text tabular-nums">
              {activities.length}
            </Text>
            <Text className="text-[11px] font-semibold text-theme-muted mt-0.5" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('profile.activities')}
            </Text>
          </View>
          <View className="w-[1px] h-8 bg-theme-border" />
          <View className="flex-1 items-center">
            <Text className="text-2xl font-bold font-rajdhani text-theme-text tabular-nums">
              {totalDistanceKm}
            </Text>
            <Text className="text-[11px] font-semibold text-theme-muted mt-0.5" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('profile.totalKm')}
            </Text>
          </View>
          <View className="w-[1px] h-8 bg-theme-border" />
          <View className="flex-1 items-center">
            <Text className="text-2xl font-bold font-rajdhani text-theme-text tabular-nums">
              {formatRookaPoints(totalPoints)}
            </Text>
            <Text className="text-[11px] font-semibold text-theme-muted mt-0.5" numberOfLines={1}>
              rooka
            </Text>
          </View>
          <View className="w-[1px] h-8 bg-theme-border" />
          <View className="flex-1 items-center">
            <View className="flex-row items-center gap-0.5">
              <Ionicons name="flame" size={14} color="#EA580C" />
              <Text className="text-2xl font-bold font-rajdhani text-amber-800 dark:text-amber-400 tabular-nums">
                {streakDays}
              </Text>
            </View>
            <Text className="text-[11px] font-semibold text-theme-muted mt-0.5" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('profile.dayStreak')}
            </Text>
          </View>
        </View>
      </Card>

      {/* 3. PERSONAL TITLES MANAGER */}
      <Text className="text-theme-muted font-bold text-xs -mb-3 ml-1 uppercase tracking-wider">
        {t('profile.personalTitlesAccolades')}
      </Text>
      {!isPaidTier ? (
        <Card className="p-5 mb-2 items-center text-center">
          <View className="w-10 h-10 rounded-full bg-theme-accent/15 items-center justify-center mb-2.5">
            <Ionicons name="ribbon-outline" size={20} color={theme.tint} />
          </View>
          <View className="flex-row items-center gap-x-1.5 mb-1">
            <RookaMark size={14} color={theme.tint} />
            <Text className="text-theme-text font-bold text-sm font-rajdhani">
              {t('profile.rookaPlusExclusive')}
            </Text>
          </View>
          <Text className="text-theme-muted text-xs text-center px-4 mb-3">
            {t('profile.titlesDescription')}
          </Text>
          <View className="px-3 py-1 bg-theme-accent/10 rounded-full">
            <Text className="text-theme-accent text-xs font-bold font-rajdhani">{t('profile.includedWithRookaPlus')}</Text>
          </View>
        </Card>
      ) : (
        <Card className="p-4 mb-2">
          {loadingTitles ? (
            <TitlesSkeleton count={2} />
          ) : (
            <View className="gap-y-2">
              {(titles.length > 0
                ? titles
                : [
                    {
                      id: 'default_rooka_plus',
                      title: 'Rooka+ Athlete',
                      title_name: 'Rooka+ Athlete',
                      description: 'Official member of the Rooka+ endurance squad.',
                      is_equipped: 1,
                      is_active: 1,
                    },
                  ]
              ).map((item) => {
                const titleName = item.title_name || item.title || 'Rooka+ Athlete';
                const isEquipped = Boolean(item.is_equipped || item.is_active);
                const isExpanded = expandedTitleId === item.id;

                return (
                  <View
                    key={item.id}
                    className={`rounded-xl p-3 border ${
                      isEquipped
                        ? 'bg-theme-accent/10 border-theme-accent/40'
                        : 'bg-theme-bg border-theme-border/60'
                    }`}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        setExpandedTitleId(isExpanded ? null : item.id);
                      }}
                      activeOpacity={0.7}
                      className="flex-row items-center justify-between"
                    >
                      <View className="flex-row items-center gap-x-2.5 flex-1 mr-2">
                        <Ionicons
                          name={isEquipped ? 'ribbon' : 'ribbon-outline'}
                          size={18}
                          color={isEquipped ? '#F59E0B' : '#8E9BA4'}
                        />
                        <View className="flex-1">
                          <Text className="text-theme-text font-bold text-sm" numberOfLines={1}>
                            {titleName}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row items-center gap-2">
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.selectionAsync();
                            handleEquipTitle(item.id);
                          }}
                          className={`px-2.5 py-1 rounded-full ${
                            isEquipped ? 'bg-theme-accent-strong' : 'bg-theme-card border border-theme-border'
                          }`}
                        >
                          <Text className={`text-xs font-bold ${isEquipped ? 'text-white' : 'text-theme-muted'}`}>
                            {isEquipped ? t('profile.equipped') : t('profile.equip')}
                          </Text>
                        </TouchableOpacity>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={theme.textSecondary}
                        />
                      </View>
                    </TouchableOpacity>

                    {isExpanded && item.description ? (
                      <View className="mt-2.5 pt-2 border-t border-theme-border/40">
                        <Text className="text-xs text-theme-muted leading-relaxed">
                          {item.description}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      )}

      {/* 4. DAILY COACH USAGE METER (or Admin Token Quota) */}
      <Text className="text-theme-muted font-bold text-xs -mb-3 ml-1 uppercase tracking-wider">
        AI Coach Telemetry
      </Text>
      {tier === 'admin' ? (
        <Card className="p-4">
          <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-theme-border/20">
            <View className="flex-row items-center gap-2">
              <View className="w-2.5 h-2.5 rounded-full bg-purple-500 mr-1" />
              <Text className="text-theme-text font-bold text-sm">Admin Token Quota</Text>
            </View>
            <View className="px-2 py-0.5 rounded bg-purple-500/15">
              <Text className="text-[10px] font-bold text-purple-600 dark:text-purple-400">ADMIN</Text>
            </View>
          </View>

          <View className="p-3.5 bg-theme-bg rounded-xl flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
                Daily Token Consumption
              </Text>
              <Text className="text-xs text-theme-muted mt-0.5">
                {formatTokens(dailyUsage)} of {formatTokens(dailyLimit)} tokens consumed
              </Text>
            </View>
            <View className="px-3 py-1.5 bg-theme-accent/10 rounded-xl">
              <Text className="text-base font-bold text-theme-accent">{formatTokens(dailyUsage)}</Text>
            </View>
          </View>
        </Card>
      ) : (
        <Card className="p-4">
          <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-theme-border/20">
            <View className="flex-row items-center gap-2">
              <Ionicons name="sparkles" size={16} color={theme.tint} />
              <Text className="text-theme-text font-bold text-sm">Daily Coach Usage</Text>
            </View>
            <Text className="text-xs font-bold font-rajdhani text-theme-accent">
              {Math.min(100, Math.round((dailyUsage / Math.max(1, dailyLimit)) * 100))}%
            </Text>
          </View>

          <View className="gap-y-2">
            <View className="w-full h-2 rounded-full bg-theme-inset overflow-hidden">
              <View
                style={{
                  width: `${Math.min(100, Math.max(4, Math.round((dailyUsage / Math.max(1, dailyLimit)) * 100)))}%`,
                }}
                className="h-full bg-theme-accent rounded-full"
              />
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-[11px] text-theme-muted">
                {dailyUsage > 0 ? 'AI analysis & planning active' : 'Ready for daily workouts'}
              </Text>
              <Text className="text-[11px] font-medium text-theme-muted">
                Resets at midnight
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* 5. APP PREFERENCES */}
      <Text className="text-theme-muted font-bold text-xs -mb-3 ml-1 uppercase tracking-wider">
        Preferences
      </Text>
      <Card className="p-2">
        {renderSettingRow(
          'moon',
          t('profile.darkMode'),
          <Switch
            value={colorScheme === 'dark'}
            onValueChange={toggleColorScheme}
            trackColor={{ false: '#DDE3E9', true: theme.tint }}
          />
        )}
        {renderSettingRow(
          'notifications',
          t('profile.pushNotifications'),
          <Switch value={true} trackColor={{ false: '#DDE3E9', true: theme.tint }} />
        )}
        <View className="px-4 py-3 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Ionicons name="language" size={20} color={theme.textSecondary} className="mr-3" />
            <Text className="text-theme-text text-base ml-2">{t('profile.languageSettingTitle', 'Language')}</Text>
          </View>
          <LanguageSelector compact={true} />
        </View>
      </Card>

      {/* 6. ACCOUNT & MEMBERSHIP */}
      <Text className="text-theme-muted font-bold text-xs -mb-3 ml-1 uppercase tracking-wider">
        Account & Membership
      </Text>
      <Card className="p-4">
        <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-theme-border/20">
          <View className="flex-row items-center gap-2">
            <RookaMark size={16} color={theme.tint} />
            <Text className="text-theme-text font-bold text-sm">Membership Plan</Text>
          </View>
          <ScalePressable
            onPress={() => {
              if (isPaidTier) {
                presentCustomerCenter().catch(() => {});
              } else {
                presentPaywall().catch(() => {});
              }
            }}
            activeScale={0.96}
            haptic="selection"
            className="px-3 py-1 bg-theme-accent/15 rounded-full"
          >
            <Text className="text-xs font-bold text-theme-accent">
              {isPaidTier ? 'Manage Plan' : 'Upgrade to Rooka+'}
            </Text>
          </ScalePressable>
        </View>

        <View className="gap-y-3">
          <View>
            <Text className="text-xs font-bold text-theme-muted uppercase mb-1">{t('account.emailAddress')}</Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('account.enterEmailPlaceholder')}
                placeholderTextColor="#8E8E93"
                keyboardType="email-address"
                autoCapitalize="none"
                className="flex-1 bg-theme-bg rounded-xl p-3 border border-theme-border/30 text-theme-text font-bold text-sm"
              />
              {email !== user?.email && (
                <ScalePressable
                  onPress={handleSaveAccount}
                  disabled={savingAccount}
                  activeScale={0.96}
                  haptic="selection"
                  className="px-4 py-3 rounded-xl bg-theme-accent justify-center items-center"
                >
                  {savingAccount ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text className="text-white font-bold text-xs">Save</Text>
                  )}
                </ScalePressable>
              )}
            </View>
          </View>
        </View>

        {onLogout && (
          <TouchableOpacity
            onPress={onLogout}
            activeOpacity={0.8}
            className="mt-4 pt-3 border-t border-theme-border/30 flex-row items-center justify-center gap-x-2"
          >
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <Text className="text-semantic-error font-bold text-sm">{t('profile.logout', 'Log Out')}</Text>
          </TouchableOpacity>
        )}
      </Card>
    </View>
  );
};

export default ProfileTab;
