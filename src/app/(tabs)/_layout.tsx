import React, { useState, useEffect } from 'react';
import { View, Animated } from 'react-native';
import { withLayoutContext } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { CustomTabBar } from '../../components/CustomTabBar';
import { DashboardSharedHeader } from '../../components/dashboard/DashboardSharedHeader';
import { Ionicons } from '@expo/vector-icons';

const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

function TabBarWrapper({ props, setPagerPosition }: { props: any, setPagerPosition: (pos: any) => void }) {
  useEffect(() => {
    setPagerPosition(props.position);
  }, [props.position]);
  return <CustomTabBar {...props} />;
}

export default function TabLayout() {
  const [pagerPosition, setPagerPosition] = useState<Animated.AnimatedInterpolation<number> | null>(null);

  return (
    <View className="flex-1 bg-theme-bg">
      {pagerPosition && <DashboardSharedHeader position={pagerPosition} />}
      <MaterialTopTabs
        tabBarPosition="bottom"
        tabBar={(props: any) => <TabBarWrapper props={props} setPagerPosition={setPagerPosition} />}
        screenOptions={{
          swipeEnabled: true,
        }}
      >
        <MaterialTopTabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="home-outline" size={size} color={color} />,
          }}
        />
        <MaterialTopTabs.Screen
          name="planning"
          options={{
            title: 'Planning',
            tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="home-outline" size={size} color={color} />,
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
        <MaterialTopTabs.Screen
          name="progress"
          options={{
            href: null,
          } as any}
        />
        <MaterialTopTabs.Screen
          name="activities"
          options={{
            href: null,
          } as any}
        />
      </MaterialTopTabs>
    </View>
  );
}
