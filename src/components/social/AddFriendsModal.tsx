import { SheetGrabber } from '@/components/ui/SheetGrabber';
import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/use-theme';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSheetDismiss } from '../../hooks/use-sheet-dismiss';
import * as Haptics from 'expo-haptics';
import { socialApi } from '../../services/apiServices';
import { getFullProfilePhotoUrl } from '../../utils/avatarUtils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AddFriendsModalProps {
  visible: boolean;
  onClose: () => void;
  onConnectionsUpdated?: () => void;
  onOpenAthleteProfile?: (userId: number | string) => void;
}

interface SearchUserResult {
  id: number;
  username: string;
  profile_picture_url?: string;
  subscription_tier?: string;
  role?: string;
  status: 'none' | 'pending' | 'pending_received' | 'accepted' | 'self' | null;
}

export const formatTierLabel = (tier?: string | null, role?: string | null): string => {
  const normalizedTier = (tier || '').toLowerCase().trim();
  const normalizedRole = (role || '').toLowerCase().trim();

  if (normalizedTier === 'admin' || normalizedRole === 'admin') {
    return 'rooka admin';
  }
  if (normalizedTier === 'premium') {
    return 'rooka premium user';
  }
  if (
    normalizedTier === 'rooka_plus' ||
    normalizedTier === 'subscription' ||
    normalizedTier === 'rooka+' ||
    normalizedTier === 'plus'
  ) {
    return 'rooka+ user';
  }
  return 'rooka free user';
};

export const AddFriendsModal: React.FC<AddFriendsModalProps> = ({
  visible,
  onClose,
  onConnectionsUpdated,
  onOpenAthleteProfile,
}) => {
  const theme = useTheme();
  const [showModal, setShowModal] = useState(visible);
  const [searchQuery, setSearchQuery] = useState('');
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const { dragY, panHandlers } = useSheetDismiss(onClose);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [connectingId, setConnectingId] = useState<number | null>(null);

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const lastSearchIdRef = useRef<number>(0);
  const latestDisplayedSearchIdRef = useRef<number>(0);

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      slideAnim.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 24,
          stiffness: 220,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();

      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      lastSearchIdRef.current = 0;
      latestDisplayedSearchIdRef.current = 0;
      fetchPendingRequests();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowModal(false);
      });
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
              subscription_tier: u.subscription_tier,
              role: u.role,
              status: (u.status as any) || 'none',
            }));
          } else if (res.user) {
            users = [
              {
                id: res.user.id,
                username: res.user.username,
                profile_picture_url: (res.user as any).profile_picture_url,
                subscription_tier: res.user.subscription_tier,
                role: res.user.role,
                status: (res.user.status as any) || 'none',
              },
            ];
          }
        }
        setSearchResults(users);
        setHasSearched(true);
      }
    } catch {
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
    } catch {
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
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setConnectingId(null);
    }
  };

  if (!showModal) return null;

  return (
    <Modal
      visible={showModal}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', position: 'relative' }}>
          {/* Static Fullscreen Backdrop: Fades In Simultaneously */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: 'rgba(0,0,0,0.6)', opacity: backdropOpacity },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={onClose}
              style={{ flex: 1 }}
            />
          </Animated.View>

          {/* Bottom Sheet Modal Container */}
          <Animated.View
            style={[
              {
                transform: [{ translateY: Animated.add(slideAnim, dragY) }],
              },
            ]}
            className="w-full bg-theme-card border-t border-theme-border rounded-t-card px-5 pt-3 pb-5 max-h-[85%] min-h-[460px]"
          >
            {/* TOP PULL HANDLE INDICATOR */}
            <View {...panHandlers} className="items-center pb-4 pt-1">
              <SheetGrabber />
            </View>

          {/* Header */}
          <View className="flex-row items-center justify-between pb-4 border-b border-theme-border/50">
            <View className="flex-row items-center gap-x-2">
              <View className="w-8 h-8 rounded-full bg-theme-accent/20 items-center justify-center">
                <Ionicons name="person-add" size={16} color={theme.tint} />
              </View>
              <Text className="text-lg font-extrabold text-theme-text">Find & Add Friends</Text>
            </View>
          </View>

          <ScrollView className="flex-1 pt-4" showsVerticalScrollIndicator={false}>
            {/* Active Live Search Input */}
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-bold text-theme-muted">
                Live Athlete Search
              </Text>
              {searchQuery.trim().length > 0 && (
                <Text className="text-xs text-theme-accent font-bold tracking-wide">
                  Searching live
                </Text>
              )}
            </View>

            <View className="flex-row items-center bg-theme-bg border border-theme-border/80 rounded-xl px-3 py-2 mb-4">
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={handleQueryChange}
                onSubmitEditing={() => executeSearch(searchQuery.trim())}
                returnKeyType="search"
                placeholder="Start typing username..."
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 text-sm font-semibold text-theme-text py-1 ml-2"
              />
              {searching ? (
                <ActivityIndicator size="small" color={theme.tint} className="mr-1" />
              ) : searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => handleQueryChange('')} className="mr-1">
                  <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Live Search Results (Top 10 Accounts, Alphabetical) */}
            {hasSearched && (
              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-bold text-theme-muted">
                    Matching Accounts ({searchResults.length})
                  </Text>
                  {searchResults.length > 0 && (
                    <Text className="text-xs text-theme-muted font-medium">Top matches A-Z</Text>
                  )}
                </View>

                {searchResults.length > 0 ? (
                  <View className="gap-y-2">
                    {searchResults.map((item) => {
                      const isConnecting = connectingId === item.id;
                      return (
                        <View
                          key={`search-user-${item.id}`}
                          className="flex-row items-center justify-between p-3.5 bg-theme-bg border border-theme-border/60 rounded-2xl mb-2"
                        >
                          {(() => {
                            const searchAvatarUri = getFullProfilePhotoUrl(
                              item.profile_picture_url || (item as any).profilePictureUrl
                            );
                            return (
                              <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => {
                                  if (onOpenAthleteProfile) {
                                    onClose();
                                    setTimeout(() => {
                                      onOpenAthleteProfile(item.id);
                                    }, 150);
                                  }
                                }}
                                className="flex-row items-center gap-x-3 flex-1 mr-2"
                              >
                                {searchAvatarUri ? (
                                  <Image
                                    source={{ uri: searchAvatarUri }}
                                    className="w-10 h-10 rounded-full mr-3"
                                  />
                                ) : (
                                  <View className="w-10 h-10 rounded-full bg-theme-accent/20 items-center justify-center mr-3">
                                    <Text className="text-sm font-extrabold text-theme-accent">
                                      {item.username.charAt(0).toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                                <View className="flex-1">
                                  <Text className="text-sm font-extrabold text-theme-text" numberOfLines={1}>
                                    {item.username}
                                  </Text>
                                  <Text className="text-xs text-theme-muted font-medium">
                                    {formatTierLabel(item.subscription_tier, item.role)}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })()}

                          {/* Action Button per Item */}
                          {item.status === 'self' ? (
                            <View className="bg-theme-accent/15 px-3 py-1.5 rounded-full border border-theme-accent/30">
                              <Text className="text-xs font-bold text-theme-accent">You</Text>
                            </View>
                          ) : item.status === 'accepted' ? (
                            <View className="flex-row items-center bg-semantic-success/15 px-3 py-1.5 rounded-full border border-semantic-success/30">
                              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                              <Text className="text-xs font-bold text-semantic-success ml-1">Connected</Text>
                            </View>
                          ) : item.status === 'pending' ? (
                            <View className="bg-theme-border/30 px-3 py-1.5 rounded-full border border-theme-border">
                              <Text className="text-xs font-bold text-theme-muted">Requested</Text>
                            </View>
                          ) : item.status === 'pending_received' ? (
                            <TouchableOpacity
                              onPress={() => handleAccept(item.id)}
                              disabled={isConnecting}
                              className="bg-semantic-success px-3.5 py-1.5 rounded-xl"
                            >
                              <Text className="text-xs font-extrabold text-white">Accept</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              onPress={() => handleConnect(item.id)}
                              disabled={isConnecting}
                              className="bg-theme-accent px-3.5 py-1.5 rounded-xl"
                            >
                              {isConnecting ? (
                                <ActivityIndicator size="small" color="#FFF" />
                              ) : (
                                <Text className="text-xs font-extrabold text-white">+ Add</Text>
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
                      {`No athletes found matching "${searchQuery.trim()}".`}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Pending Requests Section */}
            {pendingRequests.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-bold text-theme-muted mb-2">
                  Pending Friend Requests ({pendingRequests.length})
                </Text>
                {pendingRequests.map((req) => (
                  <View
                    key={`req-${req.friend_id || req.user_id}`}
                    className="flex-row items-center justify-between p-3.5 bg-theme-bg border border-theme-border/60 rounded-2xl mb-2"
                  >
                    <View className="flex-row items-center gap-x-3 flex-1 mr-2">
                      <View className="w-9 h-9 rounded-full bg-theme-accent/20 items-center justify-center">
                        <Text className="text-xs font-extrabold text-theme-accent">
                          {(req.username || 'A').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-extrabold text-theme-text" numberOfLines={1}>{req.username}</Text>
                        <Text className="text-xs text-theme-muted font-medium">
                          {formatTierLabel(req.subscription_tier, req.role)}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleAccept(req.friend_id || req.user_id)}
                      className="bg-semantic-success px-3.5 py-1.5 rounded-xl"
                    >
                      <Text className="text-xs font-extrabold text-white">Accept</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
  );
};
