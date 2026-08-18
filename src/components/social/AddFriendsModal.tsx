import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { socialApi } from '../../services/apiServices';

interface AddFriendsModalProps {
  visible: boolean;
  onClose: () => void;
  onConnectionsUpdated?: () => void;
}

interface SearchUserResult {
  id: number;
  username: string;
  profile_picture_url?: string;
  status: 'none' | 'pending' | 'pending_received' | 'accepted' | 'self' | null;
}

export const AddFriendsModal: React.FC<AddFriendsModalProps> = ({
  visible,
  onClose,
  onConnectionsUpdated,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [connectingId, setConnectingId] = useState<number | null>(null);

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const lastSearchIdRef = useRef<number>(0);
  const latestDisplayedSearchIdRef = useRef<number>(0);

  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      lastSearchIdRef.current = 0;
      latestDisplayedSearchIdRef.current = 0;
      fetchPendingRequests();
    }
  }, [visible]);

  // Instant active live search on every keystroke
  const handleQueryChange = (text: string) => {
    setSearchQuery(text);
    const term = text.trim();
    if (!term) {
      lastSearchIdRef.current++;
      latestDisplayedSearchIdRef.current = lastSearchIdRef.current;
      setSearchResults([]);
      setHasSearched(false);
      setSearching(false);
      return;
    }
    executeSearch(term);
  };

  const fetchPendingRequests = async () => {
    try {
      const res = await socialApi.getConnections();
      if (res && res.connections) {
        const pending = res.connections.filter((c: any) => c.status === 'pending_received');
        setPendingRequests(pending);
      }
    } catch (e) {
      console.log('Error fetching connections:', e);
    }
  };

  const executeSearch = async (term: string) => {
    const searchId = ++lastSearchIdRef.current;
    setSearching(true);

    try {
      const res = await socialApi.searchUser(term);
      // Display results if this response is newer than what is currently rendered
      if (searchId >= latestDisplayedSearchIdRef.current) {
        latestDisplayedSearchIdRef.current = searchId;
        let users: SearchUserResult[] = [];
        if (res && res.found) {
          if (Array.isArray(res.users) && res.users.length > 0) {
            users = res.users.map((u) => ({
              id: u.id,
              username: u.username,
              profile_picture_url: u.profile_picture_url,
              status: (u.status as any) || 'none',
            }));
          } else if (res.user) {
            users = [
              {
                id: res.user.id,
                username: res.user.username,
                profile_picture_url: (res.user as any).profile_picture_url,
                status: (res.user.status as any) || 'none',
              },
            ];
          }
        }
        setSearchResults(users);
        setHasSearched(true);
      }
    } catch (err: any) {
      if (searchId >= latestDisplayedSearchIdRef.current) {
        latestDisplayedSearchIdRef.current = searchId;
        setSearchResults([]);
        setHasSearched(true);
      }
    } finally {
      if (searchId === lastSearchIdRef.current) {
        setSearching(false);
      }
    }
  };

  const handleConnect = async (friendId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConnectingId(friendId);
    try {
      const res = await socialApi.connectUser(friendId);
      if (res && res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSearchResults((prev) =>
          prev.map((item) => (item.id === friendId ? { ...item, status: 'pending' } : item))
        );
        if (onConnectionsUpdated) onConnectionsUpdated();
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setConnectingId(null);
    }
  };

  const handleAccept = async (friendId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConnectingId(friendId);
    try {
      const res = await socialApi.acceptUser(friendId);
      if (res && res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSearchResults((prev) =>
          prev.map((item) => (item.id === friendId ? { ...item, status: 'accepted' } : item))
        );
        setPendingRequests((prev) => prev.filter((req) => req.friend_id !== friendId && req.id !== friendId));
        if (onConnectionsUpdated) onConnectionsUpdated();
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end bg-black/60"
      >
        <View className="bg-theme-card border-t border-theme-border rounded-t-3xl p-5 max-h-[85%] min-h-[460px]">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-4 border-b border-theme-border/50">
            <View className="flex-row items-center space-x-2">
              <View className="w-8 h-8 rounded-full bg-theme-accent/15 items-center justify-center">
                <Ionicons name="person-add" size={16} color="#FF5F3B" />
              </View>
              <Text className="text-lg font-extrabold text-theme-text">Find & Add Friends</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-theme-bg items-center justify-center border border-theme-border/60"
            >
              <Ionicons name="close" size={18} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 pt-4" showsVerticalScrollIndicator={false}>
            {/* Active Live Search Input */}
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
                Live Athlete Search
              </Text>
              {searchQuery.trim().length > 0 && (
                <Text className="text-[10px] text-theme-accent font-bold uppercase tracking-wide">
                  Searching live
                </Text>
              )}
            </View>

            <View className="flex-row items-center bg-theme-bg border border-theme-border/80 rounded-xl px-3 py-2 mb-4">
              <Ionicons name="search" size={18} color="#8E8E93" />
              <TextInput
                value={searchQuery}
                onChangeText={handleQueryChange}
                onSubmitEditing={() => executeSearch(searchQuery.trim())}
                returnKeyType="search"
                placeholder="Start typing username..."
                placeholderTextColor="#8E8E93"
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 text-sm font-semibold text-theme-text py-1 ml-2"
              />
              {searching ? (
                <ActivityIndicator size="small" color="#FF5F3B" className="mr-1" />
              ) : searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => handleQueryChange('')} className="mr-1">
                  <Ionicons name="close-circle" size={18} color="#8E8E93" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Live Search Results (Top 10 Accounts, Alphabetical) */}
            {hasSearched && (
              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
                    Matching Accounts ({searchResults.length})
                  </Text>
                  {searchResults.length > 0 && (
                    <Text className="text-[10px] text-theme-muted font-medium">Top matches A-Z</Text>
                  )}
                </View>

                {searchResults.length > 0 ? (
                  <View className="space-y-2">
                    {searchResults.map((item) => {
                      const isConnecting = connectingId === item.id;
                      return (
                        <View
                          key={`search-user-${item.id}`}
                          className="flex-row items-center justify-between p-3.5 bg-theme-bg border border-theme-border/60 rounded-2xl mb-2"
                        >
                          <View className="flex-row items-center space-x-3">
                            {item.profile_picture_url ? (
                              <Image
                                source={{ uri: item.profile_picture_url }}
                                className="w-10 h-10 rounded-full border border-theme-accent/40"
                              />
                            ) : (
                              <View className="w-10 h-10 rounded-full bg-theme-accent/20 items-center justify-center border border-theme-accent/40">
                                <Text className="text-sm font-black text-theme-accent">
                                  {item.username.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                            )}
                            <View>
                              <Text className="text-sm font-extrabold text-theme-text">
                                {item.username}
                              </Text>
                              <Text className="text-[11px] text-theme-muted font-medium">
                                Spark Athlete
                              </Text>
                            </View>
                          </View>

                          {/* Action Button per Item */}
                          {item.status === 'self' ? (
                            <View className="bg-theme-accent/15 px-3 py-1.5 rounded-full border border-theme-accent/30">
                              <Text className="text-xs font-bold text-theme-accent">You</Text>
                            </View>
                          ) : item.status === 'accepted' ? (
                            <View className="flex-row items-center bg-emerald-500/15 px-3 py-1.5 rounded-full border border-emerald-500/30">
                              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                              <Text className="text-xs font-bold text-emerald-500 ml-1">Connected</Text>
                            </View>
                          ) : item.status === 'pending' ? (
                            <View className="bg-theme-border/30 px-3 py-1.5 rounded-full border border-theme-border">
                              <Text className="text-xs font-bold text-theme-muted">Requested</Text>
                            </View>
                          ) : item.status === 'pending_received' ? (
                            <TouchableOpacity
                              onPress={() => handleAccept(item.id)}
                              disabled={isConnecting}
                              className="bg-emerald-500 px-3.5 py-1.5 rounded-xl shadow-xs"
                            >
                              {isConnecting ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text className="text-xs font-extrabold text-white">Accept</Text>
                              )}
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              onPress={() => handleConnect(item.id)}
                              disabled={isConnecting}
                              className="bg-theme-accent px-3.5 py-1.5 rounded-xl shadow-xs flex-row items-center space-x-1"
                            >
                              {isConnecting ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <Ionicons name="person-add" size={13} color="#FFFFFF" />
                                  <Text className="text-xs font-extrabold text-white ml-1">Connect</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View className="p-4 bg-theme-bg border border-theme-border/60 rounded-2xl items-center">
                    <Text className="text-xs text-theme-muted text-center font-medium">
                      No athletes found matching "{searchQuery.trim()}".
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Pending Requests Section */}
            {pendingRequests.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider mb-2">
                  Pending Friend Requests ({pendingRequests.length})
                </Text>
                {pendingRequests.map((req) => (
                  <View
                    key={`req-${req.friend_id || req.user_id}`}
                    className="flex-row items-center justify-between p-3.5 bg-theme-bg border border-theme-border/60 rounded-2xl mb-2"
                  >
                    <View className="flex-row items-center space-x-3">
                      <View className="w-9 h-9 rounded-full bg-theme-accent/20 items-center justify-center">
                        <Text className="text-xs font-black text-theme-accent">
                          {(req.username || 'A').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text className="text-sm font-extrabold text-theme-text">{req.username}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleAccept(req.friend_id || req.user_id)}
                      className="bg-emerald-500 px-3.5 py-1.5 rounded-xl"
                    >
                      <Text className="text-xs font-extrabold text-white">Accept</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
