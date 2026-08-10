import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Dimensions,
  Animated,
  Platform,
  KeyboardAvoidingView,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCoachAvatarSource } from '../../utils/avatarUtils';
import { userApi, integrationsApi } from '../../services/apiServices';
import { useUser } from '../../context/UserStore';
import { useLanguage } from '../../context/LanguageContext';
import { MarkdownText } from '../chat/MarkdownText';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { useKeyboardMotionContext } from '../../context/KeyboardMotionContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DURATION_OPTIONS = [
  { label: '0m', value: 0 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '60m', value: 60 },
  { label: '90m', value: 90 },
  { label: '120m+', value: 120 },
];

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

export type ChatItemType =
  | 'welcome_hero'
  | 'coach_text'
  | 'coach_typing'
  | 'user_text'
  | 'card_language'
  | 'card_persona'
  | 'card_context_event'
  | 'card_schedule'
  | 'card_integrations'
  | 'card_paywall';

export interface ChatNode {
  id: string;
  type: ChatItemType;
  text?: string;
  subtext?: string;
  data?: any;
}

function TypingDots() {
  const dots = useRef([
    new Animated.Value(0.25),
    new Animated.Value(0.25),
    new Animated.Value(0.25),
  ]).current;

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.25,
            duration: 320,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((dots.length - 1 - i) * 160),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View className="flex-row items-center" style={{ gap: 5, height: 26 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: '#9CA3AF',
            opacity: dot,
          }}
        />
      ))}
    </View>
  );
}

export default function OnboardingWizard() {
  const router = useRouter();
  const { user, refreshUser, updateUser } = useUser();
  const { t, language, setLanguage } = useLanguage();

  // Onboarding Step Flow (0 = Welcome Hero, 1 = Language, 2 = Persona, 3 = Context/Event, 4 = Schedule, 5 = Integrations, 6 = Paywall)
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 6;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { height: keyboardHeight } = useKeyboardMotionContext();

  const keyboardStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, keyboardHeight.value - (Platform.OS === 'ios' ? 34 : 0))
  }));

  // Chat Feed timeline nodes
  const [timeline, setTimeline] = useState<ChatNode[]>([
    { id: 'node_welcome', type: 'welcome_hero' },
  ]);

  const chatScrollViewRef = useRef<ScrollView>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      chatScrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  // Welcome Message Typewriter Effect
  const WELCOME_MESSAGE =
    "Hi! Welcome to Spark. 👋 I'm your AI endurance coach. I'm here to build your personalized training experience around your life, your goals, and your schedule. Let's build something awesome together!";
  const [typedText, setTypedText] = useState('');

  useEffect(() => {
    if (currentStep === 0) {
      setTypedText('');
      const words = WELCOME_MESSAGE.split(' ');
      let wordIndex = 0;

      const timer = setInterval(() => {
        if (wordIndex < words.length) {
          wordIndex++;
          setTypedText(words.slice(0, wordIndex).join(' '));
        } else {
          clearInterval(timer);
        }
      }, 100);

      return () => clearInterval(timer);
    }
  }, [currentStep]);

  // Form State
  const [coachTone, setCoachTone] = useState(
    user?.coach_tone || 'Empathetic but demanding elite endurance coach.'
  );
  const [athleteContext, setAthleteContext] = useState(user?.athlete_context || '');
  const [coachReaction, setCoachReaction] = useState<string | null>(null);
  const contextDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [metrics, setMetrics] = useState<{ label: string; value: string }[]>([
    { label: 'FTP (Watts)', value: user?.athlete_metrics?.ftp?.toString() || '' },
    { label: 'Max HR', value: user?.athlete_metrics?.max_hr?.toString() || '' },
    { label: 'Resting HR', value: user?.athlete_metrics?.resting_hr?.toString() || '' },
  ]);

  const [availability, setAvailability] = useState<{ [day: string]: { available: boolean; maxMinutes: number } }>({
    Mon: { available: true, maxMinutes: 60 },
    Tue: { available: true, maxMinutes: 60 },
    Wed: { available: true, maxMinutes: 60 },
    Thu: { available: true, maxMinutes: 60 },
    Fri: { available: true, maxMinutes: 60 },
    Sat: { available: true, maxMinutes: 60 },
    Sun: { available: true, maxMinutes: 60 },
  });

  const isPastDateString = (dateStr?: string) => {
    if (!dateStr) return false;
    const parts = dateStr.split('-').map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return false;
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dateObj < today;
  };

  const [garminEmail, setGarminEmail] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [showGarmin, setShowGarmin] = useState(false);
  const [raceName, setRaceName] = useState(user?.target_event || '');
  const [raceDate, setRaceDate] = useState(() => {
    const existing = user?.event_date || '';
    return isPastDateString(existing) ? '' : existing;
  });
  const [targetCtl, setTargetCtl] = useState(user?.target_ctl?.toString() || '75');
  const [isEstimatingCtl, setIsEstimatingCtl] = useState(false);
  const [isAiFilled, setIsAiFilled] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');

  // Date Picker Modal State
  const [showDatePicker, setShowDatePicker] = useState(false);
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentYearNum = new Date().getFullYear();
  const startYear = Math.max(2026, currentYearNum);
  const YEARS = Array.from({ length: 6 }, (_, i) => (startYear + i).toString());

  const [pickerMonth, setPickerMonth] = useState(() => {
    if (raceDate) {
      const parts = raceDate.split('-');
      if (parts.length === 3) {
        const mIdx = parseInt(parts[1], 10) - 1;
        if (mIdx >= 0 && mIdx < 12) return MONTHS[mIdx];
      }
    }
    return MONTHS[new Date().getMonth()];
  });

  const [pickerDay, setPickerDay] = useState(() => {
    if (raceDate) {
      const parts = raceDate.split('-');
      if (parts.length === 3) return parseInt(parts[2], 10).toString();
    }
    return new Date().getDate().toString();
  });

  const [pickerYear, setPickerYear] = useState(() => {
    if (raceDate) {
      const parts = raceDate.split('-');
      if (parts.length === 3) {
        const yr = parseInt(parts[0], 10);
        if (yr >= startYear) return yr.toString();
      }
    }
    return startYear.toString();
  });

  const getDaysInMonth = (monthName: string, yearStr: string) => {
    const monthIndex = MONTHS.indexOf(monthName);
    const year = parseInt(yearStr, 10);
    if (monthIndex === -1 || isNaN(year)) return 31;
    return new Date(year, monthIndex + 1, 0).getDate();
  };

  const currentDaysInMonth = getDaysInMonth(pickerMonth, pickerYear);
  const PICKER_DAYS = Array.from({ length: currentDaysInMonth }, (_, i) => (i + 1).toString());

  const isSelectedDateInPast = () => {
    const monthIndex = MONTHS.indexOf(pickerMonth);
    const day = parseInt(pickerDay, 10);
    const year = parseInt(pickerYear, 10);
    if (monthIndex === -1 || isNaN(day) || isNaN(year)) return false;
    const selectedDate = new Date(year, monthIndex, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDate < today;
  };

  const handleSetPickerMonth = (m: string) => {
    setPickerMonth(m);
    const maxDays = getDaysInMonth(m, pickerYear);
    if (parseInt(pickerDay, 10) > maxDays) {
      setPickerDay(maxDays.toString());
    }
  };

  const handleSetPickerYear = (y: string) => {
    setPickerYear(y);
    const maxDays = getDaysInMonth(pickerMonth, y);
    if (parseInt(pickerDay, 10) > maxDays) {
      setPickerDay(maxDays.toString());
    }
  };

  const handleConfirmDate = () => {
    if (isSelectedDateInPast()) return;
    const monthIndex = (MONTHS.indexOf(pickerMonth) + 1).toString().padStart(2, '0');
    const dayStr = pickerDay.padStart(2, '0');
    const formatted = `${pickerYear}-${monthIndex}-${dayStr}`;
    setRaceDate(formatted);
    setShowDatePicker(false);
  };

  const openDatePickerModal = () => {
    let initialDate = new Date();
    if (raceDate) {
      const parts = raceDate.split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
        if (!isNaN(parsed.getTime())) initialDate = parsed;
      }
    }
    const initialYr = Math.max(startYear, initialDate.getFullYear()).toString();
    setPickerYear(initialYr);
    setPickerMonth(MONTHS[initialDate.getMonth()]);
    const maxDays = getDaysInMonth(MONTHS[initialDate.getMonth()], initialYr);
    const safeDay = Math.min(initialDate.getDate(), maxDays).toString();
    setPickerDay(safeDay);
    setShowDatePicker(true);
  };

  const ctlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRaceNameChange = (text: string) => {
    setRaceName(text);
    if (!text.trim()) {
      setIsEstimatingCtl(false);
      return;
    }
    setIsEstimatingCtl(true);
    if (ctlDebounceRef.current) clearTimeout(ctlDebounceRef.current);
    ctlDebounceRef.current = setTimeout(() => {
      const lower = text.toLowerCase();
      let estimated = 75;
      if (lower.includes('140.6') || lower.includes('ironman 140') || (lower.includes('ironman') && !lower.includes('70.3'))) {
        estimated = 105;
      } else if (lower.includes('70.3') || lower.includes('half ironman')) {
        estimated = 80;
      } else if (lower.includes('100k') || lower.includes('100m') || lower.includes('ultra')) {
        estimated = 100;
      } else if (lower.includes('marathon') || lower.includes('42k') || lower.includes('42.2')) {
        estimated = 70;
      } else if (lower.includes('half marathon') || lower.includes('21k') || lower.includes('21.1')) {
        estimated = 55;
      } else if (lower.includes('10k')) {
        estimated = 45;
      } else if (lower.includes('5k')) {
        estimated = 35;
      }
      setTargetCtl(estimated.toString());
      setIsEstimatingCtl(false);
      setIsAiFilled(true);
    }, 700);
  };

  const handleAthleteContextChange = (text: string) => {
    setAthleteContext(text);
    if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current);
    if (!text.trim() || text.trim().length < 6) {
      setCoachReaction(null);
      return;
    }
    contextDebounceRef.current = setTimeout(() => {
      const lower = text.toLowerCase();
      let reaction = "Got it! I've noted down your background so I can personalize your training plan and post-workout feedback.";
      if (lower.includes('marathon') || lower.includes('42k') || lower.includes('21k') || lower.includes('half')) {
        reaction = "Exciting distance goal! We'll build progressive long runs and periodized fueling to get you race-ready.";
      } else if (lower.includes('ironman') || lower.includes('70.3') || lower.includes('triathlon')) {
        reaction = "Triathlon target locked! We'll balance swim, bike, and run volume so you stay strong and avoid overtraining.";
      } else if (lower.includes('parent') || lower.includes('kid') || lower.includes('family') || lower.includes('busy') || lower.includes('work')) {
        reaction = "Balancing family, work, and training is super inspiring! I'll keep your schedule flexible so workouts fit seamlessly into your life. ⚡️";
      } else if (lower.includes('morning') || lower.includes('early')) {
        reaction = "Early morning sessions are great for consistency! I'll schedule key opener workouts right when you feel most energized.";
      } else if (lower.includes('beginner') || lower.includes('start') || lower.includes('new')) {
        reaction = "Welcome to endurance training! We'll focus on building a sustainable base safely step by step.";
      } else if (lower.includes('bike') || lower.includes('cycle') || lower.includes('cycling') || lower.includes('gran fondo')) {
        reaction = "Awesome cycling focus! We'll target solid aerobic power and cadence work to boost your endurance on two wheels.";
      }
      setCoachReaction(reaction);
    }, 600);
  };

  const addMetricRow = () => {
    setMetrics([...metrics, { label: '', value: '' }]);
  };

  const handleDayDurationChange = (day: string, duration: number) => {
    setAvailability((prev) => ({
      ...prev,
      [day]: {
        available: duration > 0,
        maxMinutes: duration,
      },
    }));
  };

  const [isStreamingMessage, setIsStreamingMessage] = useState(false);

  const TYPING_NODE_ID = 'coach_typing_indicator';

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => () => {
    timeoutsRef.current.forEach(clearTimeout);
    intervalsRef.current.forEach(clearInterval);
  }, []);

  const streamCoachMessage = (
    message: string,
    opts: { thinkingMs?: number; wordMs?: number; onDone?: () => void } = {}
  ) => {
    const { thinkingMs = 750, wordMs = 55, onDone } = opts;

    setTimeline((prev) => [...prev, { id: TYPING_NODE_ID, type: 'coach_typing' }]);
    scrollToBottom();

    const t = setTimeout(() => {
      const coachNodeId = `coach_stream_${Date.now()}`;

      setTimeline((prev) => [
        ...prev.filter((n) => n.id !== TYPING_NODE_ID),
        { id: coachNodeId, type: 'coach_text', text: '' },
      ]);
      scrollToBottom();

      const words = message.split(' ');
      let i = 0;

      const timer = setInterval(() => {
        if (i < words.length) {
          i++;
          const slice = words.slice(0, i).join(' ');
          setTimeline((prev) =>
            prev.map((n) => (n.id === coachNodeId ? { ...n, text: slice } : n))
          );
          scrollToBottom();
        } else {
          clearInterval(timer);
          onDone?.();
        }
      }, wordMs);

      intervalsRef.current.push(timer);
    }, thinkingMs);

    timeoutsRef.current.push(t);
  };

  const appendCoachPromptAndCard = (
    userText: string | null,
    coachMessage: string,
    cardType: ChatItemType,
    dataToMarkPrevious?: { type: ChatItemType; key: string; val: any }
  ) => {
    setIsStreamingMessage(true);

    setTimeline((prev) => {
      let updated = [...prev];
      if (dataToMarkPrevious) {
        updated = updated.map((item) =>
          item.type === dataToMarkPrevious.type
            ? { ...item, data: { ...item.data, [dataToMarkPrevious.key]: dataToMarkPrevious.val } }
            : item
        );
      }
      if (userText) {
        updated.push({ id: `user_${Date.now()}`, type: 'user_text', text: userText });
      }
      return updated;
    });
    scrollToBottom();

    streamCoachMessage(coachMessage, {
      onDone: () => {
        const t = setTimeout(() => {
          setTimeline((prev) => [
            ...prev,
            { id: `card_${cardType}_${Date.now()}`, type: cardType },
          ]);
          scrollToBottom();
          setIsStreamingMessage(false);
        }, 300);
        timeoutsRef.current.push(t);
      },
    });
  };

  const appendCoachAckOnly = (userText: string, coachAck: string) => {
    setIsStreamingMessage(true);
    setTimeline((prev) => [
      ...prev,
      { id: `user_${Date.now()}`, type: 'user_text', text: userText },
    ]);
    scrollToBottom();
    streamCoachMessage(coachAck, { thinkingMs: 550, onDone: () => setIsStreamingMessage(false) });
  };

  // Step Action Handlers for Chat Flow
  const startChatOnboarding = () => {
    setCurrentStep(1);
    setTimeline([
      {
        id: 'node_welcome_banner',
        type: 'coach_text',
        text: WELCOME_MESSAGE,
      },
    ]);
    scrollToBottom();

    appendCoachPromptAndCard(null, 'Please select your preferred language:', 'card_language');
  };

  const handleSelectLanguageChoice = (langCode: string, langName: string) => {
    if (isStreamingMessage) return;
    setLanguage(langCode as any);

    if (currentStep === 1) {
      setCurrentStep(2);
      appendCoachPromptAndCard(
        `Language: ${langName}`,
        `Thank you! I will communicate with you in ${langName}. 👋 First, how would you like me to talk to you during workouts and chat?`,
        'card_persona',
        { type: 'card_language', key: 'selected', val: langCode }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_language' ? { ...item, data: { selected: langCode } } : item))
      );
      appendCoachAckOnly(
        `Updated Language: ${langName}`,
        `Got it! Updated your preferred language to ${langName}. 👋`
      );
    }
  };

  const handleSelectPersonaChoice = (toneString: string, toneTitle: string) => {
    if (isStreamingMessage) return;
    setCoachTone(toneString);

    if (currentStep === 2) {
      setCurrentStep(3);
      appendCoachPromptAndCard(
        `Coach Tone: ${toneTitle}`,
        `Awesome choice! ⚡️ Now, tell me a bit about yourself, your fitness base, or any main event on your calendar.`,
        'card_context_event',
        { type: 'card_persona', key: 'selected', val: toneTitle }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_persona' ? { ...item, data: { selected: toneTitle } } : item))
      );
      appendCoachAckOnly(
        `Updated Coach Tone: ${toneTitle}`,
        `Got it! Updated your coach tone preference to ${toneTitle}. ⚡️`
      );
    }
  };

  const handleConfirmContextAndEvent = () => {
    if (isStreamingMessage) return;

    if (currentStep === 3) {
      setCurrentStep(4);
      const feedback = coachReaction || "Got it! I've saved your background and event details.";
      appendCoachPromptAndCard(
        raceName ? `Event: ${raceName} (${raceDate || 'TBD'})` : 'Background details updated.',
        `${feedback} Next, let's set your weekly training schedule availability!`,
        'card_schedule',
        { type: 'card_context_event', key: 'completed', val: true }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_context_event' ? { ...item, data: { completed: true } } : item))
      );
      appendCoachAckOnly(
        raceName ? `Updated Event: ${raceName} (${raceDate || 'TBD'})` : 'Updated background details.',
        'Got it! Saved your updated background and target event. ⚡️'
      );
    }
  };

  const handleConfirmScheduleChoice = () => {
    if (isStreamingMessage) return;

    if (currentStep === 4) {
      setCurrentStep(5);
      appendCoachPromptAndCard(
        'Weekly availability schedule locked in.',
        'Perfect! Would you like to connect Garmin or Strava to auto-sync your completed workouts and HRV data?',
        'card_integrations',
        { type: 'card_schedule', key: 'completed', val: true }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_schedule' ? { ...item, data: { completed: true } } : item))
      );
      appendCoachAckOnly(
        'Updated weekly training schedule.',
        'Got it! Updated your weekly availability schedule. ⚡️'
      );
    }
  };

  const handleConfirmIntegrationsChoice = () => {
    if (isStreamingMessage) return;

    if (currentStep === 5) {
      setCurrentStep(6);
      appendCoachPromptAndCard(
        showGarmin ? 'Garmin connected.' : 'Integrations updated.',
        "We're all set! ⚡️ I'm ready to craft your custom endurance plan. Select a tier to launch your training experience!",
        'card_paywall',
        { type: 'card_integrations', key: 'completed', val: true }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_integrations' ? { ...item, data: { completed: true } } : item))
      );
      appendCoachAckOnly(
        showGarmin ? 'Garmin connected.' : 'Updated integrations.',
        'Got it! Updated your device integrations. ⚡️'
      );
    }
  };

  const handleCompleteSetup = async (isTrial: boolean) => {
    setIsSubmitting(true);
    try {
      const formattedMetricsContext = metrics
        .filter((m) => m.label.trim() && m.value.trim())
        .map((m) => `${m.label}: ${m.value}`)
        .join(', ');

      let cleanContext = athleteContext.trim();
      if (cleanContext.startsWith('Endurance athlete.')) {
        cleanContext = cleanContext.replace(/^Endurance athlete\.\s*/, '');
      }
      if (cleanContext.includes('[Metrics:')) {
        cleanContext = cleanContext.replace(/\s*\[Metrics:.*?\]/, '');
        cleanContext = cleanContext.trim();
      }
      if (cleanContext === 'Endurance athlete.') {
        cleanContext = '';
      }

      const fullContext = cleanContext
        ? `${cleanContext}${formattedMetricsContext ? `\n[Metrics: ${formattedMetricsContext}]` : ''}`
        : formattedMetricsContext
        ? `Endurance athlete. [Metrics: ${formattedMetricsContext}]`
        : 'Endurance athlete.';

      await updateUser({
        coach_tone: coachTone,
        athlete_context: fullContext,
        target_event: raceName || undefined,
        event_date: raceDate || undefined,
        target_ctl: targetCtl ? parseFloat(targetCtl) : undefined,
        onboarding_completed: true,
      } as any);

      if (showGarmin && garminEmail && garminPassword) {
        try {
          await integrationsApi.saveGarminCredentials({
            garminUsername: garminEmail,
            garminPassword,
          });
        } catch (_) {}
      }

      await refreshUser();
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save setup. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top', 'bottom']}>
      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="slide">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
          className="flex-1 justify-end bg-black/60"
        >
          <TouchableOpacity activeOpacity={1} className="bg-theme-bg border-t border-theme-border rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center mb-4">
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text className="text-theme-muted font-semibold text-sm">Cancel</Text>
              </TouchableOpacity>
              <Text className="text-theme-text font-bold text-base">Select Target Event Date</Text>
              <TouchableOpacity
                onPress={handleConfirmDate}
                disabled={isSelectedDateInPast()}
                className={isSelectedDateInPast() ? 'opacity-40' : 'opacity-100'}
              >
                <Text className="text-[#FF5A1F] font-bold text-sm">Confirm</Text>
              </TouchableOpacity>
            </View>

            {isSelectedDateInPast() && (
              <View className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg flex-row items-center justify-center gap-2">
                <Ionicons name="warning-outline" size={16} color="#ef4444" />
                <Text className="text-red-500 text-xs font-bold text-center">
                  Goal date cannot be in the past
                </Text>
              </View>
            )}

            <View className="h-[200px] flex-row relative">
              <View className="absolute top-[84px] left-0 right-0 h-[44px] bg-theme-card border-y border-theme-border rounded-lg" />

              {/* Month Column */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                snapToInterval={44}
                decelerationRate="fast"
                contentContainerStyle={{ paddingVertical: 84 }}
                className="flex-1"
              >
                {MONTHS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => handleSetPickerMonth(m)}
                    style={{ height: 44 }}
                    className="items-center justify-center"
                  >
                    <Text
                      className={`text-center text-lg ${
                        pickerMonth === m
                          ? 'font-bold text-black dark:text-white'
                          : 'text-gray-400 dark:text-zinc-500 font-normal'
                      }`}
                    >
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Day Column */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                snapToInterval={44}
                decelerationRate="fast"
                contentContainerStyle={{ paddingVertical: 84 }}
                className="flex-1"
              >
                {PICKER_DAYS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setPickerDay(d)}
                    style={{ height: 44 }}
                    className="items-center justify-center"
                  >
                    <Text
                      className={`text-center text-lg ${
                        pickerDay === d
                          ? 'font-bold text-black dark:text-white'
                          : 'text-gray-400 dark:text-zinc-500 font-normal'
                      }`}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Year Column */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                snapToInterval={44}
                decelerationRate="fast"
                contentContainerStyle={{ paddingVertical: 84 }}
                className="flex-1"
              >
                {YEARS.map((y) => (
                  <TouchableOpacity
                    key={y}
                    onPress={() => handleSetPickerYear(y)}
                    style={{ height: 44 }}
                    className="items-center justify-center"
                  >
                    <Text
                      className={`text-center text-lg ${
                        pickerYear === y
                          ? 'font-bold text-black dark:text-white'
                          : 'text-gray-400 dark:text-zinc-500 font-normal'
                      }`}
                    >
                      {y}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Header Stepper Bar */}
      <View className="px-6 pt-4 pb-3 border-b border-theme-border flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="w-9 h-9 rounded-xl bg-[#FF5A1F] items-center justify-center shadow-md">
            <Ionicons name="flash" size={22} color="#FFFFFF" />
          </View>
          <View>
            <Text className="text-theme-text text-xl font-bold font-barlow tracking-tight">SPARK</Text>
            <Text className="text-theme-muted text-[11px]">
              {currentStep === 0 ? 'AI Endurance Coach' : `Step ${currentStep} of ${totalSteps}`}
            </Text>
          </View>
        </View>

        {currentStep >= 1 && (
          <View className="flex-row gap-1">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <View
                key={idx}
                className={`h-2 rounded-full ${
                  idx + 1 === currentStep
                    ? 'w-6 bg-[#FF5A1F]'
                    : idx + 1 < currentStep
                    ? 'w-2 bg-[#FF5A1F]/50'
                    : 'w-2 bg-theme-border'
                }`}
              />
            ))}
          </View>
        )}
      </View>

      {/* Main Chat Scroll Container */}
      <Reanimated.View
        style={[{ flex: 1 }, keyboardStyle]}
        className="flex-1"
      >
        <ScrollView
          ref={chatScrollViewRef}
          className="flex-1 px-6 pt-4"
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {timeline.map((node) => {
            if (node.type === 'welcome_hero' && currentStep === 0) {
              return (
                <View key={node.id} className="items-center justify-center py-10 my-auto">
                  <View className="relative mb-6">
                    <View className="w-28 h-28 rounded-full items-center justify-center overflow-hidden bg-theme-bg">
                      <Image
                        source={getCoachAvatarSource(coachTone)}
                        className="w-full h-full"
                      />
                    </View>
                  </View>

                  <View className="w-full mb-8">
                    <Text className="text-theme-text text-[22px] leading-[32px] font-semibold">
                      {typedText}
                      {typedText.length < WELCOME_MESSAGE.length && (
                        <Text className="text-[#FF5A1F]">▌</Text>
                      )}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={startChatOnboarding}
                    className="w-full py-4 rounded-2xl bg-[#FF5A1F] items-center justify-center flex-row gap-2 active:opacity-90"
                  >
                    <Text className="text-white font-extrabold text-lg">Meet Your Coach & Begin</Text>
                    <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              );
            }

            if (node.type === 'coach_typing') {
              return (
                <View key={node.id} className="mb-7">
                  <TypingDots />
                </View>
              );
            }

            if (node.type === 'coach_text') {
              if (!node.text?.trim()) return null;
              return (
                <View key={node.id} className="flex-row items-start gap-3 mb-4 pr-4">
                  <View className="relative">
                    <Image
                      source={getCoachAvatarSource(coachTone)}
                      className="w-10 h-10 rounded-full"
                    />
                  </View>
                  <View className="flex-1 mt-1">
                    <View className="flex-row items-center gap-1.5 mb-1">
                      <Text className="text-theme-text font-black text-xs uppercase tracking-wider">Spark</Text>
                    </View>
                    <MarkdownText content={node.text || ''} isUser={false} />
                  </View>
                </View>
              );
            }

            if (node.type === 'user_text') {
              return (
                <View key={node.id} className="flex-row justify-end mb-7 pl-12">
                  <View className="bg-theme-card rounded-3xl px-4 py-2.5 max-w-[80%]">
                    <Text className="text-theme-text text-[16px] leading-[24px]">{node.text}</Text>
                  </View>
                </View>
              );
            }

            if (node.type === 'card_language') {
              const isSelected = !!node.data?.selected;
              return (
                <View
                  key={node.id}
                  className={`bg-theme-card border ${
                    isSelected ? 'border-theme-border' : 'border-[#FF5A1F]/50'
                  } rounded-2xl p-4 mb-5 gap-3 shadow-sm`}
                >
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="language" size={20} color="#FF5A1F" />
                    <Text className="text-theme-text font-bold text-sm">Select Your Preferred Language</Text>
                  </View>

                  <View className="flex-row flex-wrap gap-2 pt-1">
                    {SUPPORTED_LANGUAGES.map((lang) => {
                      const active = language === lang.code;
                      return (
                        <TouchableOpacity
                          key={lang.code}
                          disabled={isStreamingMessage}
                          onPress={() => handleSelectLanguageChoice(lang.code, lang.label)}
                          className={`px-4 py-2.5 rounded-xl border flex-row items-center gap-2 ${
                            active
                              ? 'bg-[#FF5A1F] border-[#FF5A1F]'
                              : 'bg-theme-bg border-theme-border active:bg-theme-card'
                          }`}
                        >
                          <Text className="text-base">{lang.flag}</Text>
                          <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-theme-text'}`}>
                            {lang.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            }

            if (node.type === 'card_persona') {
              const isSelected = !!node.data?.selected;
              return (
                <View
                  key={node.id}
                  className={`bg-theme-card border ${
                    isSelected ? 'border-theme-border' : 'border-[#FF5A1F]/50'
                  } rounded-2xl p-4 mb-5 gap-3 shadow-sm`}
                >
                  <Text className="text-theme-text font-bold text-sm">Choose Spark's Coaching Tone</Text>

                  <TouchableOpacity
                    disabled={isStreamingMessage}
                    onPress={() =>
                      handleSelectPersonaChoice(
                        'Empathetic but demanding elite endurance coach.',
                        'Empathetic & Demanding'
                      )
                    }
                    className={`p-3.5 rounded-xl border ${
                      coachTone === 'Empathetic but demanding elite endurance coach.'
                        ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                        : 'border-theme-border bg-theme-bg'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full bg-[#FF5A1F]/20 items-center justify-center mr-3">
                        <Ionicons name="sparkles" size={20} color="#FF5A1F" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-theme-text font-bold text-xs">Empathetic & Demanding (Default)</Text>
                        <Text className="text-theme-muted text-[10px] mt-0.5">
                          High expectations, supportive, data-backed guidance.
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={isStreamingMessage}
                    onPress={() =>
                      handleSelectPersonaChoice(
                        'Strict with data, but with a dry, snarky British sense of humor.',
                        'Strict Data & British Humor'
                      )
                    }
                    className={`p-3.5 rounded-xl border ${
                      coachTone === 'Strict with data, but with a dry, snarky British sense of humor.'
                        ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                        : 'border-theme-border bg-theme-bg'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full bg-purple-500/20 items-center justify-center mr-3">
                        <Ionicons name="analytics" size={20} color="#a855f7" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-theme-text font-bold text-xs">Strict Data & British Humor</Text>
                        <Text className="text-theme-muted text-[10px] mt-0.5">
                          Direct numbers focus with dry wit.
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={isStreamingMessage}
                    onPress={() =>
                      handleSelectPersonaChoice(
                        'Enthusiastic cheerleader, extremely positive and forgiving.',
                        'Positive Cheerleader'
                      )
                    }
                    className={`p-3.5 rounded-xl border ${
                      coachTone === 'Enthusiastic cheerleader, extremely positive and forgiving.'
                        ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                        : 'border-theme-border bg-theme-bg'
                    }`}
                  >
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 rounded-full bg-emerald-500/20 items-center justify-center mr-3">
                        <Ionicons name="heart" size={20} color="#10b981" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-theme-text font-bold text-xs">Positive Cheerleader</Text>
                        <Text className="text-theme-muted text-[10px] mt-0.5">
                          Always encouraging, empathetic, focuses on consistency over perfection.
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }

            if (node.type === 'card_context_event') {
              const isCompleted = !!node.data?.completed;
              return (
                <View
                  key={node.id}
                  className={`bg-theme-card border ${
                    isCompleted ? 'border-theme-border' : 'border-[#FF5A1F]/50'
                  } rounded-2xl p-4 mb-5 gap-4 shadow-sm`}
                >
                  <Text className="text-theme-text font-bold text-sm">Tell Us About Yourself & Main Event</Text>

                  <TextInput
                    editable={!isStreamingMessage}
                    multiline
                    numberOfLines={4}
                    value={athleteContext}
                    onChangeText={handleAthleteContextChange}
                    placeholder="e.g. Amateur triathlete, parent of 2 kids, prefers morning runs..."
                    placeholderTextColor="#8E8E93"
                    className="p-4 bg-theme-bg border border-theme-border rounded-xl text-theme-text text-xs min-h-[90px]"
                    style={{ textAlignVertical: 'top' }}
                  />

                  {/* Physiological Baselines */}
                  <View className="bg-theme-bg border border-theme-border rounded-xl p-3 gap-2">
                    <Text className="text-theme-muted text-[10px] font-bold uppercase tracking-wider">
                      Physiological Baselines (Optional)
                    </Text>
                    {metrics.map((item, idx) => (
                      <View key={idx} className="flex-row gap-2">
                        <TextInput
                          editable={!isStreamingMessage}
                          placeholder="Label (e.g. FTP)"
                          placeholderTextColor="#8E8E93"
                          value={item.label}
                          onChangeText={(val) => {
                            const updated = [...metrics];
                            updated[idx].label = val;
                            setMetrics(updated);
                          }}
                          className="flex-1 p-2.5 bg-theme-card border border-theme-border rounded-lg text-theme-text text-xs"
                        />
                        <TextInput
                          editable={!isStreamingMessage}
                          placeholder="Value"
                          placeholderTextColor="#8E8E93"
                          value={item.value}
                          onChangeText={(val) => {
                            const updated = [...metrics];
                            updated[idx].value = val;
                            setMetrics(updated);
                          }}
                          className="w-24 p-2.5 bg-theme-card border border-theme-border rounded-lg text-theme-text text-xs"
                        />
                      </View>
                    ))}
                    <TouchableOpacity
                      disabled={isStreamingMessage}
                      onPress={addMetricRow}
                      className="py-1.5 items-center bg-[#FF5A1F]/10 border border-[#FF5A1F]/30 rounded-lg mt-1"
                    >
                      <Text className="text-[#FF5A1F] text-xs font-bold">+ Add Metric</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Main Goal Event Setup */}
                  <View className="bg-theme-bg border border-theme-border rounded-xl p-3 gap-2.5">
                    <Text className="text-theme-muted text-[10px] font-bold uppercase tracking-wider">
                      Main Target Event
                    </Text>
                    <TextInput
                      editable={!isStreamingMessage}
                      placeholder="Race Name (e.g. Amsterdam Marathon)"
                      placeholderTextColor="#8E8E93"
                      value={raceName}
                      onChangeText={handleRaceNameChange}
                      className="p-2.5 bg-theme-card border border-theme-border rounded-lg text-theme-text text-xs"
                    />
                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        disabled={isStreamingMessage}
                        onPress={openDatePickerModal}
                        className="flex-1 p-2.5 bg-theme-card border border-theme-border rounded-lg flex-row items-center justify-between"
                      >
                        <Text className={raceDate ? 'text-theme-text text-xs font-medium' : 'text-theme-muted text-xs'}>
                          {raceDate || 'Date (YYYY-MM-DD)'}
                        </Text>
                        <Ionicons name="calendar-outline" size={16} color="#8E8E93" />
                      </TouchableOpacity>

                      <View className="w-28 p-2.5 bg-theme-card border border-theme-border rounded-lg flex-row items-center justify-center relative">
                        {isEstimatingCtl ? (
                          <View className="flex-row items-center gap-1">
                            <ActivityIndicator size="small" color="#FF5A1F" />
                            <Text className="text-[10px] text-[#FF5A1F] font-bold">Spark...</Text>
                          </View>
                        ) : (
                          <>
                            <TextInput
                              editable={!isStreamingMessage}
                              placeholder="Target CTL"
                              placeholderTextColor="#8E8E93"
                              value={targetCtl}
                              keyboardType="numeric"
                              onChangeText={(val) => {
                                setTargetCtl(val);
                                setIsAiFilled(false);
                              }}
                              className="w-full text-theme-text text-xs text-center font-bold"
                            />
                            {isAiFilled && (
                              <View className="absolute -top-2 -right-1 bg-[#FF5A1F] px-1.5 py-0.5 rounded-full">
                                <Text className="text-[8px] text-white font-bold">⚡️ Spark</Text>
                              </View>
                            )}
                          </>
                        )}
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    disabled={isStreamingMessage}
                    onPress={handleConfirmContextAndEvent}
                    className="w-full py-3 bg-[#FF5A1F] rounded-xl items-center justify-center shadow-md"
                  >
                    <Text className="text-white font-bold text-xs">
                      {isCompleted ? 'Update Details & Event ⚡️' : 'Confirm Details & Event ⚡️'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }

            if (node.type === 'card_schedule') {
              const isCompleted = !!node.data?.completed;
              return (
                <View
                  key={node.id}
                  className={`bg-theme-card border ${
                    isCompleted ? 'border-theme-border' : 'border-[#FF5A1F]/50'
                  } rounded-2xl p-4 mb-5 gap-3 shadow-sm`}
                >
                  <Text className="text-theme-text font-bold text-sm">Weekly Training Availability</Text>
                  <Text className="text-theme-muted text-xs">
                    Select how many minutes you can comfortably dedicate each day.
                  </Text>

                  <View className="gap-3 pt-1">
                    {DAYS.map((day) => {
                      const currentVal = availability[day]?.maxMinutes || 0;
                      return (
                        <View key={day} className="bg-theme-bg p-3 rounded-xl border border-theme-border gap-2">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-theme-text font-bold text-xs">{day}</Text>
                            <Text className="text-[#FF5A1F] font-bold text-xs">
                              {currentVal === 0 ? 'Rest Day' : `${currentVal} mins`}
                            </Text>
                          </View>

                          <View className="flex-row gap-1 justify-between">
                            {DURATION_OPTIONS.map((opt) => {
                              const isSelected = currentVal === opt.value;
                              return (
                                <TouchableOpacity
                                  key={opt.value}
                                  disabled={isStreamingMessage}
                                  onPress={() => handleDayDurationChange(day, opt.value)}
                                  className={`flex-1 py-1.5 rounded-lg items-center justify-center border ${
                                    isSelected
                                      ? 'bg-[#FF5A1F] border-[#FF5A1F]'
                                      : 'bg-theme-card border-theme-border'
                                  }`}
                                >
                                  <Text
                                    className={`text-[10px] font-bold ${
                                      isSelected ? 'text-white' : 'text-theme-muted'
                                    }`}
                                  >
                                    {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    disabled={isStreamingMessage}
                    onPress={handleConfirmScheduleChoice}
                    className="w-full py-3 bg-[#FF5A1F] rounded-xl items-center justify-center shadow-md mt-2"
                  >
                    <Text className="text-white font-bold text-xs">
                      {isCompleted ? 'Update Schedule ⚡️' : 'Lock In Schedule ⚡️'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }

            if (node.type === 'card_integrations') {
              const isCompleted = !!node.data?.completed;
              return (
                <View
                  key={node.id}
                  className={`bg-theme-card border ${
                    isCompleted ? 'border-theme-border' : 'border-[#FF5A1F]/50'
                  } rounded-2xl p-4 mb-5 gap-3 shadow-sm`}
                >
                  <Text className="text-theme-text font-bold text-sm">Device & Fitness Sync</Text>

                  {/* Garmin Connect */}
                  <View className="bg-theme-bg border border-theme-border rounded-xl p-3.5 gap-3">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <Ionicons name="watch-outline" size={20} color="#007ACC" />
                        <View>
                          <Text className="text-theme-text font-bold text-xs">Garmin Connect</Text>
                          <Text className="text-theme-muted text-[10px]">Sync daily workouts & HRV</Text>
                        </View>
                      </View>
                      <Switch
                        disabled={isStreamingMessage}
                        value={showGarmin}
                        onValueChange={setShowGarmin}
                        trackColor={{ false: '#3A3A3C', true: '#FF5A1F' }}
                      />
                    </View>

                    {showGarmin && (
                      <View className="pt-2 gap-2 border-t border-theme-border">
                        <TextInput
                          editable={!isStreamingMessage}
                          placeholder="Garmin Email / Username"
                          placeholderTextColor="#8E8E93"
                          value={garminEmail}
                          onChangeText={setGarminEmail}
                          autoCapitalize="none"
                          className="p-2.5 bg-theme-card border border-theme-border rounded-lg text-theme-text text-xs"
                        />
                        <TextInput
                          editable={!isStreamingMessage}
                          placeholder="Garmin Password"
                          placeholderTextColor="#8E8E93"
                          secureTextEntry
                          value={garminPassword}
                          onChangeText={setGarminPassword}
                          autoCapitalize="none"
                          className="p-2.5 bg-theme-card border border-theme-border rounded-lg text-theme-text text-xs"
                        />
                      </View>
                    )}
                  </View>

                  {/* Strava Connect */}
                  <View className="bg-theme-bg border border-theme-border rounded-xl p-3.5 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="bicycle" size={18} color="#FC4C02" />
                      <Text className="text-theme-text font-bold text-xs">Strava Sync</Text>
                    </View>
                    <TouchableOpacity
                      disabled={isStreamingMessage}
                      onPress={() => Alert.alert('Strava OAuth', 'Strava connection will open in web browser.')}
                      className="bg-[#FC4C02] px-3 py-1.5 rounded-lg"
                    >
                      <Text className="text-white font-bold text-[10px]">Connect Strava</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    disabled={isStreamingMessage}
                    onPress={handleConfirmIntegrationsChoice}
                    className="w-full py-3 bg-[#FF5A1F] rounded-xl items-center justify-center shadow-md mt-2"
                  >
                    <Text className="text-white font-bold text-xs">
                      {isCompleted ? 'Update Sync Settings ⚡️' : 'Continue to Final Step ⚡️'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }

            if (node.type === 'card_paywall') {
              return (
                <View key={node.id} className="bg-theme-card border border-theme-border rounded-2xl p-5 mb-6 gap-4 shadow-sm">
                  <View className="items-center my-1">
                    <View className="w-12 h-12 rounded-2xl bg-[#FF5A1F] items-center justify-center mb-2 shadow-lg">
                      <Ionicons name="flash" size={24} color="#FFFFFF" />
                    </View>
                    <Text className="text-theme-text font-extrabold text-lg text-center">Unlock Spark Plus</Text>
                    <Text className="text-theme-muted text-xs text-center mt-1">
                      Upgrade to unlock unlimited Spark chat, custom periodization, and automated sync.
                    </Text>
                  </View>

                  {/* Pricing Tiers */}
                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={() => setSelectedPlan('annual')}
                      className={`flex-1 p-3.5 rounded-2xl border ${
                        selectedPlan === 'annual'
                          ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                          : 'border-theme-border bg-theme-bg'
                      }`}
                    >
                      <View className="self-start px-2 py-0.5 bg-[#FF5A1F] rounded-full mb-1.5">
                        <Text className="text-white font-bold text-[9px]">SAVE 17%</Text>
                      </View>
                      <Text className="text-theme-text font-bold text-sm">Annual</Text>
                      <Text className="text-[#FF5A1F] font-bold text-lg mt-0.5">
                        €5.83<Text className="text-xs text-theme-muted">/mo</Text>
                      </Text>
                      <Text className="text-theme-muted text-[9px] mt-0.5">€69.99 billed yearly</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setSelectedPlan('monthly')}
                      className={`flex-1 p-3.5 rounded-2xl border ${
                        selectedPlan === 'monthly'
                          ? 'border-[#FF5A1F] bg-[#FF5A1F]/10'
                          : 'border-theme-border bg-theme-bg'
                      }`}
                    >
                      <Text className="text-theme-text font-bold text-sm mt-4">Monthly</Text>
                      <Text className="text-theme-text font-bold text-lg mt-0.5">
                        €6.99<Text className="text-xs text-theme-muted">/mo</Text>
                      </Text>
                      <Text className="text-theme-muted text-[9px] mt-0.5">Billed monthly</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Feature Checklist */}
                  <View className="bg-theme-bg border border-theme-border rounded-xl p-3.5 gap-2">
                    {[
                      'Increased Spark chat tokens',
                      'Personalized daily macro periodization & fueling protocols',
                      'Strava auto-tagging controls',
                      'Social leaderboard',
                    ].map((feat, idx) => (
                      <View key={idx} className="flex-row items-center gap-2">
                        <Ionicons name="checkmark-circle" size={16} color="#FF5A1F" />
                        <Text className="text-theme-text text-xs flex-1">{feat}</Text>
                      </View>
                    ))}
                  </View>

                  <View className="gap-2 pt-2">
                    <TouchableOpacity
                      onPress={() => handleCompleteSetup(true)}
                      disabled={isSubmitting}
                      className="w-full py-4 rounded-xl bg-[#FF5A1F] items-center justify-center shadow-lg"
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="text-white font-extrabold text-sm">Start 14-Day Free Trial ⚡️</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleCompleteSetup(false)}
                      disabled={isSubmitting}
                      className="w-full py-3 rounded-xl border border-theme-border bg-theme-bg items-center justify-center"
                    >
                      <Text className="text-theme-muted text-xs font-bold">Continue with Free Tier</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            return null;
          })}
        </ScrollView>
      </Reanimated.View>
    </SafeAreaView>
  );
}
