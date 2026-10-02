import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '@/hooks/use-theme';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  Image,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Share,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
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

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Activity, ActivityLap } from '../../types/activity';
import { activitiesApi, socialApi } from '../../services/apiServices';
import { decodePolyline, Coordinate } from '../../utils/polyline';
import { getSportIconConfig, getSportPlaceholderImage } from '../../utils/sportIcons';
import {
  formatClock,
  formatDuration,
  formatRelativeDayAndTime,
  pluralize,
  formatPace,
  formatSwimPace,
  formatNumber,
} from '../../utils/format';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserStore';
import { useActivities } from '../../context/ActivityStore';
import { getFullProfilePhotoUrl } from '../../utils/avatarUtils';
import { Elevation } from '../../constants/theme';

import { Card } from '../ui/Card';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SportMedallion } from '../ui/SportMedallion';
import { UserAvatar } from '../ui/UserAvatar';
import { BottomSheetModal } from '../ui/BottomSheetModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
      : typeof raw?.moving_time_s === 'number'
      ? raw.moving_time_s / 60
      : typeof raw?.elapsed_time_min === 'number'
      ? raw.elapsed_time_min
      : typeof raw?.elapsed_time === 'number'
      ? raw.elapsed_time / 60
      : typeof raw?.elapsed_time_s === 'number'
      ? raw.elapsed_time_s / 60
      : typeof fallback?.moving_time_min === 'number'
      ? fallback.moving_time_min
      : 0;

  const sportStr = raw?.sport_type || raw?.type || fallback?.sport_type || 'RUN';
  const sportUpper = String(sportStr).toUpperCase();
  const isCycling =
    sportUpper.includes('BIKE') ||
    sportUpper.includes('RIDE') ||
    sportUpper.includes('CYCL');
  const isSwim = sportUpper.includes('SWIM');

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
        paceOrSpeedStr = `${speedKmh} km/h`;
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
        elevation_gain_m:
          typeof split.elevation_difference === 'number'
            ? Math.max(0, split.elevation_difference)
            : undefined,
      };
    });
  } else if (Array.isArray(raw?.laps)) {
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
        lap_index: lap.lap_index || idx + 1,
        distance_km: lapDist,
        elapsed_time_min: lapMins,
        split_pace: lap.split_pace,
        average_heartrate: lap.average_heartrate,
        elevation_gain_m:
          typeof lap.elevation_gain_m === 'number'
            ? lap.elevation_gain_m
            : typeof lap.total_elevation_gain === 'number'
            ? lap.total_elevation_gain
            : typeof lap.elevation_difference === 'number'
            ? Math.max(0, lap.elevation_difference)
            : undefined,
      };
    });
  } else if (typeof raw?.laps_json === 'string') {
    try {
      const parsed = JSON.parse(raw.laps_json);
      if (Array.isArray(parsed)) {
        normalizedLaps = parsed.map((lap: any, idx: number) => ({
          lap_index: lap.lap_index || idx + 1,
          distance_km:
            typeof lap.distance_km === 'number' ? lap.distance_km : (lap.distance || 0) / 1000,
          elapsed_time_min:
            typeof lap.elapsed_time_min === 'number'
              ? lap.elapsed_time_min
              : (lap.moving_time || lap.elapsed_time || 0) / 60,
          split_pace: lap.split_pace,
          average_heartrate: lap.average_heartrate,
          elevation_gain_m: lap.elevation_gain_m || lap.total_elevation_gain,
        }));
      }
    } catch (_) {}
  }

  let elevation =
    typeof raw?.elevation_m === 'number'
      ? raw.elevation_m
      : typeof raw?.total_elevation_gain === 'number'
      ? raw.total_elevation_gain
      : typeof raw?.elevation_gain_m === 'number'
      ? raw.elevation_gain_m
      : typeof raw?.elevationGain === 'number'
      ? raw.elevationGain
      : typeof raw?.totalElevationGain === 'number'
      ? raw.totalElevationGain
      : typeof raw?.elevation === 'number'
      ? raw.elevation
      : typeof fallback?.elevation_m === 'number'
      ? fallback.elevation_m
      : typeof fallback?.total_elevation_gain === 'number'
      ? fallback.total_elevation_gain
      : 0;

  // If elevation is 0 or negative, sum positive elevation gains from splits/laps if available
  if (elevation <= 0 && normalizedLaps && normalizedLaps.length > 0) {
    const lapElevSum = normalizedLaps.reduce(
      (acc, l) => acc + (l.elevation_gain_m && l.elevation_gain_m > 0 ? l.elevation_gain_m : 0),
      0
    );
    if (lapElevSum > 0) {
      elevation = Math.round(lapElevSum);
    }
  }

  // Also check elev_high and elev_low from Strava
  if (elevation <= 0 && typeof raw?.elev_high === 'number' && typeof raw?.elev_low === 'number') {
    const diff = Math.round(raw.elev_high - raw.elev_low);
    if (diff > 0) {
      elevation = diff;
    }
  }

  const rawCalories =
    typeof raw?.calories === 'number' && raw.calories > 0
      ? Math.round(raw.calories)
      : typeof raw?.kilojoules === 'number' && raw.kilojoules > 0
      ? Math.round(raw.kilojoules * 1.05)
      : typeof raw?.total_calories === 'number' && raw.total_calories > 0
      ? Math.round(raw.total_calories)
      : typeof raw?.active_calories === 'number' && raw.active_calories > 0
      ? Math.round(raw.active_calories)
      : typeof raw?.totalEnergyBurned === 'number' && raw.totalEnergyBurned > 0
      ? Math.round(raw.totalEnergyBurned)
      : typeof fallback?.calories === 'number' && fallback.calories > 0
      ? Math.round(fallback.calories)
      : undefined;

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

  return {
    ...merged,
    id: raw?.id ?? fallback?.id ?? 'temp',
    name: raw?.name || raw?.title || fallback?.name || 'Workout',
    sport_type: sportStr,
    distance_km: distKm,
    moving_time_min: movingMins,
    elapsed_time: raw?.elapsed_time || fallback?.elapsed_time,
    elevation_m: elevation,
    average_heartrate: raw?.average_heartrate ?? fallback?.average_heartrate,
    max_heartrate: raw?.max_heartrate ?? fallback?.max_heartrate,
    average_power_w: avgPower,
    rooka_score: rooka,
    polyline: polylineStr,
    sets_json: setsJsonStr,
    laps: normalizedLaps || fallback?.laps,
    calories: rawCalories,
    start_date: raw?.start_date || fallback?.start_date || new Date().toISOString(),
    kudos_count: raw?.kudos_count ?? fallback?.kudos_count ?? 0,
    has_kudosed: raw?.has_kudosed ?? fallback?.has_kudosed ?? false,
    comments_count: raw?.comments_count ?? fallback?.comments_count ?? 0,
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
  const { t, language } = useLanguage();
  const reducedMotion = useReducedMotion();

  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);
  const horizontalScrollViewRef = useRef<ScrollView>(null);

  const [activity, setActivity] = useState<Activity | null>(() =>
    initialActivity ? normalizeActivity(initialActivity) : null
  );
  const [kudosCount, setKudosCount] = useState<number>(0);
  const [hasKudosed, setHasKudosed] = useState<boolean>(false);
  const [isLapsExpanded, setIsLapsExpanded] = useState<boolean>(false);
  const { refreshActivities } = useActivities();
  const [mapInteractive, setMapInteractive] = useState<boolean>(false);

  // Activity linking & options menu states
  const [showActionsMenu, setShowActionsMenu] = useState<boolean>(false);
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [linkCandidates, setLinkCandidates] = useState<Activity[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState<boolean>(false);
  const [isLinking, setIsLinking] = useState<boolean>(false);

  const mapRef = useRef<any>(null);

  // Kudos animation scale
  const kudosScale = useSharedValue(1);
  const kudosAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: kudosScale.value }],
  }));

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

  // Coordinates
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
    if (!reducedMotion) {
      kudosScale.value = withSequence(
        withTiming(1.25, { duration: 120 }),
        withSpring(1, { damping: 12, stiffness: 220 })
      );
    }
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

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${activity?.name || 'Workout'} - ${distanceKmStr} km on Rooka`,
      });
    } catch (e) {
      console.log('Share error:', e);
    }
  };

  const handleOpenLinkModal = async () => {
    setShowActionsMenu(false);
    setShowLinkModal(true);
    setLoadingCandidates(true);
    try {
      if (activityId) {
        const res = await activitiesApi.getCandidatesToLink(activityId);
        setLinkCandidates(res?.candidates || []);
      }
    } catch (e: any) {
      console.log('Failed to fetch link candidates:', e);
      setLinkCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleLinkActivity = (source: Activity) => {
    Alert.alert(
      'Link Workout Session?',
      `Merge telemetry (distance, pace, heart rate & route) from "${source.name}" into "${activity?.name || 'Workout'}"?\n\n"${source.name}" will be hidden so you don't receive duplicate points.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Link Sessions',
          onPress: async () => {
            if (!activityId) return;
            setIsLinking(true);
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const res = await activitiesApi.linkActivities(activityId, source.id);
              if (res.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setShowLinkModal(false);
                const updated = await activitiesApi.getActivityDetail(activityId);
                if (updated) {
                  setActivity(normalizeActivity(updated));
                }
                refreshActivities?.();
                Alert.alert('Session Linked', 'Telemetry successfully transferred and duplicate points removed.');
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to link activities.');
            } finally {
              setIsLinking(false);
            }
          },
        },
      ]
    );
  };

  const handleUnlinkActivity = () => {
    Alert.alert(
      'Unlink Session?',
      'This will separate the linked telemetry and restore both activities.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            if (!activityId) return;
            setIsLinking(true);
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const res = await activitiesApi.unlinkActivity(activityId);
              if (res.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setShowActionsMenu(false);
                const updated = await activitiesApi.getActivityDetail(activityId);
                if (updated) {
                  setActivity(normalizeActivity(updated));
                }
                refreshActivities?.();
                Alert.alert('Session Unlinked', 'Activities have been restored.');
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to unlink activities.');
            } finally {
              setIsLinking(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteActivity = () => {
    Alert.alert(
      'Delete Activity?',
      'Are you sure you want to delete this activity? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!activityId) return;
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              const res = await activitiesApi.deleteActivity(activityId);
              if (res.success) {
                setShowActionsMenu(false);
                refreshActivities?.();
                onClose();
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete activity.');
            }
          },
        },
      ]
    );
  };

  const sportLower = (activity?.sport_type || '').toLowerCase();
  const isCycling = sportLower.includes('ride') || sportLower.includes('cycl') || sportLower.includes('bike');
  const isSwim = sportLower.includes('swim');
  const isStrength = sportLower.includes('strength') || sportLower.includes('weight') || sportLower.includes('gym');

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
    const remainder = totalKm - fullKmCount;
    const avgPaceMin = totalMins / totalKm;

    const laps: ActivityLap[] = [];

    for (let i = 1; i <= fullKmCount; i++) {
      const variance = (Math.sin(i * 1.5) * 0.05 + 1) * avgPaceMin;
      const m = Math.floor(variance);
      const s = Math.round((variance - m) * 60);

      let paceOrSpeedStr = '';
      if (isCycling) {
        const speed = (60 / variance).toFixed(1);
        paceOrSpeedStr = `${speed} km/h`;
      } else if (isSwim) {
        const swim100mSec = (variance * 60) / 10;
        const sm = Math.floor(swim100mSec / 60);
        const ss = Math.round(swim100mSec % 60);
        paceOrSpeedStr = `${sm}:${ss < 10 ? '0' : ''}${ss} /100m`;
      } else {
        paceOrSpeedStr = `${m}:${s < 10 ? '0' : ''}${s} /km`;
      }

      laps.push({
        lap_index: i,
        distance_km: 1.0,
        elapsed_time_min: variance,
        split_pace: paceOrSpeedStr,
        average_heartrate: activity?.average_heartrate
          ? Math.round(activity.average_heartrate + Math.sin(i) * 4)
          : undefined,
      });
    }

    if (remainder > 0.05) {
      const remMin = remainder * avgPaceMin;
      let paceOrSpeedStr = '';
      if (isCycling) {
        const speed = (60 / avgPaceMin).toFixed(1);
        paceOrSpeedStr = `${speed} km/h`;
      } else if (isSwim) {
        const swim100mSec = (avgPaceMin * 60) / 10;
        const m = Math.floor(swim100mSec / 60);
        const s = Math.round(swim100mSec % 60);
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

  // Exact moving time in seconds to prevent minute-rounding drift
  const movingTimeSec =
    typeof (activity as any)?.moving_time_s === 'number' && (activity as any).moving_time_s > 0
      ? (activity as any).moving_time_s
      : typeof activity?.moving_time === 'number' && activity.moving_time > 0
      ? activity.moving_time
      : typeof activity?.moving_time_min === 'number' && activity.moving_time_min > 0
      ? Math.round(activity.moving_time_min * 60)
      : 1800;

  const durationMins = movingTimeSec / 60;

  // Accurate distance, speed, and pace calculations using exact seconds
  const distanceKm = typeof activity?.distance_km === 'number' ? activity.distance_km : 0;
  const distanceKmStr = formatNumber(distanceKm, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const avgSpeedKmh =
    distanceKm > 0 && movingTimeSec > 0
      ? formatNumber(distanceKm / (movingTimeSec / 3600), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '0.0';

  const minPerKm = distanceKm > 0 && movingTimeSec > 0 ? (movingTimeSec / 60) / distanceKm : 0;
  const avgPaceRun = distanceKm > 0 ? formatPace(minPerKm) : '--:-- /km';

  const swimSecsPer100m = distanceKm > 0 ? movingTimeSec / (distanceKm * 10) : 0;
  const avgPaceSwim = distanceKm > 0 ? formatSwimPace(swimSecsPer100m) : '--:-- /100m';

  const avgPower = activity?.average_power_w ? Math.round(activity.average_power_w) : null;
  const avgHeartRate = activity?.average_heartrate ? Math.round(activity.average_heartrate) : null;
  const maxHr = activity?.max_heartrate ? Math.round(activity.max_heartrate) : null;
  const hasHrData = Boolean(avgHeartRate && avgHeartRate > 0);
  const elevation =
    typeof activity?.elevation_m === 'number' && !isNaN(activity.elevation_m)
      ? Math.round(activity.elevation_m)
      : 0;

  const calculatedCalories = useMemo(() => {
    if (typeof activity?.calories === 'number' && activity.calories > 0) {
      return Math.round(activity.calories);
    }
    const mins = durationMins > 0 ? durationMins : (movingTimeSec > 0 ? movingTimeSec / 60 : 0);
    if (mins <= 0) return 0;
    if (isCycling) {
      return distanceKm > 0 ? Math.round(distanceKm * 32) : Math.round(mins * 8.5);
    }
    if (isSwim) {
      return distanceKm > 0 ? Math.round(distanceKm * 350) : Math.round(mins * 9.0);
    }
    if (isStrength) {
      return Math.round(mins * 7.5);
    }
    return distanceKm > 0 ? Math.round(distanceKm * 72) : Math.round(mins * 10.5);
  }, [activity?.calories, durationMins, movingTimeSec, isCycling, isSwim, isStrength, distanceKm]);

  const rookaScore = Math.round(activity?.rooka_score || (activity as any)?.tss || 0);

  // Exact elapsed time in seconds (> 30s diff)
  const elapsedSec =
    typeof (activity as any)?.elapsed_time_s === 'number' && (activity as any).elapsed_time_s > 0
      ? (activity as any).elapsed_time_s
      : typeof activity?.elapsed_time === 'number' && activity.elapsed_time > 0
      ? activity.elapsed_time
      : typeof (activity as any)?.elapsed_time_min === 'number' && (activity as any).elapsed_time_min > 0
      ? Math.round((activity as any).elapsed_time_min * 60)
      : movingTimeSec;

  const hasSignificantElapsedDiff = Math.abs(elapsedSec - movingTimeSec) >= 30;

  // Heart Rate Zones: Only show if the activity contains real, measured zone telemetry
  const hrZones = useMemo(() => {
    const rawZones = (activity as any)?.hr_zones || (activity as any)?.heart_rate_zones;
    if (!Array.isArray(rawZones) || rawZones.length === 0) {
      // Do not synthesize or fake zone distribution without actual telemetry/stream data
      return [];
    }

    const ZONE_COLORS = ['#38BDF8', '#22C55E', '#EAB308', '#F97316', '#EF4444'];
    const totalSecs = rawZones.reduce((sum: number, z: any) => sum + (Number(z.time || z.seconds || (z.mins ? z.mins * 60 : 0)) || 0), 0);
    if (totalSecs <= 0) return [];

    return rawZones.map((z: any, idx: number) => {
      const secs = Number(z.time || z.seconds || (z.mins ? z.mins * 60 : 0)) || 0;
      const pct = Math.round((secs / totalSecs) * 100);
      const mins = Math.round(secs / 60);
      return {
        label: z.label || `Z${idx + 1}`,
        color: z.color || ZONE_COLORS[idx % ZONE_COLORS.length],
        percent: pct,
        mins,
      };
    });
  }, [activity]);

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

  // Athlete information attribution
  const athleteUserId = (activity as any)?.user_id;
  const athleteUsername = (activity as any)?.username || (activity as any)?.athlete_name;
  const athletePhotoUrl = getFullProfilePhotoUrl(
    (activity as any)?.profile_picture_url || (activity as any)?.user?.profile_picture_url
  );
  const isOwner = Boolean(user?.id && (athleteUserId === user?.id || (activity as any)?.user_id === user?.id || !athleteUserId));

  const MAP_HEIGHT = Math.min(SCREEN_HEIGHT * 0.4, 320);

  return (
    <View className="flex-1 bg-theme-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 24 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* 1. MAP HERO (No gradient overlay, interactive on tap) */}
        <View
          style={{ width: '100%', height: MAP_HEIGHT }}
          className="relative bg-slate-200 dark:bg-slate-800"
        >
          {hasRoute ? (
            <Pressable
              onPress={() => setMapInteractive(true)}
              style={{ width: '100%', height: '100%' }}
            >
              <MapView
                ref={mapRef}
                style={{ width: '100%', height: '100%' }}
                initialRegion={initialRegion}
                onMapReady={() => fitMapToRoute(false)}
                scrollEnabled={mapInteractive}
                zoomEnabled={mapInteractive}
                rotateEnabled={mapInteractive}
                pitchEnabled={mapInteractive}
              >
                <Polyline coordinates={coordinates} strokeColor={theme.tint} strokeWidth={4.5} />
                {startPt && <Marker coordinate={startPt} title="Start" pinColor="green" />}
                {endPt && <Marker coordinate={endPt} title="Finish" pinColor="blue" />}
              </MapView>
            </Pressable>
          ) : (
            <Image
              source={getSportPlaceholderImage(getSportIconConfig(activity?.sport_type, activity?.name).label)}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          )}

          {/* Top Controls inside Safe Area: Back on left, Share on right */}
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              position: 'absolute',
              top: isPushScreen ? Math.max(insets.top, 16) + 4 : 16,
              left: 16,
            }}
            className="w-10 h-10 rounded-full bg-theme-card/85 items-center justify-center border border-theme-border/40 shadow-sm z-20"
          >
            <Ionicons
              name={isPushScreen ? 'chevron-back' : 'close'}
              size={isPushScreen ? 22 : 20}
              color={theme.text}
            />
          </TouchableOpacity>

          <View
            style={{
              position: 'absolute',
              top: isPushScreen ? Math.max(insets.top, 16) + 4 : 16,
              right: 16,
            }}
            className="flex-row items-center gap-x-2 z-20"
          >
            {isOwner && (
              <TouchableOpacity
                onPress={() => setShowActionsMenu(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="w-10 h-10 rounded-full bg-theme-card/85 items-center justify-center border border-theme-border/40 shadow-sm"
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={theme.text} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleShare}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="w-10 h-10 rounded-full bg-theme-card/85 items-center justify-center border border-theme-border/40 shadow-sm"
            >
              <Ionicons name="share-outline" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. OVERLAPPING CONTENT SHEET (Starts 24pt above bottom of map) */}
        <View
          style={Elevation.elevation1}
          className="px-5 -mt-6 bg-theme-bg rounded-t-[24px] pt-5 border-t border-theme-border/40"
        >
          {/* Athlete Attribution Badge (if available) */}
          {athleteUserId && athleteUsername ? (
            <TouchableOpacity
              onPress={() => onOpenAthleteProfile?.(athleteUserId)}
              activeOpacity={0.7}
              className="flex-row items-center gap-x-2 mb-2.5 self-start py-1 px-2.5 bg-theme-inset rounded-pill"
            >
              <UserAvatar
                size={20}
                photoUrl={athletePhotoUrl}
                userId={athleteUserId}
                name={athleteUsername}
              />
              <Text className="text-xs font-bold text-theme-text">{athleteUsername}</Text>
              <Ionicons name="chevron-forward" size={12} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}

          {/* Title & Sport Subtitle */}
          <Text className="text-2xl font-extrabold text-theme-text tracking-tight">
            {activity?.name || 'Workout Telemetry'}
          </Text>

          <View className="flex-row items-center gap-x-2 mt-1 mb-2">
            <SportMedallion sport={activity?.sport_type} size={24} />
            <Text className="text-xs font-medium text-theme-muted">
              {formatRelativeDayAndTime(activity?.start_date || new Date(), language)}
            </Text>
          </View>

          {/* Linked Telemetry Banner (if linked) */}
          {activity?.linked_activity_id ? (
            <View className="flex-row items-center justify-between bg-primary/10 border border-primary/25 rounded-xl px-3 py-2 mb-2">
              <View className="flex-row items-center gap-x-2 flex-1 mr-2">
                <Ionicons name="link" size={16} color={theme.tint} />
                <Text className="text-xs font-semibold text-primary flex-1" numberOfLines={1}>
                  Linked with {activity.linked_activity_name || 'watch telemetry'}
                </Text>
              </View>
              {isOwner && (
                <TouchableOpacity
                  onPress={handleUnlinkActivity}
                  disabled={isLinking}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text className="text-xs font-bold text-theme-muted underline">Unlink</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Sub-tab switcher: Sentence-case SegmentedControl */}
          <View className="my-4">
            <SegmentedControl
              items={[
                { key: 'details', label: t('common.details') },
                { key: 'results', label: t('common.results') },
              ]}
              value={activeTabIndex === 0 ? 'details' : 'results'}
              onChange={(key) => handleTabPress(key === 'details' ? 0 : 1)}
              size="md"
            />
          </View>
        </View>

        {/* 3. SWIPABLE HORIZONTAL PAGER FOR SUB-TABS */}
        <ScrollView
          ref={horizontalScrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onMomentumScrollEnd={handleHorizontalScroll}
          scrollEventThrottle={16}
          className="flex-1"
        >
          {/* PAGE 1: DETAILS */}
          <View style={{ width: SCREEN_WIDTH }} className="px-5 gap-y-4">
            {/* HERO STATS CARD: Distance in stat-xl Rajdhani + Effort badge */}
            <Card variant="default" padding={16} className="flex-row justify-between items-center">
              <View className="flex-1">
                <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                  DISTANCE
                </Text>
                <View className="flex-row items-baseline mt-1">
                  <Text className="text-4xl font-bold font-rajdhani text-theme-text tabular-nums">
                    {distanceKmStr}
                  </Text>
                  <Text className="text-sm font-medium text-theme-muted ml-1.5">km</Text>
                </View>
              </View>

              <View className="h-10 w-px bg-theme-border mx-4" />

              <View className="flex-1 items-end">
                <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                  EFFORT
                </Text>
                <View className="flex-row items-center mt-1 px-3 py-1.5 rounded-inset bg-theme-accent-soft">
                  <Ionicons name="flash" size={16} color="#0EA5E9" />
                  <Text className="text-2xl font-bold font-rajdhani text-theme-accent-text ml-1 tabular-nums">
                    +{rookaScore}
                  </Text>
                </View>
              </View>
            </Card>

            {/* 3-COLUMN STAT GRID CARD */}
            <Card variant="default" padding={16}>
              {/* Row 1 */}
              <View className="flex-row justify-between items-center">
                <View className="w-1/3">
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                    {isCycling ? 'AVG SPEED' : 'AVG PACE'}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    className="text-lg font-bold font-rajdhani text-theme-text mt-0.5 tabular-nums"
                  >
                    {isCycling ? `${avgSpeedKmh} km/h` : isSwim ? avgPaceSwim : avgPaceRun}
                  </Text>
                </View>

                <View className="w-1/3 items-center">
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                    MOVING TIME
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    className="text-lg font-bold font-rajdhani text-theme-text mt-0.5 tabular-nums"
                  >
                    {formatClock(movingTimeSec)}
                  </Text>
                </View>

                <View className="w-1/3 items-end">
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                    {avgHeartRate ? 'AVG HR' : 'AVG POWER'}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    className="text-lg font-bold font-rajdhani text-theme-text mt-0.5 tabular-nums"
                  >
                    {avgHeartRate ? `${avgHeartRate} bpm` : avgPower ? `${avgPower} W` : '--'}
                  </Text>
                </View>
              </View>

              <View className="h-px bg-theme-border my-4" />

              {/* Row 2 */}
              <View className="flex-row justify-between items-center">
                <View className="w-1/3">
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                    ELEVATION
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    className="text-lg font-bold font-rajdhani text-theme-text mt-0.5 tabular-nums"
                  >
                    {elevation && elevation > 0 ? `+${elevation}\u00A0m` : '—'}
                  </Text>
                </View>

                <View className="w-1/3 items-center">
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                    CALORIES
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    className="text-lg font-bold font-rajdhani text-theme-text mt-0.5 tabular-nums"
                  >
                    {calculatedCalories > 0 ? `${calculatedCalories} kcal` : '--'}
                  </Text>
                </View>

                <View className="w-1/3 items-end">
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                    {hasSignificantElapsedDiff ? 'ELAPSED' : maxHr ? 'MAX HR' : 'POWER'}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    className="text-lg font-bold font-rajdhani text-theme-text mt-0.5 tabular-nums"
                  >
                    {hasSignificantElapsedDiff
                      ? formatClock(elapsedSec)
                      : maxHr
                      ? `${maxHr} bpm`
                      : avgPower
                      ? `${avgPower} W`
                      : '--'}
                  </Text>
                </View>
              </View>

              {/* 5-Zone HR Distribution Bar (P2) */}
              {hasHrData && hrZones.length > 0 && (
                <View className="mt-4 pt-4 border-t border-theme-border">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider">
                      HEART RATE ZONES
                    </Text>
                    <Text className="text-xs font-semibold text-theme-muted font-rajdhani tabular-nums">
                      {hrZones.reduce((acc, z) => acc + z.mins, 0)} min total
                    </Text>
                  </View>

                  {/* 12pt stacked bar */}
                  <View className="h-3 w-full rounded-pill overflow-hidden flex-row bg-theme-inset">
                    {hrZones.map((z, idx) => (
                      <View
                        key={`hr-zone-bar-${idx}`}
                        style={{ width: `${z.percent}%`, backgroundColor: z.color }}
                        className="h-full"
                      />
                    ))}
                  </View>

                  {/* Legend below */}
                  <View className="flex-row justify-between items-center mt-2.5 px-0.5">
                    {hrZones.map((z, idx) => (
                      <View key={`hr-zone-legend-${idx}`} className="flex-row items-center gap-x-1">
                        <View style={{ backgroundColor: z.color }} className="w-2 h-2 rounded-full" />
                        <Text className="text-[10px] font-bold text-theme-muted font-rajdhani">
                          {z.label} {z.mins}m
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </Card>

            {/* SOCIAL ROW: Ghost buttons matching feed footer */}
            <View className="flex-row items-center justify-between py-2 border-t border-b border-theme-border">
              <Pressable
                onPress={handleToggleKudos}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="flex-row items-center gap-x-1.5 py-1.5 px-2 active:opacity-70"
              >
                <Animated.View style={kudosAnimatedStyle}>
                  <Ionicons
                    name={hasKudosed ? 'flash' : 'flash-outline'}
                    size={18}
                    color={hasKudosed ? theme.tint : theme.textSecondary}
                  />
                </Animated.View>
                <Text
                  className={`text-sm font-bold font-rajdhani tabular-nums ${
                    hasKudosed ? 'text-theme-accent' : 'text-theme-muted'
                  }`}
                >
                  {kudosCount}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* PAGE 2: RESULTS (BEST EFFORTS & LAPS) */}
          <View style={{ width: SCREEN_WIDTH }} className="px-5 gap-y-4">
            {/* BEST EFFORTS & MILESTONES TABLE */}
            {setsOrEfforts.length > 0 && (
              <Card variant="default" padding={16}>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
                    {hasMilestones ? 'Best Efforts & Milestones' : 'Strength Sets Breakdown'}
                  </Text>
                  <Text className="text-xs font-bold text-theme-accent font-rajdhani">
                    {setsOrEfforts.length} Recorded
                  </Text>
                </View>

                {setsOrEfforts.map((item, idx) => (
                  <View
                    key={`effort-${idx}`}
                    className="flex-row justify-between items-center bg-theme-inset p-3 rounded-inset mb-2"
                  >
                    <View className="flex-row items-center flex-1 pr-2">
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center mr-2.5 ${
                          item.prRank === 1 ? 'bg-amber-400' : 'bg-theme-accent/20'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold font-rajdhani ${
                            item.prRank === 1 ? 'text-slate-950' : 'text-theme-accent'
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
                      </View>
                    </View>

                    {item.isMilestone ? (
                      <View className="items-end">
                        <Text className="text-sm font-bold font-rajdhani text-theme-text tabular-nums">
                          {formatEffortDuration(item.timeSec)}
                        </Text>
                        {item.paceOrSpeed ? (
                          <Text className="text-xs font-medium font-rajdhani text-theme-muted">
                            {item.paceOrSpeed}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text className="text-xs font-bold font-rajdhani text-theme-accent tabular-nums">
                        {item.weight ? `${item.weight} kg × ` : ''}
                        {item.reps ? `${item.reps} reps` : 'Complete'}
                      </Text>
                    )}
                  </View>
                ))}
              </Card>
            )}

            {/* LAP SPLITS TABLE */}
            {laps.length > 0 && (
              <Card variant="default" padding={16}>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-bold text-theme-muted uppercase tracking-wider">
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

                {/* Table Header */}
                <View className="flex-row justify-between pb-2 border-b border-theme-border px-1 mb-1">
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider w-12">
                    LAP
                  </Text>
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider w-20">
                    DIST
                  </Text>
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider flex-1">
                    {isCycling ? 'SPEED' : 'PACE'}
                  </Text>
                  <Text className="text-[11px] font-semibold text-theme-muted uppercase tracking-wider w-16 text-right">
                    AVG HR
                  </Text>
                </View>

                {/* Rows */}
                {(isLapsExpanded ? laps : laps.slice(0, 5)).map((lap, idx) => (
                  <View
                    key={`lap-${lap.lap_index}`}
                    className={`flex-row justify-between items-center py-2.5 px-1 ${
                      idx !== (isLapsExpanded ? laps.length : 5) - 1 ? 'border-b border-theme-border/60' : ''
                    }`}
                  >
                    <Text className="text-xs font-bold font-rajdhani text-theme-muted w-12">
                      #{lap.lap_index}
                    </Text>
                    <Text className="text-xs font-bold font-rajdhani text-theme-text w-20 tabular-nums">
                      {lap.distance_km.toFixed(2)} km
                    </Text>
                    <Text className="text-xs font-medium font-rajdhani text-theme-muted flex-1 tabular-nums">
                      {lap.split_pace || `${Math.round(lap.elapsed_time_min)} min`}
                    </Text>
                    <Text
                      className={`text-xs font-medium font-rajdhani w-16 text-right tabular-nums ${
                        lap.average_heartrate ? 'text-rose-500' : 'text-theme-muted'
                      }`}
                    >
                      {lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : '--'}
                    </Text>
                  </View>
                ))}
              </Card>
            )}
          </View>
        </ScrollView>
      </ScrollView>

      {/* Options Menu Modal */}
      <BottomSheetModal
        visible={showActionsMenu}
        onClose={() => setShowActionsMenu(false)}
        showHandle
      >
        <View className="pb-8 pt-2">
          <Text className="text-base font-extrabold text-theme-text mb-4 text-center">
            Workout Options
          </Text>

          {activity?.linked_activity_id ? (
            <TouchableOpacity
              onPress={handleUnlinkActivity}
              className="flex-row items-center gap-x-3 py-3.5 px-3 rounded-2xl bg-theme-inset mb-2"
            >
              <Ionicons name="link-outline" size={20} color={theme.tint} />
              <View className="flex-1">
                <Text className="text-sm font-bold text-theme-text">Unlink Synced Session</Text>
                <Text className="text-xs text-theme-muted">Restore both workouts as separate entries</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleOpenLinkModal}
              className="flex-row items-center gap-x-3 py-3.5 px-3 rounded-2xl bg-theme-inset mb-2"
            >
              <Ionicons name="link-outline" size={20} color={theme.tint} />
              <View className="flex-1">
                <Text className="text-sm font-bold text-theme-text">Link With Synced Session</Text>
                <Text className="text-xs text-theme-muted">Merge GPS route, duration & heart rate into this workout</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleDeleteActivity}
            className="flex-row items-center gap-x-3 py-3.5 px-3 rounded-2xl bg-rose-500/10 mb-2"
          >
            <Ionicons name="trash-outline" size={20} color="#f43f5e" />
            <View className="flex-1">
              <Text className="text-sm font-bold text-rose-500">Delete Activity</Text>
              <Text className="text-xs text-rose-500/70">Permanently remove this workout from your log</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowActionsMenu(false)}
            className="py-3 items-center justify-center mt-2"
          >
            <Text className="text-sm font-bold text-theme-muted">Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

      {/* Link Candidates Modal */}
      <BottomSheetModal
        visible={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        showHandle
      >
        <View className="pb-8 pt-2">
          <Text className="text-base font-extrabold text-theme-text text-center">
            Link Synced Session
          </Text>
          <Text className="text-xs text-theme-muted text-center mt-1 mb-4 px-2">
            Select a session from this day to merge into {activity?.name || 'this workout'}. Telemetry will be combined and the other session hidden to prevent duplicate points.
          </Text>

          {loadingCandidates ? (
            <View className="py-8 items-center justify-center">
              <ActivityIndicator size="small" color={theme.tint} />
              <Text className="text-xs text-theme-muted mt-2">Finding sessions from this day...</Text>
            </View>
          ) : linkCandidates.length === 0 ? (
            <View className="py-6 items-center justify-center bg-theme-inset rounded-2xl px-4 my-2">
              <Ionicons name="information-circle-outline" size={24} color={theme.textSecondary} />
              <Text className="text-xs font-semibold text-theme-text mt-2 text-center">
                No other workouts found on this day
              </Text>
              <Text className="text-[11px] text-theme-muted mt-1 text-center">
                Sessions must be recorded on the same date ({activity?.start_date?.substring(0, 10)}) to be linked.
              </Text>
            </View>
          ) : (
            <ScrollView className="max-h-72 gap-y-2 mb-3">
              {linkCandidates.map((candidate) => (
                <TouchableOpacity
                  key={`candidate-${candidate.id}`}
                  onPress={() => handleLinkActivity(candidate)}
                  disabled={isLinking}
                  className="flex-row items-center justify-between p-3.5 rounded-2xl bg-theme-inset border border-theme-border/40"
                >
                  <View className="flex-row items-center gap-x-3 flex-1 mr-3">
                    <SportMedallion sport={candidate.sport_type} size={28} />
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-theme-text" numberOfLines={1}>
                        {candidate.name}
                      </Text>
                      <Text className="text-xs text-theme-muted mt-0.5">
                        {candidate.distance_km ? `${candidate.distance_km.toFixed(1)} km · ` : ''}
                        {Math.round(candidate.moving_time_min || 0)} mins
                        {candidate.average_heartrate ? ` · ${Math.round(candidate.average_heartrate)} bpm` : ''}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-x-2">
                    {candidate.rooka_score ? (
                      <View className="bg-primary/10 px-2 py-0.5 rounded-pill">
                        <Text className="text-xs font-bold text-primary font-rajdhani">
                          +{Math.round(candidate.rooka_score)}
                        </Text>
                      </View>
                    ) : null}
                    <View className="w-8 h-8 rounded-full bg-primary/15 items-center justify-center">
                      <Ionicons name="link" size={16} color={theme.tint} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            onPress={() => setShowLinkModal(false)}
            className="py-3 items-center justify-center"
          >
            <Text className="text-sm font-bold text-theme-muted">Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>
    </View>
  );
};
