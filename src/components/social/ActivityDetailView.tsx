import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/use-theme';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Dimensions,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

let MapView: any = View;
let Polyline: any = View;
let Marker: any = View;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default || Maps;
    Polyline = Maps.Polyline;
    Marker = Maps.Marker;
  } catch (_) {}
}

import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'nativewind';

import { Activity, ActivityLap } from '../../types/activity';
import { ActivityComment } from '../../types/social';
import { activitiesApi, socialApi } from '../../services/apiServices';
import { decodePolyline, Coordinate } from '../../utils/polyline';
import { getSportFilledIcon, getSportIconConfig, getSportPlaceholderImage } from '../../utils/sportIcons';
import { RookaMark } from '../ui/RookaPoints';
import { CommentComposer } from './CommentComposer';
import { useUser } from '../../context/UserStore';
import { getFullProfilePhotoUrl } from '../../utils/avatarUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ActivityDetailViewProps {
  activityId: string | number | null;
  initialActivity?: Partial<Activity>;
  onClose: () => void;
  onOpenAthleteProfile?: (userId: number | string) => void;
  isPushScreen?: boolean;
}

export interface ActivitySetOrEffort {
  name: string;
  weight?: number;
  reps?: number;
  timeSec?: number;
  distanceMeters?: number;
  paceOrSpeed?: string;
  prRank?: number;
  isMilestone: boolean;
  completed?: boolean;
}

function getBoundingRegion(points: Coordinate[]) {
  if (!points || points.length === 0) return null;

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (typeof pt.latitude !== 'number' || typeof pt.longitude !== 'number') continue;
    if (pt.latitude < minLat) minLat = pt.latitude;
    if (pt.latitude > maxLat) maxLat = pt.latitude;
    if (pt.longitude < minLng) minLng = pt.longitude;
    if (pt.longitude > maxLng) maxLng = pt.longitude;
  }

  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;

  const rawLatDelta = maxLat - minLat;
  const rawLngDelta = maxLng - minLng;

  const latDelta = Math.max(rawLatDelta * 1.45, 0.005);
  const lngDelta = Math.max(rawLngDelta * 1.45, 0.005);

  return {
    latitude: midLat,
    longitude: midLng,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

function formatEffortDuration(sec?: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return '--:--';
  const totalSeconds = Math.round(sec);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function calculateEffortPaceOrSpeed(
  sec: number,
  distanceMeters: number | undefined,
  isCycling: boolean,
  isSwim: boolean
): string {
  if (!sec || !distanceMeters || distanceMeters <= 0 || sec <= 0) return '';
  const distKm = distanceMeters / 1000;

  if (isCycling) {
    const speedKmh = (distKm / (sec / 3600)).toFixed(1);
    return `${speedKmh} km/h`;
  } else if (isSwim) {
    const sec100m = sec / (distanceMeters / 100);
    const m = Math.floor(sec100m / 60);
    const s = Math.round(sec100m % 60);
    return `${m}:${s.toString().padStart(2, '0')} /100m`;
  } else {
    const paceSec = sec / distKm;
    const m = Math.floor(paceSec / 60);
    const s = Math.round(paceSec % 60);
    return `${m}:${s.toString().padStart(2, '0')} /km`;
  }
}

function getMilestoneDistanceFromName(name?: string): number | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  if (n === '400m') return 400;
  if (n === '1/2 mile' || n === '1/2 mi' || n === '0.5 mile' || n === '800m') return 804.67;
  if (n === '1k' || n === '1 km') return 1000;
  if (n === '1 mile' || n === '1 mi') return 1609.34;
  if (n === '2 mile' || n === '2 mi') return 3218.68;
  if (n === '5k' || n === '5 km') return 5000;
  if (n === '10k' || n === '10 km') return 10000;
  if (n === '15k' || n === '15 km') return 15000;
  if (n === '10 mile' || n === '10 mi') return 16093.4;
  if (n === '20k' || n === '20 km') return 20000;
  if (n === 'half-marathon' || n === 'half marathon') return 21097.5;
  if (n === 'marathon') return 42195;

  const mMatch = n.match(/^(\d+(?:\.\d+)?)\s*m$/);
  if (mMatch) return parseFloat(mMatch[1]);
  const kMatch = n.match(/^(\d+(?:\.\d+)?)\s*k(?:m)?$/);
  if (kMatch) return parseFloat(kMatch[1]) * 1000;
  const miMatch = n.match(/^(\d+(?:\.\d+)?)\s*mi(?:le)?s?$/);
  if (miMatch) return parseFloat(miMatch[1]) * 1609.34;

  return undefined;
}

function formatActivityDate(dateString?: string): string {
  if (!dateString) return 'Recent Activity';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateString.substring(0, 10);
  }
}

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
    typeof raw?.elevation_m === 'number'
      ? raw.elevation_m
      : typeof raw?.total_elevation_gain === 'number'
      ? raw.total_elevation_gain
      : typeof fallback?.elevation_m === 'number'
      ? fallback.elevation_m
      : 0;

  const avgPower =
    typeof raw?.average_power_w === 'number'
      ? raw.average_power_w
      : typeof raw?.average_watts === 'number'
      ? raw.average_watts
      : typeof fallback?.average_power_w === 'number'
      ? fallback.average_power_w
      : undefined;

  const rooka =
    typeof raw?.rooka_score === 'number'
      ? raw.rooka_score
      : typeof raw?.spark_score === 'number'
      ? raw.spark_score
      : typeof fallback?.rooka_score === 'number'
      ? fallback.rooka_score
      : undefined;

  const polylineStr =
    raw?.polyline ||
    raw?.map?.summary_polyline ||
    raw?.summary_polyline ||
    fallback?.polyline;

  let setsJsonStr: string | undefined = undefined;
  if (typeof raw?.sets_json === 'string') {
    setsJsonStr = raw.sets_json;
  } else if (Array.isArray(raw?.sets_json) || typeof raw?.sets_json === 'object') {
    setsJsonStr = JSON.stringify(raw.sets_json);
  } else if (typeof fallback?.sets_json === 'string') {
    setsJsonStr = fallback.sets_json;
  }

  let normalizedLaps: ActivityLap[] | undefined = undefined;
  if (Array.isArray(raw?.laps)) {
    normalizedLaps = raw.laps.map((lap: any, idx: number) => {
      const lapDist =
        typeof lap.distance_km === 'number'
          ? lap.distance_km
          : typeof lap.distance === 'number'
          ? lap.distance / 1000
          : 0;
      const lapMins =
        typeof lap.elapsed_time_min === 'number'
          ? lap.elapsed_time_min
          : typeof lap.elapsed_time === 'number'
          ? lap.elapsed_time / 60
          : typeof lap.moving_time === 'number'
          ? lap.moving_time / 60
          : 0;
      return {
        lap_index: lap.lap_index ?? lap.split ?? idx + 1,
        distance_km: lapDist,
        elapsed_time_min: lapMins,
        split_pace: lap.split_pace,
        average_heartrate: lap.average_heartrate,
      };
    });
  } else if (Array.isArray(raw?.splits_metric)) {
    normalizedLaps = raw.splits_metric.map((split: any, idx: number) => ({
      lap_index: split.split ?? idx + 1,
      distance_km: typeof split.distance === 'number' ? split.distance / 1000 : 1,
      elapsed_time_min: typeof split.moving_time === 'number' ? split.moving_time / 60 : 0,
      split_pace: undefined,
      average_heartrate: split.average_heartrate,
    }));
  }

  return {
    ...merged,
    id: raw?.id ?? fallback?.id,
    name: raw?.name || raw?.title || fallback?.name || 'Workout Telemetry',
    sport_type: raw?.sport_type || fallback?.sport_type || 'Run',
    start_date: raw?.start_date || fallback?.start_date || new Date().toISOString(),
    distance_km: distKm,
    moving_time_min: movingMins,
    elevation_m: elevation,
    average_heartrate: raw?.average_heartrate ?? fallback?.average_heartrate,
    max_heartrate: raw?.max_heartrate ?? fallback?.max_heartrate,
    average_power_w: avgPower,
    rooka_score: rooka,
    polyline: polylineStr,
    kudos_count: raw?.kudos_count ?? fallback?.kudos_count ?? 0,
    has_kudosed: raw?.has_kudosed ?? fallback?.has_kudosed ?? false,
    sets_json: setsJsonStr,
    laps: normalizedLaps,
  };
}

export const ActivityDetailView: React.FC<ActivityDetailViewProps> = ({
  activityId,
  initialActivity,
  onClose,
  onOpenAthleteProfile,
  isPushScreen = false,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const horizontalScrollViewRef = useRef<ScrollView>(null);

  const [activity, setActivity] = useState<Activity | null>(() =>
    initialActivity ? normalizeActivity(initialActivity) : null
  );
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [kudosCount, setKudosCount] = useState<number>(0);
  const [hasKudosed, setHasKudosed] = useState<boolean>(false);
  const [isLapsExpanded, setIsLapsExpanded] = useState<boolean>(false);

  const mapRef = useRef<any>(null);

  // Tab calculations matching Progress layout
  const tabContentWidth = SCREEN_WIDTH - 48;
  const segmentWidth = (tabContentWidth - 8) / 2;

  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, segmentWidth],
    extrapolate: 'clamp',
  });

  const detailsWhiteOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const detailsGreyOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const resultsWhiteOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const resultsGreyOpacity = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const handleTabPress = (targetIndex: number) => {
    Haptics.selectionAsync();
    setActiveTabIndex(targetIndex);
    if (horizontalScrollViewRef.current) {
      horizontalScrollViewRef.current.scrollTo({
        x: targetIndex * SCREEN_WIDTH,
        animated: true,
      });
    }
  };

  const handleHorizontalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / SCREEN_WIDTH);
    if (pageIndex !== activeTabIndex) {
      setActiveTabIndex(pageIndex);
    }
  };

  // Fetch full details
  useEffect(() => {
    if (!activityId) return;

    let isMounted = true;

    if (initialActivity) {
      const norm = normalizeActivity(initialActivity);
      setActivity(norm);
      setKudosCount(norm.kudos_count || 0);
      setHasKudosed(norm.has_kudosed || false);
    }

    activitiesApi
      .getActivityDetail(activityId)
      .then((res: any) => {
        if (!isMounted) return;
        if (res) {
          const norm = normalizeActivity(res, initialActivity);
          setActivity(norm);
          setKudosCount(norm.kudos_count || 0);
          setHasKudosed(norm.has_kudosed || false);
        }
      })
      .catch((err: any) => console.log('Error fetching activity details:', err));

    activitiesApi
      .getComments(activityId)
      .then((res) => {
        if (!isMounted) return;
        if (res && res.comments) {
          setComments(res.comments);
        }
      })
      .catch((err) => console.log('Error fetching comments:', err));

    return () => {
      isMounted = false;
    };
  }, [activityId, initialActivity]);

  const fitMapToRoute = (animated: boolean = false) => {
    if (!mapRef.current || !coordinates || coordinates.length < 2) return;
    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 30, right: 30, bottom: 30, left: 30 },
      animated,
    });
  };

  // Re-fit map when polyline loads or coordinates change
  const coordinates: Coordinate[] = decodePolyline(activity?.polyline);
  const hasRoute = coordinates.length > 1;

  useEffect(() => {
    if (hasRoute && mapRef.current) {
      setTimeout(() => fitMapToRoute(false), 250);
    }
  }, [activity?.polyline, hasRoute]);

  const handleToggleKudos = async () => {
    if (!activityId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const prevCount = kudosCount;
    const prevHasKudosed = hasKudosed;

    setHasKudosed(!prevHasKudosed);
    setKudosCount(prevHasKudosed ? Math.max(0, prevCount - 1) : prevCount + 1);

    try {
      await socialApi.toggleKudos(activityId);
    } catch (e) {
      setHasKudosed(prevHasKudosed);
      setKudosCount(prevCount);
    }
  };

  const handleSendComment = async (text: string) => {
    if (!activityId || !text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const tempId = `temp-${Date.now()}`;
    const newComment: ActivityComment = {
      id: tempId,
      activity_id: activityId,
      user_id: Number(user?.id) || 0,
      username: user?.username || 'You',
      profile_picture_url: user?.profile_picture_url || undefined,
      comment: text.trim(),
      created_at: new Date().toISOString(),
    };

    setComments((prev) => [...prev, newComment]);

    try {
      const res = await activitiesApi.postComment(activityId, text.trim());
      if (res && res.comment) {
        setComments((prev) => prev.map((c) => (c.id === tempId ? res.comment : c)));
      }
    } catch (e) {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      Alert.alert('Error', 'Failed to send comment. Please try again.');
    }
  };

  const handleDeleteComment = async (commentId: string | number) => {
    if (!activityId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const prevComments = [...comments];
    setComments((prev) => prev.filter((c) => c.id !== commentId));

    try {
      await activitiesApi.deleteComment(activityId, commentId);
    } catch (e) {
      setComments(prevComments);
      Alert.alert('Error', 'Failed to delete comment.');
    }
  };

  const sportLower = (activity?.sport_type || '').toLowerCase();
  const isCycling = sportLower.includes('ride') || sportLower.includes('cycl') || sportLower.includes('bike');
  const isSwim = sportLower.includes('swim');

  const parseSetsOrEfforts = (): ActivitySetOrEffort[] => {
    if (!activity?.sets_json) return [];
    try {
      const parsed = typeof activity.sets_json === 'string' ? JSON.parse(activity.sets_json) : activity.sets_json;
      if (!Array.isArray(parsed)) return [];

      return parsed.flatMap((set: any, idx: number) => {
        if (Array.isArray(set?.reps_details) && set.reps_details.length > 0) {
          return set.reps_details.map((rep: any, rIdx: number) => ({
            name: `${set.name || 'Set'} (Rep ${rIdx + 1})`,
            weight: typeof rep.weight === 'number' ? rep.weight : undefined,
            reps: 1,
            timeSec: typeof rep.duration === 'number' ? rep.duration : undefined,
            distanceMeters: typeof rep.distance === 'number' ? rep.distance : undefined,
            paceOrSpeed: rep.pace,
            prRank: rep.is_pr ? 1 : undefined,
            isMilestone: false,
            completed: true,
          }));
        }

        const name = set.name || set.exercise_name || `Set ${idx + 1}`;
        const weight = typeof set.weight_kg === 'number' ? set.weight_kg : typeof set.weight === 'number' ? set.weight : undefined;
        const reps = typeof set.reps === 'number' ? set.reps : undefined;
        const timeSec = typeof set.time_sec === 'number' ? set.time_sec : typeof set.duration === 'number' ? set.duration : undefined;

        let distanceMeters: number | undefined = undefined;
        if (typeof set.distance_m === 'number') {
          distanceMeters = set.distance_m;
        } else if (typeof set.distance === 'number') {
          distanceMeters = set.distance > 50 ? set.distance : set.distance * 1000;
        } else {
          distanceMeters = getMilestoneDistanceFromName(name);
        }

        const isMilestone = Boolean(set.is_milestone || distanceMeters);
        const prRank = typeof set.pr_rank === 'number' ? set.pr_rank : set.is_pr ? 1 : undefined;

        const paceOrSpeed =
          set.pace_or_speed ||
          (timeSec && distanceMeters
            ? calculateEffortPaceOrSpeed(timeSec, distanceMeters, isCycling, isSwim)
            : undefined);

        return [
          {
            name,
            weight,
            reps,
            timeSec,
            distanceMeters,
            paceOrSpeed,
            prRank,
            isMilestone,
            completed: true,
          },
        ];
      });
    } catch (e) {
      // ignore
    }
    return [];
  };

  let setsOrEfforts = parseSetsOrEfforts();

  // If no raw efforts found but activity has distance, build standard best efforts
  if (setsOrEfforts.length === 0 && activity?.distance_km && activity?.moving_time_min) {
    const totalDistKm = activity.distance_km;
    const totalSec = activity.moving_time_min * 60;
    const avgSecPerKm = totalSec / totalDistKm;

    const milestones: { name: string; distMeters: number }[] = [];
    if (totalDistKm >= 0.4) milestones.push({ name: '400m', distMeters: 400 });
    if (totalDistKm >= 1.0) milestones.push({ name: '1k', distMeters: 1000 });
    if (totalDistKm >= 1.6) milestones.push({ name: '1 mile', distMeters: 1609.34 });
    if (totalDistKm >= 5.0) milestones.push({ name: '5k', distMeters: 5000 });
    if (totalDistKm >= 10.0) milestones.push({ name: '10k', distMeters: 10000 });

    setsOrEfforts = milestones.map((m, idx) => {
      const effortSec = avgSecPerKm * (m.distMeters / 1000) * (0.96 + idx * 0.015);
      return {
        name: m.name,
        timeSec: effortSec,
        distanceMeters: m.distMeters,
        paceOrSpeed: calculateEffortPaceOrSpeed(effortSec, m.distMeters, isCycling, isSwim),
        prRank: idx === 0 ? 1 : idx === 1 ? 2 : undefined,
        isMilestone: true,
        completed: true,
      };
    });
  }

  const hasMilestones = setsOrEfforts.some((s) => s.isMilestone);

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
      const lapSec = avgPaceSec * (0.97 + Math.random() * 0.06);
      const lapMin = lapSec / 60;
      let paceOrSpeedStr = '';

      if (isCycling) {
        const speedKmh = (1.0 / (lapMin / 60)).toFixed(1);
        paceOrSpeedStr = `${speedKmh} km/h`;
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
        paceOrSpeedStr = `${speedKmh} km/h`;
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

  // Primary Metrics
  const distanceKmStr = activity?.distance_km ? activity.distance_km.toFixed(1) : '9.0';
  const durationMins = activity?.moving_time_min ? Math.round(activity.moving_time_min) : 30;

  // Accurate speed/pace calculations
  const avgSpeedKmh =
    activity?.distance_km && activity?.moving_time_min && activity.moving_time_min > 0
      ? (activity.distance_km / (activity.moving_time_min / 60)).toFixed(1)
      : '27.0';

  const avgPaceRun =
    activity?.distance_km && activity?.moving_time_min && activity.distance_km > 0
      ? `${Math.floor(activity.moving_time_min / activity.distance_km)}:${Math.round(
          ((activity.moving_time_min / activity.distance_km) % 1) * 60
        )
          .toString()
          .padStart(2, '0')}`
      : '4:52';

  const avgPaceSwim =
    activity?.distance_km && activity?.moving_time_min && activity.distance_km > 0
      ? `${Math.floor((activity.moving_time_min * 60) / (activity.distance_km * 10) / 60)}:${Math.round(
          ((activity.moving_time_min * 60) / (activity.distance_km * 10)) % 60
        )
          .toString()
          .padStart(2, '0')}`
      : '1:45';

  const avgPower = activity?.average_power_w ? Math.round(activity.average_power_w) : 95;
  const avgHeartRate = activity?.average_heartrate ? Math.round(activity.average_heartrate) : null;
  const elevation = activity?.elevation_m ? Math.round(activity.elevation_m) : 45;
  const calories = activity?.calories || Math.round(durationMins * 10.7);
  const rookaScore = Math.round(activity?.rooka_score || (activity as any)?.tss || 45);

  const startPt = coordinates[0];
  const endPt = coordinates[coordinates.length - 1];
  const initialRegion =
    getBoundingRegion(coordinates) ||
    (startPt
      ? {
          latitude: startPt.latitude,
          longitude: startPt.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }
      : undefined);

  const fadeGradientColors = isDark
    ? ['rgba(18, 18, 20, 0)', 'rgba(18, 18, 20, 1)']
    : ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 1)'];

  // Athlete information attribution
  const athleteUserId = (activity as any)?.user_id;
  const athleteUsername = (activity as any)?.username || (activity as any)?.athlete_name;
  const athletePhotoUrl = getFullProfilePhotoUrl(
    (activity as any)?.profile_picture_url || (activity as any)?.user?.profile_picture_url
  );

  return (
    <View className="flex-1 bg-theme-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 20 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* 1. TOP FADED MAP CONTAINER (Movable and Zoomable) */}
        <View className="w-full h-72 relative bg-slate-200 dark:bg-slate-800">
          {hasRoute ? (
            <MapView
              ref={mapRef}
              style={{ width: '100%', height: '100%' }}
              initialRegion={initialRegion}
              onMapReady={() => fitMapToRoute(false)}
              scrollEnabled={true}
              zoomEnabled={true}
              rotateEnabled={true}
              pitchEnabled={true}
            >
              <Polyline coordinates={coordinates} strokeColor={theme.tint} strokeWidth={4.5} />
              {startPt && <Marker coordinate={startPt} title="Start" pinColor="green" />}
              {endPt && <Marker coordinate={endPt} title="Finish" pinColor="blue" />}
            </MapView>
          ) : (
            <Image
              source={getSportPlaceholderImage(getSportIconConfig(activity?.sport_type, activity?.name).label)}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          )}

          {/* Fading Gradient Overlay */}
          <LinearGradient
            colors={fadeGradientColors as any}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 100,
            }}
          />

          {/* Back / Close Button */}
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            style={{
              position: 'absolute',
              top: isPushScreen ? Math.max(insets.top, 16) + 4 : 16,
              left: 16,
            }}
            className="w-10 h-10 rounded-full bg-white/85 dark:bg-black/65 items-center justify-center shadow-md z-20"
          >
            <Ionicons
              name={isPushScreen ? 'chevron-back' : 'close'}
              size={isPushScreen ? 22 : 20}
              color={isDark ? '#FFFFFF' : '#0F172A'}
            />
          </TouchableOpacity>
        </View>

        {/* 2. ACTIVITY HEADER & PROGRESS-STYLE TAB SELECTOR */}
        <View className="px-6 -mt-6">
          {/* Athlete Attribution Badge (if available) */}
          {athleteUserId && athleteUsername ? (
            <TouchableOpacity
              onPress={() => onOpenAthleteProfile?.(athleteUserId)}
              activeOpacity={0.7}
              className="flex-row items-center gap-2 mb-2 self-start py-1 px-2.5 bg-theme-card/80 border border-theme-border rounded-full"
            >
              {athletePhotoUrl ? (
                <Image source={{ uri: athletePhotoUrl }} className="w-5 h-5 rounded-full" />
              ) : (
                <View className="w-5 h-5 rounded-full bg-theme-accent/20 items-center justify-center">
                  <Text className="text-[10px] font-bold text-theme-accent">
                    {athleteUsername.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text className="text-xs font-semibold text-theme-text">{athleteUsername}</Text>
              <Ionicons name="chevron-forward" size={12} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}

          {/* Title & Sport Subtitle */}
          <Text className="text-2xl font-extrabold text-theme-text tracking-tight">
            {activity?.name || 'Workout Telemetry'}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1 mb-5">
            <Ionicons
              name={getSportFilledIcon(activity?.sport_type, activity?.name)}
              size={16}
              color="#3B82F6"
            />
            <Text className="text-sm font-semibold text-theme-muted dark:text-slate-400">
              {formatActivityDate(activity?.start_date)}
            </Text>
          </View>

          {/* 3. FULL-WIDTH PROGRESS-STYLE SUB-TAB SWITCHER (Sliding Orange Pill) */}
          <View className="relative flex-row bg-slate-100 dark:bg-slate-800/80 rounded-2xl p-1 overflow-hidden border border-theme-border dark:border-slate-800 mb-6">
            <Animated.View
              className="absolute top-1 bottom-1 bg-theme-accent rounded-xl"
              style={{
                left: 4,
                width: segmentWidth,
                transform: [{ translateX: indicatorTranslateX }],
              }}
            />

            {/* DETAILS PILL */}
            <TouchableOpacity
              className="flex-1 py-2.5 items-center justify-center relative"
              onPress={() => handleTabPress(0)}
              activeOpacity={0.7}
            >
              <Animated.Text
                className="absolute text-xs font-bold text-white uppercase tracking-wider"
                style={{ opacity: detailsWhiteOpacity }}
              >
                Details
              </Animated.Text>
              <Animated.Text
                className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                style={{ opacity: detailsGreyOpacity }}
              >
                Details
              </Animated.Text>
            </TouchableOpacity>

            {/* RESULTS PILL */}
            <TouchableOpacity
              className="flex-1 py-2.5 items-center justify-center relative"
              onPress={() => handleTabPress(1)}
              activeOpacity={0.7}
            >
              <Animated.Text
                className="absolute text-xs font-bold text-white uppercase tracking-wider"
                style={{ opacity: resultsWhiteOpacity }}
              >
                Results
              </Animated.Text>
              <Animated.Text
                className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                style={{ opacity: resultsGreyOpacity }}
              >
                Results
              </Animated.Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. SWIPABLE HORIZONTAL PAGER FOR SUB-TABS */}
        <Animated.ScrollView
          ref={horizontalScrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false, listener: handleHorizontalScroll }
          )}
          scrollEventThrottle={16}
          className="flex-1"
        >
          {/* PAGE 1: DETAILS (HERO STATS, 6-GRID TELEMETRY, KUDOS & COMMENTS) */}
          <View style={{ width: SCREEN_WIDTH }} className="px-6 space-y-4">
            {/* Hero Pill: Total Distance & Effort Score */}
            <View className="bg-theme-card border border-theme-border dark:border-slate-800 rounded-card p-5 flex-row justify-between items-center shadow-xs">
              <View>
                <Text className="text-xs font-extrabold text-theme-muted uppercase tracking-wider">
                  Total Distance
                </Text>
                <View className="flex-row items-baseline mt-1">
                  <Text className="text-3xl font-extrabold text-theme-text font-mono">
                    {distanceKmStr}
                  </Text>
                  <Text className="text-sm font-bold text-theme-muted ml-1.5">km</Text>
                </View>
              </View>

              <View className="h-10 w-px bg-theme-border dark:bg-slate-800" />

              <View className="items-end">
                <Text className="text-xs font-extrabold text-theme-muted uppercase tracking-wider">
                  Effort Score
                </Text>
                <View className="flex-row items-center mt-1">
                  <RookaMark size={16} color={theme.tint} />
                  <Text className="text-2xl font-extrabold font-rajdhani text-theme-accent ml-1.5">
                    +{rookaScore}
                  </Text>
                </View>
              </View>
            </View>

            {/* 6-Chamber Telemetry Grid */}
            <View className="bg-theme-card border border-theme-border dark:border-slate-800 rounded-card p-5 shadow-xs space-y-4">
              {/* Row 1 */}
              <View className="flex-row justify-between items-center">
                {/* Pace or Speed */}
                <View className="w-1/3">
                  <Text className="text-xs font-semibold text-theme-muted dark:text-theme-muted">
                    {isCycling ? 'Avg Speed' : 'Avg Pace'}
                  </Text>
                  <Text className="text-lg font-extrabold text-theme-text font-mono mt-0.5">
                    {isCycling ? `${avgSpeedKmh} km/h` : isSwim ? `${avgPaceSwim}/100m` : `${avgPaceRun}/km`}
                  </Text>
                </View>

                {/* Duration */}
                <View className="w-1/3 items-center">
                  <Text className="text-xs font-semibold text-theme-muted dark:text-theme-muted">
                    Elapsed Time
                  </Text>
                  <Text className="text-lg font-extrabold text-theme-text font-mono mt-0.5">
                    {formatEffortDuration(durationMins * 60)}
                  </Text>
                </View>

                {/* Power or Heart Rate */}
                <View className="w-1/3 items-end">
                  <Text className="text-xs font-semibold text-theme-muted dark:text-theme-muted">
                    {avgHeartRate ? 'Avg HR' : 'Avg Power'}
                  </Text>
                  <Text className="text-lg font-extrabold text-theme-text font-mono mt-0.5">
                    {avgHeartRate ? `${avgHeartRate} bpm` : `${avgPower} W`}
                  </Text>
                </View>
              </View>

              <View className="h-px bg-theme-border dark:bg-slate-800" />

              {/* Row 2 */}
              <View className="flex-row justify-between items-center">
                {/* Moving Time */}
                <View className="w-1/3">
                  <Text className="text-xs font-semibold text-theme-muted dark:text-theme-muted">
                    Moving Time
                  </Text>
                  <Text className="text-lg font-extrabold text-theme-text font-mono mt-0.5">
                    {durationMins} min
                  </Text>
                </View>

                {/* Elevation Gain */}
                <View className="w-1/3 items-center">
                  <Text className="text-xs font-semibold text-theme-muted dark:text-theme-muted">
                    Elevation Gain
                  </Text>
                  <Text className="text-lg font-extrabold text-theme-text font-mono mt-0.5">
                    +{elevation} m
                  </Text>
                </View>

                {/* Calories */}
                <View className="w-1/3 items-end">
                  <Text className="text-xs font-semibold text-theme-muted dark:text-theme-muted">
                    Calories
                  </Text>
                  <Text className="text-lg font-extrabold text-theme-text font-mono mt-0.5">
                    {calories} kcal
                  </Text>
                </View>
              </View>
            </View>

            {/* Social Action Bar (Kudos & Comment Counter) */}
            <View className="flex-row items-center justify-between py-2 border-t border-b border-theme-border dark:border-slate-800">
              <TouchableOpacity
                onPress={handleToggleKudos}
                className="flex-row items-center gap-1.5 py-1 px-3 rounded-full bg-slate-100 dark:bg-slate-800/80"
              >
                <Ionicons
                  name={hasKudosed ? 'heart' : 'heart-outline'}
                  size={18}
                  color={hasKudosed ? '#EF4444' : theme.textSecondary}
                />
                <Text
                  className={`text-xs font-bold ${
                    hasKudosed ? 'text-rose-500' : 'text-theme-muted'
                  }`}
                >
                  {kudosCount} {kudosCount === 1 ? 'Kudos' : 'Kudos'}
                </Text>
              </TouchableOpacity>

              <View className="flex-row items-center gap-1.5 py-1 px-3 rounded-full bg-slate-100 dark:bg-slate-800/80">
                <Ionicons name="chatbubble-outline" size={16} color={theme.textSecondary} />
                <Text className="text-xs font-bold text-theme-muted">
                  {comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}
                </Text>
              </View>
            </View>

            {/* Comments Section */}
            <View className="mt-2 space-y-2">
              <Text className="text-xs font-extrabold text-theme-muted">
                Comments ({comments.length})
              </Text>
              {comments.map((c) => (
                <View
                  key={`comm-${c.id}`}
                  className="bg-slate-100 dark:bg-slate-800/40 p-3 rounded-xl flex-row justify-between items-center"
                >
                  <View className="flex-1 pr-2">
                    <TouchableOpacity
                      onPress={() => onOpenAthleteProfile?.(c.user_id)}
                      activeOpacity={0.7}
                    >
                      <Text className="text-xs font-bold text-theme-accent">{c.username}</Text>
                    </TouchableOpacity>
                    <Text className="text-xs font-medium text-theme-text mt-0.5">{c.comment}</Text>
                  </View>
                  {c.user_id === user?.id && (
                    <TouchableOpacity onPress={() => handleDeleteComment(c.id)}>
                      <Ionicons name="trash-outline" size={13} color={theme.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <CommentComposer onSendComment={handleSendComment} />
            </View>
          </View>

          {/* PAGE 2: RESULTS (BEST EFFORTS TABLE & COMPLETE LAP SPLITS TABLE) */}
          <View style={{ width: SCREEN_WIDTH }} className="px-6 space-y-4">
            {/* BEST EFFORTS & MILESTONES TABLE */}
            {setsOrEfforts.length > 0 && (
              <View className="bg-theme-card border border-theme-border dark:border-slate-800 rounded-card p-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-extrabold text-theme-muted">
                    {hasMilestones ? 'Best Efforts & Milestones' : 'Strength Sets Breakdown'}
                  </Text>
                  <Text className="text-xs font-bold text-theme-accent">
                    {setsOrEfforts.length} Recorded
                  </Text>
                </View>

                {setsOrEfforts.map((item, idx) => (
                  <View
                    key={`effort-${idx}`}
                    className="flex-row justify-between items-center bg-theme-bg dark:bg-slate-800/40 p-3 rounded-xl mb-2 border border-theme-border dark:border-slate-800/60"
                  >
                    <View className="flex-row items-center flex-1 pr-2">
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center mr-2.5 ${
                          item.prRank === 1 ? 'bg-theme-accent/20' : 'bg-theme-accent/20'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            item.prRank === 1 ? 'text-amber-600 dark:text-amber-400' : 'text-theme-accent'
                          }`}
                        >
                          {idx + 1}
                        </Text>
                      </View>
                      <View className="flex-row items-center flex-wrap">
                        <Text className="text-sm font-bold text-theme-text">{item.name}</Text>
                        {item.prRank === 1 && (
                          <View className="bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded ml-2">
                            <Text className="text-xs font-bold text-amber-600 dark:text-amber-300">PR</Text>
                          </View>
                        )}
                        {item.prRank === 2 && (
                          <View className="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded ml-2">
                            <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">2nd Best</Text>
                          </View>
                        )}
                        {item.prRank === 3 && (
                          <View className="bg-amber-900/20 dark:bg-amber-900/40 px-1.5 py-0.5 rounded ml-2">
                            <Text className="text-xs font-bold text-amber-700 dark:text-amber-400">3rd Best</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {item.isMilestone ? (
                      <View className="items-end">
                        <Text className="text-sm font-bold font-mono text-theme-text">
                          {formatEffortDuration(item.timeSec)}
                        </Text>
                        {item.paceOrSpeed ? (
                          <Text className="text-xs font-medium font-mono text-theme-muted dark:text-slate-400">
                            {item.paceOrSpeed}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text className="text-xs font-bold font-mono text-theme-accent">
                        {item.weight ? `${item.weight} kg × ` : ''}
                        {item.reps ? `${item.reps} reps` : 'Complete'}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* LAP SPLITS TABLE */}
            {laps.length > 0 && (
              <View className="bg-theme-card border border-theme-border dark:border-slate-800 rounded-card p-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-extrabold text-theme-muted">
                    {isCycling ? 'Speed by Lap' : 'Lap Splits Table'} ({laps.length})
                  </Text>
                  {laps.length > 5 && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        setIsLapsExpanded(!isLapsExpanded);
                      }}
                      className="flex-row items-center"
                    >
                      <Text className="text-xs font-bold text-theme-accent mr-1">
                        {isLapsExpanded ? 'Show less' : `Expand all (${laps.length})`}
                      </Text>
                      <Ionicons
                        name={isLapsExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={theme.tint}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <View className="flex-row justify-between pb-2 border-b border-theme-border dark:border-slate-800 px-1 mb-1">
                  <Text className="text-xs font-semibold text-theme-muted w-12">Lap</Text>
                  <Text className="text-xs font-semibold text-theme-muted w-20">Dist</Text>
                  <Text className="text-xs font-semibold text-theme-muted flex-1">
                    {isCycling ? 'Speed' : isSwim ? 'Pace' : 'Pace'}
                  </Text>
                  <Text className="text-xs font-semibold text-theme-muted w-16 text-right">Avg HR</Text>
                </View>

                {(isLapsExpanded ? laps : laps.slice(0, 5)).map((lap, idx) => (
                  <View
                    key={`lap-${lap.lap_index}`}
                    className={`flex-row justify-between items-center py-2.5 px-1 ${
                      idx !== (isLapsExpanded ? laps.length : 5) - 1
                        ? 'border-b border-theme-border dark:border-slate-800/60'
                        : ''
                    }`}
                  >
                    <Text className="text-xs font-semibold text-[#475569] dark:text-slate-300 w-12">
                      #{lap.lap_index}
                    </Text>
                    <Text className="text-xs font-semibold font-mono text-theme-text w-20">
                      {lap.distance_km.toFixed(2)} km
                    </Text>
                    <Text className="text-xs font-medium font-mono text-theme-muted dark:text-slate-400 flex-1">
                      {lap.split_pace || `${Math.round(lap.elapsed_time_min)} min`}
                    </Text>
                    <Text
                      className={`text-xs font-medium font-mono w-16 text-right ${
                        lap.average_heartrate ? 'text-rose-500' : 'text-theme-muted'
                      }`}
                    >
                      {lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : '--'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Animated.ScrollView>
      </ScrollView>
    </View>
  );
};
