import React, { useState, useRef } from 'react';
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
  NativeSyntheticEvent,
  NativeScrollEvent,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { userApi, integrationsApi } from '../../services/apiServices';
import { useUser } from '../../context/UserStore';

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

export default function OnboardingWizard() {
  const router = useRouter();
  const { user, refreshUser, updateUser } = useUser();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6;
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Persona
  const [coachTone, setCoachTone] = useState(
    user?.coach_tone || 'Empathetic but demanding elite endurance coach.'
  );

  // Step 2: Context & Metrics
  const [athleteContext, setAthleteContext] = useState(user?.athlete_context || '');
  const [metrics, setMetrics] = useState<{ label: string; value: string }[]>([
    { label: 'FTP (Watts)', value: user?.athlete_metrics?.ftp?.toString() || '' },
    { label: 'Max HR', value: user?.athlete_metrics?.max_hr?.toString() || '' },
    { label: 'Resting HR', value: user?.athlete_metrics?.resting_hr?.toString() || '' },
  ]);

  // Step 4: Schedule
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
  const [showDatePicker, setShowDatePicker] = useState(false);

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
      let estimated = 75; // default fallback

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
        estimated = 42;
      } else if (lower.includes('5k')) {
        estimated = 35;
      } else if (lower.includes('fondo') || lower.includes('century')) {
        estimated = 75;
      } else if (lower.includes('triathlon') || lower.includes('olympic')) {
        estimated = 60;
      }

      setTargetCtl(estimated.toString());
      setIsEstimatingCtl(false);
      setIsAiFilled(true);
    }, 600);
  };

  // Wheel Picker Date State
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentYear = new Date().getFullYear();
  const YEARS = Array.from({ length: 6 }, (_, i) => Math.max(2026, currentYear) + i);

  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
  const [pickerDay, setPickerDay] = useState(new Date().getDate());
  const [pickerYear, setPickerYear] = useState(Math.max(2026, currentYear));

  const daysInSelectedMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
  const PICKER_DAYS = Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1);

  const handleSetPickerMonth = (m: number) => {
    setPickerMonth(m);
    const maxDays = new Date(pickerYear, m + 1, 0).getDate();
    if (pickerDay > maxDays) setPickerDay(maxDays);
  };

  const handleSetPickerYear = (y: number) => {
    setPickerYear(y);
    const maxDays = new Date(y, pickerMonth + 1, 0).getDate();
    if (pickerDay > maxDays) setPickerDay(maxDays);
  };

  const isSelectedDateInPast = () => {
    const selected = new Date(pickerYear, pickerMonth, pickerDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected < today;
  };

  const openDatePickerModal = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (raceDate) {
      const parts = raceDate.split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
        if (parsed >= today) {
          setPickerYear(parts[0]);
          setPickerMonth(parts[1] - 1);
          setPickerDay(parts[2]);
          setShowDatePicker(true);
          return;
        }
      }
    }

    setPickerYear(Math.max(2026, today.getFullYear()));
    setPickerMonth(today.getMonth());
    setPickerDay(today.getDate());
    setShowDatePicker(true);
  };

  const horizontalScrollRef = useRef<ScrollView>(null);

  const handleConfirmWheelDate = () => {
    if (isSelectedDateInPast()) {
      Alert.alert('Invalid Date', 'Goal event date cannot be in the past. Please select today or a future date.');
      return;
    }
    const m = (pickerMonth + 1).toString().padStart(2, '0');
    const d = pickerDay.toString().padStart(2, '0');
    setRaceDate(`${pickerYear}-${m}-${d}`);
    setShowDatePicker(false);
  };

  // Step 6: Subscription Placeholder State
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');

  const addMetricRow = () => {
    setMetrics([...metrics, { label: '', value: '' }]);
  };

  const handleCompleteSetup = async (isUpgrade = false) => {
    setIsSubmitting(true);
    try {
      if (isUpgrade) {
        await userApi.trackSparkPlusClick();
      }

      // Save Coach settings
      const formattedAvailability = Object.keys(availability).reduce((acc: any, day) => {
        acc[day] = availability[day].available ? availability[day].maxMinutes : 0;
        return acc;
      }, {});

      const formattedMetricsContext = metrics
        .filter((m) => m.label.trim() && m.value.trim())
        .map((m) => `${m.label}: ${m.value}`)
        .join(', ');

      let cleanContext = athleteContext.trim();
      if (cleanContext === 'New athlete.' || cleanContext === 'No context provided yet.') {
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

  const goToStep = (targetStep: number) => {
    const valid = Math.max(1, Math.min(totalSteps, targetStep));
    setCurrentStep(valid);
    horizontalScrollRef.current?.scrollTo({
      x: (valid - 1) * SCREEN_WIDTH,
      animated: true,
    });
  };

  const nextStep = () => {
    goToStep(currentStep + 1);
  };

  const prevStep = () => {
    goToStep(currentStep - 1);
  };

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newStep = Math.round(offsetX / SCREEN_WIDTH) + 1;
    if (newStep >= 1 && newStep <= totalSteps && newStep !== currentStep) {
      setCurrentStep(newStep);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-theme-bg" edges={['top', 'bottom']}>
      {/* Date Picker Modal (iOS Native Wheel Style) */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
          className="flex-1 bg-black/50 justify-end"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            className="w-full bg-white dark:bg-zinc-900 rounded-t-3xl pb-8 shadow-2xl border-t border-theme-border"
          >
            {/* Header: Cancel (Left), Confirm (Right) */}
            <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-800">
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text className="text-gray-500 text-base font-normal">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleConfirmWheelDate}>
                <Text className={isSelectedDateInPast() ? "text-gray-400 dark:text-zinc-600 text-base font-bold" : "text-emerald-600 dark:text-emerald-400 text-base font-bold"}>
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>

            {isSelectedDateInPast() && (
              <View className="bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg mx-6 mt-3">
                <Text className="text-amber-600 dark:text-amber-400 text-xs text-center font-medium">
                  Goal date cannot be in the past
                </Text>
              </View>
            )}

            {/* Wheel Columns Container */}
            <View className="h-52 my-2 relative justify-center">
              {/* Selection Bar Borders (middle 44px) */}
              <View
                style={{ top: 84, height: 44 }}
                className="absolute left-4 right-4 border-y border-gray-300 dark:border-zinc-700 pointer-events-none"
              />

              <View className="flex-row h-full px-2">
                {/* Month Column */}
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  snapToInterval={44}
                  decelerationRate="fast"
                  contentContainerStyle={{ paddingVertical: 84 }}
                  className="flex-2"
                >
                  {MONTHS.map((m, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleSetPickerMonth(idx)}
                      style={{ height: 44 }}
                      className="items-center justify-center"
                    >
                      <Text
                        className={`text-center text-lg ${
                          pickerMonth === idx
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
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Header Stepper */}
      <View className="px-6 pt-4 pb-2 border-b border-theme-border flex-row items-center justify-between">
        <View className="flex-row items-center space-x-2">
          {currentStep > 1 && (
            <TouchableOpacity
              onPress={prevStep}
              className="mr-1 p-1 -ml-2 rounded-full active:bg-theme-card"
            >
              <Ionicons name="chevron-back" size={24} color="#FF5A1F" />
            </TouchableOpacity>
          )}
          <View>
            <Text className="text-theme-text text-xl font-bold font-barlow">Setup Wizard</Text>
            <Text className="text-theme-muted text-xs">Step {currentStep} of {totalSteps}</Text>
          </View>
        </View>
        <View className="flex-row space-x-1">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <View
              key={idx}
              className={`h-2 rounded-full ${
                idx + 1 === currentStep
                  ? 'w-6 bg-theme-accent'
                  : idx + 1 < currentStep
                  ? 'w-2 bg-theme-accent/50'
                  : 'w-2 bg-theme-border'
              }`}
            />
          ))}
        </View>
      </View>

      <ScrollView
        ref={horizontalScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        className="flex-1"
      >
        {/* STEP 1: COACH PERSONA */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-6 pt-6"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            <View className="space-y-4">
              <Text className="text-theme-muted text-xs font-bold uppercase tracking-wider">
                1. Choose Coach Persona Tone
              </Text>
              <Text className="text-theme-text text-sm">
                Select how Spark communicates with you during post-workout feedback and chat.
              </Text>

              <TouchableOpacity
                onPress={() => setCoachTone('Empathetic but demanding elite endurance coach.')}
                className={`p-4 rounded-xl border-2 ${
                  coachTone === 'Empathetic but demanding elite endurance coach.'
                    ? 'border-theme-accent bg-theme-card'
                    : 'border-theme-border bg-theme-bg'
                }`}
              >
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-full bg-theme-accent/20 items-center justify-center mr-3">
                    <Ionicons name="sparkles" size={24} color="#FF5A1F" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-theme-text font-bold text-base">Empathetic & Demanding (Default)</Text>
                    <Text className="text-theme-muted text-xs mt-1">
                      Balanced, supportive, but holds you accountable to your target goals.
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setCoachTone('Strict with data, but with a dry, snarky British sense of humor.')}
                className={`p-4 rounded-xl border-2 ${
                  coachTone === 'Strict with data, but with a dry, snarky British sense of humor.'
                    ? 'border-theme-accent bg-theme-card'
                    : 'border-theme-border bg-theme-bg'
                }`}
              >
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-full bg-purple-500/20 items-center justify-center mr-3">
                    <Ionicons name="analytics" size={24} color="#a855f7" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-theme-text font-bold text-base">Data Nerd & Snarky</Text>
                    <Text className="text-theme-muted text-xs mt-1">
                      Analytical, strictly focuses on PMC numbers, dry British humor.
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setCoachTone('Enthusiastic cheerleader, extremely positive and forgiving.')}
                className={`p-4 rounded-xl border-2 ${
                  coachTone === 'Enthusiastic cheerleader, extremely positive and forgiving.'
                    ? 'border-theme-accent bg-theme-card'
                    : 'border-theme-border bg-theme-bg'
                }`}
              >
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-full bg-emerald-500/20 items-center justify-center mr-3">
                    <Ionicons name="heart" size={24} color="#10b981" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-theme-text font-bold text-base">Positive Cheerleader</Text>
                    <Text className="text-theme-muted text-xs mt-1">
                      Always encouraging, highly empathetic, focuses on consistency over perfection.
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* STEP 2: ATHLETE CONTEXT */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-6 pt-6"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            <View className="space-y-4">
              <Text className="text-theme-muted text-xs font-bold uppercase tracking-wider">
                2. Tell Us About Yourself
              </Text>
              <Text className="text-theme-text text-sm">
                Provide context to help Spark tailor your workouts around work, family, and preferences.
              </Text>

              <TextInput
                multiline
                numberOfLines={4}
                value={athleteContext}
                onChangeText={setAthleteContext}
                placeholder="e.g. Amateur triathlete, parent of 2 kids, prefers lunch workout runs..."
                placeholderTextColor="#8E8E93"
                className="p-4 bg-theme-card border border-theme-border rounded-xl text-theme-text text-sm min-h-[100px]"
                style={{ textAlignVertical: 'top' }}
              />

              <View className="bg-theme-card border border-theme-border rounded-xl p-4 mt-2">
                <Text className="text-theme-muted text-xs font-bold uppercase tracking-wider mb-2">
                  Physiological Baselines (Optional)
                </Text>
                {metrics.map((item, idx) => (
                  <View key={idx} className="flex-row space-x-2 mb-2">
                    <TextInput
                      placeholder="Label (e.g. FTP)"
                      placeholderTextColor="#8E8E93"
                      value={item.label}
                      onChangeText={(val) => {
                        const updated = [...metrics];
                        updated[idx].label = val;
                        setMetrics(updated);
                      }}
                      className="flex-1 p-3 bg-theme-bg border border-theme-border rounded-lg text-theme-text text-xs"
                    />
                    <TextInput
                      placeholder="Value"
                      placeholderTextColor="#8E8E93"
                      value={item.value}
                      onChangeText={(val) => {
                        const updated = [...metrics];
                        updated[idx].value = val;
                        setMetrics(updated);
                      }}
                      className="w-28 p-3 bg-theme-bg border border-theme-border rounded-lg text-theme-text text-xs"
                    />
                  </View>
                ))}
                <TouchableOpacity
                  onPress={addMetricRow}
                  className="mt-2 py-2 items-center bg-theme-accent/10 border border-theme-accent/30 rounded-lg"
                >
                  <Text className="text-theme-accent text-xs font-bold">+ Add Metric</Text>
                </TouchableOpacity>
              </View>

              {/* Goal Race Setup */}
              <View className="bg-theme-card border border-theme-border rounded-xl p-4 space-y-3 mt-2">
                <Text className="text-theme-muted text-xs font-bold uppercase tracking-wider">
                  Main Target Event
                </Text>
                <TextInput
                  placeholder="Race Name (e.g. Amsterdam Marathon)"
                  placeholderTextColor="#8E8E93"
                  value={raceName}
                  onChangeText={handleRaceNameChange}
                  className="p-3 bg-theme-bg border border-theme-border rounded-lg text-theme-text text-xs"
                />
                <View className="flex-row space-x-2">
                  <TouchableOpacity
                    onPress={openDatePickerModal}
                    className="flex-1 p-3 bg-theme-bg border border-theme-border rounded-lg flex-row items-center justify-between"
                  >
                    <Text className={raceDate ? "text-theme-text text-xs font-medium" : "text-theme-muted text-xs"}>
                      {raceDate || "Date (YYYY-MM-DD)"}
                    </Text>
                    <Ionicons name="calendar-outline" size={16} color="#8E8E93" />
                  </TouchableOpacity>

                  <View className="w-28 p-3 bg-theme-bg border border-theme-border rounded-lg flex-row items-center justify-center relative">
                    {isEstimatingCtl ? (
                      <View className="flex-row items-center space-x-1">
                        <ActivityIndicator size="small" color="#FF5A1F" />
                        <Text className="text-[10px] text-theme-accent font-bold">Spark...</Text>
                      </View>
                    ) : (
                      <>
                        <TextInput
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
                          <View className="absolute -top-2 -right-1 bg-theme-accent px-1.5 py-0.5 rounded-full">
                            <Text className="text-[8px] text-white font-bold">⚡️ Spark</Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* STEP 3: SPARK & LEVELING */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-6 pt-6"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            <View className="space-y-4">
              <Text className="text-theme-muted text-xs font-bold uppercase tracking-wider">
                3. Spark Points & Progression
              </Text>

              <View className="bg-theme-card border border-theme-border rounded-2xl p-5">
                <View className="w-12 h-12 rounded-full bg-amber-500/20 items-center justify-center mb-3">
                  <Ionicons name="flash" size={26} color="#f59e0b" />
                </View>
                <Text className="text-theme-text font-bold text-lg mb-1">What is Spark?</Text>
                <Text className="text-theme-muted text-xs leading-relaxed">
                  Spark is your core XP currency. Every run, cycle, swim, or strength session logged earns Spark points based on intensity and duration.
                </Text>
              </View>

              <View className="bg-theme-card border border-theme-border rounded-2xl p-5">
                <View className="w-12 h-12 rounded-full bg-theme-accent/20 items-center justify-center mb-3">
                  <Ionicons name="trending-up" size={26} color="#FF5A1F" />
                </View>
                <Text className="text-theme-text font-bold text-lg mb-1">Leveling Up</Text>
                <Text className="text-theme-muted text-xs leading-relaxed">
                  As your cumulative Spark grows, you unlock higher Spark Levels. Your rank is showcased on community leaderboards, and Spark celebrates your level milestones!
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* STEP 4: WEEKLY SCHEDULE AVAILABILITY */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-6 pt-6"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            <View className="space-y-4">
              <Text className="text-theme-muted text-xs font-bold uppercase tracking-wider">
                4. Weekly Schedule Availability
              </Text>
              <Text className="text-theme-text text-sm">
                Configure available days and maximum training minutes. Spark will distribute weekly volume within these bounds.
              </Text>

              {DAYS.map((day) => {
                const dayData = availability[day] || { available: true, maxMinutes: 60 };
                const currentMins = dayData.available ? dayData.maxMinutes : 0;
                const isRestDay = currentMins === 0;

                return (
                  <View
                    key={day}
                    className="p-3 bg-theme-card border border-theme-border rounded-xl space-y-2"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-theme-text font-bold text-base">{day}</Text>
                      <Text className={`text-xs font-semibold ${isRestDay ? 'text-theme-muted italic' : 'text-theme-accent'}`}>
                        {isRestDay ? 'Rest Day' : `${currentMins} mins max`}
                      </Text>
                    </View>

                    <View className="flex-row items-center justify-between pt-1 space-x-1.5">
                      {DURATION_OPTIONS.map((opt) => {
                        const isSelected = currentMins === opt.value;
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            onPress={() =>
                              setAvailability({
                                ...availability,
                                [day]: { available: opt.value > 0, maxMinutes: opt.value },
                              })
                            }
                            className={`flex-1 py-1.5 rounded-lg border items-center justify-center ${
                              isSelected
                                ? 'bg-theme-accent border-theme-accent'
                                : 'bg-theme-bg border-theme-border'
                            }`}
                          >
                            <Text
                              className={`text-xs font-bold ${
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
          </ScrollView>
        </View>

        {/* STEP 5: INTEGRATIONS & SYNC */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-6 pt-6"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            <View className="space-y-4">
              <Text className="text-theme-muted text-xs font-bold uppercase tracking-wider">
                5. Integrations & Sync
              </Text>

              {/* Garmin Connect Toggle & Credentials */}
              <View className="bg-theme-card border border-theme-border rounded-xl p-4 space-y-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center space-x-3">
                    <Ionicons name="watch-outline" size={22} color="#007ACC" />
                    <View>
                      <Text className="text-theme-text font-bold text-sm">Garmin Connect</Text>
                      <Text className="text-theme-muted text-xs">Sync daily workouts & HRV</Text>
                    </View>
                  </View>
                  <Switch
                    value={showGarmin}
                    onValueChange={setShowGarmin}
                    trackColor={{ false: '#3A3A3C', true: '#FF5A1F' }}
                  />
                </View>

                {showGarmin && (
                  <View className="pt-2 space-y-2 border-t border-theme-border">
                    <TextInput
                      placeholder="Garmin Connect Email / Username"
                      placeholderTextColor="#8E8E93"
                      value={garminEmail}
                      onChangeText={setGarminEmail}
                      autoCapitalize="none"
                      className="p-3 bg-theme-bg border border-theme-border rounded-lg text-theme-text text-xs"
                    />
                    <TextInput
                      placeholder="Garmin Connect Password"
                      placeholderTextColor="#8E8E93"
                      secureTextEntry
                      value={garminPassword}
                      onChangeText={setGarminPassword}
                      autoCapitalize="none"
                      className="p-3 bg-theme-bg border border-theme-border rounded-lg text-theme-text text-xs"
                    />
                  </View>
                )}
              </View>

              {/* Strava Connect */}
              <View className="bg-theme-card border border-theme-border rounded-xl p-4 flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Ionicons name="bicycle" size={20} color="#FC4C02" className="mr-3" />
                  <Text className="text-theme-text font-bold text-sm">Strava Sync</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Alert.alert('Strava OAuth', 'Strava connection will open in web browser.')}
                  className="bg-[#FC4C02] px-4 py-2 rounded-lg"
                >
                  <Text className="text-white font-bold text-xs">Connect Strava</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* STEP 6: SUBSCRIPTION / SPARK PLUS PAYWALL */}
        <View style={{ width: SCREEN_WIDTH }} className="flex-1">
          <ScrollView
            className="flex-1 px-6 pt-6"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            <View className="space-y-4">
              <View className="items-center my-2">
                <View className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full flex-row items-center mb-2">
                  <Ionicons name="flash" size={14} color="#f59e0b" className="mr-1" />
                  <Text className="text-amber-500 font-bold text-xs uppercase tracking-wider">
                    Spark Plus Subscription
                  </Text>
                </View>
                <Text className="text-theme-text text-2xl font-bold font-barlow text-center">
                  Unlock Your Full Potential
                </Text>
                <Text className="text-theme-muted text-xs text-center mt-1 px-4">
                  Upgrade to unlock unlimited Spark chat tokens, custom macro periodization, automated Garmin sync, and injury diagnostics.
                </Text>
              </View>

              {/* Pricing Tiers */}
              <View className="flex-row space-x-3">
                <TouchableOpacity
                  onPress={() => setSelectedPlan('annual')}
                  className={`flex-1 p-4 rounded-2xl border-2 ${
                    selectedPlan === 'annual'
                      ? 'border-theme-accent bg-theme-card'
                      : 'border-theme-border bg-theme-bg'
                  }`}
                >
                  <View className="self-start px-2 py-0.5 bg-theme-accent rounded-full mb-2">
                    <Text className="text-white font-bold text-[9px]">SAVE 17%</Text>
                  </View>
                  <Text className="text-theme-text font-bold text-base">Annual</Text>
                  <Text className="text-theme-accent font-bold text-xl mt-1">€5.83<Text className="text-xs text-theme-muted">/mo</Text></Text>
                  <Text className="text-theme-muted text-[10px] mt-1">€69.99 billed yearly</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSelectedPlan('monthly')}
                  className={`flex-1 p-4 rounded-2xl border-2 ${
                    selectedPlan === 'monthly'
                      ? 'border-theme-accent bg-theme-card'
                      : 'border-theme-border bg-theme-bg'
                  }`}
                >
                  <Text className="text-theme-text font-bold text-base mt-4">Monthly</Text>
                  <Text className="text-theme-text font-bold text-xl mt-1">€6.99<Text className="text-xs text-theme-muted">/mo</Text></Text>
                  <Text className="text-theme-muted text-[10px] mt-1">Billed monthly</Text>
                </TouchableOpacity>
              </View>

              {/* Feature Checklist */}
              <View className="bg-theme-card border border-theme-border rounded-2xl p-4 space-y-3">
                {[
                  'Increased Spark chat tokens',
                  'Personalized daily macro periodization & fueling protocols',
                  'Strava auto-tagging controls',
                  'Social leaderboard',
                ].map((feat, idx) => (
                  <View key={idx} className="flex-row items-center space-x-2">
                    <Ionicons name="checkmark-circle" size={18} color="#FF5A1F" />
                    <Text className="text-theme-text text-xs flex-1">{feat}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Fixed Bottom Navigation Buttons */}
      <View className="absolute bottom-0 left-0 right-0 p-6 bg-theme-bg border-t border-theme-border flex-row items-center">
        {currentStep < totalSteps ? (
          <TouchableOpacity
            onPress={nextStep}
            className="w-full py-3.5 rounded-xl bg-theme-accent shadow-sm items-center justify-center"
          >
            <Text className="text-white font-bold text-base">Next</Text>
          </TouchableOpacity>
        ) : (
          <View className="w-full flex-row space-x-2">
            <TouchableOpacity
              onPress={() => handleCompleteSetup(false)}
              disabled={isSubmitting}
              className="flex-1 py-3.5 px-2 rounded-xl border border-theme-border bg-theme-card items-center justify-center"
            >
              <Text className="text-theme-muted text-xs font-bold text-center">Continue with Free Tier</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleCompleteSetup(true)}
              disabled={isSubmitting}
              className="flex-1 py-3.5 px-2 rounded-xl bg-theme-accent items-center justify-center shadow-sm"
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-xs text-center">Start 14-Day Free Trial</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
