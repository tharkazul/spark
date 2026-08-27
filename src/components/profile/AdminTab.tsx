import React, { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { adminApi } from '../../services/apiServices';

export function AdminTab() {
    const theme = useTheme();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUsage = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsage();
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch (err: any) {
      console.log('Admin fetch usage error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const handleAddTokens = async (username: string) => {
    setActionLoading(`tokens-${username}`);
    try {
      await adminApi.addTokens(username);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchUsage();
    } catch (err: any) {
      console.error('Failed to add tokens:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetTier = async (username: string, tier: 'free' | 'rooka_plus' | 'admin') => {
    setActionLoading(`tier-${username}`);
    try {
      await adminApi.setTier(username, tier);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchUsage();
    } catch (err: any) {
      console.error('Failed to update tier:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTriggerMorning = async () => {
    setActionLoading('morning');
    try {
      await adminApi.triggerMorning();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Failed to trigger morning job:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTrigger24h = async () => {
    setActionLoading('24h');
    try {
      await adminApi.simulate24h();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Failed to trigger 24h job:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter((u) =>
    (u.username || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ScrollView className="flex-1 space-y-4">
      {/* System Actions Header */}
      <View className="bg-theme-card p-4 rounded-2xl border border-theme-border">
        <Text className="text-base font-extrabold text-theme-text mb-3">System Triggers</Text>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={handleTriggerMorning}
            disabled={actionLoading !== null}
            className="flex-1 bg-amber-500/15 border border-amber-500/30 p-3 rounded-xl items-center flex-row justify-center gap-1.5"
          >
            {actionLoading === 'morning' ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : (
              <>
                <Ionicons name="sunny-outline" size={16} color={theme.tint} />
                <Text className="text-xs font-bold text-amber-500">Morning Sync</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleTrigger24h}
            disabled={actionLoading !== null}
            className="flex-1 bg-theme-accent/15 border border-theme-accent/30 p-3 rounded-xl items-center flex-row justify-center gap-1.5"
          >
            {actionLoading === '24h' ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : (
              <>
                <Ionicons name="time-outline" size={16} color={theme.tint} />
                <Text className="text-xs font-bold text-theme-accent">Simulate 24h</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* User Management Section */}
      <View className="bg-theme-card p-4 rounded-2xl border border-theme-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-base font-extrabold text-theme-text">User Management</Text>
          <TouchableOpacity onPress={fetchUsage} className="p-1">
            <Ionicons name="refresh" size={18} color={theme.tint} />
          </TouchableOpacity>
        </View>

        <View className="bg-theme-bg p-2.5 rounded-xl flex-row items-center gap-2 mb-3">
          <Ionicons name="search-outline" size={16} color={theme.textSecondary} />
          <TextInput
            className="flex-1 text-sm text-theme-text p-0"
            placeholder="Search username..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading ? (
          <ActivityIndicator color={theme.tint} className="py-6" />
        ) : filteredUsers.length === 0 ? (
          <Text className="text-xs text-theme-muted text-center py-4">No users found</Text>
        ) : (
          filteredUsers.map((u) => (
            <View key={u.username} className="p-3 bg-theme-bg/60 rounded-xl mb-2.5 border border-theme-border/40">
              <View className="flex-row items-center justify-between mb-2">
                <View>
                  <Text className="text-sm font-bold text-theme-text">{u.username}</Text>
                  <Text className="text-xs text-theme-muted">
                    Tier: {u.subscription_tier} · Limit: {u.effective_limit?.toLocaleString() || u.daily_token_limit}
                  </Text>
                </View>
                <View className="flex-row gap-1">
                  <TouchableOpacity
                    onPress={() => handleAddTokens(u.username)}
                    disabled={actionLoading !== null}
                    className="bg-amber-500/20 px-2.5 py-1 rounded-lg"
                  >
                    <Text className="text-xs font-bold text-amber-500">+50k</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSetTier(u.username, u.subscription_tier === 'rooka_plus' ? 'free' : 'rooka_plus')}
                    disabled={actionLoading !== null}
                    className="bg-theme-accent/20 px-2.5 py-1 rounded-lg"
                  >
                    <Text className="text-xs font-bold text-theme-accent">
                      {u.subscription_tier === 'rooka_plus' ? 'Downgrade' : 'Upgrade'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
