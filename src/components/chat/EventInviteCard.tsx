import React, { useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventInvitePayload } from '../../types/chat';

interface EventInviteCardProps {
  payload: EventInvitePayload;
  onAccept: (inviteId: number | string) => Promise<void>;
  onDecline: (inviteId: number | string) => Promise<void>;
}

const getSportIcon = (sport?: string): keyof typeof Ionicons.glyphMap => {
  const s = (sport || '').toLowerCase();
  if (s.includes('run')) return 'fitness-outline';
  if (s.includes('ride') || s.includes('cycl')) return 'bicycle-outline';
  if (s.includes('swim')) return 'water-outline';
  if (s.includes('strength') || s.includes('gym')) return 'barbell-outline';
  return 'calendar-outline';
};

export const EventInviteCard: React.FC<EventInviteCardProps> = ({
  payload,
  onAccept,
  onDecline,
}) => {
    const theme = useTheme();
  const [status, setStatus] = useState<'pending' | 'accepted' | 'declined'>(payload.status || 'pending');
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

  const handleAccept = async () => {
    if (loading) return;
    setLoading('accept');
    try {
      await onAccept(payload.invite_id);
      setStatus('accepted');
    } catch (e) {
      console.error('Failed to accept event invite:', e);
    } finally {
      setLoading(null);
    }
  };

  const handleDecline = async () => {
    if (loading) return;
    setLoading('decline');
    try {
      await onDecline(payload.invite_id);
      setStatus('declined');
    } catch (e) {
      console.error('Failed to decline event invite:', e);
    } finally {
      setLoading(null);
    }
  };

  return (
    <View className="my-3 bg-theme-card/90 border border-theme-border rounded-tile p-4 shadow-sm">
      <View className="flex-row items-center gap-3 mb-3">
        <View className="w-10 h-10 rounded-full bg-theme-accent/15 items-center justify-center">
          <Ionicons name={getSportIcon(payload.sport)} size={20} color={theme.tint} />
        </View>
        <View className="flex-1">
          <Text className="text-theme-text font-bold text-sm">
            {payload.inviter_name ? `${payload.inviter_name} invited you` : 'Event Invitation'}
          </Text>
          <Text className="text-theme-muted text-xs font-medium mt-0.5">
            {payload.sport.toUpperCase()} • {payload.date}
          </Text>
        </View>
      </View>

      {payload.description ? (
        <Text className="text-theme-text text-sm mb-3 font-normal leading-5">
          {payload.description}
        </Text>
      ) : null}

      {status === 'pending' ? (
        <View className="flex-row items-center gap-2 pt-2 border-t border-theme-border/60">
          <TouchableOpacity
            onPress={handleAccept}
            disabled={loading !== null}
            className="flex-1 bg-theme-accent py-2.5 rounded-xl items-center justify-center flex-row gap-1.5"
            activeOpacity={0.8}
          >
            {loading === 'accept' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                <Text className="text-white font-bold text-xs">Accept</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDecline}
            disabled={loading !== null}
            className="flex-1 bg-theme-bg border border-theme-border py-2.5 rounded-xl items-center justify-center flex-row gap-1.5"
            activeOpacity={0.8}
          >
            {loading === 'decline' ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <>
                <Ionicons name="close" size={16} color="#9CA3AF" />
                <Text className="text-theme-muted font-bold text-xs">Decline</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View className="pt-2 border-t border-theme-border/60 flex-row items-center gap-2">
          <View
            className={`px-3 py-1.5 rounded-lg flex-row items-center gap-1.5 ${
              status === 'accepted' ? 'bg-emerald-500/15' : 'bg-red-500/15'
            }`}
          >
            <Ionicons
              name={status === 'accepted' ? 'checkmark-circle' : 'close-circle'}
              size={14}
              color={status === 'accepted' ? '#10B981' : '#EF4444'}
            />
            <Text
              className={`text-xs font-bold ${
                status === 'accepted' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {status === 'accepted' ? 'Invitation Accepted' : 'Invitation Declined'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};
