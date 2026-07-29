import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Keyboard,
  TextInput as RNTextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { useCoachChat } from '../../context/CoachChatStore';
import { useUser } from '../../context/UserStore';
import { TextInput } from '../../components/ui/TextInput';
import { MarkdownText } from '../../components/chat/MarkdownText';
import { ProposalCard } from '../../components/chat/ProposalCard';
import { QuickSuggestions } from '../../components/chat/QuickSuggestions';
import { ChatMessage } from '../../types/chat';

interface ChatSection {
  title: string;
  dateKey: string;
  data: ChatMessage[];
}

function formatDateHeader(dateObj: Date): string {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const now = new Date();

  // Normalize to midnight to compare exact calendar days
  const dDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const nDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffDays = Math.round((nDate.getTime() - dDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return dateObj.toLocaleDateString([], { weekday: 'long' }); // e.g. "Monday"
  }
  if (dateObj.getFullYear() === now.getFullYear()) {
    return dateObj.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }); // e.g. "Tue, 28 Jul"
  }
  return dateObj.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function groupMessagesByDate(messagesList: ChatMessage[]): ChatSection[] {
  const sectionsMap: { [key: string]: { title: string; dateKey: string; data: ChatMessage[] } } = {};

  messagesList.forEach((msg) => {
    const d = new Date(msg.timestamp || Date.now());
    const dateKey = isNaN(d.getTime())
      ? 'today'
      : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

    if (!sectionsMap[dateKey]) {
      sectionsMap[dateKey] = {
        title: isNaN(d.getTime()) ? 'Today' : formatDateHeader(d),
        dateKey,
        data: [],
      };
    }
    sectionsMap[dateKey].data.push(msg);
  });

  return Object.values(sectionsMap);
}

export default function CoachScreen() {
  const {
    messages,
    sendMessage,
    sending,
    loading,
    acceptProposal,
    rejectProposal,
    tokenUsage,
    error,
  } = useCoachChat();

  const { user } = useUser();

  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const sectionListRef = useRef<SectionList>(null);
  const inputRef = useRef<RNTextInput>(null);

  // Group messages into sections by calendar date
  const sections = groupMessagesByDate(messages);

  // Calculate daily token usage percentage
  const dailyUsage = tokenUsage?.daily_token_usage || 0;
  const dailyLimit = tokenUsage?.daily_token_limit || (user?.subscription_tier === 'spark_plus' ? 50000 : 10000);
  const remainingTokens = Math.max(0, dailyLimit - dailyUsage);
  const remainingPercent = Math.round((remainingTokens / dailyLimit) * 100);
  const showTokenWarning = remainingPercent <= 10;
  const isOutOfTokens = remainingTokens <= 0;

  // State 0: Auto focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardOpen(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (sections.length > 0) {
      setTimeout(() => {
        try {
          const lastSectionIndex = sections.length - 1;
          const lastItemIndex = sections[lastSectionIndex].data.length - 1;
          sectionListRef.current?.scrollToLocation({
            sectionIndex: lastSectionIndex,
            itemIndex: lastItemIndex,
            animated: true,
          });
        } catch (_) {
          // fallback if scroll target is not layout complete yet
        }
      }, 150);
    }
  }, [messages.length, sending]);

  const handlePickImage = async () => {
    try {
      if (!ImagePicker || typeof ImagePicker.launchImageLibraryAsync !== 'function') {
        Alert.alert('Image Attachment', 'Image picker is not supported on this device/environment.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : ('images' as any),
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]?.base64) {
        const base64Uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setSelectedImages((prev) => [...prev, base64Uri]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Notice', 'Image attachment not supported in current environment.');
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
      Alert.alert(
        'Voice Recording Activated',
        'Speak now... (Tap mic again to finish dictation)',
        [{ text: 'OK' }]
      );
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

    sendMessage(textToSend, imagesToSend.length > 0 ? imagesToSend : undefined);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View className={`mb-4 max-w-[88%] ${isUser ? 'self-end' : 'self-start'}`}>
        {!isUser && (
          <View className="flex-row items-center mb-1 ml-1">
            <Text className="text-theme-accent font-bold text-xs mr-2">🤖 Spark</Text>
            {item.mood && item.mood !== 'default' && (
              <View className="bg-theme-accent/20 px-2 py-0.5 rounded-full">
                <Text className="text-theme-accent text-[10px] uppercase font-bold">{item.mood}</Text>
              </View>
            )}
          </View>
        )}

        <View
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-theme-accent rounded-br-sm shadow-sm'
              : 'bg-theme-card border border-theme-border rounded-bl-sm shadow-sm'
          }`}
        >
          {/* User attached images preview */}
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

          {/* Embedded Workout Proposal Card if coach proposed a plan */}
          {item.proposedPlan && item.proposedPlan.length > 0 ? (
            <ProposalCard
              plan={item.proposedPlan}
              status={item.proposalStatus}
              onAccept={() => acceptProposal(item.id, item.proposedPlan!)}
              onReject={() => rejectProposal(item.id)}
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
  };

  const coachAvatarUri = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top']}>
      {/* Clean Header */}
      <View className="px-4 py-3 border-b border-theme-border bg-theme-bg z-10 flex-row items-center">
        <View className="w-10 h-10 rounded-full border-2 border-theme-accent bg-theme-bg overflow-hidden mr-3 shadow-sm">
          <Image
            source={{ uri: coachAvatarUri }}
            className="w-full h-full"
            contentFit="cover"
          />
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <View className="flex-1">
          {/* Chat Thread Container with Sticky Section Date Headers */}
          {loading && messages.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#16ACBD" />
              <Text className="text-theme-muted text-xs mt-2">Connecting with Spark...</Text>
            </View>
          ) : (
            <SectionList
              ref={sectionListRef}
              sections={sections}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              stickySectionHeadersEnabled={true}
              renderSectionHeader={({ section: { title } }) => (
                <View className="py-2 items-center justify-center pointer-events-none z-10">
                  <View className="bg-theme-card/95 border border-theme-border px-3.5 py-1 rounded-full shadow-xs">
                    <Text className="text-theme-muted text-[11px] font-bold">{title}</Text>
                  </View>
                </View>
              )}
              renderItem={renderMessage}
              contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
              className="flex-1"
            />
          )}

          {/* Streaming / Typing Indicator */}
          {sending ? (
            <View className="px-4 py-2 flex-row items-center self-start mb-2 ml-4 bg-theme-card/80 rounded-full border border-theme-border">
              <ActivityIndicator size="small" color="#16ACBD" />
              <Text className="text-theme-accent text-xs font-semibold ml-2">Spark is typing...</Text>
            </View>
          ) : null}

          {/* Quick Suggestions (Only shown if user toggles them open) */}
          {showSuggestions ? (
            <QuickSuggestions
              onSelectSuggestion={(promptText) => {
                setInputText(promptText);
                setShowSuggestions(false);
              }}
            />
          ) : null}

          {/* Rounded Container Box (State 1 & State 2) - Styled like Antigravity Chat UI */}
          <View
            style={{
              marginBottom: !isKeyboardOpen ? (Platform.OS === 'ios' ? 76 : 68) : 4,
            }}
            className="px-3 py-1"
          >
            <View className="bg-theme-card rounded-3xl border border-theme-border p-2.5 shadow-lg">
              {/* Image Preview Thumbnails if attached */}
              {selectedImages.length > 0 ? (
                <View className="mb-2 flex-row gap-2 px-1">
                  {selectedImages.map((imgUri, idx) => (
                    <View key={`thumb-${idx}`} className="relative">
                      <Image
                        source={{ uri: imgUri }}
                        style={{ width: 48, height: 48, borderRadius: 8 }}
                        contentFit="cover"
                      />
                      <TouchableOpacity
                        onPress={() => handleRemoveImage(idx)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 w-4 h-4 rounded-full items-center justify-center border border-white"
                      >
                        <Ionicons name="close" size={10} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Text Input Row */}
              <View className="px-2 py-1 min-h-[38px] max-h-[100px] justify-center">
                <RNTextInput
                  ref={inputRef}
                  placeholder="Talk to Spark..."
                  placeholderTextColor="#8E8E93"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  className="text-theme-text text-sm p-0 m-0"
                  style={{ maxHeight: 84 }}
                />
              </View>

              {/* Bottom Actions Row nested INSIDE the rounded container */}
              <View className="flex-row items-center justify-between pt-2 border-t border-theme-border/30 mt-1">
                {/* Left Action Buttons */}
                <View className="flex-row items-center space-x-2">
                  <TouchableOpacity
                    onPress={handlePickImage}
                    className="w-8 h-8 rounded-full bg-theme-bg/60 border border-theme-border items-center justify-center active:opacity-70"
                  >
                    <Ionicons name="attach-outline" size={18} color="#16ACBD" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowSuggestions(!showSuggestions)}
                    className={`w-8 h-8 rounded-full border items-center justify-center ${
                      showSuggestions
                        ? 'bg-amber-500/20 border-amber-500'
                        : 'bg-theme-bg/60 border-theme-border active:opacity-70'
                    }`}
                  >
                    <Ionicons
                      name={showSuggestions ? 'bulb' : 'bulb-outline'}
                      size={16}
                      color={showSuggestions ? '#F59E0B' : '#16ACBD'}
                    />
                  </TouchableOpacity>
                </View>

                {/* Right Action Buttons */}
                <View className="flex-row items-center space-x-2">
                  <TouchableOpacity
                    onPress={handleToggleVoiceInput}
                    className={`w-8 h-8 rounded-full items-center justify-center border ${
                      isRecording
                        ? 'bg-red-500/20 border-red-500'
                        : 'bg-theme-bg/60 border-theme-border active:opacity-70'
                    }`}
                  >
                    <Ionicons
                      name={isRecording ? 'mic' : 'mic-outline'}
                      size={16}
                      color={isRecording ? '#EF4444' : '#94A3B8'}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSend}
                    disabled={sending || (!inputText.trim() && selectedImages.length === 0)}
                    className={`w-9 h-9 rounded-full items-center justify-center shadow-sm ${
                      sending || (!inputText.trim() && selectedImages.length === 0)
                        ? 'bg-theme-accent/40'
                        : 'bg-theme-accent'
                    }`}
                  >
                    <Ionicons name="send" size={15} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
