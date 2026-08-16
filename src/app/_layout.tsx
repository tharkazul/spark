import '../global.css';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import React, { useEffect } from 'react';
import { AppProviders } from '../context/AppProviders';
import { useUser } from '../context/UserStore';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { KeyboardMotionProvider } from '../context/KeyboardMotionContext';

import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Rajdhani_500Medium,
  Rajdhani_600SemiBold,
  Rajdhani_700Bold,
} from '@expo-google-fonts/rajdhani';

SplashScreen.preventAutoHideAsync();

function RootNavigation() {
  const { user, isAuthenticated, loading } = useUser();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'login';
    const inOnboarding = segments[0] === 'onboarding';

    const isNewAthlete = !user?.onboarding_completed;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated) {
      if (isNewAthlete && !inOnboarding) {
        router.replace('/onboarding');
      } else if (!isNewAthlete) {
        if (inAuthGroup || inOnboarding) {
          router.replace('/(tabs)/coach');
        } else if ((segments as string[]).length === 0 || (segments[0] === '(tabs)' && (segments as string[]).length === 1)) {
          router.replace('/(tabs)/coach');
        }
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

  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
    'PlusJakartaSans-ExtraBold': PlusJakartaSans_800ExtraBold,
    Rajdhani_500Medium,
    Rajdhani_600SemiBold,
    Rajdhani_700Bold,
    'Rajdhani-Medium': Rajdhani_500Medium,
    'Rajdhani-SemiBold': Rajdhani_600SemiBold,
    'Rajdhani-Bold': Rajdhani_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View className="flex-1 bg-theme-bg items-center justify-center">
        <ActivityIndicator size="large" color="#FF5F3B" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppProviders>
        <KeyboardProvider>
          <KeyboardMotionProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <RootNavigation />
            </GestureHandlerRootView>
          </KeyboardMotionProvider>
        </KeyboardProvider>
      </AppProviders>
    </ThemeProvider>
  );
}
