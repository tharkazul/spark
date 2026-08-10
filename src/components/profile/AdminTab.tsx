import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { adminApi } from '../../services/apiServices';

interface UserUsageItem {
  username: string;
  login_count: number;
  chat_count: number;
  daily_token_usage: number;
  common_token_usage: number;
  daily_token_limit: number;
  effective_limit: number;
  subscription_tier: string;
  last_token_reset_date: string;
  spark_plus_clicks: number;
  strava_connected: number;
  garmin_connected: number;
  activities_count: number;
}

export const AdminTab: React.FC = () => {
  const [users, setUsers] = useState<UserUsageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Selected user tier modal state
  const [selectedUser, setSelectedUser] = useState<UserUsageItem | null>(null);
  const [tierModalVisible, setTierModalVisible] = useState(false);

  const fetchAdminData = async () => {
    try {
      const data = await adminApi.getUsage();
      setUsers(data || []);
    } catch (err: any) {
      console.error('Failed to fetch admin usage:', err);
      Alert.alert('Admin Error', err.message || 'Failed to fetch user usage metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAdminData();
  };

  const handleTriggerMorning = async () => {
    setActionLoading('morning');
    try {
      const res = await adminApi.triggerMorning();
      Alert.alert('Morning Message', res.message || 'Morning message cron job triggered!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to trigger morning message job.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSimulate24h = async () => {
    setActionLoading('simulate24h');
    try {
      const res = await adminApi.simulate24h();
      Alert.alert('24h Inactivity Check', res.message || 'Simulated 24h check completed!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to run 24h simulation.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddTokens = async (username: string) => {
    setActionLoading(`tokens_${username}`);
    try {
      const res = await adminApi.addTokens(username);
      Alert.alert('Tokens Added', res.message || `Added 50k tokens to ${username}`);
      await fetchAdminData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add tokens.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetTier = async (username: string, tier: string) => {
    setActionLoading(`tier_${username}_${tier}`);
    try {
      const res = await adminApi.setTier(username, tier);
      Alert.alert('Tier Updated', res.message || `Set ${username} to ${tier}`);
      setTierModalVisible(false);
      setSelectedUser(null);
      await fetchAdminData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to set subscription tier.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = (username: string) => {
    Alert.alert(
      'Delete User',
      `Are you sure you want to soft-delete athlete "${username}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(`delete_${username}`);
            try {
              const res = await adminApi.deleteUser(username);
              Alert.alert('User Deleted', res.message || `User ${username} has been deleted.`);
              await fetchAdminData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete user.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const renderTierBadge = (tier: string) => {
    switch (tier) {
      case 'admin':
        return (
          <View className="px-2 py-0.5 bg-red-500/10 rounded-full border border-red-500/30">
            <Text className="text-[10px] font-bold text-red-500 uppercase">Admin</Text>
          </View>
        );
      case 'spark_plus':
        return (
          <View className="px-2 py-0.5 bg-purple-500/10 rounded-full border border-purple-500/30">
            <Text className="text-[10px] font-bold text-purple-400 uppercase">Spark+</Text>
          </View>
        );
      default:
        return (
          <View className="px-2 py-0.5 bg-gray-500/10 rounded-full border border-gray-500/30">
            <Text className="text-[10px] font-bold text-gray-400 uppercase">Free</Text>
          </View>
        );
    }
  };

  const renderUserCard = ({ item }: { item: UserUsageItem }) => (
    <Card className="p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-bold text-theme-text">{item.username}</Text>
          {renderTierBadge(item.subscription_tier)}
        </View>

        <TouchableOpacity
          onPress={() => {
            setSelectedUser(item);
            setTierModalVisible(true);
          }}
          className="px-2.5 py-1 bg-theme-bg rounded-lg flex-row items-center"
        >
          <Text className="text-xs font-bold text-theme-accent mr-1">Edit Tier</Text>
          <Ionicons name="create-outline" size={12} color="#16ACBD" />
        </TouchableOpacity>
      </View>

      <View className="p-3 bg-theme-bg rounded-xl my-2">
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-xs text-theme-muted">Logins:</Text>
          <Text className="text-xs font-bold text-theme-text">{item.login_count || 0}</Text>
        </View>
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-xs text-theme-muted">Chats:</Text>
          <Text className="text-xs font-bold text-theme-text">{item.chat_count || 0}</Text>
        </View>
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-xs text-theme-muted">Activities:</Text>
          <Text className="text-xs font-bold text-theme-text">{item.activities_count || 0}</Text>
        </View>
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-xs text-theme-muted">Daily Token Limit:</Text>
          <Text className="text-xs font-bold text-theme-accent">
            {(item.daily_token_usage || 0).toLocaleString()} / {(item.effective_limit || item.daily_token_limit || 10000).toLocaleString()}
          </Text>
        </View>
        <View className="flex-row justify-between items-center">
          <Text className="text-xs text-theme-muted">Integrations:</Text>
          <View className="flex-row gap-1">
            {item.strava_connected === 1 && (
              <Ionicons name="fitness-outline" size={14} color="#FC4C02" />
            )}
            {item.garmin_connected === 1 && (
              <Ionicons name="watch-outline" size={14} color="#FF5A1F" />
            )}
            {item.strava_connected === 0 && item.garmin_connected === 0 && (
              <Text className="text-[10px] text-theme-muted">None</Text>
            )}
          </View>
        </View>
      </View>

      <View className="flex-row items-center justify-end gap-2 mt-2 pt-2 border-t border-theme-bg">
        <TouchableOpacity
          onPress={() => handleAddTokens(item.username)}
          disabled={actionLoading === `tokens_${item.username}`}
          className="px-3 py-1.5 bg-theme-accent/10 rounded-lg flex-row items-center"
        >
          {actionLoading === `tokens_${item.username}` ? (
            <ActivityIndicator size="small" color="#16ACBD" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={14} color="#16ACBD" />
              <Text className="text-xs font-bold text-theme-accent ml-1">+50k Tokens</Text>
            </>
          )}
        </TouchableOpacity>

        {item.subscription_tier !== 'admin' && (
          <TouchableOpacity
            onPress={() => handleDeleteUser(item.username)}
            disabled={actionLoading === `delete_${item.username}`}
            className="px-3 py-1.5 bg-red-500/10 rounded-lg flex-row items-center"
          >
            {actionLoading === `delete_${item.username}` ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={14} color="#EF4444" />
                <Text className="text-xs font-bold text-red-500 ml-1">Delete</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );

  return (
    <View className="space-y-6">
      {/* QUICK SYSTEM TRIGGERS */}
      <Card className="p-4 mb-4">
        <View className="flex-row items-center gap-2 pb-3 mb-3">
          <View className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <Text className="text-theme-text font-bold text-sm">System Administration & Jobs</Text>
        </View>

        <View className="space-y-3">
          <TouchableOpacity
            onPress={handleTriggerMorning}
            disabled={actionLoading === 'morning'}
            className="p-3 bg-theme-bg rounded-xl flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Ionicons name="sunny-outline" size={18} color="#FF9500" />
              <Text className="text-theme-text font-bold text-xs ml-3">Trigger Morning Check-in Job</Text>
            </View>
            {actionLoading === 'morning' ? (
              <ActivityIndicator size="small" color="#16ACBD" />
            ) : (
              <Ionicons name="play" size={16} color="#8E8E93" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSimulate24h}
            disabled={actionLoading === 'simulate24h'}
            className="p-3 bg-theme-bg rounded-xl flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Ionicons name="time-outline" size={18} color="#AF52DE" />
              <Text className="text-theme-text font-bold text-xs ml-3">Simulate 24h Inactivity Check</Text>
            </View>
            {actionLoading === 'simulate24h' ? (
              <ActivityIndicator size="small" color="#16ACBD" />
            ) : (
              <Ionicons name="play" size={16} color="#8E8E93" />
            )}
          </TouchableOpacity>
        </View>
      </Card>

      {/* USER MANAGEMENT & USAGE METRICS */}
      <View className="flex-row items-center justify-between mb-3 px-1">
        <Text className="text-theme-text font-bold text-base">Registered Athletes ({users.length})</Text>
        <TouchableOpacity onPress={handleRefresh} className="p-1">
          <Ionicons name="refresh" size={18} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="py-12 items-center justify-center">
          <ActivityIndicator size="large" color="#16ACBD" />
          <Text className="text-xs text-theme-muted mt-2">Loading user metrics...</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.username}
          renderItem={renderUserCard}
          scrollEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View className="p-6 items-center">
              <Text className="text-theme-muted text-sm">No active users found.</Text>
            </View>
          }
        />
      )}

      {/* CHANGE USER TIER MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={tierModalVisible}
        onRequestClose={() => setTierModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          <View className="bg-theme-bg p-6 rounded-2xl w-full max-w-sm">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-theme-text">
                Manage {selectedUser?.username}
              </Text>
              <TouchableOpacity onPress={() => setTierModalVisible(false)}>
                <Ionicons name="close" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-theme-muted mb-4">
              Select subscription tier to grant or revoke features:
            </Text>

            <View className="space-y-3 mb-4">
              {['free', 'spark_plus', 'admin'].map((tier) => (
                <TouchableOpacity
                  key={tier}
                  onPress={() => selectedUser && handleSetTier(selectedUser.username, tier)}
                  disabled={!!actionLoading}
                  className={`p-3.5 rounded-xl flex-row items-center justify-between ${
                    selectedUser?.subscription_tier === tier
                      ? 'bg-theme-accent/20 border border-theme-accent'
                      : 'bg-theme-card'
                  }`}
                >
                  <Text
                    className={`font-bold text-sm capitalize ${
                      selectedUser?.subscription_tier === tier ? 'text-theme-accent' : 'text-theme-text'
                    }`}
                  >
                    {tier === 'spark_plus' ? 'Spark+ (50k limit)' : tier === 'admin' ? 'Admin (Unlimited)' : 'Free (10k limit)'}
                  </Text>
                  {selectedUser?.subscription_tier === tier && (
                    <Ionicons name="checkmark-circle" size={20} color="#16ACBD" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
