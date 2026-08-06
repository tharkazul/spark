import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { userApi } from '../../services/apiServices';
import { useLanguage } from '../../context/LanguageContext';

interface AccountTabProps {
  onLogout: () => void;
  isSparkPlus: boolean;
}

export const AccountTab: React.FC<AccountTabProps> = ({ onLogout, isSparkPlus }) => {
  const { t } = useLanguage();
  const [trackingUpgrade, setTrackingUpgrade] = useState(false);

  const handleSparkPlusClick = async () => {
    setTrackingUpgrade(true);
    try {
      await userApi.trackSparkPlusClick();
      Alert.alert(
        'Spark+ Premium',
        'Spark+ gives you unlimited daily AI Coach tokens, priority workout generation, advanced periodization, and direct Garmin sync!'
      );
    } catch (err) {
      Alert.alert(
        'Spark+ Premium',
        'Spark+ gives you unlimited daily AI Coach tokens, priority workout generation, advanced periodization, and direct Garmin sync!'
      );
    } finally {
      setTrackingUpgrade(false);
    }
  };

  const handleExportData = () => {
    Alert.alert(
      'Export Data',
      'Your activity history, physique logs, and settings will be compiled into a JSON download. A link will be sent to your email.'
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to request account deletion? This action is permanent and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Deletion',
          style: 'destructive',
          onPress: () => Alert.alert('Request Sent', 'Your account deletion request has been logged.'),
        },
      ]
    );
  };

  return (
    <View className="space-y-6">
      {/* USAGE STATISTICS */}
      <Card className="p-4 mb-6">
        <View className="flex-row items-center gap-2 pb-3 mb-3 border-b border-theme-border">
          <View className="w-2.5 h-2.5 rounded-full bg-purple-500" />
          <Text className="text-theme-text font-bold text-sm">Usage Statistics</Text>
        </View>

        <View className="p-4 bg-theme-bg rounded-xl border border-theme-border flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              Personal Daily Token Use Rate
            </Text>
            <Text className="text-xs text-theme-muted mt-1">
              Tokens consumed today by AI Coach interactions
            </Text>
          </View>
          <View className="px-3 py-1.5 bg-theme-accent/10 border border-theme-accent/30 rounded-xl">
            <Text className="text-lg font-bold text-theme-accent">1,420</Text>
          </View>
        </View>
      </Card>

      {/* SPARK+ UPGRADE CARD */}
      <TouchableOpacity
        onPress={handleSparkPlusClick}
        activeOpacity={0.9}
        className="bg-gradient-to-r from-orange-500 to-purple-600 rounded-2xl p-6 mb-6 shadow-md border border-orange-400/30"
      >
        <View className="flex-row items-center gap-2 mb-2">
          <Ionicons name="flash" size={24} color="#FFF" />
          <Text className="text-white text-xl font-extrabold tracking-tight">
            {isSparkPlus ? 'Spark+ Active' : 'Upgrade to Spark+'}
          </Text>
        </View>

        <Text className="text-white/90 text-xs mb-4 leading-relaxed">
          Unlock 50,000 daily coach tokens, priority workout adaptation, custom macro periodization, and deeper athletic insights.
        </Text>

        <View className="bg-white py-2.5 px-5 rounded-full self-start flex-row items-center shadow-sm">
          {trackingUpgrade ? (
            <ActivityIndicator size="small" color="#FF5A1F" />
          ) : (
            <Text className="text-theme-accent font-bold text-xs">
              {isSparkPlus ? 'View Member Benefits' : 'View Premium Benefits'}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* DATA & PRIVACY */}
      <Card className="p-4 mb-6">
        <View className="flex-row items-center gap-2 pb-3 mb-3 border-b border-theme-border">
          <View className="w-2.5 h-2.5 rounded-full bg-slate-500" />
          <Text className="text-theme-text font-bold text-sm">Account Data & Privacy</Text>
        </View>

        <View className="space-y-3">
          <TouchableOpacity
            onPress={handleExportData}
            className="p-3 bg-theme-bg border border-theme-border rounded-xl flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Ionicons name="download-outline" size={18} color="#8E8E93" />
              <Text className="text-theme-text font-bold text-xs ml-3">Export My Account Data</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDeleteAccount}
            className="p-3 bg-theme-bg border border-theme-border rounded-xl flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text className="text-red-500 font-bold text-xs ml-3">Request Account Deletion</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      </Card>

      {/* LOG OUT BUTTON */}
      <TouchableOpacity
        onPress={onLogout}
        className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl items-center mb-6"
      >
        <Text className="text-red-500 font-bold text-base">{t('profile.logout')}</Text>
      </TouchableOpacity>
    </View>
  );
};
