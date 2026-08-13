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

  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    try {
      const res = await userApi.requestAccountData();
      Alert.alert(
        'Export Request Recorded',
        res.message || 'Your activity history, physique logs, and settings compilation request has been recorded.'
      );
    } catch (err: any) {
      Alert.alert(
        'Export Data',
        err?.message || 'Your activity history, physique logs, and settings will be compiled. A link will be sent to your email.'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? All workout history, physique logs, AI chat messages, and social connections will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue Deletion',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This action is PERMANENT and CANNOT be undone. Are you absolutely sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Permanently Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      const res = await userApi.deleteAccount();
                      Alert.alert(
                        'Account Deleted',
                        res.message || 'Your account and data have been permanently deleted.',
                        [
                          {
                            text: 'OK',
                            onPress: () => onLogout(),
                          },
                        ]
                      );
                    } catch (err: any) {
                      Alert.alert(
                        'Deletion Error',
                        err?.message || 'Failed to delete account. Please try again or contact support.'
                      );
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View className="space-y-6">
      {/* USAGE STATISTICS */}
      <Card className="p-4 mb-6">
        <View className="flex-row items-center gap-2 pb-3 mb-3">
          <View className="w-2.5 h-2.5 rounded-full bg-purple-500" />
          <Text className="text-theme-text font-bold text-sm">Usage Statistics</Text>
        </View>

        <View className="p-4 bg-theme-bg rounded-xl flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              Personal Daily Token Use Rate
            </Text>
            <Text className="text-xs text-theme-muted mt-1">
              Tokens consumed today by AI Coach interactions
            </Text>
          </View>
          <View className="px-3 py-1.5 bg-theme-accent/10 rounded-xl">
            <Text className="text-lg font-bold text-theme-accent">1,420</Text>
          </View>
        </View>
      </Card>

      {/* SPARK+ UPGRADE CARD */}
      <TouchableOpacity
        onPress={handleSparkPlusClick}
        activeOpacity={0.9}
        className="bg-gradient-to-r from-orange-500 to-purple-600 rounded-2xl p-6 mb-6 shadow-md"
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
