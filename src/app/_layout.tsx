import '../global.css';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import React, { useEffect } from 'react';
import { AppProviders } from '../context/AppProviders';
import { useUser } from '../context/UserStore';

SplashScreen.preventAutoHideAsync();

function RootNavigation() {
  const { user, isAuthenticated, loading } = useUser();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'login';
    const inOnboarding = segments[0] === 'onboarding';

    const isNewAthlete = !user?.athlete_context ||
                         user?.athlete_context === 'New athlete.' ||
                         user?.athlete_context === 'No context provided yet.' ||
                         user?.athlete_context.trim() === '';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated) {
      if (isNewAthlete && !inOnboarding) {
        router.replace('/onboarding');
      } else if (!isNewAthlete && (inAuthGroup || inOnboarding)) {
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, loading, segments, user]);

  if (loading) {
    return (
      <View className="flex-1 bg-theme-bg items-center justify-center">
        <ActivityIndicator size="large" color="#FF5F3B" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppProviders>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <RootNavigation />
        </GestureHandlerRootView>
      </AppProviders>
    </ThemeProvider>
  );
}
