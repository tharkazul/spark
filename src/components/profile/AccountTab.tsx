import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
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
  isSparkPlus: boolean;
}

export const AccountTab: React.FC<AccountTabProps> = ({ onLogout, isSparkPlus }) => {
  const { t } = useLanguage();
  const { user } = useUser();
  const { tokenUsage } = useCoachChatStore();
  const [trackingUpgrade, setTrackingUpgrade] = useState(false);

  const tier = user?.subscription_tier || 'free';
  const isMember = isSparkPlus || tier === 'admin' || tier === 'premium' || tier === 'spark_plus' || tier === 'subscription';

  const dailyUsage = tokenUsage?.daily_token_usage ?? (user as any)?.dailyTokenUsage ?? (user as any)?.daily_token_usage ?? 0;
  const dailyLimit = tokenUsage?.daily_token_limit ?? (user as any)?.dailyTokenLimit ?? (user as any)?.daily_token_limit ?? (tier === 'admin' ? 500000 : isMember ? 50000 : 5000);

  const handleSparkPlusClick = async () => {
    setTrackingUpgrade(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await userApi.trackSparkPlusClick();
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
    } catch (err: any) {
      console.error('Export data error:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await userApi.deleteAccount();
      onLogout();
    } catch (err: any) {
      console.error('Deletion error:', err);
    } finally {
      setDeleting(false);
    }
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

      {/* SPARK+ UPGRADE / MEMBER CARD */}
      <TouchableOpacity
        onPress={handleSparkPlusClick}
        activeOpacity={0.9}
        className="mb-6 rounded-2xl overflow-hidden shadow-lg border border-theme-border/30"
      >
        <LinearGradient
          colors={isMember ? ['#1E293B', '#0F172A'] : ['#FF5A1F', '#7C3AED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 22, borderRadius: 16 }}
        >
          <View className="flex-row items-center justify-between mb-2.5">
            <View className="flex-row items-center">
              <Ionicons name="flash" size={24} color="#FFF" />
              <Text className="text-white text-xl font-extrabold tracking-tight ml-2">
                {isMember
                  ? (tier === 'admin' ? '⚡ Spark Admin Access' : '⚡ Spark+ Active')
                  : 'Upgrade to Spark+'}
              </Text>
            </View>
            <View className="px-2.5 py-1 bg-white/20 rounded-full">
              <Text className="text-white text-[10px] font-extrabold uppercase tracking-wider">
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
              <ActivityIndicator size="small" color="#FF5A1F" />
            ) : (
              <Text className="text-theme-accent font-bold text-xs">
                {isMember ? 'View Member Benefits' : 'View Premium Benefits'}
              </Text>
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* DATA & PRIVACY */}
      <Card className="p-4 mb-6">
        <View className="flex-row items-center gap-2 pb-3 mb-3">
          <View className="w-2.5 h-2.5 rounded-full bg-slate-500" />
          <Text className="text-theme-text font-bold text-sm">Account Data & Privacy</Text>
        </View>

        <View className="space-y-3">
          <TouchableOpacity
            onPress={handleExportData}
            disabled={exporting}
            className="p-3 bg-theme-bg rounded-xl flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              {exporting ? (
                <ActivityIndicator size="small" color="#FF5A1F" />
              ) : (
                <Ionicons name="download-outline" size={18} color="#8E8E93" />
              )}
              <Text className="text-theme-text font-bold text-xs ml-3">Export My Account Data</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#8E8E93" />
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
              <Text className="text-red-500 font-bold text-xs ml-3">Delete My Account</Text>
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
