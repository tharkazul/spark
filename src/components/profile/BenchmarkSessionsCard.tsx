import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '../ui/Card';
import { ScalePressable } from '../ui/ScalePressable';
import { SportMedallion } from '../ui/SportMedallion';
import { useTheme } from '@/hooks/use-theme';
import { benchmarksApi } from '../../services/apiServices';
import { BenchmarkTest } from '../../types/user';
import { useCoachChat } from '../../context/CoachChatStore';
import { useLanguage } from '../../context/LanguageContext';
import { BenchmarkSkeleton } from '../skeletons/BenchmarkSkeleton';

interface BenchmarkPreset {
  id: string;
  sport: string;
  title: string;
  subtitle: string;
  color: string;
  prompt: string;
}

const PRESET_TESTS: BenchmarkPreset[] = [
  {
    id: 'run_5k',
    sport: 'Run',
    title: '5k Pace & HR Benchmark Run',
    subtitle: 'Calibrate threshold pace and max aerobic heart rate zones.',
    color: '#10B981',
    prompt: 'Please plan a new running benchmark session for me: 5k Pace & HR Baseline Test. I want to test my threshold pace and calibrate my heart rate zones.',
  },
  {
    id: 'bike_ftp',
    sport: 'Bike',
    title: '20-Min FTP Baseline Test',
    subtitle: 'Functional Threshold Power test to establish cycling wattage zones.',
    color: '#F59E0B',
    prompt: 'Please plan a new cycling benchmark session for me: 20-Min FTP Baseline Test. I want to test my 20-minute functional threshold power and recalibrate my cycling wattage zones.',
  },
  {
    id: 'swim_css',
    sport: 'Swim',
    title: '400m CSS Swim Test',
    subtitle: 'Critical Swim Speed assessment to set pace per 100m zones.',
    color: '#06B6D4',
    prompt: 'Please plan a new swim benchmark session for me: 400m CSS (Critical Swim Speed) Test. I want to establish my swim pace per 100m zones.',
  },
  {
    id: 'hyrox_func',
    sport: 'Strength',
    title: 'Hyrox Functional Fitness Test',
    subtitle: 'Multi-station functional test (sled, burpees, rowing, wall balls).',
    color: '#EC4899',
    prompt: 'Please plan a new functional endurance benchmark session for me: Hyrox Benchmark Assessment (sled push, burpees, rowing, wall balls) to test my functional capacity.',
  },
  {
    id: 'general_all',
    sport: 'Other',
    title: 'Custom Baseline Assessment',
    subtitle: 'Ask your coach to design an assessment based on your current phase.',
    color: '#8B5CF6',
    prompt: 'Please plan a new benchmark session for me to test my current fitness levels and calibrate my training zones.',
  },
];

export const BenchmarkSessionsCard: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sendMessage } = useCoachChat();
  const { t, language } = useLanguage();

  const [benchmarks, setBenchmarks] = useState<BenchmarkTest[]>([]);
  const [loading, setLoading] = useState(false);

  // Request Modal State
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<BenchmarkPreset>(PRESET_TESTS[0]);
  const [customAthleteNote, setCustomAthleteNote] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);

  // Manual Log Modal State
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [logSport, setLogSport] = useState('Run');
  const [logTestName, setLogTestName] = useState('');
  const [logPace, setLogPace] = useState('');
  const [logPower, setLogPower] = useState('');
  const [logAvgHr, setLogAvgHr] = useState('');
  const [logMaxHr, setLogMaxHr] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [savingLog, setSavingLog] = useState(false);

  useEffect(() => {
    fetchBenchmarks();
  }, []);

  const fetchBenchmarks = async () => {
    setLoading(true);
    try {
      const data = await benchmarksApi.getBenchmarks();
      if (Array.isArray(data)) {
        setBenchmarks(data);
      }
    } catch (err: any) {
      console.error('Failed to load benchmark tests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRequestModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCustomAthleteNote('');
    setRequestModalVisible(true);
  };

  const handleSendRequestToCoach = async () => {
    setSendingRequest(true);
    try {
      let finalPrompt = t(`benchmarkPresets.${selectedPreset.id}Prompt`, selectedPreset.prompt);
      if (customAthleteNote.trim()) {
        finalPrompt += `\n\n${t('benchmarkPresets.athleteNote', { note: customAthleteNote.trim() })}`;
      }

      await sendMessage(finalPrompt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRequestModalVisible(false);

      // Navigate athlete straight to Coach Chat
      router.push('/(tabs)/coach');
    } catch (err: any) {
      console.error('Failed to dispatch benchmark request:', err);
      Alert.alert(t('benchmarkPresets.requestErrorTitle'), t('benchmarkPresets.requestErrorBody'));
    } finally {
      setSendingRequest(false);
    }
  };

  const handleOpenLogModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLogSport('Run');
    setLogTestName('');
    setLogPace('');
    setLogPower('');
    setLogAvgHr('');
    setLogMaxHr('');
    setLogNotes('');
    setLogModalVisible(true);
  };

  const handleSaveManualLog = async () => {
    if (!logTestName.trim()) {
      Alert.alert(t('benchmarkPresets.nameRequiredTitle'), t('benchmarkPresets.nameRequiredBody'));
      return;
    }

    setSavingLog(true);
    try {
      const metricsObj: Record<string, any> = {};
      if (logPace.trim()) metricsObj.pace = logPace.trim();
      if (logPower.trim()) metricsObj.ftp_watts = logPower.trim();
      if (logAvgHr.trim()) metricsObj.avg_hr = logAvgHr.trim();
      if (logMaxHr.trim()) metricsObj.max_hr = logMaxHr.trim();

      await benchmarksApi.createBenchmark({
        sport_type: logSport,
        test_name: logTestName.trim(),
        metrics_json: metricsObj,
        coach_notes: logNotes.trim() || 'Manually logged benchmark baseline',
        completed_at: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLogModalVisible(false);
      await fetchBenchmarks();
    } catch (err: any) {
      console.error('Failed to log benchmark result:', err);
      Alert.alert(t('benchmarkPresets.saveFailedTitle'), err.message || t('benchmarkPresets.saveFailedBody'));
    } finally {
      setSavingLog(false);
    }
  };

  const handleDelete = (item: BenchmarkTest) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t('benchmarks.removeBenchmark'),
      t('benchmarks.removeConfirm', { name: item.test_name }),
      [
        { text: t('benchmarks.cancel'), style: 'cancel' },
        {
          text: t('benchmarks.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await benchmarksApi.deleteBenchmark(item.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setBenchmarks((prev) => prev.filter((b) => b.id !== item.id));
            } catch (err: any) {
              console.error('Failed to delete benchmark:', err);
              Alert.alert(t('common.error'), t('benchmarkPresets.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const getSportDetails = (sport: string) => {
    const s = (sport || '').toLowerCase();
    if (s.includes('run')) return { color: '#10B981', label: t('sports.run') };
    if (s.includes('bike') || s.includes('cycl')) return { color: '#F59E0B', label: t('sports.bike') };
    if (s.includes('swim')) return { color: '#06B6D4', label: t('sports.swim') };
    if (s.includes('strength') || s.includes('hyrox')) return { color: '#EC4899', label: 'Hyrox' };
    return { color: '#8B5CF6', label: s === 'other' || !sport ? t('benchmarkPresets.assessment') : sport };
  };

  const parseMetrics = (metricsJson?: string | Record<string, any>): Record<string, any> => {
    if (!metricsJson) return {};
    if (typeof metricsJson === 'object') return metricsJson;
    try {
      return JSON.parse(metricsJson);
    } catch {
      return { summary: metricsJson };
    }
  };

  const formatTestDate = (dateStr?: string) => {
    if (!dateStr) return t('benchmarkPresets.recorded');
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(language, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr.slice(0, 10);
    }
  };

  return (
    <Card className="p-4 mb-6">
      {/* Header */}
      <View className="flex-row items-center justify-between pb-2 mb-1 border-b border-theme-border/30 gap-x-2">
        <View className="flex-row items-center gap-x-1.5 flex-1 min-w-0 mr-1">
          <Ionicons name="speedometer-outline" size={17} color={theme.tint} />
          <Text
            className="text-sm font-bold text-theme-text font-rajdhani flex-1"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {t('benchmarks.title')}
          </Text>
        </View>
        <View className="flex-row items-center gap-x-1.5 shrink-0">
          <ScalePressable
            onPress={handleOpenLogModal}
            activeScale={0.92}
            haptic="light"
            className="px-2 py-1 bg-theme-border/40 rounded-full flex-row items-center gap-x-1"
          >
            <Ionicons name="create-outline" size={12} color={theme.textSecondary} />
            <Text className="text-[11px] font-medium text-theme-muted">{t('benchmarks.log')}</Text>
          </ScalePressable>
          <ScalePressable
            onPress={handleOpenRequestModal}
            activeScale={0.92}
            haptic="light"
            className="px-2.5 py-1 bg-theme-accent/15 rounded-full flex-row items-center gap-x-1"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={12} color={theme.tint} />
            <Text className="text-xs font-bold text-theme-accent">{t('benchmarks.request')}</Text>
          </ScalePressable>
        </View>
      </View>

      <Text className="text-xs text-theme-muted mb-3">
        {t('benchmarks.subtitle')}
      </Text>

      {loading ? (
        <BenchmarkSkeleton count={2} />
      ) : benchmarks.length === 0 ? (
        <View className="p-4 bg-theme-bg rounded-xl items-center border border-theme-border/50 my-1">
          <Ionicons name="speedometer-outline" size={26} color={theme.textSecondary} className="mb-1.5 opacity-60" />
          <Text className="text-xs font-bold text-theme-text mb-0.5">{t('benchmarks.noTestsRecorded')}</Text>
          <Text className="text-[11px] text-theme-muted text-center px-3 mb-3">
            {t('benchmarks.noTestsDesc')}
          </Text>
          <ScalePressable
            onPress={handleOpenRequestModal}
            activeScale={0.96}
            haptic="light"
            className="px-3.5 py-2 bg-theme-accent rounded-lg flex-row items-center justify-center gap-x-1.5 shadow-sm max-w-full"
          >
            <Ionicons name="chatbubble-ellipses" size={14} color="#FFFFFF" />
            <Text className="text-white text-xs font-bold font-rajdhani text-center" numberOfLines={1}>
              {t('benchmarks.requestSession')}
            </Text>
          </ScalePressable>
        </View>
      ) : (
        <View className="gap-y-2.5">
          {benchmarks.map((item) => {
            const sportInfo = getSportDetails(item.sport_type);
            const metrics = parseMetrics(item.metrics_json);
            const metricKeys = Object.keys(metrics);

            return (
              <View
                key={item.id}
                className="p-3 bg-theme-bg rounded-xl border border-theme-border/60"
              >
                <View className="flex-row items-center justify-between mb-1.5">
                  <View className="flex-row items-center gap-x-2.5 flex-1 mr-2">
                    <SportMedallion sport={item.sport_type} size={32} />
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-theme-text font-rajdhani" numberOfLines={1}>
                        {item.test_name}
                      </Text>
                      <Text className="text-[10px] text-theme-muted">
                        {sportInfo.label} • {formatTestDate(item.completed_at || item.created_at)}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    className="p-1 opacity-50 active:opacity-100"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={15} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Metrics Badges */}
                {metricKeys.length > 0 && (
                  <View className="flex-row flex-wrap gap-1.5 mb-1 mt-1">
                    {metricKeys.map((key) => {
                      const val = metrics[key];
                      if (val === null || val === undefined || val === '') return null;
                      const label = key.replace(/_/g, ' ').toUpperCase();
                      return (
                        <View
                          key={key}
                          className="px-2 py-0.5 rounded-md bg-theme-card border border-theme-border/40 flex-row items-center gap-x-1"
                        >
                          <Text className="text-[9px] font-bold text-theme-muted uppercase tracking-wider">
                            {label}:
                          </Text>
                          <Text className="text-[10px] font-semibold text-theme-text font-rajdhani">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Coach Notes */}
                {Boolean(item.coach_notes) && (
                  <View className="mt-1.5 p-2 rounded-lg bg-theme-card/60 border-l-2 border-theme-accent">
                    <Text className="text-[10px] text-theme-muted italic">
                      "{item.coach_notes === 'Initial Onboarding Baseline Assessment'
                        ? t('benchmarkPresets.onboardingNote')
                        : item.coach_notes === 'Manually logged benchmark baseline'
                        ? t('benchmarkPresets.manualNote')
                        : item.coach_notes}"
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* REQUEST BENCHMARK MODAL */}
      <Modal
        visible={requestModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRequestModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <View className="flex-1 bg-black/60 justify-end">
            <View
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
              className="bg-theme-card rounded-t-3xl p-5 max-h-[85%] border-t border-theme-border"
            >
              <View className="flex-row items-center justify-between pb-3 border-b border-theme-border/40 mb-3">
                <View className="flex-row items-center gap-x-2 flex-1 min-w-0 mr-2">
                  <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.tint} />
                  <Text className="text-base font-bold text-theme-text font-rajdhani flex-1" numberOfLines={1}>
                    {t('benchmarks.requestSession')}
                  </Text>
                </View>
                <ScalePressable
                  onPress={() => setRequestModalVisible(false)}
                  activeScale={0.9}
                  haptic="light"
                  className="w-8 h-8 rounded-full bg-theme-bg items-center justify-center shrink-0"
                >
                  <Ionicons name="close" size={18} color={theme.text} />
                </ScalePressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                <Text className="text-xs text-theme-muted mb-3">
                  {t('benchmarks.requestModalDesc')}
                </Text>

                {/* Presets List */}
                <View className="gap-y-2 mb-4">
                  {PRESET_TESTS.map((preset) => {
                    const isSelected = selectedPreset.id === preset.id;
                    return (
                      <ScalePressable
                        key={preset.id}
                        onPress={() => {
                          setSelectedPreset(preset);
                        }}
                        activeScale={0.98}
                        haptic="selection"
                        className={`p-3 rounded-xl border flex-row items-center justify-between ${
                          isSelected
                            ? 'bg-theme-accent/15 border-theme-accent'
                            : 'bg-theme-bg border-theme-border/50'
                        }`}
                      >
                        <View className="flex-row items-center gap-x-3 flex-1 mr-2">
                          <SportMedallion sport={preset.sport} size={36} />
                          <View className="flex-1">
                            <Text
                              className={`text-xs font-bold font-rajdhani ${
                                isSelected ? 'text-theme-accent' : 'text-theme-text'
                              }`}
                            >
                              {t(`benchmarkPresets.${preset.id}Title`, preset.title)}
                            </Text>
                            <Text className="text-[10px] text-theme-muted mt-0.5">
                              {t(`benchmarkPresets.${preset.id}Subtitle`, preset.subtitle)}
                            </Text>
                          </View>
                        </View>

                        <Ionicons
                          name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                          size={18}
                          color={isSelected ? theme.tint : theme.textSecondary}
                        />
                      </ScalePressable>
                    );
                  })}
                </View>

                {/* Optional Athlete Note */}
                <Text className="text-xs font-bold text-theme-text mb-1 font-rajdhani">
                  {t('benchmarks.timingPreference')}
                </Text>
                <TextInput
                  value={customAthleteNote}
                  onChangeText={setCustomAthleteNote}
                  placeholder={t('benchmarks.timingPlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  numberOfLines={2}
                  className="bg-theme-bg border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text mb-5 min-h-[60px]"
                  textAlignVertical="top"
                />

                {/* Send Button */}
                <ScalePressable
                  onPress={handleSendRequestToCoach}
                  disabled={sendingRequest}
                  activeScale={0.96}
                  haptic="selection"
                  className={`bg-theme-accent py-3.5 rounded-xl items-center justify-center flex-row gap-x-2 shadow-sm mb-2 ${
                    sendingRequest ? 'opacity-60' : ''
                  }`}
                >
                  {sendingRequest ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                      <Text className="text-white font-bold text-sm font-rajdhani uppercase tracking-wider">
                        {t('benchmarks.sendToCoach')}
                      </Text>
                    </>
                  )}
                </ScalePressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* LOG BENCHMARK RESULT MODAL */}
      <Modal
        visible={logModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLogModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <View className="flex-1 bg-black/60 justify-end">
            <View
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
              className="bg-theme-card rounded-t-3xl p-5 max-h-[85%] border-t border-theme-border"
            >
              <View className="flex-row items-center justify-between pb-3 border-b border-theme-border/40 mb-3">
                <View className="flex-row items-center gap-x-2 flex-1 min-w-0 mr-2">
                  <Ionicons name="create-outline" size={20} color={theme.tint} />
                  <Text className="text-base font-bold text-theme-text font-rajdhani flex-1" numberOfLines={1}>
                    {t('benchmarks.logBaseline')}
                  </Text>
                </View>
                <ScalePressable
                  onPress={() => setLogModalVisible(false)}
                  activeScale={0.9}
                  haptic="light"
                  className="w-8 h-8 rounded-full bg-theme-bg items-center justify-center shrink-0"
                >
                  <Ionicons name="close" size={18} color={theme.text} />
                </ScalePressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                {/* Sport Selector */}
                <Text className="text-xs font-bold text-theme-text mb-1 font-rajdhani">
                  {t('benchmarks.sport')}
                </Text>
                <View className="flex-row gap-x-2 mb-3">
                  {[
                    { id: 'Run', label: t('sports.run') },
                    { id: 'Bike', label: t('sports.bike') },
                    { id: 'Swim', label: t('sports.swim') },
                    { id: 'Strength', label: t('sports.strength') },
                    { id: 'Other', label: t('benchmarkPresets.other') },
                  ].map((s) => {
                    const isSel = logSport === s.id;
                    return (
                      <ScalePressable
                        key={s.id}
                        onPress={() => setLogSport(s.id)}
                        activeScale={0.94}
                        haptic="selection"
                        className={`px-3 py-1.5 rounded-lg border flex-1 items-center ${
                          isSel ? 'bg-theme-accent border-theme-accent' : 'bg-theme-bg border-theme-border'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold font-rajdhani ${
                            isSel ? 'text-white' : 'text-theme-muted'
                          }`}
                        >
                          {s.label}
                        </Text>
                      </ScalePressable>
                    );
                  })}
                </View>

                {/* Test Name */}
                <Text className="text-xs font-bold text-theme-text mb-1 font-rajdhani">
                  {t('benchmarks.assessmentName')}
                </Text>
                <TextInput
                  value={logTestName}
                  onChangeText={setLogTestName}
                  placeholder={t('benchmarkPresets.namePlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  className="bg-theme-bg border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text mb-3"
                />

                {/* Metrics Row 1: Pace & Power */}
                <View className="flex-row gap-x-2 mb-3">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-theme-text mb-1 font-rajdhani">
                      {t('benchmarks.paceCss')}
                    </Text>
                    <TextInput
                      value={logPace}
                      onChangeText={setLogPace}
                      placeholder="4:15 /km"
                      placeholderTextColor={theme.textSecondary}
                      className="bg-theme-bg border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-theme-text mb-1 font-rajdhani">
                      {t('benchmarks.ftpPower')}
                    </Text>
                    <TextInput
                      value={logPower}
                      onChangeText={setLogPower}
                      placeholder="265 W"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="numeric"
                      className="bg-theme-bg border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text"
                    />
                  </View>
                </View>

                {/* Metrics Row 2: Heart Rate */}
                <View className="flex-row gap-x-2 mb-3">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-theme-text mb-1 font-rajdhani">
                      {t('benchmarks.avgHr')}
                    </Text>
                    <TextInput
                      value={logAvgHr}
                      onChangeText={setLogAvgHr}
                      placeholder="168"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="numeric"
                      className="bg-theme-bg border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-theme-text mb-1 font-rajdhani">
                      {t('benchmarks.maxHr')}
                    </Text>
                    <TextInput
                      value={logMaxHr}
                      onChangeText={setLogMaxHr}
                      placeholder="184"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="numeric"
                      className="bg-theme-bg border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text"
                    />
                  </View>
                </View>

                {/* Notes */}
                <Text className="text-xs font-bold text-theme-text mb-1 font-rajdhani">
                  {t('benchmarks.notesAndConditions')}
                </Text>
                <TextInput
                  value={logNotes}
                  onChangeText={setLogNotes}
                  placeholder={t('benchmarks.notesPlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  numberOfLines={2}
                  className="bg-theme-bg border border-theme-border rounded-xl px-3 py-2 text-xs text-theme-text mb-5 min-h-[50px]"
                  textAlignVertical="top"
                />

                {/* Save Log Button */}
                <ScalePressable
                  onPress={handleSaveManualLog}
                  disabled={savingLog}
                  activeScale={0.96}
                  haptic="selection"
                  className={`bg-theme-accent py-3 rounded-xl items-center justify-center flex-row gap-x-2 shadow-sm mb-2 ${
                    savingLog ? 'opacity-50' : ''
                  }`}
                >
                  {savingLog ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                      <Text className="text-white font-bold text-sm font-rajdhani uppercase tracking-wider">
                        {t('benchmarks.saveResult')}
                      </Text>
                    </>
                  )}
                </ScalePressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Card>
  );
};
