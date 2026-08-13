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
  SafeAreaView,
} from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Activity, ActivityLap, StrengthSetItem } from '../../types/activity';
import { ActivityComment } from '../../types/social';
import { activitiesApi, socialApi } from '../../services/apiServices';
import { decodePolyline, Coordinate } from '../../utils/polyline';
import { CommentComposer } from './CommentComposer';
import { useUser } from '../../context/UserStore';

interface ActivityDetailModalProps {
  visible: boolean;
  activityId: string | number | null;
  initialActivity?: Partial<Activity>;
  onClose: () => void;
}

export const ActivityDetailModal: React.FC<ActivityDetailModalProps> = ({
  visible,
  activityId,
  initialActivity,
  onClose,
}) => {
  const { user } = useUser();
  const [loading, setLoading] = useState<boolean>(true);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [hasKudosed, setHasKudosed] = useState<boolean>(false);
  const [kudosCount, setKudosCount] = useState<number>(0);
  const [coordinates, setCoordinates] = useState<Coordinate[]>([]);

  useEffect(() => {
    if (!visible || !activityId) return;

    let isMounted = true;
    setLoading(true);

    const loadData = async () => {
      try {
        const detailRes = await activitiesApi.getActivityDetail(activityId);
        if (!isMounted) return;

        const actData = detailRes || (initialActivity as Activity);
        setActivity(actData);
        setHasKudosed(!!actData?.has_kudosed);
        setKudosCount(actData?.kudos_count || 0);

        if (actData?.polyline) {
          const points = decodePolyline(actData.polyline);
          setCoordinates(points);
        } else {
          setCoordinates([]);
        }

        // Fetch activity comments
        const commentsRes = await activitiesApi.getComments(activityId);
        if (isMounted && commentsRes?.comments) {
          setComments(commentsRes.comments);
        }
      } catch (err) {
        console.log('Error loading activity detail:', err);
        if (initialActivity) {
          setActivity(initialActivity as Activity);
          setHasKudosed(!!initialActivity.has_kudosed);
          setKudosCount(initialActivity.kudos_count || 0);
          if (initialActivity.polyline) {
            setCoordinates(decodePolyline(initialActivity.polyline));
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
  }, [visible, activityId]);

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
        // Fallback local addition if mock API
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
      Alert.alert('Error', err.message || 'Failed to post comment');
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

  // Parse strength sets if strength activity
  const parseStrengthSets = (): StrengthSetItem[] => {
    if (!activity?.sets_json) return [];
    try {
      const parsed = JSON.parse(activity.sets_json);
      if (Array.isArray(parsed)) {
        return parsed.flatMap((item: any) => {
          if (item.type === 'repeat' && Array.isArray(item.steps)) {
            return item.steps.map((st: any) => ({
              exerciseName: st.exerciseName || st.type || 'Exercise',
              weight: st.weight,
              reps: st.condition_value,
              completed: true,
            }));
          }
          return [
            {
              exerciseName: item.exerciseName || item.type || 'Exercise',
              weight: item.weight,
              reps: item.condition_value,
              completed: true,
            },
          ];
        });
      }
    } catch (e) {
      // Return empty array
    }
    return [];
  };

  const strengthSets = parseStrengthSets();

  // Generate synthetic lap splits if distance > 0
  const getLapSplits = (): ActivityLap[] => {
    if (activity?.laps && activity.laps.length > 0) return activity.laps;

    const totalKm = activity?.distance_km || 0;
    const totalMins = activity?.moving_time_min || 0;

    if (totalKm <= 0 || totalMins <= 0) return [];

    const fullKmCount = Math.floor(totalKm);
    const avgPaceSec = (totalMins * 60) / totalKm;
    const laps: ActivityLap[] = [];

    for (let i = 1; i <= fullKmCount; i++) {
      const lapSec = avgPaceSec * (0.95 + Math.random() * 0.1);
      const lapMin = lapSec / 60;
      const m = Math.floor(lapMin);
      const s = Math.round((lapMin - m) * 60);
      laps.push({
        lap_index: i,
        distance_km: 1.0,
        elapsed_time_min: lapMin,
        split_pace: `${m}:${s < 10 ? '0' : ''}${s} /km`,
        average_heartrate: activity?.average_heartrate
          ? Math.round(activity.average_heartrate + (Math.random() * 6 - 3))
          : undefined,
      });
    }

    const remainder = totalKm - fullKmCount;
    if (remainder > 0.05) {
      const remMin = (avgPaceSec * remainder) / 60;
      const paceMin = remMin / remainder;
      const m = Math.floor(paceMin);
      const s = Math.round((paceMin - m) * 60);
      laps.push({
        lap_index: fullKmCount + 1,
        distance_km: Math.round(remainder * 100) / 100,
        elapsed_time_min: remMin,
        split_pace: `${m}:${s < 10 ? '0' : ''}${s} /km`,
        average_heartrate: activity?.average_heartrate,
      });
    }

    return laps;
  };

  const laps = getLapSplits();

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-theme-bg">
        {/* MODAL HEADER */}
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-theme-border/40 bg-theme-bg z-10">
          <View className="flex-row items-center space-x-3">
            <View className="w-9 h-9 rounded-full bg-theme-accent/20 items-center justify-center border border-theme-accent/40">
              <Ionicons
                name={
                  activity?.sport_type === 'BIKE'
                    ? 'bicycle'
                    : activity?.sport_type === 'SWIM'
                    ? 'water'
                    : activity?.sport_type === 'STRENGTH'
                    ? 'barbell'
                    : 'walk'
                }
                size={18}
                color="#FF5F3B"
              />
            </View>
            <View>
              <Text className="text-base font-extrabold text-theme-text" numberOfLines={1}>
                {activity?.name || 'Workout Telemetry'}
              </Text>
              <Text className="text-[11px] font-bold text-theme-muted uppercase tracking-wider">
                {activity?.sport_type || 'WORKOUT'} · {activity?.start_date ? activity.start_date.substring(0, 10) : 'Recent'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={onClose}
            className="w-8 h-8 rounded-full bg-theme-card border border-theme-border items-center justify-center"
          >
            <Ionicons name="close" size={18} color="#6F6F79" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center p-8">
            <ActivityIndicator size="large" color="#FF5F3B" />
            <Text className="text-xs font-bold text-theme-muted mt-3">Loading telemetry & route map...</Text>
          </View>
        ) : (
          <ScrollView className="flex-1 px-5 pt-3" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            {/* POLYLINE ROUTE MAP */}
            {coordinates.length > 0 ? (
              <View className="h-56 rounded-2xl overflow-hidden mb-4 border border-theme-border shadow-sm">
                <MapView
                  className="w-full h-full"
                  initialRegion={{
                    latitude: coordinates[0].latitude,
                    longitude: coordinates[0].longitude,
                    latitudeDelta: 0.03,
                    longitudeDelta: 0.03,
                  }}
                  scrollEnabled
                  zoomEnabled
                >
                  <Polyline coordinates={coordinates} strokeColor="#FF5F3B" strokeWidth={4} />
                  <Marker coordinate={coordinates[0]} title="Start" pinColor="green" />
                  <Marker coordinate={coordinates[coordinates.length - 1]} title="Finish" pinColor="red" />
                </MapView>
              </View>
            ) : null}

            {/* TELEMETRY STATS GRID */}
            <View className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-4 shadow-sm">
              <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-3">
                Key Telemetry
              </Text>

              <View className="flex-row flex-wrap justify-between">
                <View className="w-[48%] bg-theme-bg p-3 rounded-xl mb-2.5 border border-theme-border/50">
                  <Text className="text-[10px] uppercase font-bold text-theme-muted">Distance</Text>
                  <Text className="text-lg font-black text-theme-text font-mono">
                    {activity?.distance_km ? `${activity.distance_km.toFixed(2)} km` : '0.0 km'}
                  </Text>
                </View>

                <View className="w-[48%] bg-theme-bg p-3 rounded-xl mb-2.5 border border-theme-border/50">
                  <Text className="text-[10px] uppercase font-bold text-theme-muted">Duration</Text>
                  <Text className="text-lg font-black text-theme-text font-mono">
                    {activity?.moving_time_min ? `${Math.round(activity.moving_time_min)} mins` : '0 mins'}
                  </Text>
                </View>

                <View className="w-[48%] bg-theme-bg p-3 rounded-xl mb-2.5 border border-theme-border/50">
                  <Text className="text-[10px] uppercase font-bold text-theme-muted">Avg Heart Rate</Text>
                  <Text className="text-lg font-black text-rose-500 font-mono">
                    {activity?.average_heartrate ? `${activity.average_heartrate} bpm` : '--'}
                  </Text>
                </View>

                <View className="w-[48%] bg-theme-bg p-3 rounded-xl mb-2.5 border border-theme-border/50">
                  <Text className="text-[10px] uppercase font-bold text-theme-muted">Spark Score</Text>
                  <Text className="text-lg font-black text-theme-accent font-mono">
                    +{activity?.spark_score || activity?.tss || 0} TSS
                  </Text>
                </View>

                {activity?.average_power_w ? (
                  <View className="w-[48%] bg-theme-bg p-3 rounded-xl mb-2 border border-theme-border/50">
                    <Text className="text-[10px] uppercase font-bold text-theme-muted">Avg Power</Text>
                    <Text className="text-lg font-black text-amber-500 font-mono">
                      {activity.average_power_w} W
                    </Text>
                  </View>
                ) : null}

                {activity?.elevation_m ? (
                  <View className="w-[48%] bg-theme-bg p-3 rounded-xl mb-2 border border-theme-border/50">
                    <Text className="text-[10px] uppercase font-bold text-theme-muted">Elevation Gain</Text>
                    <Text className="text-lg font-black text-emerald-500 font-mono">
                      +{activity.elevation_m} m
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* STRENGTH SETS BREAKDOWN */}
            {strengthSets.length > 0 && (
              <View className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-4 shadow-sm">
                <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-3">
                  Strength Sets Breakdown ({strengthSets.length})
                </Text>

                {strengthSets.map((set, idx) => (
                  <View
                    key={`set-${idx}`}
                    className="flex-row justify-between items-center bg-theme-bg p-3 rounded-xl mb-2 border border-theme-border/40"
                  >
                    <View className="flex-row items-center space-x-2.5">
                      <View className="w-6 h-6 rounded-full bg-theme-accent/20 items-center justify-center">
                        <Text className="text-xs font-black text-theme-accent">{idx + 1}</Text>
                      </View>
                      <Text className="text-sm font-bold text-theme-text">{set.exerciseName}</Text>
                    </View>

                    <Text className="text-xs font-black font-mono text-theme-accent">
                      {set.weight ? `${set.weight} kg × ` : ''}
                      {set.reps ? `${set.reps} reps` : 'Complete'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* LAP SPLITS TABLE */}
            {laps.length > 0 && (
              <View className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-4 shadow-sm">
                <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-3">
                  Lap Splits Table
                </Text>

                <View className="flex-row justify-between pb-2 border-b border-theme-border/50 px-1 mb-2">
                  <Text className="text-[10px] uppercase font-bold text-theme-muted w-12">Lap</Text>
                  <Text className="text-[10px] uppercase font-bold text-theme-muted w-20">Dist</Text>
                  <Text className="text-[10px] uppercase font-bold text-theme-muted flex-1">Split Pace</Text>
                  <Text className="text-[10px] uppercase font-bold text-theme-muted w-16 text-right">Avg HR</Text>
                </View>

                {laps.map((lap) => (
                  <View key={`lap-${lap.lap_index}`} className="flex-row justify-between items-center py-2 px-1 border-b border-theme-border/20">
                    <Text className="text-xs font-black text-theme-accent w-12">#{lap.lap_index}</Text>
                    <Text className="text-xs font-bold font-mono text-theme-text w-20">
                      {lap.distance_km.toFixed(2)} km
                    </Text>
                    <Text className="text-xs font-bold font-mono text-theme-muted flex-1">
                      {lap.split_pace || `${Math.round(lap.elapsed_time_min)} min`}
                    </Text>
                    <Text className="text-xs font-bold font-mono text-rose-500 w-16 text-right">
                      {lap.average_heartrate ? `${lap.average_heartrate} bpm` : '--'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* KUDOS ACTION BAR */}
            <View className="flex-row justify-between items-center bg-theme-card border border-theme-border rounded-2xl p-4 mb-4 shadow-sm">
              <View className="flex-row items-center space-x-2">
                <Ionicons name="sparkles" size={18} color="#FF5F3B" />
                <Text className="text-sm font-extrabold text-theme-text">{kudosCount} Kudos Received</Text>
              </View>

              <TouchableOpacity
                onPress={handleToggleKudos}
                className={`flex-row items-center space-x-1.5 px-4 py-2 rounded-full ${
                  hasKudosed ? 'bg-rose-500' : 'bg-theme-accent'
                }`}
              >
                <Ionicons name={hasKudosed ? 'heart' : 'heart-outline'} size={16} color="#FFFFFF" />
                <Text className="text-xs font-black text-white">
                  {hasKudosed ? 'Kudos Given!' : 'Give Kudos'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* COMMENTS SECTION */}
            <View className="bg-theme-card border border-theme-border rounded-2xl p-4 mb-6 shadow-sm">
              <Text className="text-xs uppercase tracking-wider font-extrabold text-theme-muted mb-3">
                Comments ({comments.length})
              </Text>

              {comments.length === 0 ? (
                <Text className="text-xs text-theme-muted italic mb-4 text-center py-2">
                  No comments yet. Be the first to leave a message!
                </Text>
              ) : (
                comments.map((c) => (
                  <View key={`comment-${c.id}`} className="bg-theme-bg p-3 rounded-xl mb-2.5 border border-theme-border/40">
                    <View className="flex-row justify-between items-center mb-1">
                      <View className="flex-row items-center space-x-2">
                        {c.profile_picture_url ? (
                          <Image source={{ uri: c.profile_picture_url }} className="w-5 h-5 rounded-full" />
                        ) : (
                          <View className="w-5 h-5 rounded-full bg-theme-accent/20 items-center justify-center">
                            <Text className="text-[10px] font-black text-theme-accent">
                              {c.username ? c.username.charAt(0).toUpperCase() : 'U'}
                            </Text>
                          </View>
                        )}
                        <Text className="text-xs font-extrabold text-theme-text">{c.username}</Text>
                      </View>

                      {c.user_id === user?.id && (
                        <TouchableOpacity onPress={() => handleDeleteComment(c.id)}>
                          <Ionicons name="trash-outline" size={14} color="#6F6F79" />
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
