import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import Reanimated, {
  Easing as REasing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../../constants/api';
import { useKeyboardMotionContext } from '../../context/KeyboardMotionContext';
import { dictionaries, useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { apiClient } from '../../services/apiClient';
import { integrationsApi } from '../../services/apiServices';
import { getCoachAvatarSource } from '../../utils/avatarUtils';
import { MarkdownText } from '../chat/MarkdownText';
import { BottomSheetModal } from '../ui/BottomSheetModal';

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

const SUPPORTED_LANGUAGES: Array<{ code: string; label: string; flag: string; disabled?: boolean }> = [
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
  | 'card_gender'
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

  const { user, refreshUser, updateUser } = useUser();
  const { t, language, setLanguage } = useLanguage();

  // Onboarding Step Flow (0 = Welcome Hero, 1 = Language, 2 = Persona, 3 = Gender, 4 = Context/Event, 5 = Schedule, 6 = Integrations, 7 = Paywall)
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 7;
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

  // --- Hero -> Chat handoff animation ---
  // The hero avatar visually "flies" from its big centered spot into the small
  // top-left slot it occupies as the first chat avatar, shrinking as it goes.
  // The headline/button/terms fade + drift up and out at the same time.
  const heroAvatarBoxRef = useRef<View>(null);
  // Invisible probe kept exactly where the small chat avatar will render
  // (same top/left as the first chat row's avatar), so we can measure the
  // real landing spot instead of guessing header height + padding.
  const chatAvatarProbeRef = useRef<View>(null);
  // The real first chat-row avatar, once it mounts — used to snap the clone
  // onto its exact final position/size right before fading, so any tiny
  // discrepancy between the probe estimate and reality can't show as a ghost.
  const firstChatAvatarRef = useRef<View>(null);
  const [isHeroTransitioning, setIsHeroTransitioning] = useState(false);

  const heroT = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const heroContentOpacity = useSharedValue(1);
  const heroContentTranslateY = useSharedValue(0);

  const avatarFromX = useSharedValue(0);
  const avatarFromY = useSharedValue(0);
  const avatarFromSize = useSharedValue(112);
  const avatarToX = useSharedValue(24);
  const avatarToY = useSharedValue(80);
  const avatarToSize = useSharedValue(40);

  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: heroContentOpacity.value,
    transform: [{ translateY: heroContentTranslateY.value }],
  }));

  const avatarOverlayStyle = useAnimatedStyle(() => {
    const size = interpolate(heroT.value, [0, 1], [avatarFromSize.value, avatarToSize.value]);
    return {
      opacity: overlayOpacity.value,
      top: interpolate(heroT.value, [0, 1], [avatarFromY.value, avatarToY.value]),
      left: interpolate(heroT.value, [0, 1], [avatarFromX.value, avatarToX.value]),
      width: size,
      height: size,
      borderRadius: size / 2,
    };
  });

  const finalizeHeroHandoff = () => {
    startChatOnboarding();
    // Wait for the real chat avatar to actually commit to the native layout
    // (one rAF is often not enough on its own), then snap the clone onto its
    // exact measured rect before fading — removes any residual few-px offset
    // between the probe's estimate and where the real avatar actually lands.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (firstChatAvatarRef.current) {
          firstChatAvatarRef.current.measureInWindow((x, y, w) => {
            avatarToX.value = x;
            avatarToY.value = y;
            avatarToSize.value = w;
            overlayOpacity.value = withDelay(80, withTiming(0, { duration: 140 }));
          });
        } else {
          overlayOpacity.value = withDelay(80, withTiming(0, { duration: 140 }));
        }
      });
    });
  };

  const handleBeginPress = () => {
    if (isHeroTransitioning) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!heroAvatarBoxRef.current || !chatAvatarProbeRef.current) {
      startChatOnboarding();
      return;
    }

    setIsHeroTransitioning(true);

    heroAvatarBoxRef.current.measureInWindow((fromX, fromY, fromWidth) => {
      avatarFromX.value = fromX;
      avatarFromY.value = fromY;
      avatarFromSize.value = fromWidth;

      chatAvatarProbeRef.current?.measureInWindow((toX, toY, toWidth) => {
        avatarToX.value = toX;
        avatarToY.value = toY;
        avatarToSize.value = toWidth;

        overlayOpacity.value = 1;
        heroContentOpacity.value = withTiming(0, { duration: 200, easing: REasing.out(REasing.quad) });
        heroContentTranslateY.value = withTiming(-14, { duration: 220, easing: REasing.out(REasing.quad) });

        heroT.value = withTiming(
          1,
          { duration: 480, easing: REasing.out(REasing.cubic) },
          (finished) => {
            if (finished) {
              runOnJS(finalizeHeroHandoff)();
            }
          }
        );
      });
    });
  };

  const WELCOME_MESSAGE = t('onboarding.welcomeMessage');
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
  }, [currentStep, WELCOME_MESSAGE]);

  const [coachTone, setCoachTone] = useState(
    user?.coach_tone || ''
  );
  const [gender, setGender] = useState<string>(user?.gender || 'Prefer not to share');
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

  const [garminEmail, setGarminEmail] = useState(
    (user as any)?.garmin_username || (user as any)?.garminUsername || ''
  );
  const [garminPassword, setGarminPassword] = useState('');
  const [showGarmin, setShowGarmin] = useState(!!user?.garmin_connected);
  const [isGarminSaved, setIsGarminSaved] = useState(!!user?.garmin_connected);
  const [isSavingGarmin, setIsSavingGarmin] = useState(false);
  const [garminSaveSuccessMsg, setGarminSaveSuccessMsg] = useState<string | null>(null);
  const [garminError, setGarminError] = useState<string | null>(null);

  const [isConnectingStrava, setIsConnectingStrava] = useState(false);
  const [stravaSuccessMsg, setStravaSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user?.garmin_connected) {
      setIsGarminSaved(true);
      setShowGarmin(true);
      if ((user as any)?.garmin_username || (user as any)?.garminUsername) {
        setGarminEmail((user as any)?.garmin_username || (user as any)?.garminUsername);
      }
    }
  }, [user?.garmin_connected]);
  const [raceName, setRaceName] = useState(user?.target_event || '');
  const [raceDate, setRaceDate] = useState(() => {
    const existing = user?.event_date || '';
    return isPastDateString(existing) ? '' : existing;
  });
  const [targetCtl, setTargetCtl] = useState(user?.target_ctl?.toString() || '75');
  const [isEstimatingCtl, setIsEstimatingCtl] = useState(false);
  const [isAiFilled, setIsAiFilled] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentYearNum = new Date().getFullYear();
  const startYear = Math.max(2026, currentYearNum);
  const YEARS = Array.from({ length: 6 }, (_, i) => (startYear + i).toString());

  const [pickerMonth, setPickerMonth] = useState('October');
  const [pickerDay, setPickerDay] = useState('1');
  const [pickerYear, setPickerYear] = useState(startYear.toString());

  const getDaysInMonth = (monthName: string, yearStr: string) => {
    const monthIndex = MONTHS.indexOf(monthName);
    const y = parseInt(yearStr, 10) || startYear;
    return new Date(y, monthIndex + 1, 0).getDate();
  };

  const currentMaxDays = getDaysInMonth(pickerMonth, pickerYear);
  const PICKER_DAYS = Array.from({ length: currentMaxDays }, (_, i) => (i + 1).toString());

  const isSelectedDateInPast = () => {
    const monthIndex = MONTHS.indexOf(pickerMonth);
    const dayNum = parseInt(pickerDay, 10) || 1;
    const yearNum = parseInt(pickerYear, 10) || startYear;
    const selected = new Date(yearNum, monthIndex, dayNum);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected < today;
  };

  const handleSetPickerMonth = (m: string) => {
    setPickerMonth(m);
    const maxD = getDaysInMonth(m, pickerYear);
    if (parseInt(pickerDay, 10) > maxD) {
      setPickerDay(maxD.toString());
    }
  };

  const handleSetPickerYear = (y: string) => {
    setPickerYear(y);
    const maxD = getDaysInMonth(pickerMonth, y);
    if (parseInt(pickerDay, 10) > maxD) {
      setPickerDay(maxD.toString());
    }
  };

  const handleConfirmDate = () => {
    if (isSelectedDateInPast()) return;
    const monthIndex = MONTHS.indexOf(pickerMonth) + 1;
    const mStr = monthIndex < 10 ? `0${monthIndex}` : `${monthIndex}`;
    const dayNum = parseInt(pickerDay, 10);
    const dStr = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    const fullDate = `${pickerYear}-${mStr}-${dStr}`;
    setRaceDate(fullDate);
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

  const raceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRaceNameChange = (text: string) => {
    setRaceName(text);
    if (raceDebounceRef.current) clearTimeout(raceDebounceRef.current);
    if (!text.trim() || text.trim().length < 3) {
      setIsEstimatingCtl(false);
      return;
    }
    setIsEstimatingCtl(true);
    raceDebounceRef.current = setTimeout(() => {
      const lower = text.toLowerCase();
      let estimated = 70;
      if (lower.includes('ironman') || lower.includes('140.6')) {
        estimated = 115;
      } else if (lower.includes('70.3') || lower.includes('half ironman')) {
        estimated = 90;
      } else if (lower.includes('marathon') || lower.includes('42k')) {
        estimated = 85;
      } else if (lower.includes('half marathon') || lower.includes('21k')) {
        estimated = 65;
      } else if (lower.includes('olympic') || lower.includes('triathlon')) {
        estimated = 75;
      } else if (lower.includes('hyrox')) {
        estimated = 80;
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
      let reaction = t('onboarding.contextFeedbackDefault');
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

    appendCoachPromptAndCard(null, t('onboarding.selectLanguagePrompt'), 'card_language');
  };

  const handleSelectLanguageChoice = (langCode: string, langName: string) => {
    if (isStreamingMessage) return;
    setLanguage(langCode as any);

    const targetDict = dictionaries[langCode as keyof typeof dictionaries] || dictionaries.en;
    const userLabel = (targetDict.onboarding?.selectedLanguageUser || 'Language: {lang}').replace('{lang}', langName);
    const coachPrompt = (targetDict.onboarding?.coachLanguageAck || 'Thank you! I will communicate with you in {lang}. 👋 First, how would you like me to talk to you during workouts and chat?').replace('{lang}', langName);

    if (currentStep === 1) {
      setCurrentStep(2);
      appendCoachPromptAndCard(
        userLabel,
        coachPrompt,
        'card_persona',
        { type: 'card_language', key: 'selected', val: langCode }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_language' ? { ...item, data: { selected: langCode } } : item))
      );
      const updatedUser = (targetDict.onboarding?.updatedLanguageUser || 'Updated Language: {lang}').replace('{lang}', langName);
      const updatedAck = (targetDict.onboarding?.updatedLanguageAck || 'Got it! Updated your preferred language to {lang}. 👋').replace('{lang}', langName);
      appendCoachAckOnly(updatedUser, updatedAck);
    }
  };

  const handleSelectPersonaChoice = (toneString: string, toneTitle: string) => {
    if (isStreamingMessage) return;
    setCoachTone(toneString);

    if (currentStep === 2) {
      setCurrentStep(3);
      appendCoachPromptAndCard(
        t('onboarding.selectedPersonaUser', { tone: toneTitle }),
        t('onboarding.genderPrompt'),
        'card_gender',
        { type: 'card_persona', key: 'selected', val: toneTitle }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_persona' ? { ...item, data: { selected: toneTitle } } : item))
      );
      appendCoachAckOnly(
        t('onboarding.updatedPersonaUser', { tone: toneTitle }),
        t('onboarding.updatedPersonaAck', { tone: toneTitle })
      );
    }
  };

  const handleSelectGenderChoice = (genderVal: string, genderLabel: string) => {
    if (isStreamingMessage) return;
    setGender(genderVal);

    if (currentStep === 3) {
      setCurrentStep(4);
      appendCoachPromptAndCard(
        t('onboarding.selectedGenderUser', { gender: genderLabel }),
        t('onboarding.contextPrompt'),
        'card_context_event',
        { type: 'card_gender', key: 'selected', val: genderVal }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_gender' ? { ...item, data: { selected: genderVal } } : item))
      );
      appendCoachAckOnly(
        t('onboarding.updatedGenderUser', { gender: genderLabel }),
        t('onboarding.updatedGenderAck', { gender: genderLabel })
      );
    }
  };

  const handleConfirmContextAndEvent = () => {
    if (isStreamingMessage) return;

    if (currentStep === 4) {
      setCurrentStep(5);
      const feedback = coachReaction || t('onboarding.contextFeedbackDefault');
      appendCoachPromptAndCard(
        raceName ? t('onboarding.contextUserEvent', { name: raceName, date: raceDate || 'TBD' }) : t('onboarding.contextUserBackground'),
        `${feedback} ${t('onboarding.schedulePrompt')}`,
        'card_schedule',
        { type: 'card_context_event', key: 'completed', val: true }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_context_event' ? { ...item, data: { completed: true } } : item))
      );
      appendCoachAckOnly(
        raceName ? t('onboarding.contextUserEvent', { name: raceName, date: raceDate || 'TBD' }) : t('onboarding.contextUserBackground'),
        t('onboarding.contextFeedbackDefault')
      );
    }
  };

  const handleConfirmScheduleChoice = () => {
    if (isStreamingMessage) return;

    if (currentStep === 5) {
      setCurrentStep(6);
      appendCoachPromptAndCard(
        t('onboarding.selectedScheduleUser'),
        t('onboarding.integrationsPrompt'),
        'card_integrations',
        { type: 'card_schedule', key: 'completed', val: true }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_schedule' ? { ...item, data: { completed: true } } : item))
      );
      appendCoachAckOnly(
        t('onboarding.selectedScheduleUser'),
        t('onboarding.updateScheduleBtn')
      );
    }
  };

  const handleSaveGarmin = async (): Promise<boolean> => {
    if (!garminEmail.trim() || !garminPassword.trim()) {
      setGarminError(t('onboarding.garminFillError'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return false;
    }
    setIsSavingGarmin(true);
    setGarminError(null);
    setGarminSaveSuccessMsg(null);
    try {
      const res = await integrationsApi.saveGarminCredentials({
        garminUsername: garminEmail.trim(),
        garminPassword: garminPassword.trim(),
      });
      await refreshUser();
      setIsGarminSaved(true);
      setGarminSaveSuccessMsg(res?.message || t('onboarding.garminSavedSuccess'));
      setGarminPassword('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (err: any) {
      setGarminError(err?.message || 'Failed to save Garmin credentials');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return false;
    } finally {
      setIsSavingGarmin(false);
    }
  };

  const handleDisconnectGarmin = async () => {
    setIsSavingGarmin(true);
    try {
      await integrationsApi.disconnectGarmin();
      await refreshUser();
      setIsGarminSaved(false);
      setShowGarmin(false);
      setGarminEmail('');
      setGarminPassword('');
      setGarminSaveSuccessMsg(null);
      setGarminError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Garmin disconnect error:', err);
    } finally {
      setIsSavingGarmin(false);
    }
  };

  const handleConnectStravaOAuth = async () => {
    setIsConnectingStrava(true);
    setStravaSuccessMsg(null);
    try {
      const clientId = '208765';
      const stravaRedirectUri = `${API_BASE_URL}/oauthredirect`;
      const appDeepLink = Linking.createURL('oauthredirect');
      const authUrl = `https://www.strava.com/oauth/mobile/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
        stravaRedirectUri
      )}&scope=activity:read_all,activity:write&approval_prompt=force`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, appDeepLink);
      if (result.type === 'success' && result.url) {
        let code: string | undefined;
        try {
          code = new URL(result.url).searchParams.get('code') || undefined;
        } catch (_) {
          const match = result.url.match(/[?&]code=([^&]+)/);
          if (match) code = match[1];
        }
        if (code) {
          const res = await integrationsApi.exchangeStravaCode(code);
          await refreshUser();
          setStravaSuccessMsg(res?.message || t('onboarding.stravaSuccessMsg'));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            t('onboarding.stravaTitle'),
            t('onboarding.stravaSuccessMsg')
          );
        }
      }
    } catch (err: any) {
      console.error('Onboarding Strava OAuth error:', err);
      Alert.alert(t('onboarding.stravaTitle'), t('onboarding.stravaErrorMsg'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setIsConnectingStrava(false);
    }
  };

  const handleDisconnectStrava = async () => {
    setIsConnectingStrava(true);
    try {
      await integrationsApi.disconnectStrava();
      await refreshUser();
      setStravaSuccessMsg(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Strava disconnect error:', err);
    } finally {
      setIsConnectingStrava(false);
    }
  };

  const handleConfirmIntegrationsChoice = async () => {
    if (isStreamingMessage) return;

    // If user filled in credentials and has not yet saved, save automatically
    if (showGarmin && garminEmail.trim() && garminPassword.trim() && !isGarminSaved) {
      const saved = await handleSaveGarmin();
      if (!saved) return;
    }

    if (currentStep === 6) {
      setCurrentStep(7);
      appendCoachPromptAndCard(
        t('onboarding.selectedIntegrationsUser'),
        t('onboarding.paywallPrompt'),
        'card_paywall',
        { type: 'card_integrations', key: 'completed', val: true }
      );
    } else {
      setTimeline((prev) =>
        prev.map((item) => (item.type === 'card_integrations' ? { ...item, data: { completed: true } } : item))
      );
      appendCoachAckOnly(
        t('onboarding.selectedIntegrationsUser'),
        t('onboarding.updateIntegrationsBtn')
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

      try {
        await apiClient('/api/onboarding/finalize', {
          method: 'POST',
          body: JSON.stringify({
            coachTone,
            athleteContext: fullContext,
            trainingAvailability: availability,
            gender,
            targetEvent: raceName || undefined,
            eventDate: raceDate || undefined,
            targetCtl: targetCtl ? parseFloat(targetCtl) : undefined,
            language: language || 'en',
          }),
        });
      } catch (e) {
        console.warn('Finalize onboarding call warning:', e);
        await updateUser({
          coach_tone: coachTone,
          athlete_context: fullContext,
          training_availability: availability as any,
          gender: gender,
          target_event: raceName || undefined,
          event_date: raceDate || undefined,
          target_ctl: targetCtl ? parseFloat(targetCtl) : undefined,
          onboarding_completed: true,
        } as any);
      }

      if (showGarmin && garminEmail && garminPassword && !isGarminSaved) {
        try {
          await integrationsApi.saveGarminCredentials({
            garminUsername: garminEmail.trim(),
            garminPassword: garminPassword.trim(),
          });
        } catch (_) { }
      }

      await refreshUser();
      router.replace('/(tabs)/coach');
    } catch (err: any) {
      console.error('Onboarding save error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setIsSubmitting(false);
    }
  };

  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-theme-bg" edges={['top', 'bottom']}>
        {/* Date Picker Modal */}
        <BottomSheetModal
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          contentClassName="bg-theme-bg border-t border-theme-border rounded-t-3xl p-6"
        >
          <View className="flex-row justify-between items-center mb-4">
            <Pressable onPress={() => setShowDatePicker(false)}>
              <Text className="text-theme-muted font-semibold text-sm">{t('onboarding.cancelBtn')}</Text>
            </Pressable>
            <Text className="text-theme-text font-bold text-base">{t('onboarding.selectTargetDateModalTitle')}</Text>
            <Pressable
              onPress={handleConfirmDate}
              disabled={isSelectedDateInPast()}
              className={isSelectedDateInPast() ? 'opacity-40' : 'opacity-100'}
            >
              <Text className="text-[#FF5A1F] font-bold text-sm">{t('onboarding.confirmDateBtn')}</Text>
            </Pressable>
          </View>

          {isSelectedDateInPast() && (
            <View className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg flex-row items-center justify-center gap-2">
              <Ionicons name="warning-outline" size={16} color="#ef4444" />
              <Text className="text-red-500 text-xs font-bold text-center">
                {t('onboarding.dateInPastWarning')}
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
                <Pressable
                  key={m}
                  onPress={() => handleSetPickerMonth(m)}
                  style={{ height: 44 }}
                  className="items-center justify-center"
                >
                  <Text
                    className={`text-center text-lg ${pickerMonth === m
                      ? 'font-bold text-black dark:text-white'
                      : 'text-gray-400 dark:text-zinc-500 font-normal'
                      }`}
                  >
                    {m}
                  </Text>
                </Pressable>
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
                <Pressable
                  key={d}
                  onPress={() => setPickerDay(d)}
                  style={{ height: 44 }}
                  className="items-center justify-center"
                >
                  <Text
                    className={`text-center text-lg ${pickerDay === d
                      ? 'font-bold text-black dark:text-white'
                      : 'text-gray-400 dark:text-zinc-500 font-normal'
                      }`}
                  >
                    {d}
                  </Text>
                </Pressable>
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
                <Pressable
                  key={y}
                  onPress={() => handleSetPickerYear(y)}
                  style={{ height: 44 }}
                  className="items-center justify-center"
                >
                  <Text
                    className={`text-center text-lg ${pickerYear === y
                      ? 'font-bold text-black dark:text-white'
                      : 'text-gray-400 dark:text-zinc-500 font-normal'
                      }`}
                  >
                    {y}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </BottomSheetModal>

        {/* Header Stepper Bar */}
        <View className="px-6 pt-4 pb-3 border-b border-theme-border flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="w-9 h-9 rounded-xl overflow-hidden shadow-md">
              <Image
                source={require('../../../assets/images/logo-mark.png')}
                className="w-full h-full"
                resizeMode="cover"
              />
            </View>
            <View>
              <Text className="text-theme-text text-xl font-bold font-barlow tracking-tight">ROOKA</Text>
              <Text className="text-theme-muted text-[11px]">
                {currentStep === 0 ? 'AI Endurance Coach' : t('onboarding.stepOf', { current: currentStep, total: totalSteps })}
              </Text>
            </View>
          </View>

          {currentStep >= 1 && (
            <View className="flex-row gap-1">
              {Array.from({ length: totalSteps }).map((_, idx) => (
                <View
                  key={idx}
                  style={
                    idx + 1 === currentStep
                      ? { backgroundColor: '#FF5A1F' }
                      : idx + 1 < currentStep
                        ? { backgroundColor: 'rgba(255, 90, 31, 0.5)' }
                        : undefined
                  }
                  className={`h-2 rounded-full bg-theme-border ${idx + 1 === currentStep ? 'w-6' : 'w-2'
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
          {/* Invisible probe marking exactly where the first chat row's avatar
            renders (px-6 pt-4, 40x40) — measured live so the hero avatar has
            an accurate landing target instead of a guessed offset. */}
          <View
            ref={chatAvatarProbeRef}
            pointerEvents="none"
            style={{ position: 'absolute', top: 16, left: 24, width: 40, height: 40, opacity: 0 }}
          />
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
                    <View className="relative mb-6" style={{ opacity: isHeroTransitioning ? 0 : 1 }}>
                      <View
                        ref={heroAvatarBoxRef}
                        className="w-28 h-28 rounded-full items-center justify-center overflow-hidden bg-theme-bg"
                      >
                        <Image
                          source={getCoachAvatarSource(coachTone)}
                          className="w-full h-full"
                        />
                      </View>
                    </View>

                    <Reanimated.View style={heroContentStyle} className="w-full items-center">
                      <View className="w-full mb-8">
                        <Text className="text-theme-text text-[22px] leading-[32px] font-semibold">
                          {typedText}
                          {typedText.length < WELCOME_MESSAGE.length && (
                            <Text className="text-[#FF5A1F]">▌</Text>
                          )}
                        </Text>
                      </View>

                      <Pressable
                        onPress={handleBeginPress}
                        disabled={isHeroTransitioning}
                        className="w-full py-4 rounded-2xl bg-[#FF5A1F] items-center justify-center flex-row gap-2 active:opacity-90"
                      >
                        <Text className="text-white font-extrabold text-lg">{t('onboarding.meetCoachBegin')}</Text>
                        <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
                      </Pressable>

                      <View className="mt-6 px-2 items-center">
                        <Text className="text-theme-muted text-[11px] text-center leading-relaxed">
                          {t('onboarding.agreeToTerms')}{' '}
                          <Text
                            onPress={() => Linking.openURL('https://rooka.io/terms.html')}
                            className="text-theme-accent font-semibold underline"
                          >
                            {t('onboarding.termsOfService')}
                          </Text>
                          {' '}{t('onboarding.andAcknowledge')}{' '}
                          <Text
                            onPress={() => Linking.openURL('https://rooka.io/privacy')}
                            className="text-theme-accent font-semibold underline"
                          >
                            {t('onboarding.privacyPolicy')}
                          </Text>
                          {t('onboarding.termsDisclaimer')}
                        </Text>
                      </View>
                    </Reanimated.View>
                  </View>
                );
              }

              if (node.type === 'coach_typing') {
                return (
                  <View key={node.id} className="flex-row items-start gap-3 mb-4 pr-4">
                    <View className="relative">
                      <Image
                        source={getCoachAvatarSource(coachTone)}
                        className="w-10 h-10 rounded-full"
                      />
                    </View>
                    <View className="flex-1 mt-1 justify-center min-h-[40px]">
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <Text className="text-theme-text font-black text-xs uppercase tracking-wider">Rooka</Text>
                      </View>
                      <TypingDots />
                    </View>
                  </View>
                );
              }

              if (node.type === 'coach_text') {
                if (!node.text?.trim()) return null;
                return (
                  <View key={node.id} className="flex-row items-start gap-3 mb-4 pr-4">
                    <View className="relative" ref={node.id === 'node_welcome_banner' ? firstChatAvatarRef : undefined}>
                      <Image
                        source={getCoachAvatarSource(coachTone)}
                        className="w-10 h-10 rounded-full"
                      />
                    </View>
                    <View className="flex-1 mt-1">
                      <View className="flex-row items-center gap-1.5 mb-1">
                        <Text className="text-theme-text font-black text-xs uppercase tracking-wider">Rooka</Text>
                      </View>
                      <MarkdownText content={node.text || ''} isUser={false} />
                    </View>
                  </View>
                );
              }

              if (node.type === 'user_text') {
                return (
                  <View key={node.id} className="flex-row justify-end mb-7 pl-12">
                    <View className="bg-theme-accent rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] shadow-sm">
                      <Text className="text-white font-medium text-[16px] leading-[24px]">{node.text}</Text>
                    </View>
                  </View>
                );
              }

              if (node.type === 'card_language') {
                const isSelected = !!node.data?.selected;
                const languagesList = [
                  ...SUPPORTED_LANGUAGES,
                  { code: 'more', label: t('onboarding.moreSoon'), flag: '🌐', disabled: true },
                ];
                return (
                  <View
                    key={node.id}
                    className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-5 gap-3 shadow-sm"
                    style={!isSelected ? { borderColor: 'rgba(255, 90, 31, 0.5)' } : undefined}
                  >
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="language" size={20} color="#FF5A1F" />
                      <Text className="text-theme-text font-bold text-sm">{t('onboarding.selectLanguageTitle')}</Text>
                    </View>

                    <View className="flex-row flex-wrap justify-between gap-y-2.5 pt-1">
                      {languagesList.map((lang) => {
                        if (lang.disabled) {
                          return (
                            <View
                              key="more"
                              style={{ width: '48.5%' }}
                              className="py-3 px-3 rounded-xl border border-dashed border-theme-border/60 bg-theme-bg/40 flex-row items-center justify-center gap-2 opacity-60"
                            >
                              <Text className="text-base">🌐</Text>
                              <Text className="text-xs font-semibold text-theme-muted">{lang.label}</Text>
                            </View>
                          );
                        }
                        const active = node.data?.selected === lang.code;
                        return (
                          <Pressable
                            key={lang.code}
                            disabled={isStreamingMessage}
                            style={[
                              { width: '48.5%' },
                              active && { backgroundColor: '#FF5A1F', borderColor: '#FF5A1F' },
                            ]}
                            onPress={() => handleSelectLanguageChoice(lang.code, lang.label)}
                            className="py-3 px-3 rounded-xl border flex-row items-center justify-center gap-2 active:bg-theme-card bg-theme-bg border-theme-border shadow-sm"
                          >
                            <Text className="text-base">{lang.flag}</Text>
                            <Text
                              className="text-xs font-bold text-theme-text"
                              style={active ? { color: '#FFFFFF' } : undefined}
                            >
                              {lang.label}
                            </Text>
                          </Pressable>
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
                    className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-5 gap-3 shadow-sm"
                    style={!isSelected ? { borderColor: 'rgba(255, 90, 31, 0.5)' } : undefined}
                  >
                    <Text className="text-theme-text font-bold text-sm">{t('onboarding.chooseToneTitle')}</Text>

                    <Pressable
                      disabled={isStreamingMessage}
                      onPress={() =>
                        handleSelectPersonaChoice(
                          'Empathetic but demanding elite endurance coach.',
                          t('onboarding.toneEmpatheticShort')
                        )
                      }
                      className="p-3.5 rounded-xl border border-theme-border bg-theme-bg"
                      style={
                        node.data?.selected === t('onboarding.toneEmpatheticShort')
                          ? { borderColor: '#FF5A1F', backgroundColor: 'rgba(255, 90, 31, 0.1)' }
                          : undefined
                      }
                    >
                      <View className="flex-row items-center">
                        <View className="w-10 h-10 rounded-full overflow-hidden border border-theme-border mr-3 bg-theme-bg">
                          <Image
                            source={getCoachAvatarSource('Empathetic but demanding elite endurance coach.')}
                            className="w-full h-full"
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-theme-text font-bold text-xs">{t('onboarding.toneEmpatheticTitle')}</Text>
                          <Text className="text-theme-muted text-[10px] mt-0.5">
                            {t('onboarding.toneEmpatheticDesc')}
                          </Text>
                        </View>
                      </View>
                    </Pressable>

                    <Pressable
                      disabled={isStreamingMessage}
                      onPress={() =>
                        handleSelectPersonaChoice(
                          'Strict with data, but with a dry, snarky British sense of humor.',
                          t('onboarding.toneStrictShort')
                        )
                      }
                      className="p-3.5 rounded-xl border border-theme-border bg-theme-bg"
                      style={
                        node.data?.selected === t('onboarding.toneStrictShort')
                          ? { borderColor: '#FF5A1F', backgroundColor: 'rgba(255, 90, 31, 0.1)' }
                          : undefined
                      }
                    >
                      <View className="flex-row items-center">
                        <View className="w-10 h-10 rounded-full overflow-hidden border border-theme-border mr-3 bg-theme-bg">
                          <Image
                            source={getCoachAvatarSource('Strict with data, but with a dry, snarky British sense of humor.')}
                            className="w-full h-full"
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-theme-text font-bold text-xs">{t('onboarding.toneStrictTitle')}</Text>
                          <Text className="text-theme-muted text-[10px] mt-0.5">
                            {t('onboarding.toneStrictDesc')}
                          </Text>
                        </View>
                      </View>
                    </Pressable>

                    <Pressable
                      disabled={isStreamingMessage}
                      onPress={() =>
                        handleSelectPersonaChoice(
                          'Enthusiastic cheerleader, extremely positive and forgiving.',
                          t('onboarding.toneCheerleaderShort')
                        )
                      }
                      className="p-3.5 rounded-xl border border-theme-border bg-theme-bg"
                      style={
                        node.data?.selected === t('onboarding.toneCheerleaderShort')
                          ? { borderColor: '#FF5A1F', backgroundColor: 'rgba(255, 90, 31, 0.1)' }
                          : undefined
                      }
                    >
                      <View className="flex-row items-center">
                        <View className="w-10 h-10 rounded-full overflow-hidden border border-theme-border mr-3 bg-theme-bg">
                          <Image
                            source={getCoachAvatarSource('Enthusiastic cheerleader, extremely positive and forgiving.')}
                            className="w-full h-full"
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="text-theme-text font-bold text-xs">{t('onboarding.toneCheerleaderTitle')}</Text>
                          <Text className="text-theme-muted text-[10px] mt-0.5">
                            {t('onboarding.toneCheerleaderDesc')}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  </View>
                );
              }

              if (node.type === 'card_gender') {
                const selectedGender = node.data?.selected || gender;
                return (
                  <View
                    key={node.id}
                    className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-5 gap-3 shadow-sm"
                  >
                    <Text className="text-theme-text font-bold text-sm">{t('onboarding.genderTitle')}</Text>
                    <Text className="text-theme-muted text-xs">
                      {t('onboarding.genderSubtitle')}
                    </Text>

                    <View className="gap-2.5 mt-1">
                      {[
                        { label: t('onboarding.genderMale'), val: 'Male', icon: 'male-outline', desc: t('onboarding.genderMaleDesc') },
                        { label: t('onboarding.genderFemale'), val: 'Female', icon: 'female-outline', desc: t('onboarding.genderFemaleDesc') },
                        { label: t('onboarding.genderPreferNot'), val: 'Prefer not to share', icon: 'shield-outline', desc: t('onboarding.genderPreferNotDesc') },
                      ].map((opt) => (
                        <Pressable
                          key={opt.val}
                          disabled={isStreamingMessage}
                          onPress={() => handleSelectGenderChoice(opt.val, opt.label)}
                          className="p-3.5 rounded-xl border border-theme-border bg-theme-bg"
                          style={
                            selectedGender === opt.val
                              ? { borderColor: '#FF5A1F', backgroundColor: 'rgba(255, 90, 31, 0.1)' }
                              : undefined
                          }
                        >
                          <View className="flex-row items-center">
                            <View className="w-9 h-9 rounded-full bg-[#FF5A1F]/15 items-center justify-center mr-3">
                              <Ionicons name={opt.icon as any} size={18} color="#FF5A1F" />
                            </View>
                            <View className="flex-1">
                              <Text className="text-theme-text font-bold text-xs">{opt.label}</Text>
                              <Text className="text-theme-muted text-[10px] mt-0.5">{opt.desc}</Text>
                            </View>
                            {selectedGender === opt.val && (
                              <Ionicons name="checkmark-circle" size={18} color="#FF5A1F" />
                            )}
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              }

              if (node.type === 'card_context_event') {
                const isCompleted = !!node.data?.completed;
                return (
                  <View
                    key={node.id}
                    className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-5 gap-4 shadow-sm"
                    style={!isCompleted ? { borderColor: 'rgba(255, 90, 31, 0.5)' } : undefined}
                  >
                    <Text className="text-theme-text font-bold text-sm">{t('onboarding.contextTitle')}</Text>

                    <TextInput
                      editable={!isStreamingMessage}
                      multiline
                      numberOfLines={4}
                      value={athleteContext}
                      onChangeText={handleAthleteContextChange}
                      placeholder={t('onboarding.contextPlaceholder')}
                      placeholderTextColor="#8E8E93"
                      className="p-4 bg-theme-bg border border-theme-border rounded-xl text-theme-text text-xs min-h-[90px]"
                      style={{ textAlignVertical: 'top' }}
                    />

                    {/* Physiological Baselines */}
                    <View className="bg-theme-bg border border-theme-border rounded-xl p-3 gap-2">
                      <Text className="text-theme-muted text-[10px] font-bold uppercase tracking-wider">
                        {t('onboarding.baselinesTitle')}
                      </Text>
                      {metrics.map((item, idx) => (
                        <View key={idx} className="flex-row gap-2">
                          <TextInput
                            editable={!isStreamingMessage}
                            placeholder={t('onboarding.baselinePlaceholderLabel')}
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
                            placeholder={t('onboarding.baselinePlaceholderValue')}
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
                      <Pressable
                        disabled={isStreamingMessage}
                        onPress={addMetricRow}
                        className="py-1.5 items-center bg-[#FF5A1F]/10 border border-[#FF5A1F]/30 rounded-lg mt-1"
                      >
                        <Text className="text-[#FF5A1F] text-xs font-bold">{t('onboarding.addMetric')}</Text>
                      </Pressable>
                    </View>

                    {/* Main Goal Event Setup */}
                    <View className="bg-theme-bg border border-theme-border rounded-xl p-3 gap-2.5">
                      <Text className="text-theme-muted text-[10px] font-bold uppercase tracking-wider">
                        {t('onboarding.targetEventTitle')}
                      </Text>
                      <TextInput
                        editable={!isStreamingMessage}
                        placeholder={t('onboarding.raceNamePlaceholder')}
                        placeholderTextColor="#8E8E93"
                        value={raceName}
                        onChangeText={handleRaceNameChange}
                        className="p-2.5 bg-theme-card border border-theme-border rounded-lg text-theme-text text-xs"
                      />
                      <View className="flex-row gap-2">
                        <Pressable
                          disabled={isStreamingMessage}
                          onPress={openDatePickerModal}
                          className="flex-1 p-2.5 bg-theme-card border border-theme-border rounded-lg flex-row items-center justify-between"
                        >
                          <Text className={raceDate ? 'text-theme-text text-xs font-medium' : 'text-theme-muted text-xs'}>
                            {raceDate || t('onboarding.raceDatePlaceholder')}
                          </Text>
                          <Ionicons name="calendar-outline" size={16} color="#8E8E93" />
                        </Pressable>

                        <View className="w-28 p-2.5 bg-theme-card border border-theme-border rounded-lg flex-row items-center justify-center relative">
                          {isEstimatingCtl ? (
                            <View className="flex-row items-center gap-1">
                              <ActivityIndicator size="small" color="#FF5A1F" />
                              <Text className="text-[10px] text-[#FF5A1F] font-bold">Rooka...</Text>
                            </View>
                          ) : (
                            <>
                              <TextInput
                                editable={!isStreamingMessage}
                                placeholder={t('onboarding.targetCtlPlaceholder')}
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
                                  <Text className="text-[8px] text-white font-bold">⚡️ Rooka</Text>
                                </View>
                              )}
                            </>
                          )}
                        </View>
                      </View>
                    </View>

                    <Pressable
                      disabled={isStreamingMessage}
                      onPress={handleConfirmContextAndEvent}
                      className="w-full py-3 bg-[#FF5A1F] rounded-xl items-center justify-center shadow-md"
                    >
                      <Text className="text-white font-bold text-xs">
                        {isCompleted ? t('onboarding.updateContextEventBtn') : t('onboarding.confirmContextEventBtn')}
                      </Text>
                    </Pressable>
                  </View>
                );
              }

              if (node.type === 'card_schedule') {
                const isCompleted = !!node.data?.completed;
                return (
                  <View
                    key={node.id}
                    className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-5 gap-3 shadow-sm"
                    style={!isCompleted ? { borderColor: 'rgba(255, 90, 31, 0.5)' } : undefined}
                  >
                    <Text className="text-theme-text font-bold text-sm">{t('onboarding.scheduleTitle')}</Text>
                    <Text className="text-theme-muted text-xs">
                      {t('onboarding.scheduleSubtitle')}
                    </Text>

                    <View className="gap-3 pt-1">
                      {DAYS.map((day) => {
                        const currentVal = availability[day]?.maxMinutes || 0;
                        return (
                          <View key={day} className="bg-theme-bg p-3 rounded-xl border border-theme-border gap-2">
                            <View className="flex-row items-center justify-between">
                              <Text className="text-theme-text font-bold text-xs">{day}</Text>
                              <Text className="text-[#FF5A1F] font-bold text-xs">
                                {currentVal === 0 ? t('onboarding.restDay') : t('onboarding.mins', { count: currentVal })}
                              </Text>
                            </View>

                            <View className="flex-row gap-1 justify-between">
                              {DURATION_OPTIONS.map((opt) => {
                                const isSelected = currentVal === opt.value;
                                return (
                                  <Pressable
                                    key={opt.value}
                                    disabled={isStreamingMessage}
                                    onPress={() => handleDayDurationChange(day, opt.value)}
                                    className="flex-1 py-1.5 rounded-lg items-center justify-center border bg-theme-card border-theme-border"
                                    style={
                                      isSelected
                                        ? { backgroundColor: '#FF5A1F', borderColor: '#FF5A1F' }
                                        : undefined
                                    }
                                  >
                                    <Text
                                      className="text-[10px] font-bold text-theme-muted"
                                      style={isSelected ? { color: '#FFFFFF' } : undefined}
                                    >
                                      {opt.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    <Pressable
                      disabled={isStreamingMessage}
                      onPress={handleConfirmScheduleChoice}
                      className="w-full py-3 bg-[#FF5A1F] rounded-xl items-center justify-center shadow-md mt-2"
                    >
                      <Text className="text-white font-bold text-xs">
                        {isCompleted ? t('onboarding.updateScheduleBtn') : t('onboarding.confirmScheduleBtn')}
                      </Text>
                    </Pressable>
                  </View>
                );
              }

              if (node.type === 'card_integrations') {
                const isCompleted = !!node.data?.completed;
                const isGarminActive = isGarminSaved || !!user?.garmin_connected;
                const isStravaActive = !!user?.strava_connected;

                return (
                  <View
                    key={node.id}
                    className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-5 gap-3 shadow-sm"
                    style={!isCompleted ? { borderColor: 'rgba(255, 90, 31, 0.5)' } : undefined}
                  >
                    <Text className="text-theme-text font-bold text-sm">{t('onboarding.integrationsTitle')}</Text>

                    {/* Garmin Connect */}
                    <View className="bg-theme-bg border border-theme-border rounded-xl p-3.5 gap-3">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3 flex-1 mr-2">
                          <Ionicons name="watch-outline" size={20} color="#007ACC" />
                          <View className="flex-1">
                            <View className="flex-row items-center gap-1.5 flex-wrap">
                              <Text className="text-theme-text font-bold text-xs">{t('onboarding.garminTitle')}</Text>
                              {isGarminActive && (
                                <View className="bg-green-500/10 px-1.5 py-0.5 rounded flex-row items-center gap-1">
                                  <Ionicons name="checkmark-circle" size={10} color="#22C55E" />
                                  <Text className="text-green-500 text-[9px] font-bold">
                                    {t('onboarding.garminConnectedBadge')}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text className="text-theme-muted text-[10px]">{t('onboarding.garminSubtitle')}</Text>
                          </View>
                        </View>
                        <Switch
                          disabled={isStreamingMessage || isSavingGarmin}
                          value={showGarmin}
                          onValueChange={(val) => {
                            setShowGarmin(val);
                          }}
                          trackColor={{ false: '#3A3A3C', true: '#FF5A1F' }}
                        />
                      </View>

                      {showGarmin && (
                        <View className="pt-2 gap-2 border-t border-theme-border">
                          {isGarminActive && (
                            <View className="bg-green-500/10 border border-green-500/20 rounded-lg p-2.5 flex-row items-center justify-between">
                              <View className="flex-row items-center gap-2 flex-1 mr-2">
                                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                                <View className="flex-1">
                                  <Text className="text-green-400 font-bold text-xs">
                                    {garminSaveSuccessMsg || t('onboarding.garminSavedSuccess')}
                                  </Text>
                                  <Text className="text-theme-muted text-[10px]" numberOfLines={1}>
                                    {t('onboarding.garminConnectedStatus')}: {garminEmail || (user as any)?.garmin_username || (user as any)?.garminUsername || 'Garmin User'}
                                  </Text>
                                </View>
                              </View>
                              <Pressable
                                disabled={isSavingGarmin}
                                onPress={handleDisconnectGarmin}
                                className="px-2 py-1 bg-theme-bg/60 rounded border border-theme-border"
                              >
                                <Text className="text-red-400 font-medium text-[10px]">
                                  {t('onboarding.garminDisconnectBtn')}
                                </Text>
                              </Pressable>
                            </View>
                          )}

                          <TextInput
                            editable={!isStreamingMessage && !isSavingGarmin}
                            placeholder={t('onboarding.garminUserPlaceholder')}
                            placeholderTextColor="#8E8E93"
                            value={garminEmail}
                            onChangeText={(text) => {
                              setGarminEmail(text);
                              setIsGarminSaved(false);
                              setGarminError(null);
                              setGarminSaveSuccessMsg(null);
                            }}
                            autoCapitalize="none"
                            className="p-2.5 bg-theme-card border border-theme-border rounded-lg text-theme-text text-xs"
                          />
                          <TextInput
                            editable={!isStreamingMessage && !isSavingGarmin}
                            placeholder={t('onboarding.garminPassPlaceholder')}
                            placeholderTextColor="#8E8E93"
                            secureTextEntry
                            value={garminPassword}
                            onChangeText={(text) => {
                              setGarminPassword(text);
                              setIsGarminSaved(false);
                              setGarminError(null);
                              setGarminSaveSuccessMsg(null);
                            }}
                            autoCapitalize="none"
                            className="p-2.5 bg-theme-card border border-theme-border rounded-lg text-theme-text text-xs"
                          />

                          {garminError && (
                            <View className="flex-row items-center gap-1.5 px-1">
                              <Ionicons name="alert-circle" size={13} color="#EF4444" />
                              <Text className="text-red-400 text-[10px] flex-1">{garminError}</Text>
                            </View>
                          )}

                          <Pressable
                            disabled={isStreamingMessage || isSavingGarmin || !garminEmail.trim() || !garminPassword.trim()}
                            onPress={handleSaveGarmin}
                            className={`py-2 px-3 rounded-lg flex-row items-center justify-center gap-1.5 ${!garminEmail.trim() || !garminPassword.trim()
                                ? 'bg-[#007ACC]/50 opacity-60'
                                : 'bg-[#007ACC]'
                              }`}
                          >
                            {isSavingGarmin ? (
                              <>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text className="text-white font-bold text-xs">{t('onboarding.garminSavingBtn')}</Text>
                              </>
                            ) : (
                              <>
                                <Ionicons name="cloud-upload-outline" size={14} color="#FFFFFF" />
                                <Text className="text-white font-bold text-xs">{t('onboarding.garminSaveBtn')}</Text>
                              </>
                            )}
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {/* Strava Connect */}
                    <View className="bg-theme-bg border border-theme-border rounded-xl p-3.5 gap-2">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2 flex-1 mr-2">
                          <Ionicons name="bicycle" size={18} color="#FC4C02" />
                          <View className="flex-1">
                            <View className="flex-row items-center gap-1.5 flex-wrap">
                              <Text className="text-theme-text font-bold text-xs">{t('onboarding.stravaTitle')}</Text>
                              {isStravaActive && (
                                <View className="bg-green-500/10 px-1.5 py-0.5 rounded flex-row items-center gap-1">
                                  <Ionicons name="checkmark-circle" size={10} color="#22C55E" />
                                  <Text className="text-green-500 text-[9px] font-bold">
                                    {t('onboarding.stravaConnectedBadge')}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text className="text-theme-muted text-[10px]">{t('onboarding.stravaSubtitle')}</Text>
                          </View>
                        </View>

                        {isStravaActive ? (
                          <View className="flex-row items-center gap-1.5">
                            <Pressable
                              disabled={isStreamingMessage || isConnectingStrava}
                              onPress={handleConnectStravaOAuth}
                              className="bg-theme-card border border-theme-border px-2.5 py-1.5 rounded-lg flex-row items-center gap-1"
                            >
                              {isConnectingStrava ? (
                                <ActivityIndicator size="small" color="#8E8E93" />
                              ) : (
                                <Text className="text-theme-muted text-[10px] font-semibold">
                                  {t('onboarding.stravaReconnectBtn')}
                                </Text>
                              )}
                            </Pressable>
                            <Pressable
                              disabled={isStreamingMessage || isConnectingStrava}
                              onPress={handleDisconnectStrava}
                              className="px-2 py-1.5 bg-theme-card border border-theme-border rounded-lg"
                            >
                              <Text className="text-red-400 font-medium text-[10px]">
                                {t('onboarding.stravaDisconnectBtn')}
                              </Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            disabled={isStreamingMessage || isConnectingStrava}
                            onPress={handleConnectStravaOAuth}
                            className="bg-[#FC4C02] px-3 py-1.5 rounded-lg flex-row items-center gap-1.5"
                          >
                            {isConnectingStrava ? (
                              <>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                <Text className="text-white font-bold text-[10px]">
                                  {t('onboarding.stravaConnecting')}
                                </Text>
                              </>
                            ) : (
                              <Text className="text-white font-bold text-[10px]">
                                {t('onboarding.connectStrava')}
                              </Text>
                            )}
                          </Pressable>
                        )}
                      </View>

                      {stravaSuccessMsg && isStravaActive && (
                        <View className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 flex-row items-center gap-1.5 mt-1">
                          <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                          <Text className="text-green-400 font-semibold text-[10px] flex-1">
                            {stravaSuccessMsg}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Pressable
                      disabled={isStreamingMessage || isSavingGarmin || isConnectingStrava}
                      onPress={handleConfirmIntegrationsChoice}
                      className="w-full py-3 bg-[#FF5A1F] rounded-xl items-center justify-center shadow-md mt-2"
                    >
                      <Text className="text-white font-bold text-xs">
                        {isCompleted ? t('onboarding.updateIntegrationsBtn') : t('onboarding.confirmIntegrationsBtn')}
                      </Text>
                    </Pressable>
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
                      <Text className="text-theme-text font-extrabold text-lg text-center">{t('onboarding.paywallTitle')}</Text>
                      <Text className="text-theme-muted text-xs text-center mt-1">
                        {t('onboarding.paywallSubtitle')}
                      </Text>
                    </View>

                    {/* Pricing Tiers */}
                    <View className="flex-row gap-3">
                      <Pressable
                        onPress={() => setSelectedPlan('annual')}
                        className="flex-1 p-3.5 rounded-2xl border border-theme-border bg-theme-bg"
                        style={
                          selectedPlan === 'annual'
                            ? { borderColor: '#FF5A1F', backgroundColor: 'rgba(255, 90, 31, 0.1)' }
                            : undefined
                        }
                      >
                        <View className="self-start px-2 py-0.5 bg-[#FF5A1F] rounded-full mb-1.5">
                          <Text className="text-white font-bold text-[9px]">{t('onboarding.savePercent')}</Text>
                        </View>
                        <Text className="text-theme-text font-bold text-sm">{t('onboarding.annual')}</Text>
                        <Text className="text-[#FF5A1F] font-bold text-lg mt-0.5">
                          {t('onboarding.annualPrice')}<Text className="text-xs text-theme-muted">{t('onboarding.annualPeriod')}</Text>
                        </Text>
                        <Text className="text-theme-muted text-[9px] mt-0.5">{t('onboarding.annualBilled')}</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => setSelectedPlan('monthly')}
                        className="flex-1 p-3.5 rounded-2xl border border-theme-border bg-theme-bg"
                        style={
                          selectedPlan === 'monthly'
                            ? { borderColor: '#FF5A1F', backgroundColor: 'rgba(255, 90, 31, 0.1)' }
                            : undefined
                        }
                      >
                        <Text className="text-theme-text font-bold text-sm mt-4">{t('onboarding.monthly')}</Text>
                        <Text className="text-theme-text font-bold text-lg mt-0.5">
                          {t('onboarding.monthlyPrice')}<Text className="text-xs text-theme-muted">{t('onboarding.monthlyPeriod')}</Text>
                        </Text>
                        <Text className="text-theme-muted text-[9px] mt-0.5">{t('onboarding.monthlyBilled')}</Text>
                      </Pressable>
                    </View>

                    {/* Feature Checklist */}
                    <View className="bg-theme-bg border border-theme-border rounded-xl p-3.5 gap-2">
                      {[
                        t('onboarding.feat1'),
                        t('onboarding.feat2'),
                        t('onboarding.feat3'),
                        t('onboarding.feat4'),
                      ].map((feat, idx) => (
                        <View key={idx} className="flex-row items-center gap-2">
                          <Ionicons name="checkmark-circle" size={16} color="#FF5A1F" />
                          <Text className="text-theme-text text-xs flex-1">{feat}</Text>
                        </View>
                      ))}
                    </View>

                    <View className="gap-2 pt-2">
                      <Pressable
                        onPress={() => handleCompleteSetup(true)}
                        disabled={isSubmitting}
                        className="w-full py-4 rounded-xl bg-[#FF5A1F] items-center justify-center shadow-lg"
                      >
                        {isSubmitting ? (
                          <ActivityIndicator color="white" />
                        ) : (
                          <Text className="text-white font-extrabold text-sm">{t('onboarding.startTrialBtn')}</Text>
                        )}
                      </Pressable>

                      <Pressable
                        onPress={() => handleCompleteSetup(false)}
                        disabled={isSubmitting}
                        className="w-full py-3 rounded-xl border border-theme-border bg-theme-bg items-center justify-center"
                      >
                        <Text className="text-theme-muted text-xs font-bold">{t('onboarding.freeTierBtn')}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }

              return null;
            })}
          </ScrollView>
        </Reanimated.View>
      </SafeAreaView>

      {/* Floating clone of the coach avatar used purely for the hero -> chat handoff animation.
          Deliberately rendered OUTSIDE the SafeAreaView, in this padding-free wrapper, so its
          absolute top/left line up 1:1 with the raw measureInWindow() coordinates below —
          no need to reason about how RN treats a positioned ancestor's own padding. */}
      <Reanimated.View
        pointerEvents="none"
        style={[{ position: 'absolute', overflow: 'hidden' }, avatarOverlayStyle]}
      >
        <Image
          source={getCoachAvatarSource(coachTone)}
          style={{ width: '100%', height: '100%' }}
        />
      </Reanimated.View>
    </View>
  );
}
