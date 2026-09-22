import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityDetailView } from '../../components/social/ActivityDetailView';

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <ActivityDetailView
      activityId={id || null}
      onClose={() => router.back()}
      onOpenAthleteProfile={(userId) => {
        router.push({ pathname: '/athlete/[id]', params: { id: String(userId) } });
      }}
      isPushScreen={true}
    />
  );
}
