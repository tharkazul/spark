import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { AnatomicalBodyMap } from '../progress/AnatomicalBodyMap';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useTheme } from '@/hooks/use-theme';
import { seasonApi } from '../../services/apiServices';
import { ExerciseCues } from '../../types/season';
import { bestViewFor, highlightPartsFor, musclesForExercise } from '../../domain/exerciseMuscles';

let WebViewComponent: any = null;
if (Platform.OS !== 'web') {
  try {
    const mod = require('react-native-webview');
    WebViewComponent = mod.WebView || mod.default || null;
  } catch (_) {}
}

const youtubeVideoCache = new Map<string, string>();

async function resolveClientYoutubeVideoId(exerciseName: string): Promise<string | null> {
  const key = exerciseName.toLowerCase().trim();
  const cached = youtubeVideoCache.get(key);
  if (cached) return cached;
  try {
    const q = encodeURIComponent(`${exerciseName} exercise form tutorial`);
    const res = await fetch(`https://www.youtube.com/results?search_query=${q}`, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const matches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);
    const unique = [...new Set(matches)];
    const videoId = unique[0] || null;
    if (videoId) {
      youtubeVideoCache.set(key, videoId);
    }
    return videoId;
  } catch (_) {
    return null;
  }
}

/**
 * Opens an exercise's info page inside the sheet that shows the workout, instead of a second
 * sheet of another size stacked on top. A step card without this provider shows no (i) button.
 */
export const ExerciseInfoContext = createContext<((exerciseName: string) => void) | null>(null);

interface ExerciseInfoViewProps {
  exerciseName: string;
}

/**
 * "What is a Bulgarian split squat?": the muscles it works on the body map,
 * three form cues and an inline demo video. Cues and video ID are resolved once per
 * exercise on the server (shared, not personal) and need AI consent
 * only the first time anyone asks for cues.
 */
export function ExerciseInfoView({ exerciseName }: ExerciseInfoViewProps) {
  const { t, language } = useLanguage();
  const theme = useTheme();
  const { user } = useUser();
  const [cues, setCues] = useState<ExerciseCues | null>(null);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const muscles = useMemo(() => musclesForExercise(exerciseName), [exerciseName]);
  const highlight = useMemo(() => (muscles ? highlightPartsFor(muscles) : null), [muscles]);

  useEffect(() => {
    setCues(null);
    setYoutubeVideoId(null);
    if (!exerciseName) return;
    let active = true;
    setLoading(true);
    seasonApi
      .getExerciseCues(exerciseName)
      .then(async (res) => {
        if (!active) return;
        setCues(res?.cues && res.cues.cues.length ? res.cues : null);
        if (res?.youtubeVideoId) {
          setYoutubeVideoId(res.youtubeVideoId);
        } else {
          const fallbackId = await resolveClientYoutubeVideoId(exerciseName);
          if (active && fallbackId) setYoutubeVideoId(fallbackId);
        }
      })
      .catch(async () => {
        const fallbackId = await resolveClientYoutubeVideoId(exerciseName);
        if (active && fallbackId) setYoutubeVideoId(fallbackId);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [exerciseName, language]);

  const openDemo = () => {
    if (youtubeVideoId) {
      Linking.openURL(`https://www.youtube.com/watch?v=${youtubeVideoId}`).catch(() => {});
      return;
    }
    const q = encodeURIComponent(`${exerciseName} exercise form`);
    Linking.openURL(`https://www.youtube.com/results?search_query=${q}`).catch(() => {});
  };

  const embedHtml = useMemo(() => {
    if (!youtubeVideoId) return '';
    const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeVideoId)}?playsinline=1&rel=0&modestbranding=1`;
    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; background: #000; }
      html, body, iframe { width: 100%; height: 100%; border: 0; display: block; }
    </style>
  </head>
  <body>
    <iframe
      src="${embedUrl}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowfullscreen
    ></iframe>
  </body>
</html>`;
  }, [youtubeVideoId]);

  const muscleNames = (list: string[]) => list.map((m) => t(`exercise.muscle_${m}`)).join(', ');

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
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

      {youtubeVideoId && (Platform.OS === 'web' || WebViewComponent) ? (
        <View className="mt-3 rounded-inset overflow-hidden border border-theme-border bg-black" style={{ height: 200 }}>
          {Platform.OS === 'web' ? (
            React.createElement('iframe', {
              src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeVideoId)}?playsinline=1&rel=0&modestbranding=1`,
              style: { width: '100%', height: '100%', border: 'none' },
              allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
              allowFullScreen: true,
            })
          ) : (
            <WebViewComponent
              originWhitelist={['*']}
              source={{ html: embedHtml, baseUrl: 'https://www.youtube-nocookie.com' }}
              allowsInlineMediaPlayback
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              style={{ flex: 1, backgroundColor: '#000' }}
            />
          )}
        </View>
      ) : null}

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
  );
}
