import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { CustomTabBar } from '../../components/CustomTabBar';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../context/UserStore';
import { HeaderLayoutProvider } from '../../context/HeaderLayoutContext';

export default function TabLayout() {
  const { isAuthenticated, loading, user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else if (user && (!user.onboarding_completed || user.needsZoneSetup)) {
        // Zones are what every Rooka score is weighted by. An account created
        // before zones existed has none and cannot be scored, so it goes back
        // through onboarding once to supply an age — the plan it already has is
        // protected by the guard in /finalize.
        router.replace('/onboarding');
      }
    }
  }, [isAuthenticated, loading, user?.onboarding_completed, user?.needsZoneSetup]);

  return (
    <HeaderLayoutProvider>
      <Tabs
        tabBar={(props) => <CustomTabBar {...(props as any)} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Planning',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="physique"
          options={{
            title: 'Progress',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="stats-chart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="coach"
          options={{
            title: 'Coach',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="sparkles-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="social"
          options={{
            title: 'Activities',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </HeaderLayoutProvider>
  );
}

