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
  Image as RNImage,
  KeyboardAvoidingView,
  Modal,
  StyleSheet
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
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

import { useCoachChat } from '../../context/CoachChatStore';
import { useUser } from '../../context/UserStore';
import { usePlan } from '../../context/PlanStore';
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

function flattenMessagesChronological(messagesList: ChatMessage[]): ChatListItem[] {
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
  
  return items;
}

const MessageRow = React.memo(({
  item,
  isFirstInRun,
  coachTone,
  onAccept,
  onReject,
  onAcceptInvite,
  onDeclineInvite,
  onExpandImage
}: {
  item: ChatMessage;
  isFirstInRun: boolean;
  coachTone?: string;
  onAccept: any;
  onReject: any;
  onAcceptInvite: any;
  onDeclineInvite: any;
  onExpandImage: (source: string | number) => void;
}) => {
  const hasText = hasRenderableText(item.content);
  const hasImages = !!item.images?.length;
  const hasProposal = !!item.proposedPlan?.length;
  const hasPayloadCard = !!item.payload_json;
  if (!hasText && !hasImages && !hasProposal && !hasPayloadCard) return null;
  
  const isUser = item.role === 'user';
  const avatarSrc = getCoachAvatarSource(coachTone, item.mood);

  return (
    <View className={`mb-3 max-w-[86%] ${isUser ? 'self-end' : 'self-start'}`}>
      {!isUser && isFirstInRun && (
        <View className="flex-row items-center mb-1 ml-1">
          <TouchableOpacity activeOpacity={0.8} onPress={() => onExpandImage(avatarSrc)}>
            <RNImage
              source={avatarSrc}
              style={{ width: 24, height: 24, borderRadius: 12, marginRight: 8 }}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <Text className="text-theme-accent font-extrabold text-xs mr-2">Spark</Text>
        </View>
      )}

      <View
        className={`px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-theme-accent rounded-br-sm shadow-sm'
            : 'bg-theme-card border border-theme-border rounded-bl-sm shadow-sm'
        }`}
      >
        {item.images && item.images.length > 0 ? (
          <View className="mb-2 flex-row flex-wrap gap-2">
            {item.images.map((imgUri, imgIdx) => (
              <TouchableOpacity
                key={`msg-img-${imgIdx}`}
                activeOpacity={0.85}
                onPress={() => onExpandImage(imgUri)}
              >
                <Image
                  source={{ uri: imgUri }}
                  style={{ width: 140, height: 140, borderRadius: 10 }}
                  contentFit="cover"
                />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <MarkdownText content={item.content} isUser={isUser} onImagePress={onExpandImage} />

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

        <Text
          className={`text-[10px] mt-1.5 self-end ${
            isUser ? 'text-white/70' : 'text-theme-muted'
          }`}
        >
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
  const { plan } = usePlan();
  const insets = useSafeAreaInsets();
  const { height, progress } = useKeyboardMotionContext();
  const { tabBarOccupied, notifyScroll } = useTabBar();

  const [showWorkoutBar, setShowWorkoutBar] = useState(false);
  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | number | null>(null);
  const [showScrollDownBtn, setShowScrollDownBtn] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<RNTextInput>(null);

  const flatItems = useMemo(() => flattenMessagesChronological(messages), [messages]);

  const stickyHeaderIndices = useMemo(() => {
    const indices: number[] = [];
    flatItems.forEach((item, index) => {
      if (item.type === 'date') {
        indices.push(index);
      }
    });
    return indices;
  }, [flatItems]);

  const initialScrollDone = useRef(false);
  const isUserScrolledUp = useRef(false);

  const forceScrollToBottom = useCallback((animated = true) => {
    try {
      flatListRef.current?.scrollToEnd({ animated });
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToOffset({ offset: 9999999, animated });
        } catch (_) {}
      }, 80);
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToEnd({ animated });
        } catch (_) {}
      }, 200);
    } catch (_) {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      isUserScrolledUp.current = false;
      initialScrollDone.current = false;
      setShowScrollDownBtn(false);
      const t1 = setTimeout(() => forceScrollToBottom(false), 50);
      const t2 = setTimeout(() => forceScrollToBottom(true), 150);
      const t3 = setTimeout(() => forceScrollToBottom(true), 350);
      const t4 = setTimeout(() => forceScrollToBottom(true), 600);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }, [forceScrollToBottom])
  );

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (contentSize.height <= 0) return;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const isScrolledUp = distanceFromBottom > 150;
    isUserScrolledUp.current = isScrolledUp;
    setShowScrollDownBtn(isScrolledUp);
  };

  const handleContentSizeChange = () => {
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      forceScrollToBottom(false);
      setTimeout(() => forceScrollToBottom(true), 100);
      setTimeout(() => forceScrollToBottom(true), 300);
    }
  };

  // Scroll to bottom whenever messages change (new user message or coach reply)
  useEffect(() => {
    isUserScrolledUp.current = false;
    const t1 = setTimeout(() => forceScrollToBottom(true), 50);
    const t2 = setTimeout(() => forceScrollToBottom(true), 150);
    const t3 = setTimeout(() => forceScrollToBottom(true), 350);
    const t4 = setTimeout(() => forceScrollToBottom(true), 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [messages.length, forceScrollToBottom]);

  // Scroll when sending state toggles
  useEffect(() => {
    if (sending) {
      isUserScrolledUp.current = false;
      const t1 = setTimeout(() => forceScrollToBottom(true), 50);
      const t2 = setTimeout(() => forceScrollToBottom(true), 200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [sending, forceScrollToBottom]);

  const dailyUsage = tokenUsage?.daily_token_usage || 0;
  const dailyLimit = tokenUsage?.daily_token_limit || (user?.subscription_tier === 'spark_plus' ? 500000 : 100000);
  const remainingTokens = Math.max(0, dailyLimit - dailyUsage);
  const remainingPercent = Math.round((remainingTokens / dailyLimit) * 100);
  const showTokenWarning = remainingPercent <= 10;
  const isOutOfTokens = remainingTokens <= 0;

  const todayWorkouts = useMemo(() => {
    if (!plan || !Array.isArray(plan)) return [];
    const todayStr = new Date().toISOString().split('T')[0];
    return plan.filter((w) => w.date === todayStr || w.day === 'TODAY');
  }, [plan]);

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

  const handleSend = (textOverride?: string) => {
    const rawText = textOverride !== undefined ? textOverride : inputText;
    const textToSend = rawText.trim();
    if ((!textToSend && selectedImages.length === 0) || sending) return;
    const imagesToSend = [...selectedImages];

    setInputText('');
    setSelectedImages([]);
    setIsRecording(false);
    setShowSuggestions(false);

    sendMessage(textToSend, imagesToSend.length > 0 ? imagesToSend : undefined);
  };

  const handleTextChange = (text: string) => {
    if (text.includes('\n')) {
      const cleanText = text.replace(/\n/g, '');
      if (cleanText.trim().length > 0 || selectedImages.length > 0) {
        handleSend(cleanText);
        return;
      }
    }
    setInputText(text);
  };

  const renderItem: any = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.type === 'date') {
      return (
        <View className="py-2 items-center justify-center pointer-events-none">
          <View className="bg-theme-card border border-theme-border px-4 py-1 rounded-full shadow-md">
            <Text className="text-theme-text text-[11px] font-extrabold tracking-wide">{item.title}</Text>
          </View>
        </View>
      );
    }
    return (
      <MessageRow
        item={item.data}
        isFirstInRun={item.isFirstInRun}
        coachTone={user?.coach_tone}
        onAccept={acceptProposal}
        onReject={rejectProposal}
        onAcceptInvite={acceptInvite}
        onDeclineInvite={declineInvite}
        onExpandImage={(source) => setPreviewImage(source)}
      />
    );
  }, [user?.coach_tone, acceptProposal, rejectProposal, acceptInvite, declineInvite]);

  const getFullAvatarUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  };

  const lastCoachMessage = [...messages].reverse().find(m => m.role === 'coach' || m.role === 'assistant');
  const rawMood = (lastCoachMessage?.role === 'coach' && lastCoachMessage?.mood) ? lastCoachMessage.mood.toLowerCase() : 'default';
  const lastMood = ['hype', 'disappointed'].includes(rawMood) ? rawMood : 'default';
  let coachAvatarPath = user?.coach_avatar_neutral;
  if (lastMood === 'hype') coachAvatarPath = user?.coach_avatar_hype || user?.coach_avatar_neutral;
  if (lastMood === 'disappointed') coachAvatarPath = user?.coach_avatar_disappointed || user?.coach_avatar_neutral;
  const customAvatarUri = getFullAvatarUrl(coachAvatarPath);
  const avatarSource = (customAvatarUri && customAvatarUri.includes('/uploads/')) 
    ? { uri: customAvatarUri } 
    : getCoachAvatarSource(user?.coach_tone, lastMood);

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        className="flex-1"
      >
      {/* Click-to-Expand Image Lightbox Modal */}
      <Modal
        visible={!!previewImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPreviewImage(null)}
          className="flex-1 bg-black/95 items-center justify-center p-4 relative z-50"
        >
          <TouchableOpacity
            onPress={() => setPreviewImage(null)}
            className="absolute top-12 right-6 z-50 bg-white/20 p-2.5 rounded-full items-center justify-center"
          >
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>

          {previewImage ? (
            typeof previewImage === 'number' ? (
              <RNImage
                source={previewImage}
                style={{ width: '100%', height: '80%' }}
                resizeMode="contain"
              />
            ) : (
              <Image
                source={{ uri: previewImage as string }}
                style={{ width: '100%', height: '80%' }}
                contentFit="contain"
              />
            )
          ) : null}
        </TouchableOpacity>
      </Modal>

      {/* Header bar matching spark/ with top toggle action buttons */}
      <View className="px-4 py-3 border-b border-theme-border/50 bg-theme-bg z-10 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setPreviewImage(avatarSource)}
            className="w-9 h-9 rounded-full bg-theme-bg overflow-hidden mr-3 border border-theme-accent/40 shadow-sm items-center justify-center"
          >
            <RNImage source={avatarSource} style={{ width: 36, height: 36, borderRadius: 18 }} resizeMode="cover" />
          </TouchableOpacity>
          <View className="flex-row items-center">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent mr-2" />
            <Text className="text-theme-text text-base font-black">Spark</Text>
          </View>
        </View>

        {/* Top Header Toggle Buttons (Today's Plan & Diet Rings) */}
        <View className="flex-row items-center space-x-2">
          <TouchableOpacity
            onPress={() => setShowWorkoutBar(!showWorkoutBar)}
            className={`px-2.5 py-1 rounded-full border flex-row items-center ${
              showWorkoutBar ? 'bg-theme-accent/20 border-theme-accent' : 'bg-theme-card border-theme-border'
            }`}
          >
            <Text className="text-[11px] font-bold text-theme-text">🏃 Plan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleChatMacroStrip?.()}
            className={`px-2.5 py-1 rounded-full border flex-row items-center ${
              isChatMacroStripVisible ? 'bg-theme-accent/20 border-theme-accent' : 'bg-theme-card border-theme-border'
            }`}
          >
            <Text className="text-[11px] font-bold text-theme-text">🥗 Rings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Low Token Budget Warning Banner */}
      {showTokenWarning ? (
        <View className="bg-amber-500/15 px-4 py-2 border-b border-amber-500/30 flex-row items-center justify-between">
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

      {/* TOP SECTION: Today's Workout Bar & Diet Macro Rings */}
      {showWorkoutBar ? (
        <View className="px-4 py-3 bg-theme-card border-b border-theme-border flex-col">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-xs font-black uppercase text-theme-accent tracking-wider">🏃 Today's Workout</Text>
          </View>
          {todayWorkouts.length > 0 ? (
            todayWorkouts.map((w, idx) => (
              <View key={`today-w-${idx}`} className="p-2 rounded-lg bg-theme-bg border border-theme-border/50 mb-1 flex-row items-center justify-between">
                <Text className="text-theme-text text-xs font-bold">{w.sport} • {w.description}</Text>
                {w.target_spark ? <Text className="text-amber-400 font-bold font-rajdhani text-xs">+{Math.round(w.target_spark)} Spark</Text> : null}
              </View>
            ))
          ) : (
            <Text className="text-theme-muted text-xs">No workouts scheduled for today.</Text>
          )}
        </View>
      ) : null}

      {isChatMacroStripVisible ? (
        <View className="bg-theme-card border-b border-theme-border py-2 px-3">
          <ChatMacroStrip
            isVisible={true}
            onToggle={toggleChatMacroStrip || (() => {})}
          />
        </View>
      ) : null}

      {/* CHAT MESSAGES STREAM */}
      <View className="flex-1">
        {loading && messages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#16ACBD" />
            <Text className="text-theme-muted text-xs mt-2">Connecting with Spark...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={flatItems}
            keyExtractor={(item: any, index: number) => item.type === 'date' ? item.id : `msg-${item.data.id || index}`}
            inverted={false}
            stickyHeaderIndices={stickyHeaderIndices}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={handleContentSizeChange}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}
            onScrollBeginDrag={notifyScroll}
            className="flex-1"
          />
        )}

        {/* Floating Scroll-Down-to-Bottom Button */}
        {showScrollDownBtn ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => forceScrollToBottom(true)}
            className="absolute bottom-3 right-4 z-40 bg-theme-accent w-10 h-10 rounded-full shadow-lg items-center justify-center"
            style={{
              elevation: 8,
              shadowColor: '#FF5A1F',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 6,
            }}
          >
            <Ionicons name="chevron-down" size={22} color="white" />
          </TouchableOpacity>
        ) : null}

        {sending ? (
          <View className="px-4 py-2 flex-row items-center self-start mb-2 ml-4 bg-theme-card/80 rounded-full border border-theme-border">
            <ActivityIndicator size="small" color="#16ACBD" />
            <Text className="text-theme-accent text-xs font-semibold ml-2">{t('chat.thinking')}</Text>
          </View>
        ) : null}
      </View>

      {/* Bottom Input Area */}
      <View 
        style={{ paddingBottom: Math.max(tabBarOccupied + 12, 100) }}
        className="p-3 bg-theme-bg border-t border-theme-border/60"
      >
        {showSuggestions ? (
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

        <View className="bg-theme-card rounded-3xl p-2.5 shadow-lg border border-theme-border">
          {selectedImages.length > 0 ? (
            <View className="mb-2 flex-row gap-2 px-1">
              {selectedImages.map((imgUri, idx) => (
                <View key={`thumb-${idx}`} className="relative">
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewImage(imgUri)}>
                    <Image source={{ uri: imgUri }} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" />
                  </TouchableOpacity>
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
              placeholder="Ask about your training, nutrition, or recovery..."
              placeholderTextColor="#8E8E93"
              value={inputText}
              onChangeText={handleTextChange}
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Enter') {
                  handleSend();
                }
              }}
              multiline={true}
              blurOnSubmit={false}
              returnKeyType="send"
              enterKeyHint="send"
              onSubmitEditing={() => handleSend()}
              className="text-theme-text text-sm p-0 m-0"
              style={{ maxHeight: 84 }}
            />
          </View>

          <View className="flex-row items-center justify-between pt-2 mt-1 border-t border-theme-border/30">
            <View className="flex-row items-center space-x-2">
              <TouchableOpacity onPress={handlePickImage} className="w-8 h-8 rounded-full bg-theme-bg/60 border border-theme-border items-center justify-center active:opacity-70">
                <Ionicons name="attach-outline" size={18} color="#16ACBD" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowSuggestions(!showSuggestions)}
                className={`w-8 h-8 rounded-full border items-center justify-center active:opacity-70 ${showSuggestions ? 'bg-amber-500/20 border-amber-500' : 'bg-theme-bg/60 border-theme-border'}`}
              >
                <Ionicons name={showSuggestions ? 'bulb' : 'bulb-outline'} size={16} color={showSuggestions ? '#F59E0B' : '#16ACBD'} />
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center space-x-2">
              <TouchableOpacity
                onPress={handleToggleVoiceInput}
                className={`w-8 h-8 rounded-full border items-center justify-center active:opacity-70 ${isRecording ? 'bg-red-500/20 border-red-500' : 'bg-theme-bg/60 border-theme-border'}`}
              >
                <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={16} color={isRecording ? '#EF4444' : '#94A3B8'} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSend()}
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
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
