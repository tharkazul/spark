import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Platform,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Keyboard,
  TextInput as RNTextInput,
  StyleSheet
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

const getImageManipulator = () => {
  try {
    return require('expo-image-manipulator');
  } catch (e) {
    return null;
  }
};
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  useAnimatedScrollHandler, 
  useAnimatedReaction, 
  runOnJS 
} from 'react-native-reanimated';

import { useCoachChat } from '../../context/CoachChatStore';
import { useUser } from '../../context/UserStore';
import { useLanguage } from '../../context/LanguageContext';
import { MarkdownText, hasRenderableText } from '../../components/chat/MarkdownText';
import { ProposalCard } from '../../components/chat/ProposalCard';
import { EventInviteCard } from '../../components/chat/EventInviteCard';
import { SocialMentionCard } from '../../components/chat/SocialMentionCard';
import { QuickSuggestions } from '../../components/chat/QuickSuggestions';
import { ChatMessage } from '../../types/chat';
import { API_BASE_URL } from '../../constants/api';
import { getCoachAvatarSource } from '../../utils/avatarUtils';
import { useKeyboardMotionContext } from '../../context/KeyboardMotionContext';
import { useTabBar } from '../../context/TabBarContext';
import { ChatMacroStrip } from '../../components/chat/ChatMacroStrip';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

type ComposerState = 'seated' | 'docked';
const SHOW_THRESHOLD = 96;

interface ChatSection {
  title: string;
  dateKey: string;
  data: ChatMessage[];
}

function formatDateHeader(dateObj: Date): string {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const now = new Date();
  const dDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const nDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((nDate.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return dateObj.toLocaleDateString([], { weekday: 'long' });
  }
  if (dateObj.getFullYear() === now.getFullYear()) {
    return dateObj.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return dateObj.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

type ChatListItem = 
  | { type: 'message'; data: ChatMessage; isFirstInRun: boolean }
  | { type: 'date'; title: string; id: string };

function flattenMessages(messagesList: ChatMessage[]): ChatListItem[] {
  const items: ChatListItem[] = [];
  let currentDateKey = '';
  let prevMsg: ChatMessage | null = null;
  
  messagesList.forEach((msg, index) => {
    const d = new Date(msg.timestamp || Date.now());
    const dateKey = isNaN(d.getTime()) ? 'today' : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    
    if (dateKey !== currentDateKey) {
      currentDateKey = dateKey;
      items.push({ type: 'date', title: isNaN(d.getTime()) ? 'Today' : formatDateHeader(d), id: `date-${dateKey}` });
      prevMsg = null;
    }
    
    const isFirstInRun = prevMsg === null || prevMsg.role !== msg.role;
    items.push({ type: 'message', data: msg, isFirstInRun });
    prevMsg = msg;
  });
  
  return items.reverse();
}

const MessageRow = React.memo(({ item, isFirstInRun, coachTone, onAccept, onReject, onAcceptInvite, onDeclineInvite }: { item: ChatMessage, isFirstInRun: boolean, coachTone?: string, onAccept: any, onReject: any, onAcceptInvite: any, onDeclineInvite: any }) => {
  const hasText = hasRenderableText(item.content);
  const hasImages = !!item.images?.length;
  const hasProposal = !!item.proposedPlan?.length;
  const hasPayloadCard = !!item.payload_json;
  if (!hasText && !hasImages && !hasProposal && !hasPayloadCard) return null;
  
  const isUser = item.role === 'user';
  return (
    <View className={`mb-4 ${isUser ? 'self-end max-w-[80%]' : 'self-start w-full'}`}>
      {!isUser && isFirstInRun && (
        <View className="flex-row items-start gap-3 mb-1">
          <View className="relative">
            <Image
              source={getCoachAvatarSource(coachTone, item.mood)}
              className="w-10 h-10 rounded-full"
            />
          </View>
          <View className="flex-1 mt-1">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Text className="text-theme-text font-black text-xs uppercase tracking-wider">Spark</Text>
            </View>
          </View>
        </View>
      )}

      <View className={`${isUser ? 'bg-theme-card rounded-3xl px-4 py-2.5' : 'pl-14 pr-4'}`}>
        {item.images && item.images.length > 0 ? (
          <View className="mb-2 flex-row flex-wrap gap-2">
            {item.images.map((imgUri, imgIdx) => (
              <Image
                key={`msg-img-${imgIdx}`}
                source={{ uri: imgUri }}
                style={{ width: 140, height: 140, borderRadius: 10 }}
                contentFit="cover"
              />
            ))}
          </View>
        ) : null}

        <MarkdownText content={item.content} isUser={isUser} />

        {item.payload_json?.type === 'event_invite' ? (
          <EventInviteCard
            payload={item.payload_json}
            onAccept={onAcceptInvite}
            onDecline={onDeclineInvite}
          />
        ) : item.payload_json?.type === 'social_mention' ? (
          <SocialMentionCard
            payload={item.payload_json}
          />
        ) : null}

        {item.proposedPlan && item.proposedPlan.length > 0 ? (
          <ProposalCard
            plan={item.proposedPlan}
            status={item.proposalStatus}
            onAccept={() => onAccept(item.id, item.proposedPlan!)}
            onReject={() => onReject(item.id)}
          />
        ) : null}

        <Text className="text-[11px] mt-1.5 self-end text-theme-muted">
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
});

export default function CoachScreen() {
  const { t } = useLanguage();
  const { messages, sendMessage, sending, loading, acceptProposal, rejectProposal, acceptInvite, declineInvite, tokenUsage, error } = useCoachChat();
  const { user, isChatMacroStripVisible, toggleChatMacroStrip } = useUser();
  const insets = useSafeAreaInsets();
  const { height, progress } = useKeyboardMotionContext();
  const { tabBarOccupied } = useTabBar();

  const [composerState, setComposerState] = useState<ComposerState>('seated');
  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pillInteractive, setPillInteractive] = useState(false);

  const sectionListRef = useRef<any>(null);
  const inputRef = useRef<RNTextInput>(null);
  const isPinnedToBottom = useRef(true);
  const hasUserScrolled = useRef(false);
  const didInitialScroll = useRef(false);

  const distanceFromBottom = useSharedValue(0);

  const flatItems = useMemo(() => flattenMessages(messages), [messages]);

  const scrollToBottom = useCallback((animated = true) => {
    try {
      sectionListRef.current?.scrollToOffset({ offset: 0, animated });
    } catch (err) {}
  }, []);

  const updatePinned = useCallback((pinned: boolean) => {
    if (!hasUserScrolled.current) return;
    isPinnedToBottom.current = pinned;
  }, []);

  const activateComposer = useCallback(() => {
    setComposerState('docked');
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      distanceFromBottom.value = e.contentOffset.y;
    },
  });

  useAnimatedReaction(
    () => distanceFromBottom.value < SHOW_THRESHOLD,
    (pinned, was) => {
      if (pinned !== was) runOnJS(updatePinned)(pinned);
    }
  );

  useAnimatedReaction(
    () => distanceFromBottom.value > SHOW_THRESHOLD,
    (show, prev) => {
      if (show !== prev) {
        runOnJS(setPillInteractive)(show);
      }
    }
  );

  useAnimatedReaction(
    () => progress.value > 0.05,
    (opening, was) => {
      if (opening && !was) runOnJS(scrollToBottom)(true);
    }
  );

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (inputText.trim().length === 0 && selectedImages.length === 0) {
        setComposerState('seated');
      }
    });
    return () => sub.remove();
  }, [inputText, selectedImages]);

  useEffect(() => {
    if (composerState === 'docked') {
      inputRef.current?.focus();
    }
  }, [composerState]);

  useEffect(() => {
    if (isPinnedToBottom.current) {
      scrollToBottom(true);
    }
  }, [messages.length, sending, scrollToBottom]);

  const dailyUsage = tokenUsage?.daily_token_usage || 0;
  const dailyLimit = tokenUsage?.daily_token_limit || (user?.subscription_tier === 'spark_plus' ? 500000 : 100000);
  const remainingTokens = Math.max(0, dailyLimit - dailyUsage);
  const remainingPercent = Math.round((remainingTokens / dailyLimit) * 100);
  const showTokenWarning = remainingPercent <= 10;
  const isOutOfTokens = remainingTokens <= 0;

  const handlePickImage = async () => {
    try {
      if (!ImagePicker || typeof ImagePicker.launchImageLibraryAsync !== 'function') {
        Alert.alert('Image Attachment', 'Image picker is not supported on this device/environment.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : ('images' as any),
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        const asset = result.assets[0];
        const ImageManipulator = getImageManipulator();
        if (ImageManipulator && typeof ImageManipulator.manipulateAsync === 'function') {
          const manipulated = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: 1600 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat?.JPEG || 'jpeg', base64: true }
          );

          if (manipulated?.base64) {
            const base64Uri = `data:image/jpeg;base64,${manipulated.base64}`;
            setSelectedImages((prev) => [...prev, base64Uri]);
          } else {
            setSelectedImages((prev) => [...prev, asset.uri]);
          }
        } else {
          setSelectedImages((prev) => [...prev, asset.uri]);
        }
      }
    } catch (error) {
      console.error('Image processing error:', error);
      Alert.alert('Notice', 'Image attachment or compression failed.');
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleVoiceInput = () => {
    if (isRecording) {
      setIsRecording(false);
      setInputText((prev) => (prev ? `${prev} (voice input completed)` : "My calf is feeling a bit tight today."));
    } else {
      setIsRecording(true);
      Alert.alert('Voice Recording Activated', 'Speak now... (Tap mic again to finish dictation)', [{ text: 'OK' }]);
    }
  };

  const handleSend = () => {
    if ((!inputText.trim() && selectedImages.length === 0) || sending) return;
    const textToSend = inputText.trim();
    const imagesToSend = [...selectedImages];

    setInputText('');
    setSelectedImages([]);
    setIsRecording(false);
    setShowSuggestions(false);
    isPinnedToBottom.current = true;

    sendMessage(textToSend, imagesToSend.length > 0 ? imagesToSend : undefined);
  };

  const renderItem: any = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.type === 'date') {
      return (
        <View className="py-4 items-center justify-center my-4">
          <Text className="text-theme-muted text-[12px] font-medium">{item.title}</Text>
        </View>
      );
    }
    return (
      <View>
        <MessageRow
          item={item.data}
          isFirstInRun={item.isFirstInRun}
          coachTone={user?.coach_tone}
          onAccept={acceptProposal}
          onReject={rejectProposal}
          onAcceptInvite={acceptInvite}
          onDeclineInvite={declineInvite}
        />
      </View>
    );
  }, [user?.coach_tone, acceptProposal, rejectProposal, acceptInvite, declineInvite]);

  const getFullAvatarUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  };

  const lastCoachMessage = [...messages].reverse().find(m => m.role === 'coach' || m.role === 'assistant');
  const lastMood = (lastCoachMessage?.role === 'coach' && lastCoachMessage?.mood) ? lastCoachMessage.mood.toLowerCase() : 'neutral';
  let coachAvatarPath = user?.coach_avatar_neutral;
  if (lastMood === 'hype') coachAvatarPath = user?.coach_avatar_hype || user?.coach_avatar_neutral;
  if (lastMood === 'disappointed') coachAvatarPath = user?.coach_avatar_disappointed || user?.coach_avatar_neutral;
  const customAvatarUri = getFullAvatarUrl(coachAvatarPath);
  const avatarSource = customAvatarUri ? { uri: customAvatarUri } : getCoachAvatarSource(user?.coach_tone);

  const seatStyle = useAnimatedStyle(() => ({
    opacity: withTiming(composerState === 'docked' ? 0 : 1, { duration: 120 }),
  }));

  const composerStyle = useAnimatedStyle(() => {
    const keyboardLift = Math.max(0, height.value - insets.bottom);
    const tabBarClearance = (1 - progress.value) * tabBarOccupied;
    return {
      opacity: withTiming(composerState === 'docked' ? 1 : 0, { duration: 140 }),
      transform: [{ translateY: -(keyboardLift + tabBarClearance) }],
    };
  });

  const pillStyle = useAnimatedStyle(() => {
    const show = distanceFromBottom.value > SHOW_THRESHOLD ? 1 : 0;
    return {
      opacity: withTiming(show, { duration: 150 }),
      transform: [
        { scale: withTiming(show ? 1 : 0.9, { duration: 150 }) },
        { translateY: withTiming(show ? 0 : 6, { duration: 150 }) },
      ],
    };
  });

  const renderInlineInvitation = () => (
    <Animated.View
      style={seatStyle}
      pointerEvents={composerState === 'docked' ? 'none' : 'auto'}
      className="px-4 pt-2 pb-6"
    >
      <TouchableOpacity
        onPress={activateComposer}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Message your coach"
        className="flex-row items-center bg-theme-card border border-theme-border rounded-full px-4 py-3"
        style={{ gap: 10 }}
      >
        <Ionicons name="chatbubble-outline" size={18} color="#9CA3AF" />
        <Text className="text-theme-muted text-[16px] flex-1" numberOfLines={1}>
          Message your coach
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      <View className="px-4 py-3 bg-theme-bg z-10 flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-theme-bg overflow-hidden mr-3 shadow-sm">
          <Image source={avatarSource} className="w-full h-full" contentFit="cover" />
        </View>
        <View className="flex-1">
          <Text className="text-theme-text text-base font-extrabold">Spark</Text>
          {isOutOfTokens ? (
            <Text className="text-amber-400 text-xs font-semibold">Out of daily tokens</Text>
          ) : error ? (
            <Text className="text-red-400 text-xs font-semibold">Connection issue</Text>
          ) : null}
        </View>
      </View>

      {showTokenWarning ? (
        <View className="bg-amber-500/15 px-4 py-2 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 mr-2">
            <Ionicons name="warning-outline" size={16} color="#F59E0B" />
            <Text className="text-amber-300 text-xs font-semibold ml-2">
              Daily Budget Low: {remainingPercent}% remaining ({remainingTokens.toLocaleString()} tokens left)
            </Text>
          </View>
          {user?.subscription_tier !== 'spark_plus' ? (
            <TouchableOpacity className="bg-amber-500 px-2.5 py-1 rounded-md">
              <Text className="text-black font-bold text-[10px]">UPGRADE</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View className="flex-1">
        {loading && messages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#FF5A1F" />
            <Text className="text-theme-muted text-xs mt-2">Connecting with Spark...</Text>
          </View>
        ) : (
          <AnimatedFlatList
            ref={sectionListRef}
            data={flatItems}
            keyExtractor={(item: any, index: number) => item.type === 'date' ? item.id : `msg-${item.data.id || index}`}
            inverted={true}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => { hasUserScrolled.current = true; }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            renderItem={renderItem as any}
            ListHeaderComponent={
              <View>
                {sending ? (
                  <View className="px-4 py-2 flex-row items-center self-start mb-4 ml-4 bg-theme-card/80 rounded-full">
                    <ActivityIndicator size="small" color="#FF5A1F" />
                    <Text className="text-theme-accent text-xs font-semibold ml-2">{t('chat.thinking')}</Text>
                  </View>
                ) : null}
                {renderInlineInvitation()}
              </View>
            }
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: tabBarOccupied + 16, paddingBottom: 16 }}
            className="flex-1"
          />
        )}
      </View>

      <View style={[StyleSheet.absoluteFill, { paddingBottom: Math.max(insets.bottom, 16) }]} pointerEvents="box-none" className="justify-end items-center">
        {/* Jump To Latest Pill */}
        <Animated.View style={[pillStyle, { marginBottom: 12 }]} pointerEvents={pillInteractive ? 'auto' : 'none'}>
          <TouchableOpacity
            onPress={() => {
              isPinnedToBottom.current = true;
              scrollToBottom(true);
            }}
            className="flex-row items-center bg-theme-card border border-theme-border rounded-full px-3.5 py-2"
            style={{ gap: 6, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { height: 2, width: 0 }, elevation: 3 }}
            accessibilityLabel="Scroll to latest message"
          >
            <Ionicons name="arrow-down" size={15} color="#9CA3AF" />
            <Text className="text-theme-muted text-[13px] font-medium">Latest</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Docked Composer */}
        <Animated.View
          pointerEvents={composerState === 'docked' ? 'auto' : 'none'}
          style={[composerStyle, { 
            position: 'absolute',
            bottom: Math.max(insets.bottom, 16),
            left: 0,
            right: 0,
            paddingHorizontal: 12,
          }]}
        >
          {showSuggestions && composerState === 'docked' ? (
            <View className="mb-2">
              <QuickSuggestions
                onSelectSuggestion={(promptText) => {
                  setInputText(promptText);
                  setShowSuggestions(false);
                  inputRef.current?.focus();
                }}
              />
            </View>
          ) : null}

          <ChatMacroStrip
            isVisible={isChatMacroStripVisible ?? true}
            onToggle={toggleChatMacroStrip || (() => {})}
          />

          <View className="bg-theme-card rounded-3xl p-2.5 shadow-lg border border-theme-border">
            {selectedImages.length > 0 ? (
              <View className="mb-2 flex-row gap-2 px-1">
                {selectedImages.map((imgUri, idx) => (
                  <View key={`thumb-${idx}`} className="relative">
                    <Image source={{ uri: imgUri }} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" />
                    <TouchableOpacity
                      onPress={() => handleRemoveImage(idx)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 w-4 h-4 rounded-full items-center justify-center"
                    >
                      <Ionicons name="close" size={10} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <View className="px-2 py-1 min-h-[38px] max-h-[100px] justify-center">
              <RNTextInput
                ref={inputRef}
                placeholder={t('chat.inputPlaceholder')}
                placeholderTextColor="#8E8E93"
                value={inputText}
                onChangeText={setInputText}
                multiline={true}
                blurOnSubmit={false}
                onSubmitEditing={handleSend}
                className="text-theme-text text-[16px] p-0 m-0"
                style={{ maxHeight: 84 }}
              />
            </View>

            <View className="flex-row items-center justify-between pt-2 mt-1 border-t border-theme-border/50">
              <View className="flex-row items-center gap-2">
                <TouchableOpacity onPress={handlePickImage} className="w-8 h-8 rounded-full bg-theme-bg/60 items-center justify-center active:opacity-70">
                  <Ionicons name="attach-outline" size={18} color="#FF5A1F" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowSuggestions(!showSuggestions)}
                  className={`w-8 h-8 rounded-full items-center justify-center active:opacity-70 ${showSuggestions ? 'bg-amber-500/20' : 'bg-theme-bg/60'}`}
                >
                  <Ionicons name={showSuggestions ? 'bulb' : 'bulb-outline'} size={16} color={showSuggestions ? '#F59E0B' : '#FF5A1F'} />
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={handleToggleVoiceInput}
                  className={`w-8 h-8 rounded-full items-center justify-center active:opacity-70 ${isRecording ? 'bg-red-500/20' : 'bg-theme-bg/60'}`}
                >
                  <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={16} color={isRecording ? '#EF4444' : '#94A3B8'} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={sending || (!inputText.trim() && selectedImages.length === 0)}
                  className={`w-9 h-9 rounded-full items-center justify-center shadow-sm ${
                    sending || (!inputText.trim() && selectedImages.length === 0) ? 'bg-theme-accent/40' : 'bg-theme-accent'
                  }`}
                >
                  <Ionicons name="send" size={15} color="white" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}
