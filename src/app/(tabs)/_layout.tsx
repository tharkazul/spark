import React, { useEffect } from 'react';
import { RookaMark } from '../../components/ui/RookaPoints';
import { ParamListBase, TabNavigationState } from '@react-navigation/native';
import {
  createMaterialTopTabNavigator,
  MaterialTopTabNavigationOptions,
  MaterialTopTabNavigationEventMap,
} from '@react-navigation/material-top-tabs';
import { withLayoutContext, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CustomTabBar } from '../../components/CustomTabBar';
import { useUser } from '../../context/UserStore';
import { HeaderLayoutProvider } from '../../context/HeaderLayoutContext';

const MaterialTopTabs = createMaterialTopTabNavigator();

/**
 * The five main tabs, as a horizontal pager rather than a bottom-tab stack, so
 * Planning <-> Progress <-> Chat <-> Social <-> Profile can be swiped between.
 *
 * `useOnlyUserDefinedScreens` (the third argument) matters here: `planning.tsx`
 * is an alias that re-exports `index.tsx`, and without it that alias would be
 * auto-injected as a sixth page you could swipe into and find a duplicate
 * Planning screen. Declared screens only, in the order declared below.
 */
const Tabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof MaterialTopTabs.Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(MaterialTopTabs.Navigator, undefined, true);

export default function TabLayout() {
  const { isAuthenticated, loading, user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else if (user && !user.onboarding_completed) {
        router.replace('/onboarding');
      }
    }
  }, [isAuthenticated, loading, user?.onboarding_completed]);

  if (loading || !isAuthenticated) {
    return null;
  }

  return (
    <HeaderLayoutProvider>
      <Tabs
        tabBar={(props) => <CustomTabBar {...(props as any)} />}
        // The bar floats over the content on `position: absolute`, so it is
        // rendered after the pager rather than taking a strip of layout above it.
        tabBarPosition="bottom"
        screenOptions={{
          swipeEnabled: true,
          animationEnabled: true,
          // Chat and Progress are expensive to mount; building all five up front
          // would make the first paint of the tab bar noticeably slower.
          lazy: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Planning',
            tabBarIcon: ({ color, size = 22 }: { color: string; size?: number }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="physique"
          options={{
            title: 'Progress',
            tabBarIcon: ({ color, size = 22 }: { color: string; size?: number }) => (
              <Ionicons name="stats-chart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="coach"
          options={{
            title: 'Coach',
            tabBarIcon: ({ color, size = 22 }: { color: string; size?: number }) => (
              <RookaMark size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="social"
          options={{
            title: 'Social',
            tabBarIcon: ({ color, size = 22 }: { color: string; size?: number }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size = 22 }: { color: string; size?: number }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </HeaderLayoutProvider>
  );
}
