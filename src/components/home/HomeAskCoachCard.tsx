import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Card } from '../ui/Card';
import { useCoachChat } from '../../context/CoachChatStore';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useTheme } from '@/hooks/use-theme';
import { getCoachAvatarSource, getCoachDisplayName } from '../../utils/avatarUtils';

interface HomeAskCoachCardProps {
  draft: string;
  onChangeDraft: (text: string) => void;
  inputRef?: React.RefObject<TextInput | null>;
}

// Chat replies can carry markdown and plan JSON; the Home preview only wants the prose.
const toPreviewText = (content: string) =>
  content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_#>`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Ask the coach without leaving Home. The message goes through the same chat
 * pipeline as the Coach tab, so the reply lands in the chat, raises the unread
 * bubble and, when the app is in the background, arrives as a push notification.
 * The card also previews the reply in place once it is in.
 */
export function HomeAskCoachCard({ draft, onChangeDraft, inputRef }: HomeAskCoachCardProps) {
  const { t } = useLanguage();
  const theme = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const { messages, sending, sendMessage } = useCoachChat();
  const [sentText, setSentText] = useState<string | null>(null);

  const coachName = getCoachDisplayName(user);
  const avatarSource = getCoachAvatarSource(user?.coach_tone, undefined, user);

  // The reply is whatever the coach said after the message sent from here.
  const reply = useMemo(() => {
    if (!sentText) return null;
    let sentIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && messages[i].content === sentText) {
        sentIdx = i;
        break;
      }
    }
    if (sentIdx < 0) return null;
    const parts = messages
      .slice(sentIdx + 1)
      .filter((m) => m.role === 'coach' || m.role === 'assistant')
      .map((m) => toPreviewText(m.content || ''))
      .filter(Boolean);
    return parts.length > 0 ? parts.join('\n\n') : null;
  }, [messages, sentText]);

  // One-tap starters for the questions athletes ask most before a session.
  // They fill the field rather than sending, so the athlete can add detail.
  const quickQuestions = [
    { label: t('home.askChipTime'), text: t('home.askChipTimeText'), icon: 'time-outline' as const },
    { label: t('home.askChipSleep'), text: t('home.askChipSleepText'), icon: 'moon-outline' as const },
    { label: t('home.askChipSore'), text: t('home.askChipSoreText'), icon: 'body-outline' as const },
  ];
  const isWaiting = Boolean(sentText && !reply);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onChangeDraft('');
    // sendMessage asks for AI consent first when it hasn't been given, and
    // returns without sending; nothing is shown as "sent" in that case.
    if (user?.aiConsent === true) setSentText(text);
    sendMessage(text).catch(() => {});
  };

  const openChat = () => {
    Haptics.selectionAsync();
    router.push('/(tabs)/coach');
  };

  return (
    <Card>
      <View className="flex-row items-center gap-2.5 mb-2.5">
        <Image source={avatarSource} style={{ width: 28, height: 28, borderRadius: 14 }} resizeMode="cover" />
        <Text className="text-sm font-bold text-theme-text flex-1">{t('home.askTitle', { coach: coachName })}</Text>
      </View>

      <View className="flex-row items-end gap-2 bg-theme-inset rounded-inset pl-3 pr-1.5 py-1.5">
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={t('home.askPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={1000}
          className="flex-1 text-sm text-theme-text py-1.5"
          style={{ maxHeight: 96 }}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel={t('home.askSend')}
          className={`w-9 h-9 rounded-full items-center justify-center ${draft.trim() ? 'bg-theme-accent-strong' : 'bg-theme-border'}`}
        >
          <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {!draft && !isWaiting && (
        <View className="flex-row flex-wrap gap-2 mt-2.5">
          {quickQuestions.map((q) => (
            <TouchableOpacity
              key={q.label}
              onPress={() => {
                Haptics.selectionAsync();
                onChangeDraft(q.text);
                inputRef?.current?.focus();
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-full bg-theme-accent/10 border border-theme-accent/25"
            >
              <Ionicons name={q.icon} size={12} color={theme.tint} />
              <Text className="text-xs font-semibold text-theme-accent">{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isWaiting && (
        <View className="mt-3">
          <View className="flex-row items-center gap-2">
            {sending ? <ActivityIndicator size="small" color={theme.tint} /> : <Ionicons name="checkmark-circle" size={15} color="#22C55E" />}
            <Text className="text-xs font-semibold text-theme-text">
              {sending ? t('home.askTyping', { coach: coachName }) : t('home.askSent')}
            </Text>
          </View>
          <Text className="text-[11px] text-theme-muted mt-1">{t('home.askNotify', { coach: coachName })}</Text>
        </View>
      )}

      {reply && (
        <TouchableOpacity onPress={openChat} activeOpacity={0.8} accessibilityRole="button" className="mt-3 pt-3 border-t border-theme-border/60">
          <Text className="text-[11px] font-bold uppercase tracking-wider text-theme-muted mb-1">
            {t('home.askReplied', { coach: coachName })}
          </Text>
          <Text className="text-sm text-theme-text leading-snug" numberOfLines={5}>
            {reply}
          </Text>
          <View className="flex-row items-center gap-1 mt-2">
            <Text className="text-xs font-bold text-theme-accent">{t('home.askOpenChat')}</Text>
            <Ionicons name="chevron-forward" size={12} color={theme.tint} />
          </View>
        </TouchableOpacity>
      )}
    </Card>
  );
}
