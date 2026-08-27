import React, { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Card } from '../ui/Card';
import { userApi } from '../../services/apiServices';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useCoachChatStore } from '../../context/CoachChatStore';

interface AccountTabProps {
  onLogout: () => void;
  isRookaPlus: boolean;
}

export const AccountTab: React.FC<AccountTabProps> = ({ onLogout, isRookaPlus }) => {
    const theme = useTheme();
  const { t } = useLanguage();
  const { user, refreshUser } = useUser();
  const { tokenUsage } = useCoachChatStore();
  const [trackingUpgrade, setTrackingUpgrade] = useState(false);

  useEffect(() => {
    refreshUser();
  }, []);

  const tier = user?.subscription_tier || 'free';
  const isMember = isRookaPlus || tier === 'admin' || tier === 'premium' || tier === 'rooka_plus' || tier === 'subscription';

  const dailyUsage =
    typeof tokenUsage?.daily_token_usage === 'number'
      ? tokenUsage.daily_token_usage
      : (typeof user?.daily_token_usage === 'number'
          ? user.daily_token_usage
          : (typeof (user as any)?.dailyTokenUsage === 'number'
              ? (user as any).dailyTokenUsage
              : 0));

  const dailyLimit =
    typeof tokenUsage?.daily_token_limit === 'number'
      ? tokenUsage.daily_token_limit
      : (typeof user?.daily_token_limit === 'number'
          ? user.daily_token_limit
          : (typeof (user as any)?.dailyTokenLimit === 'number'
              ? (user as any).dailyTokenLimit
              : (tier === 'admin' ? 500000 : isMember ? 50000 : 5000)));

  const handleRookaPlusClick = async () => {
    setTrackingUpgrade(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await userApi.trackRookaPlusClick();
    } catch (err) {
      // silent catch
    } finally {
      setTrackingUpgrade(false);
    }
  };

  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await userApi.requestAccountData();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Data Export Requested", "Your personal account data summary has been compiled successfully.");
    } catch (err: any) {
      console.error('Export data error:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account?",
      "This action cannot be undone. All your workout history, physique logs, chat messages, and account settings will be permanently erased.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Permanently Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await userApi.deleteAccount();
              onLogout();
            } catch (err: any) {
              console.error('Deletion error:', err);
              Alert.alert("Error", err.message || "Failed to delete account.");
            } finally {
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  const handleManageSubscription = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url).catch(() => {
      Alert.alert("Manage Subscription", `Please manage your subscription directly in your ${Platform.OS === 'ios' ? 'Apple ID' : 'Google Play Store'} account settings.`);
    });
  };

  const handleOpenPrivacyPolicy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('https://rookaapp.fitness/privacy.html').catch(() => {
      Alert.alert("Privacy Policy", "Visit https://rookaapp.fitness/privacy.html to read our Privacy Policy.");
    });
  };

  const handleOpenTerms = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('https://rookaapp.fitness/terms.html').catch(() => {
      Alert.alert("Terms of Service", "Visit https://rookaapp.fitness/terms.html to read our Terms of Service.");
    });
  };

  return (
    <View className="space-y-6">
      {/* USAGE STATISTICS */}
      <Card className="p-4 mb-6">
        <View className="flex-row items-center gap-2 pb-3 mb-3 border-b border-theme-border/20">
          <View className="w-2.5 h-2.5 rounded-full bg-purple-500 mr-2" />
          <Text className="text-theme-text font-bold text-sm">Usage Statistics</Text>
        </View>

        <View className="p-4 bg-theme-bg rounded-xl flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              Personal Daily Token Use Rate
            </Text>
            <Text className="text-xs text-theme-muted mt-1">
              Tokens consumed today by AI Coach interactions (Limit: {dailyLimit.toLocaleString()}/day)
            </Text>
          </View>
          <View className="px-3 py-1.5 bg-theme-accent/10 rounded-xl">
            <Text className="text-lg font-bold text-theme-accent">{dailyUsage.toLocaleString()}</Text>
          </View>
        </View>
      </Card>

      {/* ROOKA+ UPGRADE / MEMBER CARD */}
      <TouchableOpacity
        onPress={handleRookaPlusClick}
        activeOpacity={0.9}
        className="mb-6 rounded-2xl overflow-hidden shadow-lg border border-theme-border/30"
      >
        <LinearGradient
          colors={isMember ? ['#1E293B', '#0F172A'] : ['#FF5F3B', '#7C3AED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 22, borderRadius: 16 }}
        >
          <View className="flex-row items-center justify-between mb-2.5">
            <View className="flex-row items-center">
              <Ionicons name="flash" size={24} color="#FFF" />
              <Text className="text-white text-xl font-extrabold tracking-tight ml-2">
                {isMember
                  ? (tier === 'admin' ? '⚡ Rooka Admin Access' : '⚡ Rooka+ Active')
                  : 'Upgrade to Rooka+'}
              </Text>
            </View>
            <View className="px-2.5 py-1 bg-white/20 rounded-full">
              <Text className="text-white text-xs font-extrabold uppercase tracking-wider">
                {isMember ? (tier === 'admin' ? 'ADMIN' : 'ACTIVE') : 'PRO TIER'}
              </Text>
            </View>
          </View>

          <Text className="text-white/90 text-xs mb-4 leading-relaxed font-medium">
            {isMember
              ? (tier === 'admin'
                  ? 'Your account has full administrator access with a 500k daily token quota, advanced periodization, and direct integrations.'
                  : 'Your account has unlocked 50,000 daily coach tokens, priority workout adaptation, custom macro periodization, and direct Garmin sync.')
              : 'Unlock 50,000 daily coach tokens, priority workout adaptation, custom macro periodization, and deeper athletic insights.'}
          </Text>

          <View className="bg-white py-2.5 px-5 rounded-full self-start flex-row items-center shadow-sm">
            {trackingUpgrade ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : (
              <Text className="text-theme-accent font-bold text-xs">
                {isMember ? 'View Member Benefits' : 'View Premium Benefits'}
              </Text>
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* SUBSCRIPTIONS */}
      <Card className="p-4 mb-6">
        <View className="flex-row items-center gap-2 pb-3 mb-3 border-b border-theme-border/20">
          <View className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2" />
          <Text className="text-theme-text font-bold text-sm">Subscription Management</Text>
        </View>

        <TouchableOpacity
          onPress={handleManageSubscription}
          className="p-3 bg-theme-bg rounded-xl flex-row items-center justify-between"
        >
          <View className="flex-row items-center">
            <Ionicons name="card-outline" size={18} color={theme.textSecondary} />
            <View className="ml-3">
              <Text className="text-theme-text font-bold text-xs">Manage or Cancel Subscription</Text>
              <Text className="text-theme-muted text-xs mt-0.5">1-Click cancel via {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'}</Text>
            </View>
          </View>
          <Ionicons name="open-outline" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      </Card>

      {/* LEGAL & PRIVACY */}
      <Card className="p-4 mb-6">
        <View className="flex-row items-center gap-2 pb-3 mb-3 border-b border-theme-border/20">
          <View className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-2" />
          <Text className="text-theme-text font-bold text-sm">Legal & Privacy Disclosures</Text>
        </View>

        <View className="space-y-3">
          <TouchableOpacity
            onPress={handleOpenPrivacyPolicy}
            className="p-3 bg-theme-bg rounded-xl flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.textSecondary} />
              <Text className="text-theme-text font-bold text-xs ml-3">Privacy Policy</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={theme.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenTerms}
            className="p-3 bg-theme-bg rounded-xl flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Ionicons name="document-text-outline" size={18} color={theme.textSecondary} />
              <Text className="text-theme-text font-bold text-xs ml-3">Terms of Service & EULA</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={theme.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleExportData}
            disabled={exporting}
            className="p-3 bg-theme-bg rounded-xl flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              {exporting ? (
                <ActivityIndicator size="small" color={theme.tint} />
              ) : (
                <Ionicons name="download-outline" size={18} color={theme.textSecondary} />
              )}
              <Text className="text-theme-text font-bold text-xs ml-3">Export Account Data</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDeleteAccount}
            disabled={deleting}
            className="p-3 bg-theme-bg rounded-xl flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              {deleting ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              )}
              <Text className="text-red-500 font-bold text-xs ml-3">Delete Account & Purge Data</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </Card>

      {/* LOG OUT BUTTON */}
      <TouchableOpacity
        onPress={onLogout}
        className="p-4 bg-red-500/10 rounded-xl items-center mb-6"
      >
        <Text className="text-red-500 font-bold text-base">{t('profile.logout')}</Text>
      </TouchableOpacity>
    </View>
  );
};
