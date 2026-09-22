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
import { DynamicDateIcon } from '../../components/ui/DynamicDateIcon';
import { useUser } from '../../context/UserStore';
import { HeaderLayoutProvider } from '../../context/HeaderLayoutContext';

const MaterialTopTabs = createMaterialTopTabNavigator();

/**
 * The five main tabs, as a horizontal pager rather than a bottom-tab stack, so
 * Planning <-> Progress <-> Chat <-> Social <-> Profile can be swiped between.
 *
 * Declared screens only, in the order declared below:
 * Planning (index) <-> Progress (physique) <-> Coach (coach) <-> Social (social) <-> Profile (profile).
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
        initialRouteName="coach"
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
        {/* Tab 1: Planning - Dynamic Date Sheet with current date number */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Planning',
            tabBarIcon: ({ color, size = 22 }: { color: string; size?: number }) => (
              <DynamicDateIcon size={size} color={color} />
            ),
          }}
        />

        {/* Tab 2: Progress - Pulse / Activity Trend Line (PMC / physiology load) */}
        <Tabs.Screen
          name="physique"
          options={{
            title: 'Progress',
            tabBarIcon: ({ color, size = 22 }: { color: string; size?: number }) => (
              <Ionicons name="pulse-outline" size={size} color={color} />
            ),
          }}
        />

        {/* Tab 3: Coach Rooka - Hero elevated center icon */}
        <Tabs.Screen
          name="coach"
          options={{
            title: 'Coach',
            tabBarIcon: ({ color, size = 22 }: { color: string; size?: number }) => (
              <RookaMark size={size} color={color} />
            ),
          }}
        />

        {/* Tab 4: Social - Trophy (Rooka Leaderboard, Quests & Levels) */}
        <Tabs.Screen
          name="social"
          options={{
            title: 'Social',
            tabBarIcon: ({ color, size = 22 }: { color: string; size?: number }) => (
              <Ionicons name="trophy-outline" size={size} color={color} />
            ),
          }}
        />

        {/* Tab 5: Profile - User Silhouette */}
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
