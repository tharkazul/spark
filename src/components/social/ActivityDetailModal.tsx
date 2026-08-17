import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Activity, ActivityLap, StrengthSetItem } from '../../types/activity';
import { ActivityComment } from '../../types/social';
import { activitiesApi, socialApi } from '../../services/apiServices';
import { decodePolyline, Coordinate } from '../../utils/polyline';
import { getSportFilledIcon } from '../../utils/sportIcons';
import { CommentComposer } from './CommentComposer';
import { useUser } from '../../context/UserStore';

interface ActivityDetailModalProps {
  visible: boolean;
  activityId: string | number | null;
  initialActivity?: Partial<Activity>;
  onClose: () => void;
}

// Normalizer to unify Strava API responses, Local SQLite responses, and partial feed objects
function normalizeActivity(raw: any, fallback?: Partial<Activity>): Activity {
  if (!raw && !fallback) return {} as Activity;
  const merged = { ...fallback, ...raw };

  const distKm =
    typeof raw?.distance_km === 'number'
      ? raw.distance_km
      : typeof raw?.distance === 'number'
      ? raw.distance / 1000
      : typeof fallback?.distance_km === 'number'
      ? fallback.distance_km
      : 0;

  const movingMins =
    typeof raw?.moving_time_min === 'number'
      ? raw.moving_time_min
      : typeof raw?.moving_time === 'number'
      ? raw.moving_time / 60
      : typeof fallback?.moving_time_min === 'number'
      ? fallback.moving_time_min
      : 0;

  const elevation =
    raw?.elevation_m ??
    raw?.total_elevation_gain ??
    fallback?.elevation_m ??
    0;

  const avgPower =
    raw?.average_power_w ??
    raw?.average_watts ??
    raw?.weighted_average_watts ??
    fallback?.average_power_w;

  const spark =
    raw?.spark_score ??
    raw?.suffer_score ??
    raw?.tss ??
    fallback?.spark_score ??
    fallback?.tss ??
    0;

  const polylineStr =
    raw?.polyline ??
    raw?.map?.summary_polyline ??
    raw?.map?.polyline ??
    fallback?.polyline ??
    '';

  const nameStr =
    raw?.name ||
    raw?.title ||
    fallback?.name ||
    (fallback as any)?.title ||
    'Workout Telemetry';

  const sportStr =
    raw?.sport_type ||
    raw?.type ||
    fallback?.sport_type ||
    'Workout';

  const startDateStr =
    raw?.start_date_local ||
    raw?.start_date ||
    fallback?.start_date ||
    '';

  const sportUpper = sportStr.toUpperCase();
  const nameUpper = nameStr.toUpperCase();
  const isCycling =
    sportUpper.includes('BIKE') ||
    sportUpper.includes('RIDE') ||
    sportUpper.includes('CYCL') ||
    nameUpper.includes('RIDE') ||
    nameUpper.includes('BIKE') ||
    nameUpper.includes('CYCLING');
  const isSwim = sportUpper.includes('SWIM') || nameUpper.includes('SWIM');

  let normalizedLaps: ActivityLap[] | undefined = undefined;
  if (Array.isArray(raw?.splits_metric) && raw.splits_metric.length > 0) {
    normalizedLaps = raw.splits_metric.map((split: any, idx: number) => {
      const splitDistKm = (split.distance || 1000) / 1000;
      const splitTimeMin = (split.moving_time || split.elapsed_time || 0) / 60;
      let paceOrSpeedStr = '';

      if (isCycling) {
        const speedKmh = split.average_speed
          ? (split.average_speed * 3.6).toFixed(1)
          : splitTimeMin > 0
          ? (splitDistKm / (splitTimeMin / 60)).toFixed(1)
          : '0.0';
        paceOrSpeedStr = `${speedKmh} km/u`;
      } else if (isSwim) {
        const sec100m = splitDistKm > 0 ? (splitTimeMin * 60) / (splitDistKm * 10) : 0;
        const m = Math.floor(sec100m / 60);
        const s = Math.round(sec100m % 60);
        paceOrSpeedStr = `${m}:${s < 10 ? '0' : ''}${s} /100m`;
      } else {
        const paceSec = splitDistKm > 0 ? (splitTimeMin * 60) / splitDistKm : 0;
        const m = Math.floor(paceSec / 60);
        const s = Math.round(paceSec % 60);
        paceOrSpeedStr = `${m}:${s < 10 ? '0' : ''}${s} /km`;
      }

      return {
        lap_index: split.split || idx + 1,
        distance_km: splitDistKm,
        elapsed_time_min: splitTimeMin,
        split_pace: paceOrSpeedStr,
        average_heartrate: split.average_heartrate,
        elevation_gain_m: split.elevation_difference,
      };
    });
  } else if (Array.isArray(raw?.laps)) {
    normalizedLaps = raw.laps;
  } else if (Array.isArray(fallback?.laps)) {
    normalizedLaps = fallback.laps;
  }

  let setsJsonStr = '';
  if (typeof raw?.sets_json === 'string') {
    setsJsonStr = raw.sets_json;
  } else if (Array.isArray(raw?.sets_json)) {
    setsJsonStr = JSON.stringify(raw.sets_json);
  } else if (Array.isArray(raw?.sets)) {
    setsJsonStr = JSON.stringify(raw.sets);
  } else if (typeof fallback?.sets_json === 'string') {
    setsJsonStr = fallback.sets_json;
  }

  return {
    ...merged,
    id: raw?.id ?? fallback?.id ?? '',
    name: nameStr,
    sport_type: sportStr,
    distance_km: distKm,
    moving_time_min: movingMins,
    elevation_m: elevation,
    average_heartrate: raw?.average_heartrate ?? fallback?.average_heartrate,
    max_heartrate: raw?.max_heartrate ?? fallback?.max_heartrate,
    average_power_w: avgPower,
    spark_score: spark,
    polyline: polylineStr,
    start_date: startDateStr,
    kudos_count: raw?.kudos_count ?? fallback?.kudos_count ?? 0,
    has_kudosed: raw?.has_kudosed ?? fallback?.has_kudosed ?? false,
    sets_json: setsJsonStr,
    laps: normalizedLaps,
  };
}

export const ActivityDetailModal: React.FC<ActivityDetailModalProps> = ({
  visible,
  activityId,
  initialActivity,
  onClose,
}) => {
  const { user } = useUser();
  const [loading, setLoading] = useState<boolean>(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [hasKudosed, setHasKudosed] = useState<boolean>(false);
  const [kudosCount, setKudosCount] = useState<number>(0);
  const [coordinates, setCoordinates] = useState<Coordinate[]>([]);
  const [isLapsExpanded, setIsLapsExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (!visible) {
      setActivity(null);
      setComments([]);
      setCoordinates([]);
      setIsLapsExpanded(false);
      return;
    }

    setIsLapsExpanded(false);

    // Immediately initialize with initialActivity if present
    if (initialActivity) {
      const initAct = normalizeActivity(initialActivity);
      setActivity(initAct);
      setHasKudosed(!!initAct.has_kudosed);
      setKudosCount(initAct.kudos_count || 0);
      if (initAct.polyline) {
        setCoordinates(decodePolyline(initAct.polyline));
      }
    }

    if (!activityId) return;

    let isMounted = true;
    setLoading(!initialActivity);

    const loadData = async () => {
      try {
        const detailRes = await activitiesApi.getActivityDetail(activityId);
        if (!isMounted) return;

        const normalized = normalizeActivity(detailRes, initialActivity);
        setActivity(normalized);
        setHasKudosed(!!normalized.has_kudosed);
        setKudosCount(normalized.kudos_count || 0);

        if (normalized.polyline) {
          const points = decodePolyline(normalized.polyline);
          setCoordinates(points);
        }

        // Fetch activity comments
        const commentsRes = await activitiesApi.getComments(activityId);
        if (isMounted && commentsRes?.comments) {
          setComments(commentsRes.comments);
        }
      } catch (err) {
        console.log('Error loading activity detail:', err);
        if (initialActivity && isMounted) {
          const fallbackAct = normalizeActivity(initialActivity);
          setActivity(fallbackAct);
          setHasKudosed(!!fallbackAct.has_kudosed);
          setKudosCount(fallbackAct.kudos_count || 0);
          if (fallbackAct.polyline) {
            setCoordinates(decodePolyline(fallbackAct.polyline));
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [visible, activityId, initialActivity]);

  const handleToggleKudos = async () => {
    if (!activityId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const nextState = !hasKudosed;
    const nextCount = nextState ? kudosCount + 1 : Math.max(0, kudosCount - 1);
    setHasKudosed(nextState);
    setKudosCount(nextCount);

    try {
      await socialApi.toggleKudos(activityId);
    } catch (err) {
      console.error('Kudos toggle failed:', err);
    }
  };

  const handleSendComment = async (commentText: string) => {
    if (!activityId) return;
    try {
      const res = await activitiesApi.postComment(activityId, commentText);
      if (res?.comment) {
        setComments((prev) => [...prev, res.comment]);
      } else {
        const newC: ActivityComment = {
          id: `c_${Date.now()}`,
          activity_id: activityId,
          user_id: user?.id || 0,
          username: user?.username || 'You',
          comment: commentText,
          created_at: new Date().toISOString(),
        };
        setComments((prev) => [...prev, newC]);
      }
    } catch (err: any) {
      console.error('Failed to post comment:', err);
    }
  };

  const handleDeleteComment = async (commentId: string | number) => {
    if (!activityId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await activitiesApi.deleteComment(activityId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  };

  // Parse strength sets
  const parseStrengthSets = (): StrengthSetItem[] => {
    if (!activity?.sets_json) return [];
    try {
      const parsed = typeof activity.sets_json === 'string' ? JSON.parse(activity.sets_json) : activity.sets_json;
      if (Array.isArray(parsed)) {
        return parsed.flatMap((item: any) => {
          if (item.type === 'repeat' && Array.isArray(item.steps)) {
            return item.steps.map((st: any) => ({
              exerciseName: st.exerciseName || st.name || st.type || 'Exercise',
              weight: st.weight,
              reps: st.condition_value || st.reps,
              completed: true,
            }));
          }
          return [
            {
              exerciseName: item.exerciseName || item.name || item.type || 'Exercise',
              weight: item.weight,
              reps: item.condition_value || item.reps,
              completed: true,
            },
          ];
        });
      }
    } catch (e) {
      // ignore
    }
    return [];
  };

  const strengthSets = parseStrengthSets();

  const sportUpper = (activity?.sport_type || '').toUpperCase();
  const nameUpper = (activity?.name || '').toUpperCase();
  const isCycling =
    sportUpper.includes('BIKE') ||
    sportUpper.includes('RIDE') ||
    sportUpper.includes('CYCL') ||
    nameUpper.includes('RIDE') ||
    nameUpper.includes('BIKE') ||
    nameUpper.includes('CYCLING');
  const isSwim = sportUpper.includes('SWIM') || nameUpper.includes('SWIM');

  // Generate synthetic lap splits if distance > 0 and no native laps
  const getLapSplits = (): ActivityLap[] => {
    if (activity?.laps && activity.laps.length > 0) return activity.laps;

    const totalKm = activity?.distance_km || 0;
    const totalMins = activity?.moving_time_min || 0;

    if (totalKm <= 0 || totalMins <= 0) return [];

    const fullKmCount = Math.floor(totalKm);
    const avgPaceSec = (totalMins * 60) / totalKm;
    const laps: ActivityLap[] = [];

    for (let i = 1; i <= fullKmCount; i++) {
      const lapSec = avgPaceSec * (0.96 + Math.random() * 0.08);
      const lapMin = lapSec / 60;
      let paceOrSpeedStr = '';

      if (isCycling) {
        const speedKmh = (1.0 / (lapMin / 60)).toFixed(1);
        paceOrSpeedStr = `${speedKmh} km/u`;
      } else if (isSwim) {
        const sec100m = (lapMin * 60) / 10;
        const m = Math.floor(sec100m / 60);
        const s = Math.round(sec100m % 60);
        paceOrSpeedStr = `${m}:${s < 10 ? '0' : ''}${s} /100m`;
      } else {
        const m = Math.floor(lapMin);
        const s = Math.round((lapMin - m) * 60);
        paceOrSpeedStr = `${m}:${s < 10 ? '0' : ''}${s} /km`;
      }

      laps.push({
        lap_index: i,
        distance_km: 1.0,
        elapsed_time_min: lapMin,
        split_pace: paceOrSpeedStr,
        average_heartrate: activity?.average_heartrate
          ? Math.round(activity.average_heartrate + (Math.random() * 6 - 3))
          : undefined,
      });
    }

    const remainder = totalKm - fullKmCount;
    if (remainder > 0.05) {
      const remMin = (avgPaceSec * remainder) / 60;
      let paceOrSpeedStr = '';

      if (isCycling) {
        const speedKmh = (remainder / (remMin / 60)).toFixed(1);
        paceOrSpeedStr = `${speedKmh} km/u`;
      } else if (isSwim) {
        const sec100m = (remMin * 60) / (remainder * 10);
        const m = Math.floor(sec100m / 60);
        const s = Math.round(sec100m % 60);
        paceOrSpeedStr = `${m}:${s < 10 ? '0' : ''}${s} /100m`;
      } else {
        const paceMin = remMin / remainder;
        const m = Math.floor(paceMin);
        const s = Math.round((paceMin - m) * 60);
        paceOrSpeedStr = `${m}:${s < 10 ? '0' : ''}${s} /km`;
      }

      laps.push({
        lap_index: fullKmCount + 1,
        distance_km: Math.round(remainder * 100) / 100,
        elapsed_time_min: remMin,
        split_pace: paceOrSpeedStr,
        average_heartrate: activity?.average_heartrate,
      });
    }

    return laps;
  };

  const laps = getLapSplits();

  const renderMap = () => {
    if (!coordinates || coordinates.length === 0) return null;
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    if (!start || typeof start.latitude !== 'number' || isNaN(start.latitude)) return null;

    return (
      <View className="bg-theme-card border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 mb-4">
        <Text className="text-[11px] uppercase font-bold tracking-wider text-[#64748B] mb-3">
          GPS Route Map
        </Text>
        <View className="h-56 rounded-xl overflow-hidden border border-[#E2E8F0] dark:border-slate-800">
          <MapView
            style={{ width: '100%', height: '100%' }}
            initialRegion={{
              latitude: start.latitude,
              longitude: start.longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
            scrollEnabled
            zoomEnabled
          >
            <Polyline coordinates={coordinates} strokeColor="#FF5F3B" strokeWidth={4} />
            <Marker coordinate={start} title="Start" pinColor="green" />
            {end && <Marker coordinate={end} title="Finish" pinColor="red" />}
          </MapView>
        </View>
      </View>
    );
  };

  if (!visible) return null;

  const sparkScore = Math.round(activity?.spark_score || activity?.tss || 0);
  const distanceKmStr = activity?.distance_km ? activity.distance_km.toFixed(2) : '0.00';
  const durationMins = activity?.moving_time_min ? Math.round(activity.moving_time_min) : 0;
  const avgSpeedKmh =
    activity?.distance_km && activity?.moving_time_min
      ? (activity.distance_km / (activity.moving_time_min / 60)).toFixed(1)
      : '0.0';
  const avgPaceRun =
    activity?.distance_km && activity?.moving_time_min
      ? `${Math.floor(activity.moving_time_min / activity.distance_km)}:${Math.round(
          ((activity.moving_time_min / activity.distance_km) % 1) * 60
        )
          .toString()
          .padStart(2, '0')}`
      : '--:--';
  const avgPaceSwim =
    activity?.distance_km && activity?.moving_time_min
      ? `${Math.floor((activity.moving_time_min * 60) / (activity.distance_km * 10) / 60)}:${Math.round(
          ((activity.moving_time_min * 60) / (activity.distance_km * 10)) % 60
        )
          .toString()
          .padStart(2, '0')}`
      : '--:--';
  const avgHeartRate = activity?.average_heartrate ? Math.round(activity.average_heartrate) : null;
  const avgPower = activity?.average_power_w ? Math.round(activity.average_power_w) : null;
  const elevation = activity?.elevation_m ? Math.round(activity.elevation_m) : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1 }} className="flex-1 bg-theme-bg" edges={['top', 'bottom']}>
        {/* TOP PULL HANDLE INDICATOR */}
        <View className="items-center pt-3 pb-1.5 bg-theme-bg">
          <View className="w-11 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </View>

        {/* MODAL HEADER */}
        <View className="flex-row items-center px-5 py-3 border-b border-[#E2E8F0] dark:border-slate-800 bg-theme-bg z-10">
          <View className="flex-row items-center flex-1">
            <View className="w-10 h-10 rounded-full bg-[#F8FAFC] dark:bg-slate-800 items-center justify-center mr-3 border border-[#E2E8F0] dark:border-slate-700">
              <Ionicons
                name={getSportFilledIcon(activity?.sport_type, activity?.name)}
                size={20}
                color="#FF5F3B"
              />
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-theme-text" numberOfLines={1}>
                {activity?.name || 'Workout Telemetry'}
              </Text>
              <Text className="text-[11px] font-bold text-[#64748B] dark:text-slate-400 uppercase tracking-wider mt-0.5">
                {activity?.sport_type || 'WORKOUT'} · {activity?.start_date ? activity.start_date.substring(0, 10) : 'Recent'}
              </Text>
            </View>
          </View>
        </View>

        {loading && !activity ? (
          <View style={{ flex: 1 }} className="flex-1 items-center justify-center p-8">
            <ActivityIndicator size="large" color="#FF5F3B" />
            <Text className="text-xs font-bold text-[#64748B] mt-3">Loading telemetry & route map...</Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            className="flex-1 px-5 pt-4"
            contentContainerStyle={{ paddingBottom: 60, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
          >
            {/* TELEMETRY STATS SECTION */}
            <View className="bg-theme-card border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 mb-4">
              <Text className="text-[11px] uppercase font-bold tracking-wider text-[#64748B] mb-3">
                Key Telemetry
              </Text>

              {/* 1. Full-Width Spark Hero Banner */}
              <View className="flex-row items-center justify-between bg-[#FFF5EB] dark:bg-orange-950/25 px-3.5 py-2.5 rounded-xl mb-3 border border-[#FF5F3B]/20">
                <View className="flex-row items-center space-x-1.5">
                  <Ionicons name="sparkles" size={15} color="#FF5F3B" />
                  <Text className="text-xs font-bold text-[#64748B] dark:text-slate-300 ml-1">
                    Spark Score
                  </Text>
                </View>
                <Text
                  className="text-base font-bold text-[#FF5F3B] font-mono"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  +{sparkScore} Spark
                </Text>
              </View>

              {/* 2. 2x2 Clean Grid (No heavy black tile borders) */}
              <View className="flex-row flex-wrap justify-between gap-y-2.5">
                {/* Distance */}
                <View className="w-[48.5%] bg-[#F8FAFC] dark:bg-slate-800/40 p-3 rounded-xl">
                  <Text className="text-[11px] uppercase font-semibold text-[#64748B] tracking-wider mb-1">
                    Distance
                  </Text>
                  <Text
                    className="text-[22px] font-bold text-theme-text font-mono"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {distanceKmStr}{' '}
                    <Text className="text-[13px] font-medium text-[#64748B]">km</Text>
                  </Text>
                </View>

                {/* Duration */}
                <View className="w-[48.5%] bg-[#F8FAFC] dark:bg-slate-800/40 p-3 rounded-xl">
                  <Text className="text-[11px] uppercase font-semibold text-[#64748B] tracking-wider mb-1">
                    Duration
                  </Text>
                  <Text
                    className="text-[22px] font-bold text-theme-text font-mono"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {durationMins}{' '}
                    <Text className="text-[13px] font-medium text-[#64748B]">mins</Text>
                  </Text>
                </View>

                {/* Speed or Pace */}
                <View className="w-[48.5%] bg-[#F8FAFC] dark:bg-slate-800/40 p-3 rounded-xl">
                  <Text className="text-[11px] uppercase font-semibold text-[#64748B] tracking-wider mb-1">
                    {isCycling ? 'Avg Speed' : 'Avg Pace'}
                  </Text>
                  {isCycling ? (
                    <Text
                      className="text-[22px] font-bold text-theme-text font-mono"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {avgSpeedKmh}{' '}
                      <Text className="text-[13px] font-medium text-[#64748B]">km/u</Text>
                    </Text>
                  ) : isSwim ? (
                    <Text
                      className="text-[22px] font-bold text-theme-text font-mono"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {avgPaceSwim}{' '}
                      <Text className="text-[13px] font-medium text-[#64748B]">/100m</Text>
                    </Text>
                  ) : (
                    <Text
                      className="text-[22px] font-bold text-theme-text font-mono"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {avgPaceRun}{' '}
                      <Text className="text-[13px] font-medium text-[#64748B]">/km</Text>
                    </Text>
                  )}
                </View>

                {/* Avg Heart Rate */}
                <View className="w-[48.5%] bg-[#F8FAFC] dark:bg-slate-800/40 p-3 rounded-xl">
                  <Text className="text-[11px] uppercase font-semibold text-[#64748B] tracking-wider mb-1">
                    Avg Heart Rate
                  </Text>
                  {avgHeartRate ? (
                    <Text
                      className="text-[22px] font-bold text-rose-500 font-mono"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {avgHeartRate}{' '}
                      <Text className="text-[13px] font-medium text-[#64748B]">bpm</Text>
                    </Text>
                  ) : (
                    <Text
                      className="text-[22px] font-bold text-[#94A3B8] font-mono"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      --
                    </Text>
                  )}
                </View>

                {/* Extra metrics (Power & Elevation) if present */}
                {avgPower != null && (
                  <View className="w-[48.5%] bg-[#F8FAFC] dark:bg-slate-800/40 p-3 rounded-xl">
                    <Text className="text-[11px] uppercase font-semibold text-[#64748B] tracking-wider mb-1">
                      Avg Power
                    </Text>
                    <Text
                      className="text-[22px] font-bold text-amber-500 font-mono"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {avgPower}{' '}
                      <Text className="text-[13px] font-medium text-[#64748B]">W</Text>
                    </Text>
                  </View>
                )}

                {elevation != null && elevation > 0 && (
                  <View className="w-[48.5%] bg-[#F8FAFC] dark:bg-slate-800/40 p-3 rounded-xl">
                    <Text className="text-[11px] uppercase font-semibold text-[#64748B] tracking-wider mb-1">
                      Elevation Gain
                    </Text>
                    <Text
                      className="text-[22px] font-bold text-emerald-500 font-mono"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      +{elevation}{' '}
                      <Text className="text-[13px] font-medium text-[#64748B]">m</Text>
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* GPS ROUTE MAP */}
            {renderMap()}

            {/* STRENGTH SETS BREAKDOWN */}
            {strengthSets.length > 0 && (
              <View className="bg-theme-card border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 mb-4">
                <Text className="text-[11px] uppercase font-bold tracking-wider text-[#64748B] mb-3">
                  Strength Sets Breakdown ({strengthSets.length})
                </Text>

                {strengthSets.map((set, idx) => (
                  <View
                    key={`set-${idx}`}
                    className="flex-row justify-between items-center bg-[#F8FAFC] dark:bg-slate-800/40 p-3 rounded-xl mb-2 border border-[#F1F5F9] dark:border-slate-800/60"
                  >
                    <View className="flex-row items-center space-x-2.5">
                      <View className="w-6 h-6 rounded-full bg-theme-accent/20 items-center justify-center mr-2">
                        <Text className="text-xs font-bold text-theme-accent">{idx + 1}</Text>
                      </View>
                      <Text className="text-sm font-bold text-theme-text">{set.exerciseName}</Text>
                    </View>

                    <Text
                      className="text-xs font-bold font-mono text-theme-accent"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {set.weight ? `${set.weight} kg × ` : ''}
                      {set.reps ? `${set.reps} reps` : 'Complete'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* LAP SPLITS TABLE */}
            {laps.length > 0 && (
              <View className="bg-theme-card border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 mb-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-[11px] uppercase font-bold tracking-wider text-[#64748B]">
                    {isCycling ? 'Speed by Lap' : 'Lap Splits Table'} ({laps.length})
                  </Text>
                  {laps.length > 5 && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        setIsLapsExpanded(!isLapsExpanded);
                      }}
                      className="flex-row items-center space-x-1 py-0.5 px-1.5"
                    >
                      <Text className="text-xs font-bold text-theme-accent">
                        {isLapsExpanded ? 'Show less' : `Expand all (${laps.length})`}
                      </Text>
                      <Ionicons
                        name={isLapsExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color="#FF5F3B"
                        style={{ marginLeft: 2 }}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <View className="flex-row justify-between pb-2 border-b border-[#E2E8F0] dark:border-slate-800 px-1 mb-1">
                  <Text className="text-[11px] uppercase font-semibold text-[#94A3B8] w-12">Lap</Text>
                  <Text className="text-[11px] uppercase font-semibold text-[#94A3B8] w-20">Dist</Text>
                  <Text className="text-[11px] uppercase font-semibold text-[#94A3B8] flex-1">
                    {isCycling ? 'Speed (km/u)' : isSwim ? 'Pace (/100m)' : 'Split Pace'}
                  </Text>
                  <Text className="text-[11px] uppercase font-semibold text-[#94A3B8] w-16 text-right">Avg HR</Text>
                </View>

                {laps.length <= 5 || isLapsExpanded ? (
                  <>
                    {laps.map((lap, idx) => (
                      <View
                        key={`lap-${lap.lap_index}`}
                        className={`flex-row justify-between items-center py-2.5 px-1 ${
                          idx !== laps.length - 1 ? 'border-b border-[#F1F5F9] dark:border-slate-800/60' : ''
                        }`}
                      >
                        <Text
                          className="text-xs font-semibold text-[#475569] dark:text-slate-300 w-12"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          #{lap.lap_index}
                        </Text>
                        <Text
                          className="text-xs font-semibold font-mono text-theme-text w-20"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {lap.distance_km.toFixed(2)} km
                        </Text>
                        <Text
                          className="text-xs font-medium font-mono text-[#64748B] dark:text-slate-400 flex-1"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {lap.split_pace || `${Math.round(lap.elapsed_time_min)} min`}
                        </Text>
                        <Text
                          className={`text-xs font-medium font-mono w-16 text-right ${
                            lap.average_heartrate ? 'text-rose-500' : 'text-[#94A3B8]'
                          }`}
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : '--'}
                        </Text>
                      </View>
                    ))}
                    {laps.length > 5 && isLapsExpanded && (
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.selectionAsync();
                          setIsLapsExpanded(false);
                        }}
                        className="pt-2.5 pb-1 items-center justify-center flex-row space-x-1"
                      >
                        <Text className="text-xs font-bold text-theme-accent">Show less</Text>
                        <Ionicons name="chevron-up" size={13} color="#FF5F3B" style={{ marginLeft: 2 }} />
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                    {/* First 3 laps */}
                    {laps.slice(0, 3).map((lap) => (
                      <View
                        key={`lap-${lap.lap_index}`}
                        className="flex-row justify-between items-center py-2.5 px-1 border-b border-[#F1F5F9] dark:border-slate-800/60"
                      >
                        <Text
                          className="text-xs font-semibold text-[#475569] dark:text-slate-300 w-12"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          #{lap.lap_index}
                        </Text>
                        <Text
                          className="text-xs font-semibold font-mono text-theme-text w-20"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {lap.distance_km.toFixed(2)} km
                        </Text>
                        <Text
                          className="text-xs font-medium font-mono text-[#64748B] dark:text-slate-400 flex-1"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {lap.split_pace || `${Math.round(lap.elapsed_time_min)} min`}
                        </Text>
                        <Text
                          className={`text-xs font-medium font-mono w-16 text-right ${
                            lap.average_heartrate ? 'text-rose-500' : 'text-[#94A3B8]'
                          }`}
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : '--'}
                        </Text>
                      </View>
                    ))}

                    {/* Expandable in-between pill button */}
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        setIsLapsExpanded(true);
                      }}
                      activeOpacity={0.7}
                      className="py-2.5 px-3 my-1.5 items-center justify-center bg-[#F8FAFC] dark:bg-slate-800/50 rounded-xl flex-row border border-[#E2E8F0] dark:border-slate-800 active:bg-theme-accent/10"
                    >
                      <Ionicons name="ellipsis-horizontal" size={14} color="#64748B" />
                      <Text className="text-xs font-semibold text-theme-accent mx-2">
                        Show {laps.length - 4} in-between laps
                      </Text>
                      <Ionicons name="chevron-down" size={14} color="#FF5F3B" />
                    </TouchableOpacity>

                    {/* Final lap */}
                    {(() => {
                      const lastLap = laps[laps.length - 1];
                      return (
                        <View
                          key={`lap-${lastLap.lap_index}`}
                          className="flex-row justify-between items-center py-2.5 px-1"
                        >
                          <Text
                            className="text-xs font-semibold text-[#475569] dark:text-slate-300 w-12"
                            style={{ fontVariant: ['tabular-nums'] }}
                          >
                            #{lastLap.lap_index}
                          </Text>
                          <Text
                            className="text-xs font-semibold font-mono text-theme-text w-20"
                            style={{ fontVariant: ['tabular-nums'] }}
                          >
                            {lastLap.distance_km.toFixed(2)} km
                          </Text>
                          <Text
                            className="text-xs font-medium font-mono text-[#64748B] dark:text-slate-400 flex-1"
                            style={{ fontVariant: ['tabular-nums'] }}
                          >
                            {lastLap.split_pace || `${Math.round(lastLap.elapsed_time_min)} min`}
                          </Text>
                          <Text
                            className={`text-xs font-medium font-mono w-16 text-right ${
                              lastLap.average_heartrate ? 'text-rose-500' : 'text-[#94A3B8]'
                            }`}
                            style={{ fontVariant: ['tabular-nums'] }}
                          >
                            {lastLap.average_heartrate ? `${Math.round(lastLap.average_heartrate)} bpm` : '--'}
                          </Text>
                        </View>
                      );
                    })()}
                  </>
                )}
              </View>
            )}

            {/* KUDOS ACTION BAR */}
            <View className="flex-row justify-between items-center bg-theme-card border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 mb-4">
              <View className="flex-row items-center space-x-2">
                <Ionicons name="sparkles" size={18} color="#FF5F3B" />
                <Text className="text-sm font-bold text-theme-text ml-1.5">
                  {kudosCount} Kudos Received
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleToggleKudos}
                className={`flex-row items-center space-x-1.5 px-4 py-2 rounded-full ${
                  hasKudosed ? 'bg-rose-500' : 'bg-theme-accent'
                }`}
              >
                <Ionicons name={hasKudosed ? 'heart' : 'heart-outline'} size={15} color="#FFFFFF" />
                <Text className="text-xs font-bold text-white ml-1">
                  {hasKudosed ? 'Kudos Given!' : 'Give Kudos'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* COMMENTS SECTION */}
            <View className="bg-theme-card border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 mb-6">
              <Text className="text-[11px] uppercase font-bold tracking-wider text-[#64748B] mb-3">
                Comments ({comments.length})
              </Text>

              {comments.length === 0 ? (
                <Text className="text-xs text-[#94A3B8] italic mb-4 text-center py-2">
                  No comments yet. Be the first to leave a message!
                </Text>
              ) : (
                comments.map((c) => (
                  <View
                    key={`comment-${c.id}`}
                    className="bg-[#F8FAFC] dark:bg-slate-800/40 p-3 rounded-xl mb-2.5 border border-[#F1F5F9] dark:border-slate-800/60"
                  >
                    <View className="flex-row justify-between items-center mb-1">
                      <View className="flex-row items-center space-x-2">
                        {c.profile_picture_url ? (
                          <Image source={{ uri: c.profile_picture_url }} className="w-5 h-5 rounded-full mr-1.5" />
                        ) : (
                          <View className="w-5 h-5 rounded-full bg-theme-accent/20 items-center justify-center mr-1.5">
                            <Text className="text-[10px] font-black text-theme-accent">
                              {c.username ? c.username.charAt(0).toUpperCase() : 'U'}
                            </Text>
                          </View>
                        )}
                        <Text className="text-xs font-bold text-theme-text">{c.username}</Text>
                      </View>

                      {c.user_id === user?.id && (
                        <TouchableOpacity onPress={() => handleDeleteComment(c.id)}>
                          <Ionicons name="trash-outline" size={14} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text className="text-xs font-medium text-theme-text pl-7">{c.comment}</Text>
                  </View>
                ))
              )}

              {/* COMMENT COMPOSER WITH @MENTION */}
              <View className="mt-2">
                <CommentComposer onSendComment={handleSendComment} />
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};
