import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { socialApi } from '../../services/apiServices';

interface ConnectionRequestCardProps {
  payload: {
    type: 'connection_request' | 'connection_accepted';
    friend_id?: number;
    fromUserId?: number;
    username?: string;
    status?: string;
  };
  onConnectionAccepted?: () => void;
}

export const ConnectionRequestCard: React.FC<ConnectionRequestCardProps> = ({
  payload,
  onConnectionAccepted,
}) => {
  const targetId = payload.friend_id || payload.fromUserId;
  const isAcceptedType = payload.type === 'connection_accepted' || payload.status === 'accepted';
  const [accepted, setAccepted] = useState(isAcceptedType);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!targetId || accepted) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const res = await socialApi.acceptUser(targetId);
      if (res && res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setAccepted(true);
        if (onConnectionAccepted) onConnectionAccepted();
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="mt-3 p-3.5 bg-theme-bg border border-theme-border/70 rounded-2xl">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center space-x-3">
          <View className="w-9 h-9 rounded-full bg-theme-accent/20 items-center justify-center border border-theme-accent/40">
            <Ionicons
              name={accepted ? 'checkmark-circle' : 'person-add'}
              size={18}
              color={accepted ? '#10B981' : '#FF5F3B'}
            />
          </View>
          <View>
            <Text className="text-sm font-extrabold text-theme-text">{payload.username || 'Rooka Athlete'}</Text>
            <Text className="text-[11px] text-theme-muted font-medium">
              {accepted ? 'Connected Athlete' : 'Sent you a connection request'}
            </Text>
          </View>
        </View>

        {accepted ? (
          <View className="flex-row items-center bg-emerald-500/15 px-3 py-1.5 rounded-full border border-emerald-500/30">
            <Ionicons name="checkmark-circle" size={13} color="#10B981" />
            <Text className="text-xs font-extrabold text-emerald-500 ml-1">Connected</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleAccept}
            disabled={loading}
            className="bg-emerald-500 px-3.5 py-1.5 rounded-xl shadow-xs flex-row items-center space-x-1"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-xs font-extrabold text-white">Accept</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
