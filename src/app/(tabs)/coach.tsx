import { BrandColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Image as RNImage,
  TextInput as RNTextInput,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useColorScheme
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDisciplineConfig } from '../../utils/disciplineConfig';

const getImageManipulator = () => {
  try {
    return require('expo-image-manipulator');
  } catch (e) {
    return null;
  }
};

import { ConnectionRequestCard } from '../../components/chat/ConnectionRequestCard';
import { EventInviteCard } from '../../components/chat/EventInviteCard';
import { MarkdownText, hasRenderableText } from '../../components/chat/MarkdownText';
import { ProposalCard } from '../../components/chat/ProposalCard';
import { QuickSuggestions } from '../../components/chat/QuickSuggestions';
import { SocialMentionCard } from '../../components/chat/SocialMentionCard';
import { WorkoutPill } from '../../components/chat/WorkoutPill';
import { WorkoutDebriefCard } from '../../components/chat/WorkoutDebriefCard';
import { CoachChatSkeleton } from '../../components/skeletons/CoachChatSkeleton';
import { useCoachChat, sortMessagesChronological } from '../../context/CoachChatStore';
import { useGamification } from '../../context/GamificationStore';
import { useLanguage } from '../../context/LanguageContext';
import { usePhysique } from '../../context/PhysiqueStore';
import { usePlan } from '../../context/PlanStore';
import { useSubscription } from '../../context/SubscriptionStore';
import { useTabBar } from '../../context/TabBarContext';
import { useUser } from '../../context/UserStore';
import { getAuthToken } from '../../services/apiClient';
import { tokenStorage } from '../../services/storage';
import { ChatMessage, ProposedWorkoutItem } from '../../types/chat';
import { getCoachAvatarSource, resolveChatImageUrl } from '../../utils/avatarUtils';
import { hasSubscriptionTier } from '../../utils/permissions';

import { MacroRingGauge } from '../../components/dashboard/MacroRingGauge';
import { DeviceSyncBanner } from '../../components/dashboard/DeviceSyncBanner';
import { BottomSheetModal, BottomSheetHeader } from '../../components/ui/BottomSheetModal';
import { Chip } from '../../components/ui/Chip';
import { RookaPoints } from '../../components/ui/RookaPoints';
import { SportMedallion } from '../../components/ui/SportMedallion';
import { calculateWorkoutDurationMinutes } from '../../utils/format';

interface ChatSection {
  title: string;
  dateKey: string;
  data: ChatMessage[];
}

function formatDateHeader(dateObj: Date, t?: any, locale?: string): string {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const now = new Date();
  const dDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const nDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((nDate.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t ? t('common.today', 'Today') : 'Today';
  if (diffDays === 1) return t ? t('common.yesterday', 'Yesterday') : 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return dateObj.toLocaleDateString(locale || [], { weekday: 'long' });
  }
  if (dateObj.getFullYear() === now.getFullYear()) {
    return dateObj.toLocaleDateString(locale || [], { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return dateObj.toLocaleDateString(locale || [], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPillWorkoutDate(dateStr?: string, t?: any, locale?: string): string {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
    if (!y || !m || !d) return dateStr;
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t ? t('common.today', 'Today') : 'Today';
    if (diffDays === 1) return t ? t('common.tomorrow', 'Tomorrow') : 'Tomorrow';
    if (diffDays === -1) return t ? t('common.yesterday', 'Yesterday') : 'Yesterday';

    return target.toLocaleDateString(locale || 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch (_) {
    return dateStr;
  }
}

type ChatListItem =
  | { type: 'message'; data: ChatMessage; isFirstInRun: boolean; isLastInRun: boolean }
  | { type: 'date'; title: string; id: string }
  | { type: 'thinking'; id: string };

function flattenMessagesChronological(messagesList: ChatMessage[], t?: any, locale?: string): ChatListItem[] {
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
      items.push({ type: 'date', title: isNaN(d.getTime()) ? (t ? t('common.today', 'Today') : 'Today') : formatDateHeader(d, t, locale), id: `date-${dateKey}` });
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
  authToken,
  onAccept,
  onReject,
  onAcceptInvite,
  onDeclineInvite,
  onAcceptConnection,
  onDeclineConnection,
  onExpandImage,
  onSelectWorkout,
  onResend,
}: {
  item: ChatMessage;
  isFirstInRun: boolean;
  isLastInRun: boolean;
  user?: any;
  coachTone?: string;
  authToken?: string | null;
  onAccept: any;
  onReject: any;
  onAcceptInvite: any;
  onDeclineInvite: any;
  onAcceptConnection?: (friendId: number | string) => Promise<void> | void;
  onDeclineConnection?: (friendId: number | string) => Promise<void> | void;
  onExpandImage: (source: any) => void;
  onSelectWorkout?: (workout: ProposedWorkoutItem) => void;
  onResend: (id: string | number) => void;
}) => {
  const createdWorkouts = useMemo(() => {
    if (item.payload_json?.type === 'created_workout' && Array.isArray((item.payload_json as any).workouts)) {
      return (item.payload_json as any).workouts as ProposedWorkoutItem[];
    }
    if (item.proposedPlan && item.proposedPlan.length > 0) {
      return item.proposedPlan;
    }
    return null;
  }, [item.payload_json, item.proposedPlan]);

  const hasText = hasRenderableText(item.content);
  const hasImages = !!item.images?.length;
  const hasProposal = !!item.proposedPlan?.length || (createdWorkouts && createdWorkouts.length > 0);
  const hasPayloadCard = !!item.payload_json;
  if (!hasText && !hasImages && !hasProposal && !hasPayloadCard) return null;

  const isUser = item.role === 'user';
  const avatarSrc = getCoachAvatarSource(coachTone, item.mood, user);
  const router = useRouter();
  const { t } = useLanguage();

  const isUpgradePrompt = useMemo(() => {
    if (isUser || !item.content) return false;
    const lower = item.content.toLowerCase();
    return (
      lower.includes('run out of tokens') ||
      lower.includes('upgrade page') ||
      lower.includes('subtab=account')
    );
  }, [isUser, item.content]);

  return (
    <View className={`max-w-[85%] ${isUser ? 'self-end' : 'self-start'} ${isLastInRun ? 'mb-4' : 'mb-1'}`}>
      {!isUser && isFirstInRun && (
        <View className="flex-row items-center mb-1.5 ml-1">
          <TouchableOpacity activeOpacity={0.8} onPress={() => onExpandImage(avatarSrc)}>
            <RNImage
              source={avatarSrc}
              style={{ width: 24, height: 24, borderRadius: 12, marginRight: 8 }}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <Text className="text-theme-accent-text font-bold text-xs mr-2 font-rajdhani">rooka</Text>
        </View>
      )}

      <View
        className={`px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-theme-accent-strong rounded-br-[6px]'
            : 'bg-theme-card border border-theme-border rounded-bl-[6px]'
        }`}
      >
        {item.images && item.images.length > 0 ? (
          <View className="mb-2 flex-row flex-wrap gap-2">
            {item.images.map((imgUri, imgIdx) => {
              const resolvedUri = resolveChatImageUrl(imgUri, authToken);
              return (
                <TouchableOpacity
                  key={`msg-img-${imgIdx}`}
                  activeOpacity={0.85}
                  onPress={() => onExpandImage(resolvedUri)}
                >
                  <Image
                    source={{
                      uri: resolvedUri,
                      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
                    }}
                    style={{ width: 140, height: 140, borderRadius: 10 }}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <MarkdownText content={item.content} isUser={isUser} onImagePress={onExpandImage} />
        {isUpgradePrompt && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.navigate({
                pathname: '/(tabs)/profile',
                params: { subtab: 'account' },
              });
            }}
            className="mt-3 py-2 px-3.5 bg-theme-accent-strong rounded-button flex-row items-center justify-center self-start"
          >
            <Ionicons name="sparkles" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text className="text-white text-xs font-bold font-rajdhani">
              {t('profile.upgradeToRookaPlus', 'Upgrade to Rooka+')}
            </Text>
            <Ionicons name="chevron-forward" size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}

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
            onAccept={onAcceptConnection}
            onDecline={onDeclineConnection}
          />
        ) : (item.payload_json as any)?.type === 'workout_debrief' ? (
          <WorkoutDebriefCard
            debrief={item.payload_json as any}
          />
        ) : null}

        {createdWorkouts && createdWorkouts.length > 0 ? (
          <View className="mt-1">
            {createdWorkouts.map((w, wIdx) => (
              <WorkoutPill
                key={`workout-pill-${wIdx}`}
                workout={w}
                onPress={() => onSelectWorkout?.(w)}
              />
            ))}
          </View>
        ) : item.proposedPlan && item.proposedPlan.length > 0 ? (
          <ProposalCard
            plan={item.proposedPlan}
            status={item.proposalStatus}
            onAccept={() => onAccept(item.id, item.proposedPlan!)}
            onReject={() => onReject(item.id)}
          />
        ) : null}
      </View>

      {isLastInRun && !item.isError && (
        <Text className={`text-[11px] mt-1 mr-1 text-theme-muted ${isUser ? 'self-end' : 'self-start ml-1'}`}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}

      {isUser && item.isError && (
        <TouchableOpacity activeOpacity={0.8} onPress={() => onResend(item.id)} className="mt-1 flex-row items-center self-end mr-1">
          <Ionicons name="reload-circle" size={14} color="#EF4444" />
          <Text className="text-semantic-error text-xs ml-1 font-medium">{t('coach.failedToSend', 'Failed to send. Tap to retry.')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export default function CoachScreen() {
  const theme = useTheme();
  const { t, language } = useLanguage();
  const {
    messages,
    refreshMessages,
    sendMessage,
    resendMessage,
    sending,
    loading,
    acceptProposal,
    rejectProposal,
    acceptInvite,
    declineInvite,
    acceptConnection,
    declineConnection,
    tokenUsage,
    error,
    markAsRead,
    setChatActive,
  } = useCoachChat();
  const { user } = useUser();
  const { presentPaywall } = useSubscription();
  const { plan } = usePlan();
  const { nutrition, clearLoggedNutrition } = usePhysique();
  const insets = useSafeAreaInsets();
  const { tabBarOccupied, notifyScrollEnd } = useTabBar();
  const router = useRouter();
  const { quests, generateQuest: generateNewQuest, swapQuest: swapActiveQuest } = useGamification();

  const [isWorkoutModalOpen, setIsWorkoutModalOpen] = useState(false);
  const [selectedPillWorkout, setSelectedPillWorkout] = useState<ProposedWorkoutItem | null>(null);
  const [authToken, setAuthTokenState] = useState<string | null>(getAuthToken());
  const [isNutritionModalOpen, setIsNutritionModalOpen] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [questLoading, setQuestLoading] = useState(false);

  useEffect(() => {
    if (!authToken) {
      tokenStorage.getToken().then((t) => {
        if (t) setAuthTokenState(t);
      });
    }
  }, [authToken]);

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
    const sorted = sortMessagesChronological(messages);
    const items = flattenMessagesChronological(sorted, t, language).slice().reverse();
    if (sending) {
      return [{ type: 'thinking' as const, id: 'pending-thinking' }, ...items];
    }
    return items;
  }, [messages, sending, t, language]);

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

  /**
   * Chat deliberately does NOT hide the tab bar on scroll, unlike the other
   * tabs. There the bar sits over content worth reading; here the composer is
   * pinned above it either way, so sliding the bar away uncovers nothing and
   * just adds motion to the one screen you scroll most. The bar already gets
   * out of the way on this screen when it matters -- the keyboard drives it
   * via KeyboardMotionContext, independently of the scroll path.
   */
  const handleScrollBeginDrag = useCallback(() => {
    showFloatingDate();
  }, [showFloatingDate]);

  // 4. FOCUS
  useFocusEffect(
    useCallback(() => {
      isPinnedToBottom.current = true;
      setShowScrollDownBtn(false);
      scrollToBottom(false);
      setChatActive(true);
      markAsRead();
      refreshMessages();
      // Chat never hides the bar itself, so make sure it is up on arrival:
      // swiping here mid-momentum from a tab that DID hide it would otherwise
      // leave it stranded off-screen with nothing to bring it back.
      notifyScrollEnd?.();

      return () => {
        setChatActive(false);
        markAsRead();
      };
    }, [scrollToBottom, markAsRead, notifyScrollEnd, refreshMessages, setChatActive])
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
      paddingTop: 4,      // renders at visual bottom in inverted list
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
          setFloatingDate(formatDateHeader(d, t, language));
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
        allowsMultipleSelection: true,
        orderedSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const ImageManipulator = getImageManipulator();
        const processedUris: string[] = [];

        for (const asset of result.assets) {
          if (!asset.uri) continue;
          if (ImageManipulator && typeof ImageManipulator.manipulateAsync === 'function') {
            try {
              const manipulated = await ImageManipulator.manipulateAsync(
                asset.uri,
                [{ resize: { width: 1600 } }],
                { compress: 0.7, format: ImageManipulator.SaveFormat?.JPEG || 'jpeg', base64: true }
              );

              if (manipulated?.base64) {
                processedUris.push(`data:image/jpeg;base64,${manipulated.base64}`);
              } else {
                processedUris.push(asset.uri);
              }
            } catch (manipErr) {
              console.warn('Image manipulation failed for asset, using uri:', manipErr);
              processedUris.push(asset.uri);
            }
          } else {
            processedUris.push(asset.uri);
          }
        }

        if (processedUris.length > 0) {
          setSelectedImages((prev) => [...prev, ...processedUris]);
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

  const checkSelfHarmCrisis = (text: string): boolean => {
    const crisisRegex = /(suicide|self-harm|self harm|kill myself|want to die|ending my life|end my life|hurting myself|hurt myself|cut myself|overdose|take my life|hopeless|can't go on|give up on life|mental breakdown)/i;
    if (crisisRegex.test(text)) {
      Alert.alert(
        "Mental Health & Crisis Support",
        "If you are experiencing thoughts of self-harm or distress, please know that confidential help is available 24/7:\n\n" +
        "• US/Canada: Call/text 988 (Suicide & Crisis Lifeline) or text HOME to 741741.\n" +
        "• Netherlands/EU: Call 113 or 112 (113 Zelfmoordpreventie).\n" +
        "• UK: Call 111 or Samaritans at 116 123.\n\n" +
        "rooka AI Coach is an athletic fitness tool and cannot replace professional medical or crisis support.",
        [
          { text: "Call 988 (US)", onPress: () => Linking.openURL("tel:988") },
          { text: "Call 113 (NL)", onPress: () => Linking.openURL("tel:113") },
          { text: "Close", style: "cancel" }
        ]
      );
      return true;
    }
    return false;
  };

  const handleSend = (textOverride?: string) => {
    const rawText = textOverride !== undefined ? textOverride : inputText;
    const textToSend = rawText.trim();
    if ((!textToSend && selectedImages.length === 0) || sending) return;

    if (textToSend && checkSelfHarmCrisis(textToSend)) {
      return;
    }

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

  const handleSelectWorkout = useCallback((w: ProposedWorkoutItem) => {
    setSelectedPillWorkout(w);
    setIsWorkoutModalOpen(true);
  }, []);

  const renderItem: any = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.type === 'thinking') {
      return (
        <View className="mb-4 max-w-[85%] self-start">
          <View className="flex-row items-center mb-1.5 ml-1">
            <RNImage
              source={avatarSource}
              style={{ width: 24, height: 24, borderRadius: 12, marginRight: 8 }}
              resizeMode="cover"
            />
            <Text className="text-theme-accent-text font-bold text-xs mr-2 font-rajdhani">rooka</Text>
          </View>
          <View className="px-4 py-3 flex-row items-center bg-theme-card border border-theme-border rounded-2xl rounded-bl-[6px]">
            <ActivityIndicator size="small" color="#0EA5E9" />
            <Text className="text-theme-muted text-xs font-semibold ml-2.5">
              {t('chat.thinking')}
            </Text>
          </View>
        </View>
      );
    }
    if (item.type === 'date') {
      return (
        <View className="py-3 flex-row items-center justify-center px-4 pointer-events-none">
          <View className="flex-1 h-[1px] bg-theme-border/60" />
          <View className="bg-theme-card border border-theme-border px-3 py-1 rounded-full mx-3">
            <Text className="text-theme-muted text-[11px] font-bold tracking-wide uppercase">{item.title}</Text>
          </View>
          <View className="flex-1 h-[1px] bg-theme-border/60" />
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
        authToken={authToken}
        onAccept={acceptProposal}
        onReject={rejectProposal}
        onAcceptInvite={acceptInvite}
        onDeclineInvite={declineInvite}
        onAcceptConnection={acceptConnection}
        onDeclineConnection={declineConnection}
        onExpandImage={(source) => setPreviewImage(source)}
        onSelectWorkout={handleSelectWorkout}
        onResend={resendMessage}
      />
    );
  }, [user, avatarSource, t, authToken, handleSelectWorkout, acceptProposal, rejectProposal, acceptInvite, declineInvite, acceptConnection, declineConnection, resendMessage]);

  const primaryWorkout = todayWorkouts[0] || null;
  const primaryWorkoutDuration = useMemo(() => {
    return primaryWorkout ? calculateWorkoutDurationMinutes(primaryWorkout) : 0;
  }, [primaryWorkout]);
  const totalTodayRooka = todayWorkouts.reduce((acc, w) => acc + (w.target_rooka || (w as any).rookaPoints || 0), 0);
  const totalTargetKcal = useMemo(() => {
    const carbs = nutrition?.carbsTarget || 280;
    const protein = nutrition?.proteinTarget || 200;
    const fat = nutrition?.fatTarget || 80;
    return carbs * 4 + protein * 4 + fat * 9;
  }, [nutrition]);

  const activeQuest = quests?.find((q) => q.status === 'active') || null;
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

  // One palette for every screen; see utils/disciplineConfig.
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const getSportIconConfig = (sport?: string) => getDisciplineConfig(sport, scheme);


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
                  source={{
                    uri: resolveChatImageUrl(previewImage as string, authToken),
                    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
                  }}
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
          onClose={() => {
            setIsWorkoutModalOpen(false);
            setSelectedPillWorkout(null);
          }}
          showHandle
          header={
            selectedPillWorkout ? (
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-3">
                  <SportMedallion sport={selectedPillWorkout.sport} size={40} />
                  <View>
                    <Text className="text-lg font-extrabold text-theme-text">
                      {(selectedPillWorkout.sport || '').toLowerCase() === 'rest'
                        ? t('common.restDay', 'Rest Day')
                        : t('dashboard.workoutDetails', 'Workout Details')}
                    </Text>
                    <Text className="text-xs text-theme-muted font-bold">
                      {formatPillWorkoutDate(selectedPillWorkout.date, t, language) ||
                        selectedPillWorkout.date ||
                        t('common.today', 'Today')}
                    </Text>
                  </View>
                </View>
                {selectedPillWorkout.target_rooka && selectedPillWorkout.target_rooka > 0 ? (
                  <Chip
                    variant="points"
                    size="md"
                    label={Math.round(selectedPillWorkout.target_rooka)}
                  />
                ) : null}
              </View>
            ) : null
          }
        >
          {selectedPillWorkout ? (
            (() => {
              const cfg = getSportIconConfig(selectedPillWorkout.sport);
              let steps: any[] = [];
              if (selectedPillWorkout.steps_json) {
                try {
                  steps = typeof selectedPillWorkout.steps_json === 'string'
                    ? JSON.parse(selectedPillWorkout.steps_json)
                    : selectedPillWorkout.steps_json;
                } catch (_) {}
              }

              return (
                <>
                  <View className="bg-theme-bg p-4 rounded-2xl border border-theme-border/60 mb-5">
                    {/* Top Sport Line */}
                    <View className="flex-row items-center justify-between mb-2 pb-2 border-b border-theme-border/40">
                      <View className="flex-row items-center gap-2">
                        <View
                          style={{ backgroundColor: cfg.tint }}
                          className="w-7 h-7 rounded-lg items-center justify-center"
                        >
                          <Ionicons name={cfg.icon as any} size={15} color={cfg.color} />
                        </View>
                        <Text className="text-sm font-extrabold text-theme-text">
                          {selectedPillWorkout.sport || 'Workout'}
                        </Text>
                      </View>
                      {selectedPillWorkout.target_rooka && selectedPillWorkout.target_rooka > 0 ? (
                        <RookaPoints value={Math.round(selectedPillWorkout.target_rooka)} variant="badge" />
                      ) : null}
                    </View>

                    {/* Workout Title / Name */}
                    {selectedPillWorkout.description ? (
                      <Text className="text-sm font-extrabold text-theme-text mb-1.5 leading-snug">
                        {selectedPillWorkout.description}
                      </Text>
                    ) : null}

                    {/* Workout Focus / Instructions */}
                    {selectedPillWorkout.details ? (
                      <Text className="text-xs text-theme-muted font-normal leading-relaxed mb-2">
                        {selectedPillWorkout.details}
                      </Text>
                    ) : null}

                    {/* Structured Steps if available */}
                    {Array.isArray(steps) && steps.length > 0 && (
                      <View className="mt-2 pt-2 border-t border-theme-border/30 gap-y-1.5">
                        <Text className="text-[11px] font-bold text-theme-muted uppercase tracking-wider mb-1">
                          {t('coach.structuredSteps', 'Structured Workout Steps')}
                        </Text>
                        {steps.map((st: any, sIdx: number) => (
                          <View
                            key={`modal-step-${sIdx}`}
                            className="flex-row items-center justify-between py-1.5 px-2.5 rounded-lg bg-theme-card/60"
                          >
                            <Text className="text-xs font-semibold text-theme-text flex-1 mr-2" numberOfLines={1}>
                              {st.name || st.description || `Step ${sIdx + 1}`}
                            </Text>
                            <Text className="text-xs text-theme-muted font-mono">
                              {st.duration || st.distance || st.target || ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              );
            })()
          ) : (
            <>
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-3">
                  <SportMedallion sport={primaryWorkout?.sport || 'Rest'} size={40} />
                  <View>
                    <Text className="text-lg font-extrabold text-theme-text">
                      {todayWorkouts.length > 1 ? t('coach.todaysWorkouts', "Today's Workouts") : t('coach.todaysWorkout', "Today's Workout")}
                    </Text>
                    <Text className="text-xs text-theme-muted font-bold">{dateBadgeStr}</Text>
                  </View>
                </View>
                {totalTodayRooka > 0 ? (
                  <Chip
                    variant="points"
                    size="md"
                    label={Math.round(totalTodayRooka)}
                  />
                ) : null}
              </View>

              {todayWorkouts.length > 0 ? (
                <View className="gap-y-3 mb-5">
                  {todayWorkouts.map((w, idx) => {
                    return (
                      <View key={`modal-w-${idx}`} className="bg-theme-bg p-4 rounded-2xl border border-theme-border/60">
                        {/* Top Sport Line */}
                        <View className="flex-row items-center justify-between mb-2 pb-2 border-b border-theme-border/40">
                          <View className="flex-row items-center gap-2">
                            <SportMedallion sport={w.sport || 'Workout'} size={24} />
                            <Text className="text-sm font-extrabold text-theme-text">{w.sport || 'Workout'}</Text>
                          </View>
                          {w.target_rooka ? (
                            <RookaPoints value={Math.round(w.target_rooka)} variant="badge" />
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
                  <Ionicons name="moon-outline" size={28} color={theme.textSecondary} />
                  <Text className="text-sm font-bold text-theme-text mt-2">{t('coach.restRecoveryDay', 'Rest & Recovery Day')}</Text>
                  <Text className="text-xs text-theme-muted text-center mt-1">{t('coach.noWorkoutScheduled', 'No structured workout scheduled for today.')}</Text>
                </View>
              )}
            </>
          )}

          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => {
                setIsWorkoutModalOpen(false);
                setSelectedPillWorkout(null);
                // `/(tabs)/planning` was an alias route re-exporting the Planning
                // screen. The tab pager only carries the five declared screens, so
                // go to the real one.
                router.push('/(tabs)');
              }}
              className="flex-1 py-3.5 bg-theme-bg border border-theme-border rounded-xl flex-row items-center justify-center gap-2"
            >
              <Ionicons name="calendar-outline" size={16} color={theme.tint} />
              <Text className="text-xs font-extrabold text-theme-accent">{t('coach.viewFullPlan', 'View Full Plan')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setIsWorkoutModalOpen(false);
                setSelectedPillWorkout(null);
              }}
              className="flex-1 py-3.5 bg-theme-accent rounded-xl items-center justify-center"
            >
              <Text className="text-xs font-extrabold text-white">{t('common.gotIt', 'Got it')}</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetModal>

        {/* Nutrition Detail Sheet Modal */}
        <BottomSheetModal
          visible={isNutritionModalOpen}
          onClose={() => setIsNutritionModalOpen(false)}
          showHandle
          header={
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-full bg-theme-accent/15 items-center justify-center">
                  <Ionicons name="restaurant-outline" size={20} color={theme.tint} />
                </View>
                <View>
                  <Text className="text-base font-bold text-theme-text font-rajdhani">{t('coach.todaysFueling', "Today's Fueling")}</Text>
                  <Text className="text-xs text-theme-muted font-medium">{t('coach.macroTargetsEnergyBudget', 'Macro targets & energy budget')}</Text>
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
                  className="flex-row items-center gap-1 bg-theme-bg px-2.5 py-1 rounded-full border border-theme-border"
                >
                  <Ionicons name="refresh-outline" size={12} color={theme.textSecondary} />
                  <Text className="text-[11px] font-bold text-theme-muted">{t('common.reset', 'Reset')}</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        >

          {/* Total Target Energy Hero */}
          <View className="mb-4 items-center py-1">
            <Text className="text-[11px] font-bold text-theme-muted uppercase tracking-wider mb-0.5">
              {t('dashboard.dailyEnergyTarget')}
            </Text>
            <Text className="text-3xl font-rajdhani font-bold text-theme-text tabular-nums">
              {totalTargetKcal.toLocaleString()} <Text className="text-base text-theme-muted font-normal">kcal</Text>
            </Text>
            <Text className="text-xs text-theme-muted mt-0.5 text-center font-medium">
              {t('coach.calculatedFromVolume', 'Calculated from your training volume and target weight')}
            </Text>
          </View>

          {/* 3 Live Macro Rings Row */}
          <View className="bg-theme-card p-4 rounded-2xl border border-theme-border mb-4 flex-row justify-around items-center">
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

          {/* Rationale / Explanation with Form (TSB) Chip */}
          <View className="p-3.5 bg-theme-card rounded-2xl mb-5 border border-theme-border">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-xs font-bold text-theme-text">{nutrition?.focusTitle || t('coach.dailyNutritionTargets', 'Daily Nutrition Targets')}</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsNutritionModalOpen(false);
                  router.push('/(tabs)/progress' as any);
                }}
                className="bg-emerald-500/15 px-2 py-0.5 rounded-full flex-row items-center gap-1"
              >
                <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <Text className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Fresh (TSB)</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-xs text-theme-muted leading-relaxed font-medium">
              {nutrition?.rationale || 'Prioritize consistent protein distribution and targeted hydration throughout the day.'}
            </Text>
          </View>

          {/* Footer Actions */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setIsNutritionModalOpen(false)}
              className="flex-1 py-3.5 bg-theme-accent-strong rounded-button items-center justify-center"
            >
              <Text className="text-xs font-bold text-white">{t('common.gotIt', 'Got it')}</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetModal>

        {/* Quest Detail Sheet Modal */}
        <BottomSheetModal
          visible={isQuestModalOpen}
          onClose={() => setIsQuestModalOpen(false)}
          showHandle
          header={
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-3">
                <View className="w-12 h-12 rounded-2xl bg-theme-accent/15 items-center justify-center">
                  <Ionicons name="trophy" size={26} color={theme.tint} />
                </View>
                <View>
                  <Text className="text-lg font-extrabold text-theme-text">{t('coach.activeQuest', 'Active Quest')}</Text>
                  <Text className="text-xs text-theme-muted font-bold">{t('coach.expiresSundayMidnight', 'Expires Sunday midnight')}</Text>
                </View>
              </View>
              <Chip
                variant="points"
                size="md"
                label={Math.round(activeQuest?.reward_points || 0)}
              />
            </View>
          }
        >

          <View className="bg-theme-bg p-4 rounded-2xl border border-theme-border/60 mb-5">
            <Text className="text-sm font-bold text-theme-text leading-relaxed font-rajdhani">
              {activeQuest?.description || 'Complete your active challenges this week to earn bonus rooka points.'}
            </Text>
          </View>

          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-xs font-bold text-theme-muted">
                {t('coach.progressCount', { current: Math.round(activeQuest?.progress || 0), target: Math.round(activeQuest?.target_value || 0) })}
              </Text>
              <Text className="text-sm font-mono font-bold text-theme-accent">
                {questProgressPercent}%
              </Text>
            </View>
            <View className="w-full h-3 bg-theme-bg rounded-full overflow-hidden">
              <View
                className="h-full bg-theme-accent rounded-full"
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
                <ActivityIndicator size="small" color={theme.tint} />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={16} color={theme.textSecondary} />
                  <Text className="text-xs font-bold text-theme-muted">{t('coach.swapChallenge', 'Swap Challenge')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsQuestModalOpen(false)}
              className="flex-1 py-3.5 bg-theme-accent rounded-xl items-center justify-center"
            >
              <Text className="text-xs font-extrabold text-white">{t('common.gotIt', 'Got it')}</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetModal>

        {/* Header bar with Avatar, Status, and Date */}
        <View className="px-4 pt-2.5 pb-2.5 bg-theme-bg border-b border-theme-border/40 z-10 flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 mr-2">
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPreviewImage(avatarSource)}
              className="relative mr-3"
            >
              <RNImage
                source={avatarSource}
                style={{ width: 40, height: 40, borderRadius: 20 }}
                resizeMode="cover"
              />
              <View className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute bottom-0 right-0 border-2 border-theme-bg" />
            </TouchableOpacity>
            <View>
              <Text className="text-theme-text text-base font-bold font-rajdhani leading-tight">
                rooka
              </Text>
              <Text className="text-[11px] text-theme-muted font-medium">
                {t('coach.yourCoach', 'Your coach')}
              </Text>
            </View>
          </View>

          {/* Header Right: Date Link to Planning */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/(tabs)');
            }}
            className="flex-row items-center gap-1.5 py-1 px-2.5 rounded-full bg-theme-card border border-theme-border"
          >
            <Ionicons name="calendar-outline" size={13} color={theme.tint} />
            <Text className="text-xs font-semibold text-theme-text">{dateBadgeStr}</Text>
            <Ionicons name="chevron-forward" size={12} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Docked Glanceable Telemetry Micro-Pill Strip */}
        <View className="py-2 bg-theme-bg border-b border-theme-border/20">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              minWidth: '100%',
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
            className="flex-row gap-2"
          >
            {/* 1. Workout Micro-Pill */}
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedPillWorkout(primaryWorkout);
                setIsWorkoutModalOpen(true);
              }}
              activeOpacity={0.75}
              style={{ flexGrow: 1 }}
              className="h-9 bg-theme-card border border-theme-border px-3 rounded-full flex-row items-center justify-center gap-2"
            >
              <SportMedallion sport={primaryWorkout?.sport || 'Rest'} size={20} />
              <Text className="text-xs font-bold text-theme-text" numberOfLines={1}>
                {primaryWorkout?.sport
                  ? `${(() => {
                      const upper = (primaryWorkout.sport || '').toUpperCase();
                      if (upper === 'RUN') return t('sports.run', 'Run');
                      if (upper === 'BIKE' || upper === 'CYCLING') return t('sports.bike', 'Bike');
                      if (upper === 'SWIM') return t('sports.swim', 'Swim');
                      if (upper === 'STRENGTH') return t('sports.strength', 'Strength');
                      if (upper === 'MOBILITY') return t('sports.mobility', 'Mobility');
                      if (upper === 'WALK') return t('sports.walk', 'Walk');
                      if (upper === 'REST') return t('common.restDay', 'Rest Day');
                      return primaryWorkout.sport;
                    })()}${primaryWorkoutDuration ? `, ${primaryWorkoutDuration} min` : ''}`
                  : t('common.restDay', 'Rest Day')}
              </Text>
              {primaryWorkout?.target_rooka ? (
                <RookaPoints value={Math.round(primaryWorkout.target_rooka)} />
              ) : null}
            </TouchableOpacity>

            {/* 2. Nutrition Micro-Pill */}
            {user?.subscription_tier !== 'free' && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsNutritionModalOpen(true);
                }}
                activeOpacity={0.75}
                style={{ flexGrow: 1 }}
                className="h-9 bg-theme-card border border-theme-border px-3 rounded-full flex-row items-center justify-center gap-2"
              >
                <Ionicons name="restaurant-outline" size={15} color="#F59E0B" />
                <Text className="text-xs font-bold text-theme-text" numberOfLines={1}>
                  {t('coach.nutrition', 'Nutrition')}
                </Text>
              </TouchableOpacity>
            )}

            {/* 3. Quest Micro-Pill */}
            {user?.subscription_tier !== 'free' && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsQuestModalOpen(true);
                }}
                activeOpacity={0.75}
                style={{ flexGrow: 1 }}
                className="h-9 bg-theme-card border border-theme-border px-3 rounded-full flex-row items-center justify-center gap-2"
              >
                <Ionicons name="trophy-outline" size={15} color="#FB923C" />
                <Text className="text-xs font-bold text-theme-text" numberOfLines={1}>
                  {t('coach.quest', 'Quest')}
                </Text>
                <Text className="text-xs font-mono font-bold text-theme-accent-text font-rajdhani">
                  {activeQuest ? `${Math.round(activeQuest.progress || 0)}/${Math.round(activeQuest.target_value || 0)}` : '0/0'}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Low Token Budget Warning Banner */}
        {showTokenWarning ? (
          <View className="bg-theme-accent/15 px-4 py-2 border-b border-theme-accent/30 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 mr-2">
              <Ionicons name="warning-outline" size={16} color="#F59E0B" />
              <Text className="text-theme-accent text-xs font-semibold ml-2">
                {t('coach.dailyBudgetLow', { percent: remainingPercent })}
              </Text>
            </View>
            {!hasSubscriptionTier(user?.subscription_tier) ? (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  presentPaywall();
                }}
                activeOpacity={0.8}
                className="bg-theme-accent px-2.5 py-1 rounded-md"
              >
                <Text className="text-black font-bold text-xs">{t('coach.upgrade', 'UPGRADE')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Contextual Device Sync Banner (Prompt to sync Garmin/Strava) */}
        <DeviceSyncBanner />

        {/* CHAT MESSAGES STREAM */}
        <View className="flex-1 relative">
          {/* Floating Date Pill (Telegram/WhatsApp style) */}
          {floatingDate ? (
            <Animated.View
              pointerEvents="none"
              style={{ opacity: fadeAnim }}
              className="absolute top-2 self-center z-40"
            >
              <View className="bg-theme-card border border-theme-border px-4 py-1.5 rounded-full">
                <Text className="text-theme-text text-xs font-extrabold tracking-wide">
                  {floatingDate}
                </Text>
              </View>
            </Animated.View>
          ) : null}

          {loading && messages.length === 0 ? (
            <CoachChatSkeleton />
          ) : (
            <FlatList
              ref={flatListRef}
              data={flatItems}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              inverted
              onScroll={handleScroll}
              scrollEventThrottle={32}
              onScrollBeginDrag={handleScrollBeginDrag}
              initialNumToRender={12}
              maxToRenderPerBatch={6}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
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
              className="absolute bottom-3 right-4 z-40 bg-theme-accent-strong w-10 h-10 rounded-full items-center justify-center border border-white/20"
            >
              <Ionicons name="chevron-down" size={22} color="white" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Bottom Input Area */}
        <View
          style={{ paddingBottom: isKeyboardVisible ? (Platform.OS === 'ios' ? 8 : 12) : Math.max(tabBarOccupied + 8, 96) }}
          className="px-3 pt-1 bg-theme-bg"
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

          <View className="bg-theme-card rounded-[24px] px-3 py-1.5 border border-theme-border flex-row items-end gap-2 min-h-[48px]">
            {/* Left Action Buttons */}
            <View className="flex-row items-center gap-1.5 pb-1">
              <TouchableOpacity
                onPress={handlePickImage}
                hitSlop={6}
                className="w-9 h-9 rounded-full bg-theme-bg border border-theme-border items-center justify-center active:opacity-70"
              >
                <Ionicons name="attach-outline" size={18} color={theme.tint} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowSuggestions(!showSuggestions)}
                hitSlop={6}
                className={`w-9 h-9 rounded-full border items-center justify-center active:opacity-70 ${
                  showSuggestions
                    ? 'bg-amber-500/15 border-amber-500/40'
                    : 'bg-theme-bg border border-theme-border'
                }`}
              >
                <Ionicons
                  name={showSuggestions ? 'bulb' : 'bulb-outline'}
                  size={16}
                  color={showSuggestions ? '#F59E0B' : theme.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Input & Selected Image Previews */}
            <View className="flex-1 justify-center py-1">
              {selectedImages.length > 0 ? (
                <View className="mb-2 flex-row gap-2">
                  {selectedImages.map((imgUri, idx) => (
                    <View key={`thumb-${idx}`} className="relative">
                      <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewImage(imgUri)}>
                        <Image source={{ uri: imgUri }} style={{ width: 44, height: 44, borderRadius: 8 }} contentFit="cover" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRemoveImage(idx)}
                        className="absolute -top-1.5 -right-1.5 bg-semantic-error w-4 h-4 rounded-full items-center justify-center"
                      >
                        <Ionicons name="close" size={10} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              <RNTextInput
                ref={inputRef}
                placeholder={t('coach.askCoach', 'Ask your coach...')}
                placeholderTextColor={theme.textSecondary}
                value={inputText}
                onChangeText={(text) => {
                  if (text.endsWith('\n')) {
                    handleSend(text.trim());
                  } else {
                    setInputText(text);
                  }
                }}
                multiline={true}
                blurOnSubmit={false}
                returnKeyType="default"
                className="text-theme-text text-base font-jakarta"
                style={{
                  maxHeight: 110,
                  minHeight: 28,
                  paddingTop: Platform.OS === 'ios' ? 4 : 2,
                  paddingBottom: Platform.OS === 'ios' ? 4 : 2,
                  lineHeight: 22,
                }}
              />
            </View>

            {/* Right Action Button (Mic if empty, Send if populated) */}
            <View className="pb-1">
              {inputText.trim().length > 0 || selectedImages.length > 0 ? (
                <TouchableOpacity
                  onPress={() => handleSend()}
                  disabled={sending}
                  className="w-9 h-9 rounded-full bg-theme-accent-strong items-center justify-center active:opacity-80"
                >
                  <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleToggleVoiceInput}
                  className={`w-9 h-9 rounded-full border items-center justify-center active:opacity-70 ${
                    isRecording
                      ? 'bg-rose-500/20 border-rose-500'
                      : 'bg-theme-bg border border-theme-border'
                  }`}
                >
                  <Ionicons
                    name={isRecording ? 'mic' : 'mic-outline'}
                    size={17}
                    color={isRecording ? '#EF4444' : theme.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
