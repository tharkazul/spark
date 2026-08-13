import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { socialApi } from '../../services/apiServices';
import { SocialFeedActivity } from '../../types/social';

interface FeedSubTabProps {
  onOpenActivityModal?: (id: string | number, activity?: Partial<SocialFeedActivity>) => void;
}

export const FeedSubTab: React.FC<FeedSubTabProps> = ({ onOpenActivityModal }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [feedItems, setFeedItems] = useState<SocialFeedActivity[]>([
    {
      id: 'feed-1',
      user_id: 101,
      username: 'Felix Son',
      spark_level: 14,
      start_date: new Date().toISOString(),
      title: 'Morning Threshold Bike Intervals',
      sport_type: 'BIKE',
      distance_km: 32.4,
      moving_time_min: 65,
      spark_score: 88,
      kudos_count: 14,
      comments_count: 3,
      has_kudosed: false,
    },
    {
      id: 'feed-2',
      user_id: 102,
      username: 'Rutger Van der Berg',
      spark_level: 12,
      start_date: new Date(Date.now() - 86400000).toISOString(),
      title: 'Easy Aerobic Recovery Run',
      sport_type: 'RUN',
      distance_km: 8.2,
      moving_time_min: 42,
      spark_score: 48,
      kudos_count: 21,
      comments_count: 5,
      has_kudosed: true,
    },
  ]);

  useEffect(() => {
    let isMounted = true;
    socialApi
      .getFeed()
      .then((res) => {
        if (!isMounted) return;
        if (res && Array.isArray(res.activities) && res.activities.length > 0) {
          setFeedItems(res.activities);
        }
      })
      .catch((err) => console.log('Feed fetch error:', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleKudos = async (item: SocialFeedActivity) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const id = item.id;
    const nextHasKudosed = !item.has_kudosed;
    const nextKudosCount = nextHasKudosed ? item.kudos_count + 1 : Math.max(0, item.kudos_count - 1);

    setFeedItems((prev) =>
      prev.map((act) =>
        act.id === id
          ? {
              ...act,
              has_kudosed: nextHasKudosed,
              kudos_count: nextKudosCount,
            }
          : act
      )
    );

    try {
      await socialApi.toggleKudos(id);
    } catch (err) {
      console.error('Toggle kudos error:', err);
    }
  };

  if (loading && feedItems.length === 0) {
    return (
      <View className="items-center justify-center p-8">
        <ActivityIndicator size="large" color="#FF5F3B" />
        <Text className="text-xs font-bold text-theme-muted mt-3">Loading social feed...</Text>
      </View>
    );
  }

  return (
    <View className="space-y-4">
      {feedItems.map((item) => (
        <TouchableOpacity
          key={`feed-${item.id}`}
          activeOpacity={0.9}
          onPress={() => onOpenActivityModal && onOpenActivityModal(item.id, item)}
          className="bg-theme-card border border-theme-border rounded-2xl p-4 shadow-sm mb-4"
        >
          {/* Header */}
          <View className="flex-row justify-between items-center mb-3">
            <View className="flex-row items-center space-x-3">
              {item.profile_picture_url ? (
                <Image source={{ uri: item.profile_picture_url }} className="w-10 h-10 rounded-full border border-theme-accent/40" />
              ) : (
                <View className="w-10 h-10 rounded-full bg-theme-accent/20 items-center justify-center border border-theme-accent/40">
                  <Text className="text-sm font-black text-theme-accent">
                    {item.username ? item.username.charAt(0).toUpperCase() : 'A'}
                  </Text>
                </View>
              )}
              <View>
                <View className="flex-row items-center space-x-1.5">
                  <Text className="text-sm font-extrabold text-theme-text">{item.username}</Text>
                  {item.spark_level ? (
                    <View className="px-1.5 py-0.5 bg-theme-accent/15 rounded">
                      <Text className="text-[9px] font-black text-theme-accent">Lvl {item.spark_level}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-[11px] text-theme-muted">
                  {item.start_date ? item.start_date.substring(0, 10) : 'Recent'}
                </Text>
              </View>
            </View>

            <View className="px-2.5 py-1 bg-theme-accent/15 rounded-full flex-row items-center">
              <Ionicons name="flash" size={12} color="#FF5F3B" />
              <Text className="text-xs font-black text-theme-accent ml-1">+{item.spark_score} Spark</Text>
            </View>
          </View>

          {/* Activity Info */}
          <Text className="text-base font-bold text-theme-text mb-2">{item.title}</Text>

          <View className="flex-row items-center space-x-4 bg-theme-bg p-3 rounded-xl mb-3 border border-theme-border/50">
            {typeof item.distance_km === 'number' && (
              <View>
                <Text className="text-[10px] text-theme-muted uppercase font-bold">Distance</Text>
                <Text className="text-sm font-extrabold font-mono text-theme-text">{item.distance_km.toFixed(1)} km</Text>
              </View>
            )}
            {typeof item.moving_time_min === 'number' && (
              <View className="pl-4 border-l border-theme-border/50">
                <Text className="text-[10px] text-theme-muted uppercase font-bold">Duration</Text>
                <Text className="text-sm font-extrabold font-mono text-theme-text">{Math.round(item.moving_time_min)} mins</Text>
              </View>
            )}
          </View>

          {/* Footer Actions */}
          <View className="flex-row items-center justify-between pt-2 border-t border-theme-border/30">
            <TouchableOpacity
              onPress={() => handleToggleKudos(item)}
              className={`flex-row items-center space-x-1.5 px-3 py-1.5 rounded-full ${
                item.has_kudosed ? 'bg-rose-500/15' : 'bg-theme-bg'
              }`}
            >
              <Ionicons
                name={item.has_kudosed ? 'heart' : 'heart-outline'}
                size={16}
                color={item.has_kudosed ? '#F43F5E' : '#6F6F79'}
              />
              <Text className={`text-xs font-extrabold ${item.has_kudosed ? 'text-rose-500' : 'text-theme-muted'}`}>
                {item.kudos_count} Kudos
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onOpenActivityModal && onOpenActivityModal(item.id, item)}
              className="flex-row items-center space-x-1.5 px-3 py-1.5 rounded-full bg-theme-bg"
            >
              <Ionicons name="chatbubble-outline" size={16} color="#6F6F79" />
              <Text className="text-xs font-bold text-theme-muted">{item.comments_count} Comments</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};
