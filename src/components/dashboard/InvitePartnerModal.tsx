import React, { useState, useEffect } from 'react';
import { View, Text, Alert, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { getFullProfilePhotoUrl } from '../../utils/avatarUtils';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { useLanguage } from '../../context/LanguageContext';
import { BottomSheetModal } from '../ui/BottomSheetModal';
import { socialApi } from '../../services/apiServices';
import { SocialConnection } from '../../types/social';
import { WorkoutItem } from '../../types/dashboard';
import * as Haptics from 'expo-haptics';

interface InvitePartnerModalProps {
  visible: boolean;
  onClose: () => void;
  workout: WorkoutItem | null;
}

export function InvitePartnerModal({ visible, onClose, workout }: InvitePartnerModalProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  const [location, setLocation] = useState('');
  const [time, setTime] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible) {
      loadConnections();
      setSelectedIds(new Set());
      setLocation('');
      setTime('');
    }
  }, [visible]);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const res = await socialApi.getConnections();
      setConnections(res.connections.filter(c => c.status === 'accepted'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: number) => {
    Haptics.selectionAsync();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSend = async () => {
    if (!workout || selectedIds.size === 0) return;
    
    if (String(workout.id).startsWith('w-')) {
      Alert.alert("Please wait a moment for the workout to finish saving before inviting.");
      return;
    }

    setSending(true);
    try {
      await socialApi.invite(workout.id, Array.from(selectedIds), location, time);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e) {
      console.error(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
    }
  };

  const renderConnection = ({ item }: { item: SocialConnection }) => {
    const isSelected = selectedIds.has(item.friend_id);
    
    return (
      <TouchableOpacity
        onPress={() => toggleSelection(item.friend_id)}
        activeOpacity={0.75}
        className={`flex-row items-center p-3.5 mb-2.5 rounded-2xl border ${
          isSelected
            ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10'
            : 'border-slate-200 dark:border-theme-border/50 bg-slate-50/60 dark:bg-theme-bg'
        }`}
      >
        {item.profile_picture_url ? (
          <Image
            source={{ uri: getFullProfilePhotoUrl(item.profile_picture_url) || undefined }}
            className="w-10 h-10 rounded-full mr-3"
          />
        ) : (
          <View className="w-10 h-10 rounded-full bg-emerald-500/15 items-center justify-center">
            <Text className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
              {item.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View className="flex-1 ml-3">
          <Text className="text-slate-900 dark:text-theme-text font-bold text-base">{item.username}</Text>
        </View>

        <View
          className={`w-6 h-6 rounded-full border items-center justify-center ${
            isSelected
              ? 'bg-[#10B981] border-[#10B981] shadow-xs'
              : 'bg-white dark:bg-theme-card border-slate-300 dark:border-theme-border/70'
          }`}
        >
          {isSelected && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      contentClassName="bg-theme-card rounded-t-[32px] rounded-b-none px-6 pt-3 h-[90%] border-t border-theme-border/50 shadow-2xl"
      showHandle={true}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="flex-row justify-between items-center pb-4 pt-2">
          <Text className="text-xl font-extrabold text-theme-text">Invite Friends</Text>
          <TouchableOpacity onPress={onClose} className="p-2 -mr-2 bg-theme-bg rounded-full">
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {workout && (
          <View className="bg-theme-bg p-3 rounded-xl mb-4 border border-theme-border/50 flex-row items-center">
            <View className="w-10 h-10 rounded-full bg-theme-tint/10 items-center justify-center mr-3">
               <Ionicons name="calendar-outline" size={20} color={theme.tint} />
            </View>
            <View className="flex-1">
               <Text className="text-theme-text font-bold">{workout.title}</Text>
               <Text className="text-theme-muted text-xs">{workout.dateStr} • {workout.day}</Text>
            </View>
          </View>
        )}

        <View className="flex-row gap-2 mb-4">
          <View className="flex-1">
            <Text className="text-xs font-bold text-theme-muted mb-1 uppercase tracking-wider ml-1">Location (Optional)</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Central Park"
              placeholderTextColor={theme.textSecondary}
              className="bg-theme-bg text-theme-text px-4 py-3 rounded-xl border border-theme-border/50 font-medium"
            />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-bold text-theme-muted mb-1 uppercase tracking-wider ml-1">Time (Optional)</Text>
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="e.g. 07:00 AM"
              placeholderTextColor={theme.textSecondary}
              className="bg-theme-bg text-theme-text px-4 py-3 rounded-xl border border-theme-border/50 font-medium"
            />
          </View>
        </View>

        <Text className="text-xs font-bold text-theme-muted mb-2 uppercase tracking-wider ml-1">Select Connections</Text>
        
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={theme.tint} />
          </View>
        ) : connections.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-theme-muted text-center">No active connections found.</Text>
          </View>
        ) : (
          <FlatList
            data={connections}
            keyExtractor={c => c.friend_id.toString()}
            renderItem={renderConnection}
            className="flex-1"
            showsVerticalScrollIndicator={false}
          />
        )}

        <View className="pt-4 pb-8">
          <TouchableOpacity
            disabled={selectedIds.size === 0 || sending}
            onPress={handleSend}
            className={`py-4 rounded-full items-center justify-center ${(selectedIds.size === 0 || sending) ? 'opacity-50' : ''}`}
            style={{ backgroundColor: theme.tint }}
          >
            {sending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text className="text-white font-extrabold text-base">
                Send {selectedIds.size > 0 ? selectedIds.size : ''} Invite{selectedIds.size !== 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </BottomSheetModal>
  );
}
