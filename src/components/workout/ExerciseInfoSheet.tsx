import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { BottomSheetModal } from '../ui/BottomSheetModal';
import { AnatomicalBodyMap } from '../progress/AnatomicalBodyMap';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useTheme } from '@/hooks/use-theme';
import { seasonApi } from '../../services/apiServices';
import { ExerciseCues } from '../../types/season';
import { bestViewFor, highlightPartsFor, musclesForExercise } from '../../domain/exerciseMuscles';

interface ExerciseInfoSheetProps {
  exerciseName: string | null;
  onClose: () => void;
}

/**
 * "What is a Bulgarian split squat?": the muscles it works on the body map,
 * three form cues and a link to a demo video. Cues are generated once per
 * exercise and language on the server (shared, not personal) and need AI consent
 * only the first time anyone asks.
 */
export function ExerciseInfoSheet({ exerciseName, onClose }: ExerciseInfoSheetProps) {
  const { t, language } = useLanguage();
  const theme = useTheme();
  const { user } = useUser();
  const [cues, setCues] = useState<ExerciseCues | null>(null);
  const [loading, setLoading] = useState(false);

  const muscles = useMemo(() => musclesForExercise(exerciseName), [exerciseName]);
  const highlight = useMemo(() => (muscles ? highlightPartsFor(muscles) : null), [muscles]);

  useEffect(() => {
    setCues(null);
    if (!exerciseName) return;
    let active = true;
    setLoading(true);
    seasonApi
      .getExerciseCues(exerciseName)
      .then((res) => active && setCues(res?.cues && res.cues.cues.length ? res.cues : null))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [exerciseName, language]);

  const openDemo = () => {
    const q = encodeURIComponent(`${exerciseName} exercise form`);
    Linking.openURL(`https://www.youtube.com/results?search_query=${q}`).catch(() => {});
  };

  const muscleNames = (list: string[]) => list.map((m) => t(`exercise.muscle_${m}`)).join(', ');

  return (
    <BottomSheetModal visible={Boolean(exerciseName)} onClose={onClose} showHandle>
      <ScrollView style={{ maxHeight: 620 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text className="text-xl font-extrabold text-theme-text">{exerciseName}</Text>

        {muscles && highlight ? (
          <>
            <Text className="text-xs text-theme-muted mt-1">
              <Text className="font-bold text-theme-accent">{t('exercise.primary')}: </Text>
              {muscleNames(muscles.primary)}
              {muscles.secondary.length > 0 && (
                <>
                  {'  ·  '}
                  <Text className="font-bold">{t('exercise.secondary')}: </Text>
                  {muscleNames(muscles.secondary)}
                </>
              )}
            </Text>
            <View className="mt-2">
              <AnatomicalBodyMap highlightParts={highlight} initialView={bestViewFor(muscles)} initialSize="small" />
            </View>
          </>
        ) : (
          <Text className="text-xs text-theme-muted mt-1">{t('exercise.noMuscleMap')}</Text>
        )}

        <View className="mt-3 bg-theme-inset rounded-inset p-3">
          <Text className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5">{t('exercise.howTo')}</Text>
          {loading ? (
            <ActivityIndicator color={theme.tint} />
          ) : cues ? (
            <View className="gap-y-1.5">
              {cues.setup ? <Text className="text-sm text-theme-text">{cues.setup}</Text> : null}
              {cues.cues.map((c, i) => (
                <View key={i} className="flex-row gap-2">
                  <Ionicons name="checkmark-circle" size={15} color="#22C55E" style={{ marginTop: 1 }} />
                  <Text className="flex-1 text-sm text-theme-text">{c}</Text>
                </View>
              ))}
              {cues.mistake ? (
                <View className="flex-row gap-2 mt-1">
                  <Ionicons name="alert-circle" size={15} color="#F59E0B" style={{ marginTop: 1 }} />
                  <Text className="flex-1 text-sm text-theme-muted">{cues.mistake}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text className="text-sm text-theme-muted">{user?.aiConsent === true ? t('exercise.cuesUnavailable') : t('exercise.cuesNeedAi')}</Text>
          )}
        </View>

        <TouchableOpacity
          onPress={openDemo}
          activeOpacity={0.8}
          accessibilityRole="link"
          className="mt-3 py-3 rounded-button bg-theme-accent/10 border border-theme-accent/25 flex-row items-center justify-center gap-2"
        >
          <Ionicons name="logo-youtube" size={18} color="#EF4444" />
          <Text className="text-sm font-bold text-theme-accent">{t('exercise.watchDemo')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheetModal>
  );
}
