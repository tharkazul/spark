import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AthleteProfileView } from '../../components/social/AthleteProfileView';

export default function AthleteProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <AthleteProfileView
      athleteId={id || null}
      onClose={() => router.back()}
      onOpenActivity={(activityId) => {
        router.push({ pathname: '/activity/[id]', params: { id: String(activityId) } });
      }}
      isPushScreen={true}
    />
  );
}
