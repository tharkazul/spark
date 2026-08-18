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
import { QuickActionsRow } from '../../components/dashboard/QuickActionsRow';
import { AddWorkoutModal } from '../../components/dashboard/AddWorkoutModal';
import { LogWeightModal } from '../../components/dashboard/LogWeightModal';
import { LogNiggleModal } from '../../components/dashboard/LogNiggleModal';
import { BottomSheetModal } from '../../components/ui/BottomSheetModal';
import { MacroRingGauge } from '../../components/dashboard/MacroRingGauge';
import { ChatMessage } from '../../types/chat';
import { WorkoutItem } from '../../types/dashboard';
import { API_BASE_URL } from '../../constants/api';

// Date Helpers
function getSafeDate(dateVal?: string | number | null): Date {
  if (!dateVal) return new Date();
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? new Date() : d;
}

function getSafeDateStr(dateVal?: string | number | null): string {
  const d = getSafeDate(dateVal);
  try {
    return d.toISOString().split('T')[0];
  } catch (_) {
    return new Date().toISOString().split('T')[0];
  }
}

function formatDateLabel(dateStr?: string | number | null): string {
  const d = getSafeDate(dateStr);
  const now = new Date();
  
  const dYear = d.getFullYear();
  const dMonth = d.getMonth();
  const dDate = d.getDate();

  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDate = now.getDate();

  if (dYear === nowYear && dMonth === nowMonth && dDate === nowDate) {
    return 'Today';
  }

  const yesterday = new Date(now);
  yesterday.setDate(nowDate - 1);
  if (dYear === yesterday.getFullYear() && dMonth === yesterday.getMonth() && dDate === yesterday.getDate()) {
    return 'Yesterday';
  }

  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function groupMessagesByDate(messages: ChatMessage[]) {
  if (!messages || messages.length === 0) return [];

  const sorted = [...messages].sort((a, b) => {
    const timeA = getSafeDate(a.timestamp || (a as any).created_at).getTime();
    const timeB = getSafeDate(b.timestamp || (b as any).created_at).getTime();
    return timeA - timeB;
  });
  const grouped: { dateLabel: string; dateStr: string; messages: ChatMessage[] }[] = [];

  let currentDateStr = '';

  sorted.forEach((msg) => {
    const rawDate = msg.timestamp || (msg as any).created_at;
    const msgDateStr = getSafeDateStr(rawDate);
    if (msgDateStr !== currentDateStr) {
      currentDateStr = msgDateStr;
      grouped.push({
        dateLabel: formatDateLabel(rawDate),
        dateStr: msgDateStr,
        messages: [msg],
      });
    } else {
      grouped[grouped.length - 1].messages.push(msg);
    }
  });

  return grouped;
}

const MessageRow = React.memo(
  ({
    item,
    isFirstInRun,
    isLastInRun,
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
    coachTone?: string;
    onAccept: (id: string | number, plan: any) => void;
    onReject: (id: string | number) => void;
    onAcceptInvite: (id: string | number) => Promise<void>;
    onDeclineInvite: (id: string | number) => Promise<void>;
    onExpandImage: (source: { uri: string }) => void;
  }) => {
    const isUser = item.role === 'user' || (item as any).sender === 'user';
    const isSystem = (item as any).role === 'system' || (item as any).sender === 'system';
    const contentText = item.content || (item as any).text || '';
    const safeDate = getSafeDate(item.timestamp || (item as any).created_at);

    const getFullImageUrl = (path?: string) => {
      if (!path) return null;
      if (path.startsWith('http') || path.startsWith('data:')) return path;
      return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    };

    if (isSystem) {
      return (
        <View className="py-2 items-center justify-center my-1">
          <View className="bg-theme-card border border-theme-border px-3 py-1.5 rounded-full">
            <Text className="text-[11px] font-semibold text-theme-muted">{contentText}</Text>
          </View>
        </View>
      );
    }

    const hasContent = hasRenderableText(contentText);
    const hasImages = item.images && item.images.length > 0;

    const showAvatar = !isUser && isLastInRun;
    const avatarSource = { uri: `${API_BASE_URL}/avatars/coach-${coachTone || 'default'}.png` };

    return (
      <View
        className={`flex-row my-0.5 px-3 ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        {!isUser && (
          <View className="w-8 mr-2 justify-end pb-0.5">
            {showAvatar ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => onExpandImage(avatarSource)}>
                <RNImage source={avatarSource} className="w-7 h-7 rounded-full border border-theme-accent/40" resizeMode="cover" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View className={`max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
          {item.proposedPlan && item.proposedPlan.length > 0 ? (
            <ProposalCard
              plan={item.proposedPlan}
              status={item.proposalStatus || ((item as any).isAccepted ? 'accepted' : (item as any).isRejected ? 'rejected' : 'pending')}
              onAccept={() => onAccept(item.id, item.proposedPlan!)}
              onReject={() => onReject(item.id)}
            />
          ) : (item.payload_json as any)?.type === 'event_invite' ? (
            <EventInviteCard
              payload={item.payload_json as any}
              onAccept={onAcceptInvite}
              onDecline={onDeclineInvite}
            />
          ) : (item.payload_json as any)?.type === 'social_mention' ? (
            <SocialMentionCard
              payload={item.payload_json as any}
            />
          ) : (item.payload_json as any)?.type === 'connection_request' || (item.payload_json as any)?.type === 'connection_accepted' ? (
            <ConnectionRequestCard
              payload={item.payload_json as any}
            />
          ) : null}

          {(hasContent || hasImages) && (
            <View
              className={`px-4 py-2.5 rounded-2xl ${
                isUser
                  ? 'bg-theme-accent rounded-br-xs'
                  : 'bg-theme-card border border-theme-border rounded-bl-xs shadow-xs'
              }`}
            >
              {hasImages && (
                <View className="flex-row flex-wrap gap-1.5 mb-2">
                  {item.images!.map((imgPath, imgIdx) => {
                    const fullUrl = getFullImageUrl(imgPath);
                    if (!fullUrl) return null;
                    return (
                      <TouchableOpacity
                        key={`msg-img-${item.id}-${imgIdx}`}
                        activeOpacity={0.85}
                        onPress={() => onExpandImage({ uri: fullUrl })}
                      >
                        <Image
                          source={{ uri: fullUrl }}
                          style={{ width: 140, height: 140, borderRadius: 12 }}
                          contentFit="cover"
                          transition={200}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {hasContent && (
                <MarkdownText
                  content={contentText}
                  isUser={isUser}
                />
              )}
            </View>
          )}

          {isLastInRun && (
            <Text className="text-[10px] text-theme-muted font-bold px-1.5 mt-0.5">
              {safeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
      </View>
    );
  }
);

export default function CoachScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { messages, sendMessage, sending, loading, acceptProposal, rejectProposal, acceptInvite, declineInvite, tokenUsage, error, markAsRead } = useCoachChat();
  const { user } = useUser();
  const { plan } = usePlan();
  const { nutrition, clearLoggedNutrition } = usePhysique();
  const { quests, generateQuest: generateNewQuest, swapQuest: swapActiveQuest } = useGamification();

  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ uri: string } | null>(null);

  const [isWorkoutModalOpen, setIsWorkoutModalOpen] = useState(false);
  const [isNutritionModalOpen, setIsNutritionModalOpen] = useState(false);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [questLoading, setQuestLoading] = useState(false);

  // Quick Action Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isNiggleModalOpen, setIsNiggleModalOpen] = useState(false);
  const [recordedWeight, setRecordedWeight] = useState<number>(user?.athlete_metrics?.weight_kg || 0);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<RNTextInput>(null);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [floatingDate, setFloatingDate] = useState<string>('');
  const [showScrollDownBtn, setShowScrollDownBtn] = useState(false);

  const isPinnedToBottom = useRef(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hideDateTimer = useRef<any>(null);

  const { tabBarOccupied } = usePhysique() as any || { tabBarOccupied: 100 };

  useEffect(() => {
    const showSub = KeyboardEvents.addListener('keyboardWillShow', () => setIsKeyboardVisible(true));
    const hideSub = KeyboardEvents.addListener('keyboardWillHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const avatarSource = { uri: `${API_BASE_URL}/avatars/coach-${user?.coach_tone || 'default'}.png` };

  const grouped = useMemo(() => groupMessagesByDate(messages), [messages]);

  const flatItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'message' | 'date' | 'typing';
      title?: string;
      data?: any;
      isFirstInRun?: boolean;
      isLastInRun?: boolean;
      dateStr?: string;
    }> = [];

    if (sending) {
      items.push({ id: 'typing-indicator', type: 'typing' });
    }

    const reversedGroups = [...grouped].reverse();

    reversedGroups.forEach((group) => {
      const reversedMsgs = [...group.messages].reverse();
      reversedMsgs.forEach((msg, idx) => {
        const msgRole = msg.role || (msg as any).sender;
        const nextRole = reversedMsgs[idx + 1] ? (reversedMsgs[idx + 1].role || (reversedMsgs[idx + 1] as any).sender) : undefined;
        const prevRole = reversedMsgs[idx - 1] ? (reversedMsgs[idx - 1].role || (reversedMsgs[idx - 1] as any).sender) : undefined;
        const isFirstInRun = idx === reversedMsgs.length - 1 || nextRole !== msgRole;
        const isLastInRun = idx === 0 || prevRole !== msgRole;

        items.push({
          id: `msg-${msg.id}`,
          type: 'message',
          data: msg,
          isFirstInRun,
          isLastInRun,
          dateStr: group.dateLabel,
        });
      });

      items.push({
        id: `date-${group.dateStr}`,
        type: 'date',
        title: group.dateLabel,
      });
    });

    return items;
  }, [grouped, sending]);

  const scrollToBottom = useCallback((animated = true) => {
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      isPinnedToBottom.current = true;
      setShowScrollDownBtn(false);
      scrollToBottom(false);
      markAsRead();
    }, [scrollToBottom, markAsRead])
  );

  useEffect(() => {
    if (sending && isPinnedToBottom.current) {
      scrollToBottom(true);
    }
  }, [sending, scrollToBottom]);

  const prevFlatLength = useRef(flatItems.length);
  useEffect(() => {
    if (flatItems.length > prevFlatLength.current && isPinnedToBottom.current) {
      scrollToBottom(true);
    }
    prevFlatLength.current = flatItems.length;
  }, [flatItems, scrollToBottom]);

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    if (offsetY > 150) {
      if (isPinnedToBottom.current) {
        isPinnedToBottom.current = false;
        setShowScrollDownBtn(true);
      }
    } else {
      if (!isPinnedToBottom.current) {
        isPinnedToBottom.current = true;
        setShowScrollDownBtn(false);
      }
    }
  };

  const handleScrollBeginDrag = () => {
    if (isKeyboardVisible) {
      Keyboard.dismiss();
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems && viewableItems.length > 0) {
      const topVisible = viewableItems.find(
        (v) => v.item && (v.item.type === 'message' || v.item.type === 'date') && (v.item.dateStr || v.item.title)
      );

      if (topVisible) {
        const label = topVisible.item.dateStr || topVisible.item.title;
        if (label) {
          setFloatingDate(label);
          fadeAnim.setValue(1);

          if (hideDateTimer.current) clearTimeout(hideDateTimer.current);
          hideDateTimer.current = setTimeout(() => {
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }).start(() => setFloatingDate(''));
          }, 1500);
        }
      }
    }
  });

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 40,
  });

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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const imgs = [...selectedImages];
    setInputText('');
    setSelectedImages([]);
    setShowSuggestions(false);

    isPinnedToBottom.current = true;
    setShowScrollDownBtn(false);
    scrollToBottom(true);

    sendMessage(textToSend, imgs);
  };

  const keyExtractor = useCallback((item: any) => item.id, []);

  const handleAcceptProposal = useCallback((id: string | number, planData: any) => {
    acceptProposal(id, planData);
  }, [acceptProposal]);

  const handleRejectProposal = useCallback((id: string | number) => {
    rejectProposal(id);
  }, [rejectProposal]);

  const handleAcceptInvite = useCallback(async (id: string | number) => {
    await acceptInvite(String(id));
  }, [acceptInvite]);

  const handleDeclineInvite = useCallback(async (id: string | number) => {
    await declineInvite(String(id));
  }, [declineInvite]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (item.type === 'typing') {
      return (
        <View className="flex-row items-center my-1.5 px-3">
          <View className="w-8 mr-2 justify-end pb-0.5">
            <RNImage
              source={avatarSource}
              className="w-7 h-7 rounded-full border border-theme-accent/40"
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
        <View className="items-center my-3">
          <View className="bg-theme-card/80 border border-theme-border/60 px-3 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-theme-muted">{item.title}</Text>
          </View>
        </View>
      );
    }

    return (
      <MessageRow
        item={item.data}
        isFirstInRun={item.isFirstInRun}
        isLastInRun={item.isLastInRun}
        coachTone={user?.coach_tone}
        onAccept={handleAcceptProposal}
        onReject={handleRejectProposal}
        onAcceptInvite={handleAcceptInvite}
        onDeclineInvite={handleDeclineInvite}
        onExpandImage={(source) => setPreviewImage(source)}
      />
    );
  }, [user?.coach_tone, avatarSource, handleAcceptProposal, handleRejectProposal, handleAcceptInvite, handleDeclineInvite]);

  const todayWorkouts = useMemo(() => {
    if (!plan || !Array.isArray(plan)) return [];
    const todayStr = new Date().toISOString().split('T')[0];
    return plan.filter((w) => w.date === todayStr || w.day === 'TODAY');
  }, [plan]);

  const primaryWorkout = todayWorkouts[0] || null;
  const totalTodayRooka = todayWorkouts.reduce((acc, w) => acc + (w.target_rooka || (w as any).target_spark || (w as any).sparkPoints || 0), 0);

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

  const handleSaveWorkoutInCoach = (workoutData: Omit<WorkoutItem, 'id'>) => {
    sendMessage(`Logged a ${workoutData.type} session: "${workoutData.title}" (${workoutData.duration}).`);
  };

  const handleSaveWeightInCoach = (newWeight: number) => {
    setRecordedWeight(newWeight);
    sendMessage(`Logged current body weight: ${newWeight} kg.`);
  };

  const handleSendInjuryInCoach = (description: string, severity: number) => {
    sendMessage(`Logged injury details: ${description} (Severity ${severity}/10). Please adapt my training load accordingly.`);
  };

  const now = new Date();
  const dateBadgeStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
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
          className="flex-1 bg-black/90 items-center justify-center p-4"
        >
          {previewImage && (
            <Image
              source={previewImage}
              style={{ width: '100%', height: '80%' }}
              contentFit="contain"
            />
          )}
          <TouchableOpacity
            onPress={() => setPreviewImage(null)}
            className="absolute top-12 right-6 bg-white/20 p-2 rounded-full"
          >
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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

        {/* Header Right: Date Pill */}
        <View className="bg-theme-card px-3 py-1.5 rounded-full border border-theme-border flex-row items-center gap-1.5">
          <Ionicons name="calendar-outline" size={12} color="#FF5F3B" />
          <Text className="text-xs font-bold text-theme-text">{dateBadgeStr}</Text>
        </View>
      </View>

      {/* Telemetry Micro-Pill Strip */}
      <View className="px-4 pb-2.5 pt-0.5 bg-theme-bg flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setIsWorkoutModalOpen(true);
          }}
          activeOpacity={0.75}
          className="flex-1 bg-theme-card border border-theme-border px-2 py-2 rounded-xl flex-row items-center justify-center gap-1.5 shadow-xs"
        >
          <Ionicons name={getSportIconConfig(primaryWorkout?.sport).icon as any} size={14} color={getSportIconConfig(primaryWorkout?.sport).color} />
          <Text className="text-xs font-extrabold text-theme-text" numberOfLines={1}>
            {primaryWorkout?.sport || 'Workout'}
          </Text>
        </TouchableOpacity>

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
        </TouchableOpacity>
      </View>

      {/* ATHLETE QUICK ACTION CARDS (Prominent in Chat) */}
      <View className="px-4 pb-2">
        <QuickActionsRow
          onAddActivity={() => setIsAddModalOpen(true)}
          onLogWeight={() => setIsWeightModalOpen(true)}
          onReportInjury={() => setIsNiggleModalOpen(true)}
        />
      </View>

      {/* CHAT MESSAGES STREAM */}
      <View className="flex-1 relative">
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
            contentContainerStyle={{ paddingVertical: 12 }}
            className="flex-1"
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={viewabilityConfig.current}
          />
        )}

        {showScrollDownBtn ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              Haptics.selectionAsync();
              scrollToBottom(true);
            }}
            className="absolute bottom-3 right-4 z-40 bg-theme-accent w-10 h-10 rounded-full shadow-lg items-center justify-center"
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
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewImage({ uri: imgUri })}>
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

      <AddWorkoutModal
        visible={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveWorkoutInCoach}
      />
      <LogWeightModal
        visible={isWeightModalOpen}
        previousWeight={recordedWeight}
        onClose={() => setIsWeightModalOpen(false)}
        onSaveWeight={handleSaveWeightInCoach}
      />
      <LogNiggleModal
        visible={isNiggleModalOpen}
        onClose={() => setIsNiggleModalOpen(false)}
        onSendToCoach={handleSendInjuryInCoach}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
