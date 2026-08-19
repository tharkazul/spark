import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Animated } from 'react-native';
import { withLayoutContext, useRouter } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { CustomTabBar } from '../../components/CustomTabBar';
import { DashboardSharedHeader } from '../../components/dashboard/DashboardSharedHeader';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../context/UserStore';

import { HeaderLayoutProvider } from '../../context/HeaderLayoutContext';

const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

function TabBarWrapper({ props, onPosition }: { props: any, onPosition: (pos: any) => void }) {
  useEffect(() => {
    if (props.position) {
      onPosition(props.position);
    }
  }, [props.position, onPosition]);
  return <CustomTabBar {...props} />;
}

export default function TabLayout() {
  const { isAuthenticated, loading, user } = useUser();
  const router = useRouter();

  const defaultPosition = useRef(new Animated.Value(0)).current;
  const [pagerPosition, setPagerPosition] = useState<Animated.AnimatedInterpolation<number> | null>(null);

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else if (user && !user.onboarding_completed) {
        router.replace('/onboarding');
      }
    }
  }, [isAuthenticated, loading, user?.onboarding_completed]);

  const onPosition = useCallback((pos: any) => {
    setPagerPosition(pos);
  }, []);

  const renderTabBar = useCallback(
    (props: any) => <TabBarWrapper props={props} onPosition={onPosition} />,
    [onPosition]
  );

  return (
    <HeaderLayoutProvider>
      <View className="flex-1 bg-theme-bg">
        <MaterialTopTabs
          initialRouteName="index"
          tabBarPosition="bottom"
          tabBar={renderTabBar}
          screenOptions={{
            swipeEnabled: true,
          }}
        >
          <MaterialTopTabs.Screen
            name="index"
            options={{
              title: 'Planning',
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="calendar-outline" size={size} color={color} />,
            }}
          />
          <MaterialTopTabs.Screen
            name="physique"
            options={{
              title: 'Progress',
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
            }}
          />
          <MaterialTopTabs.Screen
            name="coach"
            options={{
              title: 'Coach',
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="sparkles-outline" size={size} color={color} />,
            }}
          />
          <MaterialTopTabs.Screen
            name="social"
            options={{
              title: 'Activities',
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="people-outline" size={size} color={color} />,
            }}
          />
          <MaterialTopTabs.Screen
            name="profile"
            options={{
              title: 'Profile',
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="person-outline" size={size} color={color} />,
            }}
          />
        </MaterialTopTabs>
        <DashboardSharedHeader position={pagerPosition || defaultPosition} />
      </View>
    </HeaderLayoutProvider>
  );
}
