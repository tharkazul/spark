import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Platform,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput as RNTextInput,
  Image as RNImage,
  Modal,
  Animated,
  Keyboard,
  StyleSheet
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { KeyboardAvoidingView, KeyboardEvents } from 'react-native-keyboard-controller';

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
import { usePhysique } from '../../context/PhysiqueStore';
import { useGamification } from '../../context/GamificationStore';
import { useLanguage } from '../../context/LanguageContext';
import { MarkdownText, hasRenderableText } from '../../components/chat/MarkdownText';
import { ProposalCard } from '../../components/chat/ProposalCard';
import { EventInviteCard } from '../../components/chat/EventInviteCard';
import { SocialMentionCard } from '../../components/chat/SocialMentionCard';
import { ConnectionRequestCard } from '../../components/chat/ConnectionRequestCard';
import { QuickSuggestions } from '../../components/chat/QuickSuggestions';
import { ChatMessage } from '../../types/chat';
import { API_BASE_URL } from '../../constants/api';
import { hasSubscriptionTier } from '../../utils/permissions';
import { getCoachAvatarSource } from '../../utils/avatarUtils';
import { useTabBar } from '../../context/TabBarContext';
import { ChatMacroStrip } from '../../components/chat/ChatMacroStrip';
import { MacroRingGauge } from '../../components/dashboard/MacroRingGauge';
import { BottomSheetModal } from '../../components/ui/BottomSheetModal';

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
  | { type: 'message'; data: ChatMessage; isFirstInRun: boolean; isLastInRun: boolean }
  | { type: 'date'; title: string; id: string }
  | { type: 'thinking'; id: string };

function flattenMessagesChronological(messagesList: ChatMessage[]): ChatListItem[] {
  const items: ChatListItem[] = [];
  let currentDateKey = '';
  
  const TIME_GAP_MS = 20 * 60 * 1000; // 20 minutes

  for (let i = 0; i < messagesList.length; i++) {
    const msg = messagesList[i];
    const prevMsg = i > 0 ? messagesList[i - 1] : null;
    const nextMsg = i < messagesList.length - 1 ? messagesList[i + 1] : null;

    const d = new Date(msg.timestamp || Date.now());
    const dateKey = isNaN(d.getTime()) ? 'today' : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

    if (dateKey !== currentDateKey) {
      currentDateKey = dateKey;
      items.push({ type: 'date', title: isNaN(d.getTime()) ? 'Today' : formatDateHeader(d), id: `date-${dateKey}` });
    }

    let isFirstInRun = true;
    if (prevMsg && prevMsg.role === msg.role) {
      const prevDate = new Date(prevMsg.timestamp || Date.now());
      const diffPrev = Math.abs(d.getTime() - prevDate.getTime());
      if (diffPrev < TIME_GAP_MS) {
        isFirstInRun = false;
      }
    }

    let isLastInRun = true;
    if (nextMsg && nextMsg.role === msg.role) {
      const nextDate = new Date(nextMsg.timestamp || Date.now());
      const diffNext = Math.abs(nextDate.getTime() - d.getTime());
      if (diffNext < TIME_GAP_MS) {
        isLastInRun = false;
      }
    }

    items.push({ type: 'message', data: msg, isFirstInRun, isLastInRun });
  }

  return items;
}

const MessageRow = React.memo(({
  item,
  isFirstInRun,
  isLastInRun,
  user,
  coachTone,
  onAccept,
  onReject,
  onAcceptInvite,
  onDeclineInvite,
  onExpandImage,
}: {
  item: ChatMessage;
  isFirstInRun: boolean;
  isLastInRun: boolean;
  user?: any;
  coachTone?: string;
  onAccept: any;
  onReject: any;
  onAcceptInvite: any;
  onDeclineInvite: any;
  onExpandImage: (source: any) => void;
}) => {
  const hasText = hasRenderableText(item.content) || !!item.isStreaming;
  const hasImages = !!item.images?.length;
  const hasProposal = !!item.proposedPlan?.length;
  const hasPayloadCard = !!item.payload_json;
  if (!hasText && !hasImages && !hasProposal && !hasPayloadCard) return null;
  
  const isUser = item.role === 'user';
  const avatarSrc = getCoachAvatarSource(coachTone, item.mood, user);

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
          <Text className="text-theme-accent font-extrabold text-xs mr-2">Rooka</Text>
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
        ) : (item.payload_json as any)?.type === 'connection_request' || (item.payload_json as any)?.type === 'connection_accepted' ? (
          <ConnectionRequestCard
            payload={item.payload_json as any}
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

        {isLastInRun && (
          <Text
            className={`text-[10px] mt-1.5 self-end ${
              isUser ? 'text-white/70' : 'text-theme-muted'
            }`}
          >
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>
    </View>
  );
});

export default function CoachScreen() {
  const { t } = useLanguage();
  const { messages, sendMessage, sending, loading, acceptProposal, rejectProposal, acceptInvite, declineInvite, tokenUsage, error, markAsRead } = useCoachChat();
  const { user, isChatMacroStripVisible, toggleChatMacroStrip } = useUser();
  const { plan } = usePlan();
  const { nutrition, clearLoggedNutrition } = usePhysique();
  const insets = useSafeAreaInsets();
  const { tabBarOccupied, notifyScroll } = useTabBar();
  const router = useRouter();
  const { quests, generateQuest: generateNewQuest, swapQuest: swapActiveQuest } = useGamification();

  const [isWorkoutModalOpen, setIsWorkoutModalOpen] = useState(false);
  const [isNutritionModalOpen, setIsNutritionModalOpen] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [questLoading, setQuestLoading] = useState(false);

  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const BOTTOM_THRESHOLD = 80;

  const [previewImage, setPreviewImage] = useState<string | number | null>(null);
  const [showScrollDownBtn, setShowScrollDownBtn] = useState(false);

  const [floatingDate, setFloatingDate] = useState<string>('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<RNTextInput>(null);

  const isPinnedToBottom = useRef(true);

  // 1. DATA: reverse the flattened array with thinking indicator at bottom if sending
  const flatItems = useMemo(() => {
    const items = flattenMessagesChronological(messages).slice().reverse();
    if (sending) {
      return [{ type: 'thinking' as const, id: 'pending-thinking' }, ...items];
    }
    return items;
  }, [messages, sending]);

  // 2. SCROLL TO BOTTOM: offset 0 is newest message
  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);

  const showFloatingDate = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 40,
      useNativeDriver: true,
    }).start();

    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }, 1000);
  }, [fadeAnim]);

  // 3. SCROLL HANDLER
  const handleScroll = useCallback((event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    const atBottom = y <= BOTTOM_THRESHOLD;
    isPinnedToBottom.current = atBottom;
    setShowScrollDownBtn((prev) => (prev === !atBottom ? prev : !atBottom));
    showFloatingDate();
  }, [showFloatingDate]);

  const handleScrollBeginDrag = useCallback(() => {
    notifyScroll?.();
    showFloatingDate();
  }, [notifyScroll, showFloatingDate]);

  // 4. FOCUS
  useFocusEffect(
    useCallback(() => {
      isPinnedToBottom.current = true;
      setShowScrollDownBtn(false);
      scrollToBottom(false);
      markAsRead();

      return () => {
        markAsRead();
      };
    }, [scrollToBottom, markAsRead])
  );

  // 5. NEW MESSAGE WHILE PINNED
  const lastItemKey = flatItems[0]
    ? (flatItems[0].type === 'message' ? flatItems[0].data.id : flatItems[0].id)
    : null;

  useEffect(() => {
    if (lastItemKey && isPinnedToBottom.current) {
      scrollToBottom(true);
    }
  }, [lastItemKey, scrollToBottom]);

  // 6. CONTENT PADDING — top and bottom swap for scaleY(-1)
  const listContentStyle = useMemo(
    () => ({
      paddingHorizontal: 16,
      paddingTop: 20,     // renders at visual bottom in inverted list
      paddingBottom: 16,  // renders at visual top in inverted list
    }),
    []
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    if (!viewableItems || viewableItems.length === 0) return;
    // In an inverted list, highest index is at the visual top of the viewport
    let topItem = viewableItems[0];
    for (let i = 1; i < viewableItems.length; i++) {
      if ((viewableItems[i].index ?? 0) > (topItem.index ?? 0)) {
        topItem = viewableItems[i];
      }
    }

    if (topItem && topItem.item) {
      const it = topItem.item as ChatListItem;
      if (it.type === 'date') {
        setFloatingDate(it.title);
      } else if (it.type === 'message' && it.data.timestamp) {
        const d = new Date(it.data.timestamp);
        if (!isNaN(d.getTime())) {
          setFloatingDate(formatDateHeader(d));
        }
      }
    }
  });

  const keyExtractor = useCallback((item: any, index: number) => {
    if (item.type === 'thinking') return 'pending-thinking';
    if (item.type === 'date') return item.id;
    const m = item.data;
    return `msg-${m.clientId ?? m.id ?? m.tempId ?? `pending-${index}`}`;
  }, []);

  const dailyUsage = tokenUsage?.daily_token_usage || 0;
  const dailyLimit = tokenUsage?.daily_token_limit || (hasSubscriptionTier(user?.subscription_tier) ? 500000 : 100000);
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
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleVoiceInput = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isRecording) {
      setIsRecording(false);
      setInputText((prev) => (prev ? `${prev} (voice input completed)` : "My calf is feeling a bit tight today."));
    } else {
      setIsRecording(true);
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

    isPinnedToBottom.current = true;
    scrollToBottom(true);
  };

  const lastCoachMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'coach' || m.role === 'assistant'),
    [messages]
  );
  const rawMood = (lastCoachMessage?.role === 'coach' && lastCoachMessage?.mood) ? lastCoachMessage.mood.toLowerCase() : 'default';
  const lastMood = ['hype', 'disappointed'].includes(rawMood) ? rawMood : 'default';
  const avatarSource = useMemo(() => {
    return getCoachAvatarSource(user?.coach_tone, lastMood, user);
  }, [user, lastMood]);

  const renderItem: any = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.type === 'thinking') {
      return (
        <View className="mb-3 max-w-[86%] self-start">
          <View className="flex-row items-center mb-1 ml-1">
            <RNImage
              source={avatarSource}
              style={{ width: 24, height: 24, borderRadius: 12, marginRight: 8 }}
              resizeMode="cover"
            />
            <Text className="text-theme-accent font-extrabold text-xs mr-2">Rooka</Text>
          </View>
          <View className="px-4 py-2.5 flex-row items-center bg-theme-card border border-theme-border rounded-2xl rounded-bl-sm shadow-xs">
            <ActivityIndicator size="small" color="#16ACBD" />
            <Text className="text-theme-accent text-xs font-semibold ml-2">
              {t('chat.thinking')}
            </Text>
          </View>
        </View>
      );
    }
    if (item.type === 'date') {
      return (
        <View className="py-2.5 items-center justify-center pointer-events-none">
          <View className="bg-theme-card border border-theme-border px-4 py-1.5 rounded-full shadow-md">
            <Text className="text-theme-text text-[11px] font-extrabold tracking-wide">{item.title}</Text>
          </View>
        </View>
      );
    }
    return (
      <MessageRow
        item={item.data}
        isFirstInRun={item.isFirstInRun}
        isLastInRun={item.isLastInRun}
        user={user}
        coachTone={user?.coach_tone}
        onAccept={acceptProposal}
        onReject={rejectProposal}
        onAcceptInvite={acceptInvite}
        onDeclineInvite={declineInvite}
        onExpandImage={(source) => setPreviewImage(source)}
      />
    );
  }, [user, avatarSource, t, acceptProposal, rejectProposal, acceptInvite, declineInvite]);

  const primaryWorkout = todayWorkouts[0] || null;
  const totalTodayRooka = todayWorkouts.reduce((acc, w) => acc + (w.target_rooka || (w as any).rookaPoints || 0), 0);

  const activeQuest = quests?.find((q) => q.status === 'active') || quests?.[0] || null;
  const questProgressPercent = activeQuest
    ? Math.min(100, Math.round(((activeQuest.progress || 0) / (activeQuest.target_value || 1)) * 100))
    : 0;

  const handleGenerateQuestInCoach = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuestLoading(true);
    try {
      if (activeQuest) {
        await swapActiveQuest(activeQuest.id);
      } else {
        await generateNewQuest();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Generate quest error in coach:', err);
    } finally {
      setQuestLoading(false);
    }
  };

  const getSportIconConfig = (sport?: string) => {
    const s = (sport || '').toUpperCase();
    if (s.includes('RUN')) return { icon: 'walk-outline', color: '#F59E0B', bg: 'bg-amber-500/15' };
    if (s.includes('BIKE') || s.includes('CYCL')) return { icon: 'bicycle-outline', color: '#34D399', bg: 'bg-emerald-500/15' };
    if (s.includes('SWIM')) return { icon: 'water-outline', color: '#38BDF8', bg: 'bg-sky-500/15' };
    if (s.includes('STRENGTH')) return { icon: 'barbell-outline', color: '#C084FC', bg: 'bg-purple-500/15' };
    if (s.includes('MOBILITY')) return { icon: 'body-outline', color: '#2DD4BF', bg: 'bg-teal-500/15' };
    return { icon: 'flash-outline', color: '#FF5F3B', bg: 'bg-theme-accent/15' };
  };

  const now = new Date();
  const dateBadgeStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <SafeAreaView className="flex-1 dark:bg-dark-canvas bg-neutral-50" edges={['top']}>
      <KeyboardAvoidingView
        behavior="padding"
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
            ) : typeof previewImage === 'object' && previewImage !== null && 'uri' in previewImage ? (
              <Image
                source={previewImage}
                style={{ width: '100%', height: '80%' }}
                contentFit="contain"
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

      {/* Workout Detail Sheet Modal */}
      <BottomSheetModal
        visible={isWorkoutModalOpen}
        onClose={() => setIsWorkoutModalOpen(false)}
        showHandle
        contentClassName="bg-theme-card rounded-t-3xl p-6 border-t border-theme-border/50 max-h-[80%]"
      >
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-2xl bg-theme-accent/15 items-center justify-center">
              <Ionicons
                name={getSportIconConfig(primaryWorkout?.sport).icon as any}
                size={24}
                color={getSportIconConfig(primaryWorkout?.sport).color}
              />
            </View>
            <View>
              <Text className="text-lg font-black text-theme-text">
                {todayWorkouts.length > 1 ? "Today's Workouts" : "Today's Workout"}
              </Text>
              <Text className="text-xs text-theme-muted font-bold">{dateBadgeStr}</Text>
            </View>
          </View>
          {totalTodayRooka > 0 ? (
            <View className="bg-theme-accent/15 px-3 py-1.5 rounded-full">
              <Text className="text-sm font-mono font-extrabold text-theme-accent">
                +{Math.round(totalTodayRooka)} Total Rooka
              </Text>
            </View>
          ) : null}
        </View>

        {todayWorkouts.length > 0 ? (
          <View className="space-y-3 mb-5">
            {todayWorkouts.map((w, idx) => {
              const cfg = getSportIconConfig(w.sport);
              return (
                <View key={`modal-w-${idx}`} className="bg-theme-bg p-4 rounded-2xl border border-theme-border/60">
                  {/* Top Sport Line */}
                  <View className="flex-row items-center justify-between mb-2 pb-2 border-b border-theme-border/40">
                    <View className="flex-row items-center gap-2">
                      <View className={`w-7 h-7 rounded-lg ${cfg.bg} items-center justify-center`}>
                        <Ionicons name={cfg.icon as any} size={15} color={cfg.color} />
                      </View>
                      <Text className="text-sm font-extrabold text-theme-text">{w.sport || 'Workout'}</Text>
                    </View>
                    {w.target_rooka ? (
                      <View className="bg-theme-accent/15 px-2.5 py-0.5 rounded-full">
                        <Text className="text-xs font-mono font-extrabold text-theme-accent">
                          +{Math.round(w.target_rooka)}⚡
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Workout Title / Name */}
                  {w.description ? (
                    <Text className="text-sm font-extrabold text-theme-text mb-1.5 leading-snug">
                      {w.description}
                    </Text>
                  ) : null}

                  {/* Workout Focus / Instructions */}
                  {w.details ? (
                    <Text className="text-xs text-theme-muted font-normal leading-relaxed">
                      {w.details}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View className="bg-theme-bg p-5 rounded-2xl border border-theme-border/60 mb-5 items-center">
            <Ionicons name="moon-outline" size={28} color="#6F6F79" />
            <Text className="text-sm font-bold text-theme-text mt-2">Rest & Recovery Day</Text>
            <Text className="text-xs text-theme-muted text-center mt-1">No structured workout scheduled for today.</Text>
          </View>
        )}

        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => {
              setIsWorkoutModalOpen(false);
              router.push('/(tabs)/planning');
            }}
            className="flex-1 py-3.5 bg-theme-bg border border-theme-border rounded-xl flex-row items-center justify-center gap-2"
          >
            <Ionicons name="calendar-outline" size={16} color="#FF5F3B" />
            <Text className="text-xs font-extrabold text-theme-accent">View Full Plan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsWorkoutModalOpen(false)}
            className="flex-1 py-3.5 bg-theme-accent rounded-xl items-center justify-center"
          >
            <Text className="text-xs font-black text-white">Got it</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

      {/* Nutrition Detail Sheet Modal (Live & Functional matching Progress Page) */}
      <BottomSheetModal
        visible={isNutritionModalOpen}
        onClose={() => setIsNutritionModalOpen(false)}
        showHandle
        contentClassName="bg-theme-card rounded-t-3xl p-6 border-t border-theme-border/50 max-h-[85%]"
      >
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-2xl bg-emerald-500/15 items-center justify-center">
              <Ionicons name="restaurant-outline" size={24} color="#10B981" />
            </View>
            <View>
              <Text className="text-lg font-black text-theme-text">Today's Fueling Plan</Text>
              <Text className="text-xs text-theme-muted font-bold">Macro Fueling & Targets</Text>
            </View>
          </View>
          {((nutrition?.loggedCarbs || 0) > 0 || (nutrition?.loggedProtein || 0) > 0 || (nutrition?.loggedFat || 0) > 0) && (
            <TouchableOpacity
              onPress={async () => {
                try {
                  await clearLoggedNutrition();
                } catch (e) {
                  console.error('Failed to clear nutrition:', e);
                }
              }}
              className="flex-row items-center gap-1 bg-theme-bg px-3 py-1.5 rounded-full border border-theme-border"
            >
              <Ionicons name="refresh-outline" size={12} color="#A1A1AA" />
              <Text className="text-[11px] font-bold text-theme-muted">Reset</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Rationale Banner */}
        <View className="p-3.5 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-2xl mb-4 border border-emerald-500/20">
          <Text className="text-xs font-extrabold text-emerald-500 dark:text-emerald-400 mb-1">{nutrition?.focusTitle || 'Daily Nutrition Targets'}</Text>
          <Text className="text-xs text-theme-text leading-relaxed font-medium">{nutrition?.rationale || 'Prioritize consistent protein distribution and targeted hydration throughout the day.'}</Text>
        </View>

        {/* 3 Live Macro Rings Row */}
        <View className="bg-theme-bg/60 p-4 rounded-2xl border border-theme-border/60 mb-4 flex-row justify-around items-center">
          <MacroRingGauge
            label="Carbs"
            target={nutrition?.carbsTarget || 280}
            logged={nutrition?.loggedCarbs || 0}
            size={88}
          />
          <MacroRingGauge
            label="Protein"
            target={nutrition?.proteinTarget || 200}
            logged={nutrition?.loggedProtein || 0}
            size={88}
          />
          <MacroRingGauge
            label="Fat"
            target={nutrition?.fatTarget || 80}
            logged={nutrition?.loggedFat || 0}
            size={88}
          />
        </View>

        <TouchableOpacity
          onPress={() => setIsNutritionModalOpen(false)}
          className="w-full py-3.5 bg-theme-accent rounded-xl items-center justify-center mt-2"
        >
          <Text className="text-xs font-black text-white">Got it</Text>
        </TouchableOpacity>
      </BottomSheetModal>

      {/* Quest Detail Sheet Modal */}
      <BottomSheetModal
        visible={isQuestModalOpen}
        onClose={() => setIsQuestModalOpen(false)}
        showHandle
        contentClassName="bg-theme-card rounded-t-3xl p-6 border-t border-theme-border/50 max-h-[80%]"
      >
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-2xl bg-amber-500/15 items-center justify-center">
              <Ionicons name="trophy" size={26} color="#F97316" />
            </View>
            <View>
              <Text className="text-lg font-black text-theme-text">Active Quest</Text>
              <Text className="text-xs text-theme-muted font-bold">Expires Sunday midnight</Text>
            </View>
          </View>
          <View className="bg-amber-500/15 px-3 py-1.5 rounded-full">
            <Text className="text-sm font-mono font-extrabold text-amber-500">
              +{Math.round(activeQuest?.reward_points || 0)} Rooka
            </Text>
          </View>
        </View>

        <View className="bg-theme-bg p-4 rounded-2xl border border-theme-border/60 mb-5">
          <Text className="text-sm font-bold text-theme-text leading-relaxed">
            {activeQuest?.description || 'Complete your active challenges this week to earn bonus Rooka points.'}
          </Text>
        </View>

        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
              Progress ({Math.round(activeQuest?.progress || 0)} / {Math.round(activeQuest?.target_value || 0)})
            </Text>
            <Text className="text-sm font-mono font-bold text-amber-500">
              {questProgressPercent}%
            </Text>
          </View>
          <View className="w-full h-3 bg-theme-bg rounded-full overflow-hidden">
            <View
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${questProgressPercent}%` }}
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={handleGenerateQuestInCoach}
            disabled={questLoading}
            className="flex-1 py-3.5 bg-theme-bg border border-theme-border rounded-xl flex-row items-center justify-center gap-2"
          >
            {questLoading ? (
              <ActivityIndicator size="small" color="#F97316" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={16} color="#6F6F79" />
                <Text className="text-xs font-bold text-theme-muted">Swap Challenge</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsQuestModalOpen(false)}
            className="flex-1 py-3.5 bg-theme-accent rounded-xl items-center justify-center"
          >
            <Text className="text-xs font-black text-white">Got it</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

      {/* Header bar with Avatar, Status, and Date */}
      <View className="px-4 pt-3 pb-1.5 bg-theme-bg z-10 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setPreviewImage(avatarSource)}
            className="w-9 h-9 rounded-full bg-theme-bg overflow-hidden mr-2.5 border border-theme-accent/40 shadow-sm items-center justify-center"
          >
            <RNImage source={avatarSource} style={{ width: 36, height: 36, borderRadius: 18 }} resizeMode="cover" />
          </TouchableOpacity>
          <View className="flex-row items-center space-x-1.5">
            <View className="w-2.5 h-2.5 rounded-full bg-theme-accent mr-1.5" />
            <Text className="text-theme-text text-base font-black">Rooka</Text>
          </View>
        </View>

        {/* Header Right: Date */}
        <View className="flex-row items-center gap-1.5 py-1.5">
          <Ionicons name="calendar-outline" size={13} color="#FF5F3B" />
          <Text className="text-xs font-bold font-mono text-theme-muted">{dateBadgeStr}</Text>
        </View>
      </View>

      {/* Option A Docked Glanceable Telemetry Micro-Pill Strip (Equal Width flex-1) */}
      <View className="px-4 pb-2.5 pt-0.5 bg-theme-bg flex-row items-center gap-2">
        {/* 1. Workout Micro-Pill */}
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setIsWorkoutModalOpen(true);
          }}
          activeOpacity={0.75}
          className="flex-1 bg-theme-card border border-theme-border px-2 py-2 rounded-xl flex-row items-center justify-center gap-1.5 shadow-xs"
        >
          <Ionicons
            name={getSportIconConfig(primaryWorkout?.sport).icon as any}
            size={14}
            color={getSportIconConfig(primaryWorkout?.sport).color}
          />
          <Text className="text-xs font-extrabold text-theme-text" numberOfLines={1}>
            {primaryWorkout?.sport || 'Rest'}
          </Text>
          {primaryWorkout?.target_rooka ? (
            <Text className="text-[11px] font-mono font-extrabold text-theme-accent">
              +{Math.round(primaryWorkout.target_rooka)}⚡
            </Text>
          ) : null}
        </TouchableOpacity>

        {/* 2. Nutrition Micro-Pill */}
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setIsNutritionModalOpen(true);
          }}
          activeOpacity={0.75}
          className="flex-1 bg-theme-card border border-theme-border px-2 py-2 rounded-xl flex-row items-center justify-center gap-1.5 shadow-xs"
        >
          <Ionicons name="nutrition-outline" size={14} color="#10B981" />
          <Text className="text-xs font-extrabold text-theme-text" numberOfLines={1}>
            Nutrition
          </Text>
        </TouchableOpacity>

        {/* 3. Quest Micro-Pill */}
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setIsQuestModalOpen(true);
          }}
          activeOpacity={0.75}
          className="flex-1 bg-theme-card border border-theme-border px-2 py-2 rounded-xl flex-row items-center justify-center gap-1.5 shadow-xs"
        >
          <Ionicons name="trophy" size={13} color="#F97316" />
          <Text className="text-xs font-extrabold text-theme-text" numberOfLines={1}>
            Quest
          </Text>
          <Text className="text-[11px] font-mono font-extrabold text-amber-500">
            {activeQuest ? `${Math.round(activeQuest.progress || 0)}/${Math.round(activeQuest.target_value || 0)}` : '0/0'}
          </Text>
        </TouchableOpacity>
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
          {!hasSubscriptionTier(user?.subscription_tier) ? (
            <TouchableOpacity className="bg-amber-500 px-2.5 py-1 rounded-md">
              <Text className="text-black font-bold text-[10px]">UPGRADE</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* CHAT MESSAGES STREAM */}
      <View className="flex-1 relative">
        {/* Floating Date Pill (Telegram/WhatsApp style) */}
        {floatingDate ? (
          <Animated.View
            pointerEvents="none"
            style={{ opacity: fadeAnim }}
            className="absolute top-2 self-center z-40"
          >
            <View className="bg-theme-card border border-theme-border px-4 py-1.5 rounded-full shadow-lg">
              <Text className="text-theme-text text-[11px] font-extrabold tracking-wide">
                {floatingDate}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {loading && messages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#16ACBD" />
            <Text className="text-theme-muted text-xs mt-2">Connecting with Rooka...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={flatItems}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            inverted
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={handleScrollBeginDrag}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={11}
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={listContentStyle}
            className="flex-1"
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={viewabilityConfig.current}
          />
        )}

        {/* Floating Scroll-Down-to-Bottom Button */}
        {showScrollDownBtn ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              Haptics.selectionAsync();
              scrollToBottom(true);
            }}
            className="absolute bottom-3 right-4 z-40 bg-theme-accent w-10 h-10 rounded-full shadow-lg items-center justify-center"
            style={{
              elevation: 8,
              shadowColor: '#FF5F3B',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 6,
            }}
          >
            <Ionicons name="chevron-down" size={22} color="white" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Bottom Input Area */}
      <View 
        style={{ paddingBottom: isKeyboardVisible ? 6 : Math.max(tabBarOccupied + 12, 100) }}
        className="px-3 pt-2 bg-theme-bg"
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

          <View className="px-2 py-1.5 min-h-[40px] max-h-[100px]">
            <RNTextInput
              ref={inputRef}
              placeholder="Ask about your training, nutrition, or recovery..."
              placeholderTextColor="#8E8E93"
              value={inputText}
              onChangeText={(text) => {
                if (text.includes('\n')) {
                  handleSend(text.replace(/\n/g, ''));
                } else {
                  setInputText(text);
                }
              }}
              multiline={true}
              blurOnSubmit={false}
              returnKeyType="send"
              enterKeyHint="send"
              onSubmitEditing={() => handleSend()}
              className="text-theme-text text-sm"
              style={{ maxHeight: 90, textAlignVertical: 'top', paddingTop: 8, paddingBottom: 8 }}
            />
          </View>

          <View className="flex-row items-center justify-between pt-2 mt-1">
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
                className={`w-9 h-9 rounded-full border items-center justify-center active:opacity-70 ${
                  sending || (!inputText.trim() && selectedImages.length === 0)
                    ? 'bg-theme-bg/60 border-theme-border opacity-50'
                    : 'bg-amber-500/15 border-amber-500/40'
                }`}
              >
                <Ionicons
                  name="send"
                  size={15}
                  color={sending || (!inputText.trim() && selectedImages.length === 0) ? '#8E8E93' : '#F97316'}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
