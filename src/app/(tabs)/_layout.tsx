import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { RookaMark } from '../../components/ui/RookaPoints';
import {
  createMaterialTopTabNavigator,
  MaterialTopTabNavigationOptions,
  MaterialTopTabNavigationEventMap,
} from 'expo-router/js-top-tabs';
import { ParamListBase, TabNavigationState } from 'expo-router/react-navigation';
import { withLayoutContext, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CustomTabBar, type CustomTabBarProps } from '../../components/CustomTabBar';
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

const REBUILD_TABS_AFTER_MS = 30 * 60 * 1000;

/**
 * A key for the tabs that changes when the app comes back from a long stay in the background.
 * After hours suspended, a tester's chat page came back black and stayed that way across tab
 * switches until the app was restarted. Rebuilding the pager does what that restart did.
 */
function useTabsRebuildKey() {
  const [rebuildKey, setRebuildKey] = useState(0);
  const backgroundedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAtRef.current = Date.now();
      } else if (state === 'active') {
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (backgroundedAt !== null && Date.now() - backgroundedAt >= REBUILD_TABS_AFTER_MS) {
          setRebuildKey((key) => key + 1);
        }
      }
    });
    return () => sub.remove();
  }, []);

  return rebuildKey;
}

export default function TabLayout() {
  const { isAuthenticated, loading, user } = useUser();
  const router = useRouter();
  const tabsRebuildKey = useTabsRebuildKey();

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
        key={tabsRebuildKey}
        initialRouteName="index"
        tabBar={(props: CustomTabBarProps) => <CustomTabBar {...props} />}
        // The bar floats over the content on `position: absolute`, so it is
        // rendered after the pager rather than taking a strip of layout above it.
        tabBarPosition="bottom"
        screenOptions={{
          swipeEnabled: true,
          animationEnabled: true,
          // Chat and Progress are expensive to mount; building all five up front
          // would make the first paint of the tab bar noticeably slower. The tab bar
          // builds the others one by one once the app is idle (CustomTabBar), so
          // nothing is built during a tap.
          lazy: true,
          lazyPreloadDistance: 0,
        }}
      >
        {/* Tab 1: Planning - Dynamic Date Sheet with current date number */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Planning',
            tabBarIcon: ({ color }) => (
              <DynamicDateIcon size={22} color={color as string} />
            ),
          }}
        />

        {/* Tab 2: Progress - Pulse / Activity Trend Line (PMC / physiology load) */}
        <Tabs.Screen
          name="physique"
          options={{
            title: 'Progress',
            tabBarIcon: ({ color }) => (
              <Ionicons name="pulse-outline" size={22} color={color as string} />
            ),
          }}
        />

        {/* Tab 3: Coach Rooka - Hero elevated center icon */}
        <Tabs.Screen
          name="coach"
          options={{
            title: 'Coach',
            tabBarIcon: ({ color }) => (
              <RookaMark size={22} color={color as string} />
            ),
          }}
        />

        {/* Tab 4: Social - Trophy (Rooka Leaderboard, Quests & Levels) */}
        <Tabs.Screen
          name="social"
          options={{
            title: 'Social',
            tabBarIcon: ({ color }) => (
              <Ionicons name="trophy-outline" size={22} color={color as string} />
            ),
          }}
        />

        {/* Tab 5: Profile - User Silhouette */}
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => (
              <Ionicons name="person-outline" size={22} color={color as string} />
            ),
          }}
        />
      </Tabs>
    </HeaderLayoutProvider>
  );
}
