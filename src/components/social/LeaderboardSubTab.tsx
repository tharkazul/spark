import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { canAccessLeaderboard } from '../../utils/permissions';
import { useUser } from '../../context/UserStore';
import { useRouter } from 'expo-router';
import { socialApi } from '../../services/apiServices';
import { LeaderboardEntry } from '../../types/social';

export const LeaderboardSubTab: React.FC = () => {
  const { user } = useUser();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'rooka' | 'quests'>('rooka');
  const [loading, setLoading] = useState<boolean>(true);
  const [rookaLeaderboard, setRookaLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [questLeaderboard, setQuestLeaderboard] = useState<LeaderboardEntry[]>([]);

  const hasAccess = canAccessLeaderboard(user?.subscription_tier);

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    socialApi
      .getLeaderboard()
      .then((res) => {
        if (!isMounted) return;
        if (res?.leaderboard && Array.isArray(res.leaderboard)) {
          setRookaLeaderboard(res.leaderboard.map((item, idx) => ({ ...item, rank: idx + 1 })));
        }
        if (res?.questLeaderboard && Array.isArray(res.questLeaderboard)) {
          setQuestLeaderboard(res.questLeaderboard.map((item, idx) => ({ ...item, rank: idx + 1 })));
        }
      })
      .catch((err) => console.log('Leaderboard fetch error:', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [hasAccess]);

  const activeList = activeTab === 'rooka' ? rookaLeaderboard : questLeaderboard;

  if (!hasAccess) {
    return (
      <View className="bg-theme-card border border-theme-border rounded-2xl p-6 items-center justify-center mt-4 shadow-sm">
        <Ionicons name="lock-closed-outline" size={48} color="#FF5F3B" />
        <Text className="text-lg font-extrabold text-theme-text mt-4 text-center">Leaderboard Locked</Text>
        <Text className="text-sm text-theme-muted mt-2 text-center leading-relaxed">
          Upgrade to the Rooka+ subscription to unlock global leaderboards and rank against your friends.
        </Text>
        <TouchableOpacity
          onPress={() => router.navigate('/profile')}
          className="mt-6 bg-theme-accent px-6 py-3 rounded-full shadow-md"
        >
          <Text className="text-white font-black text-center">Upgrade to Rooka+</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="space-y-4 mb-8">
      {/* Dual Tab Switcher for Rooka Score vs 7-Day Quests */}
      <View className="flex-row bg-theme-card border border-theme-border rounded-2xl p-1 mb-4 shadow-sm">
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('rooka');
          }}
          className={`flex-1 py-2.5 rounded-xl items-center justify-center ${
            activeTab === 'rooka' ? 'bg-theme-accent' : 'bg-transparent'
          }`}
        >
          <Text
            className={`text-xs font-black ${
              activeTab === 'rooka' ? 'text-white' : 'text-theme-muted'
            }`}
          >
            ⚡️ Rooka Score
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('quests');
          }}
          className={`flex-1 py-2.5 rounded-xl items-center justify-center ${
            activeTab === 'quests' ? 'bg-theme-accent' : 'bg-transparent'
          }`}
        >
          <Text
            className={`text-xs font-black ${
              activeTab === 'quests' ? 'text-white' : 'text-theme-muted'
            }`}
          >
            🏆 7-Day Quests
          </Text>
        </TouchableOpacity>
      </View>

      {/* Leaderboard Ranks List */}
      {loading ? (
        <View className="items-center justify-center p-8">
          <ActivityIndicator size="large" color="#FF5F3B" />
          <Text className="text-xs font-bold text-theme-muted mt-3">Fetching leaderboard rankings...</Text>
        </View>
      ) : (
        activeList.map((item, index) => {
          const isCurrentUser = user?.id ? item.user_id === user.id : item.username === user?.username;
          const questsCount = (item as any).completed_quests_count ?? item.quests_completed_7d ?? 0;

          return (
            <View
              key={`rank-${item.user_id || item.rank}`}
              className={`bg-theme-card border rounded-2xl p-4 mb-2.5 flex-row justify-between items-center shadow-sm ${
                isCurrentUser ? 'border-theme-accent bg-theme-accent/5' : 'border-theme-border'
              }`}
            >
              <View className="flex-row items-center space-x-3">
                <View
                  className={`w-9 h-9 rounded-full items-center justify-center ${
                    item.rank === 1
                      ? 'bg-amber-400 border border-amber-500'
                      : item.rank === 2
                      ? 'bg-slate-300 border border-slate-400'
                      : item.rank === 3
                      ? 'bg-amber-700 border border-amber-800'
                      : 'bg-theme-bg border border-theme-border'
                  }`}
                >
                  <Text
                    className={`text-xs font-black ${
                      item.rank <= 3 ? 'text-slate-950' : 'text-theme-muted'
                    }`}
                  >
                    #{item.rank}
                  </Text>
                </View>

                <View>
                  <View className="flex-row items-center space-x-1.5">
                    <Text className="text-sm font-extrabold text-theme-text">{item.username}</Text>
                    {isCurrentUser && (
                      <View className="bg-theme-accent px-1.5 py-0.5 rounded">
                        <Text className="text-[9px] font-black text-white">YOU</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-[11px] text-theme-muted font-medium">
                    Lvl {item.rooka_level || 1} · {questsCount} Quests Completed
                  </Text>
                </View>
              </View>

              <View className="items-end">
                <Text className="text-base font-black text-theme-accent font-mono">
                  {activeTab === 'rooka' ? Math.round(item.total_rooka_score || 0) : questsCount}
                </Text>
                <Text className="text-[10px] text-theme-muted uppercase font-bold">
                  {activeTab === 'rooka' ? 'Points' : 'Quests'}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
};
