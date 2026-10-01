import { BrandColors } from '@/constants/theme';
import { RookaMark } from '../ui/RookaPoints';
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, Switch, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { WeeklyAvailabilityCard } from './WeeklyAvailabilityCard';
import { RecurringTrainingsCard } from './RecurringTrainingsCard';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { useColorScheme } from 'nativewind';
import { userApi, gamificationApi } from '../../services/apiServices';
import { API_BASE_URL } from '../../constants/api';
import { UserTitle } from '../../types/gamification';
import { calculateActivityStreak } from '../../utils/gamification';
import { TrainingZonesCard } from './TrainingZonesCard';
import { TitlesSkeleton } from '../skeletons/TitlesSkeleton';

interface ProfileTabProps {
  username: string;
  email?: string;
  isRookaPlus: boolean;
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
  isRookaPlus,
  renderSettingRow,
}) => {
    const theme = useTheme();
  const { t } = useLanguage();
  const { user, updateUser, refreshUser } = useUser();
  const { colorScheme, toggleColorScheme } = useColorScheme();

  const [titles, setTitles] = useState<UserTitle[]>([]);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);

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
        prev.map((t) => {
          const isTarget = t.id === id;
          const wasEquipped = Boolean(t.is_equipped || t.is_active);
          const nextState = isTarget ? (wasEquipped ? 0 : 1) : 0;
          return {
            ...t,
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

  const { activities } = useActivities();
  const [expandedTitleId, setExpandedTitleId] = useState<string | number | null>(null);

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

  const tier = user?.subscription_tier;
  let tierLabel = 'Free Member';
  if (tier === 'admin') {
    tierLabel = 'Admin Member';
  } else if (tier === 'premium') {
    tierLabel = 'rooka+ Premium';
  } else if (tier === 'rooka_plus' || tier === 'subscription') {
    tierLabel = 'rooka+ Member';
  }
  const isPaidTier = tier === 'admin' || tier === 'premium' || tier === 'rooka_plus' || tier === 'subscription';

  return (
    <View className="gap-y-6">
      {/* COMPACT IDENTITY HEADER (88pt avatar with accent ring) */}
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
            <View className="px-3 py-1 bg-amber-500/15 rounded-full flex-row items-center gap-x-1 border border-amber-500/30">
              <Ionicons name="ribbon" size={12} color="#F59E0B" />
              <Text className="text-amber-500 text-xs font-bold font-rajdhani">
                {equippedTitle.title_name || equippedTitle.title}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* 4-COLUMN ATHLETE STAT ROW */}
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
              {totalPoints.toLocaleString()}
            </Text>
            <Text className="text-[11px] font-semibold text-theme-muted mt-0.5" numberOfLines={1}>
              rooka
            </Text>
          </View>
          <View className="w-[1px] h-8 bg-theme-border" />
          <View className="flex-1 items-center">
            <View className="flex-row items-center gap-0.5">
              <Ionicons name="flame" size={14} color="#F97316" />
              <Text className="text-2xl font-bold font-rajdhani text-amber-500 tabular-nums">
                {streakDays}
              </Text>
            </View>
            <Text className="text-[11px] font-semibold text-theme-muted mt-0.5" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t('profile.dayStreak')}
            </Text>
          </View>
        </View>
      </Card>

      {/* PERSONAL TITLES MANAGER */}
      <Text className="text-theme-muted font-bold text-xs mb-2 ml-1 uppercase tracking-wider">
        Personal Titles & Accolades
      </Text>
      {!isPaidTier ? (
        <Card className="p-5 mb-2 items-center text-center">
          <View className="w-10 h-10 rounded-full bg-theme-accent/15 items-center justify-center mb-2.5">
            <Ionicons name="ribbon-outline" size={20} color={theme.tint} />
          </View>
          <View className="flex-row items-center gap-x-1.5 mb-1">
            <RookaMark size={14} color={theme.tint} />
            <Text className="text-theme-text font-bold text-sm font-rajdhani">
              Rooka+ Exclusive
            </Text>
          </View>
          <Text className="text-theme-muted text-xs text-center px-4 mb-3">
            Earn custom athletic titles and accolades based on your races and endurance milestones.
          </Text>
          <View className="px-3 py-1 bg-theme-accent/10 rounded-full">
            <Text className="text-theme-accent text-xs font-bold font-rajdhani">Included with Rooka+</Text>
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
                            {isEquipped ? 'Equipped' : 'Equip'}
                          </Text>
                        </TouchableOpacity>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={theme.textSecondary}
                        />
                      </View>
                    </TouchableOpacity>

                    {/* Expandable Description */}
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

      {/* WEEKLY TRAINING AVAILABILITY */}
      <WeeklyAvailabilityCard />

      {/* RECURRING TRAININGS & CLUB SPORTS */}
      <RecurringTrainingsCard />

      {/* Zones drive every rooka score, so they sit with the athlete's
          own details rather than in a settings sub-menu. */}
      <TrainingZonesCard />

      {/* APP PREFERENCES */}
      <Text className="text-theme-muted font-bold text-xs mb-2 ml-1 uppercase tracking-wider">
        {t('nav.profile')} Preferences
      </Text>
      <Card className="p-2 mb-6">
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
      </Card>
    </View>
  );
};
